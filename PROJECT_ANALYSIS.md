# CropLog 프로젝트 분석

- 분석일: 2026-08-01
- 대상: `D:\study\farmPrj\CropLog-main\CropLog-main`

## 1. 개요

**CropLog**는 농약/종자 등 필드 영업사원이 "시교"(작물 시험 재배) 진행 상황을
기록하는 모바일 PWA(Progressive Web App)이다. 시교 등록, 생육 사진 기록,
성장/품종 비교, 방문 일정 캘린더, PDF/CSV 리포트 출력 등의 기능을 제공한다.
UI는 전부 한국어이며 모바일 세로 화면(최대 480px) 전용으로 설계돼 있다.

## 2. 파일 구성

| 파일 | 역할 |
|---|---|
| `index.html` | 앱 전체(마크업 + CSS + JS, 약 4,300줄). 별도 빌드 없는 순수 vanilla JS SPA |
| `sw.js` | 서비스 워커. PWA 오프라인 지원용 앱 셸(정적 리소스) 캐싱 |
| `manifest.json` | PWA 매니페스트 (홈 화면 설치, 아이콘, standalone 모드) |
| `icon-192.png`, `icon-512.png`, `logo.png` | 앱 아이콘/로고 |

빌드 도구(webpack/vite 등), 프레임워크(React/Vue 등), 패키지 매니저 설정이 전혀 없다.
`index.html` 하나를 정적 호스팅하면 그대로 동작하는 구조.

## 3. 화면 구성 (`#app` 내 `<section id="view-*">`)

`go(view)` 함수가 섹션을 보이기/숨기기 하는 방식의 클라이언트 라우팅
(해시 라우팅 아님, `history.pushState`로 뒤로가기만 지원):

- `home` : 즐겨찾기, 검색, 최근 시교 목록
- `alllist` : 전체 시교 목록 (최근순/가나다순/품목별 정렬)
- `newtrial` : 새 시교 등록
- `detail` / `upload` / `report` : 시교 상세, 사진 업로드, 리포트 공유
- `xcompare` : 품종 간 비교
- `calendar` : 방문 일정 캘린더 (구글 캘린더 연동)
- `settings` / `crops` / `help` : 설정, 품목 색상 태그 관리, 사용법

## 4. 데이터 저장 구조 (핵심)

### 4.1 IndexedDB (`sigyoDB`, 버전 5) — 유일한 로컬 데이터 저장소

`index.html:864` 부근 "IndexedDB 레이어"에서 직접 구현 (라이브러리 없음).
Object store 목록:

| Store | 내용 |
|---|---|
| `crops` | 품목 목록 (이름, 색상) |
| `trials` | 시교(시험재배) 레코드 |
| `photos` | 생육 사진 — **Blob 원본 + Blob 썸네일**을 그대로 저장 (`trialId` 인덱스) |
| `notes` | 시교별 메모 (`trialId` 인덱스) |
| `comparisons` | "이 비교 저장하기"로 만든 합성 비교 이미지 |
| `schedules` | 캘린더 일정 (`date` 인덱스) |
| `meta` | 앱 설정, 마지막 백업 시각 등 key-value |

- **`localStorage`/`sessionStorage`는 전혀 사용하지 않음** — 모든 실제 데이터는 IndexedDB에 있음.
- 사진은 Blob으로 저장되고 화면에는 `URL.createObjectURL()`로 표시 (line 976~988).
- `navigator.storage.persist()` 호출이 없음 → 브라우저에 "이 저장소를 함부로 비우지 말아달라"는
  영속 저장소 요청을 하지 않은 상태 (아래 5번 참고).

### 4.2 서비스 워커 캐시 (`sw.js`)

- `CACHE_NAME = 'croplog-cache-v25'`, 캐싱 대상은 앱 셸(정적 파일)만 —
  `index.html`, `manifest.json`, 아이콘 등.
- **사용자 데이터(시교/사진/메모)는 캐시에 없음.** network-first 전략으로,
  온라인이면 항상 최신 파일을 받고 오프라인일 때만 캐시로 폴백.
- 즉 "브라우저 캐시 삭제"로 지워지는 건 원래 이 정적 파일 캐시뿐이며,
  실제 사용자가 잃는 데이터는 **IndexedDB**다 (별도 스토리지 영역이지만
  브라우저의 "사이트 데이터/쿠키 삭제" 또는 "캐시된 이미지 및 파일" 옵션에
  따라 함께 삭제될 수 있음. 브라우저·OS별로 挙동이 다름).

### 4.3 구글 드라이브 백업/복원 (설정에서 opt-in)

- Google Identity Services OAuth로 로그인 (`gsi/client` 스크립트).
- `performBackup()` (line 4002): crops/trials/photos/notes/meta/comparisons/schedules
  전체를 읽어 사진 Blob → base64 변환 후 하나의 JSON으로 묶어
  Drive REST API(`upload/drive/v3/files`, multipart)로 업로드.
- 백업 파일은 오늘/어제/그제/1주일전/1달전, 총 5개 시점만 롤링 보관 (`selectBackupsToKeep`).
- `syncEnabled` 켜져 있고 로그인 상태면 12시간마다 조용히 자동 백업 시도(`autoBackupCheckAndRun`).
- **기본값은 꺼짐(opt-in)** — 사용자가 직접 설정에서 켜고 로그인해야 동작.
- 복원은 사용자가 백업 시점을 선택하면 그 JSON을 받아 IndexedDB를 덮어씀.

### 4.4 파일 내보내기 (이미 기기 스토리지에 "파일"로 저장되는 기능들)

`<a download>` 클릭 트릭으로 이미 디바이스의 실제 다운로드 폴더/파일 앱에 저장되는 기능이 존재:

- 사진 개별 다운로드 (line 3337)
- 시교별 PDF 리포트 다운로드 (line 3615)
- 비교 이미지 PNG 다운로드 (line 3768, 3781)
- 전체 시교 목록 CSV 내보내기 (`exportCSV`, line 4215)

단, 이 파일들은 모두 **1회성 "내보내기(export)" 결과물**이며, 앱이 다시 그 파일을
읽어들이는(import) 기능은 없다. 즉 "복구 가능한 백업"이 아니라 "외부 공유/기록용 사본"이다.

## 5. "브라우저 캐시를 지우면 데이터가 사라진다"의 실제 원인

사용자가 겪은 문제는 기술적으로는 캐시(sw.js Cache Storage)가 아니라
**IndexedDB가 브라우저 저장소 정리에 휘말려 삭제된 것**일 가능성이 높다. 원인 후보:

1. 브라우저 설정에서 "캐시된 이미지 및 파일"뿐 아니라 **"쿠키 및 기타 사이트 데이터"까지
   같이 삭제**하면 IndexedDB도 함께 삭제됨 (Chrome/Edge/Safari 공통 동작).
2. iOS Safari는 홈 화면에 추가하지 않고 일반 브라우저 탭으로만 쓰는 PWA의 경우,
   약 7일간 미사용 시 ITP 정책으로 사이트 데이터(IndexedDB 포함)를 자동 삭제할 수 있음.
3. 앱이 `navigator.storage.persist()`를 호출하지 않아, 기기 저장 공간이 부족할 때
   브라우저가 "best-effort" 저장소로 간주해 우선적으로 비울 대상이 될 수 있음.
4. PWA를 홈 화면에서 삭제 후 재설치하면 스토리지가 초기화됨.
5. 구글 동기화(Drive 백업)가 기본 꺼짐 상태라, 위 상황이 발생했을 때 복구 수단이 없는
   사용자가 많았을 것으로 추정.

## 6. 개선 방향 메모 (다음 논의용)

브라우저 저장소(IndexedDB)는 태생적으로 "그 브라우저/그 오리진 안"에 갇힌 샌드박스 저장소라,
사용자가 명시적으로 사이트 데이터를 지우는 순간은 어떤 방법으로도 100% 막을 수 없다.
"기기 스토리지에 파일로 저장"이라는 목표를 달성하려면 아래 중 하나(또는 조합)가 필요하며,
플랫폼(iOS/Android/데스크톱) 지원 범위가 옵션마다 다르므로 방향 결정이 필요하다:

- **A. 저비용 보강**: `navigator.storage.persist()` 요청 추가 + 자동 백업 로직을
  더 적극적으로(기본값 on 유도, 주기 단축) 개선. 구조 변경 없이 이탈 확률만 낮춤.
- **B. 로컬 파일 백업/복원 추가**: 지금 있는 "내보내기" 기능처럼 전체 데이터(JSON+사진)를
  기기에 파일로 저장하고, 그 파일을 다시 읽어 복원하는 "가져오기" 기능을 추가.
  로그인 불필요, 모든 브라우저에서 동작(다운로드 방식). 다만 자동이 아니라 사용자가
  수동으로 내보내기/가져오기를 해줘야 함(주기적 알림으로 보완 가능).
- **C. File System Access API로 실시간 폴더 동기화**: 사용자가 지정한 실제 폴더에
  데이터 변경 시마다 파일을 씀. 데스크톱 Chrome/Edge, 안드로이드 Chrome 일부만 지원되고
  **iOS Safari는 미지원** — 이 앱이 iOS도 타깃(`apple-mobile-web-app-capable`)이라 한계 있음.
- **D. 네이티브 앱 전환(Capacitor 등)**: PWA를 Capacitor로 감싸 진짜 파일시스템 API를 쓰는
  네이티브 앱으로 배포. 가장 확실하지만 개발/배포 방식이 크게 바뀜(스토어 배포 또는 사이드로딩 필요).

## 7. 기술 스택 요약

- 순수 HTML/CSS/JavaScript (프레임워크 없음, 번들러 없음)
- PWA (Service Worker + Web App Manifest)
- IndexedDB (자체 경량 래퍼 함수로 직접 구현)
- Google Identity Services + Google Drive REST API (선택적 클라우드 백업)
- 외부 의존성은 CDN의 Pretendard 폰트, `accounts.google.com/gsi/client` 뿐
