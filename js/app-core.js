/* ================= IndexedDB 레이어 ================= */
let db;
const DB_NAME = 'sigyoDB', DB_VER = 5;

function openDB(){
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = (e)=>{
      const d = e.target.result;
      const upgradeTx = e.target.transaction;
      if(!d.objectStoreNames.contains('crops')) d.createObjectStore('crops', {keyPath:'id'});
      if(!d.objectStoreNames.contains('trials')) d.createObjectStore('trials', {keyPath:'id'});
      let photosStore;
      if(!d.objectStoreNames.contains('photos')){
        photosStore = d.createObjectStore('photos', {keyPath:'id'});
      } else {
        photosStore = upgradeTx.objectStore('photos');
      }
      if(!photosStore.indexNames.contains('trialId')) photosStore.createIndex('trialId', 'trialId', {unique:false});
      if(!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', {keyPath:'key'});
      let notesStore;
      if(!d.objectStoreNames.contains('notes')){
        notesStore = d.createObjectStore('notes', {keyPath:'id'});
      } else {
        notesStore = upgradeTx.objectStore('notes');
      }
      if(!notesStore.indexNames.contains('trialId')) notesStore.createIndex('trialId', 'trialId', {unique:false});
      if(!d.objectStoreNames.contains('comparisons')) d.createObjectStore('comparisons', {keyPath:'id'});
      let schedulesStore;
      if(!d.objectStoreNames.contains('schedules')){
        schedulesStore = d.createObjectStore('schedules', {keyPath:'id'});
      } else {
        schedulesStore = upgradeTx.objectStore('schedules');
      }
      if(!schedulesStore.indexNames.contains('date')) schedulesStore.createIndex('date', 'date', {unique:false});
    };
    req.onsuccess = (e)=>{ db = e.target.result; resolve(db); };
    req.onerror = (e)=> reject(e);
  });
}
function tx(store, mode='readonly'){ return db.transaction(store, mode).objectStore(store); }
function idbGetAllByIndex(store, indexName, value){
  return new Promise((res)=>{
    const req = tx(store).index(indexName).getAll(value);
    req.onsuccess = ()=> res(req.result||[]);
    req.onerror = ()=> res([]);
  });
}
function idbGetAllByRange(store, indexName, range){
  return new Promise((res)=>{
    const req = tx(store).index(indexName).getAll(range);
    req.onsuccess = ()=> res(req.result||[]);
    req.onerror = ()=> res([]);
  });
}
function idbGetAll(store){
  return new Promise((res)=>{ const r = tx(store).getAll(); r.onsuccess=()=>res(r.result||[]); });
}
function idbGet(store, key){
  return new Promise((res)=>{ const r = tx(store).get(key); r.onsuccess=()=>res(r.result); });
}
function idbPut(store, val){
  return new Promise((res, rej)=>{
    const r = tx(store,'readwrite').put(val);
    r.onsuccess=()=>res(true);
    r.onerror=()=>rej(r.error);
  });
}
function idbPutMany(store, items){
  return new Promise((res, rej)=>{
    const t = db.transaction(store, 'readwrite');
    const os = t.objectStore(store);
    items.forEach(item => os.put(item));
    t.oncomplete = ()=>res(true);
    t.onerror = ()=>rej(t.error);
  });
}
function idbDelete(store, key){
  return new Promise((res, rej)=>{
    const r = tx(store,'readwrite').delete(key);
    r.onsuccess=()=>res(true);
    r.onerror=()=>rej(r.error);
  });
}
function idbClearAll(){
  return new Promise((res)=>{
    const t = db.transaction(['crops','trials','photos','meta','notes','comparisons','schedules'],'readwrite');
    t.objectStore('crops').clear();
    t.objectStore('trials').clear();
    t.objectStore('photos').clear();
    t.objectStore('meta').clear();
    t.objectStore('notes').clear();
    t.objectStore('comparisons').clear();
    t.objectStore('schedules').clear();
    t.oncomplete = ()=>res(true);
  });
}
function idbDeleteWhere(store, predicate){
  return new Promise((res)=>{
    const s = tx(store,'readwrite');
    const req = s.openCursor();
    req.onsuccess = (e)=>{
      const cursor = e.target.result;
      if(cursor){
        if(predicate(cursor.value)) cursor.delete();
        cursor.continue();
      } else { res(true); }
    };
  });
}
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,8); }
const photoUrlCache = new Map();
function getPhotoUrl(p){
  if(!photoUrlCache.has(p.id)){
    photoUrlCache.set(p.id, URL.createObjectURL(p.blob));
  }
  return photoUrlCache.get(p.id);
}
const photoThumbUrlCache = new Map();
function getPhotoThumbUrl(p){
  const key = p.id+'_thumb';
  if(!photoThumbUrlCache.has(key)){
    photoThumbUrlCache.set(key, URL.createObjectURL(p.thumbBlob || p.blob));
  }
  return photoThumbUrlCache.get(key);
}
function todayStr(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function timeAgo(ts){
  const diffMs = Date.now()-ts;
  const day = Math.floor(diffMs/86400000);
  if(day<=0) return '오늘';
  if(day===1) return '어제';
  return `${day}일 전`;
}

/* ================= 미니멀 라인 아이콘 ================= */
function icon(name, size){
  size = size || 18;
  const c = `width="${size}" height="${size}" viewBox="0 0 24 24" style="vertical-align:-3px;flex:0 0 auto;"`;
  const s = `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
  const icons = {
    leaf:   `<svg ${c} ${s}><path d="M12 21V9"/><path d="M12 9c0-3.3 2.2-5.5 5.5-5.5 0 3.3-2.2 5.5-5.5 5.5Z"/><path d="M12 9c0-3.3-2.2-5.5-5.5-5.5 0 3.3 2.2 5.5 5.5 5.5Z"/></svg>`,
    settings: `<svg ${c} ${s}><line x1="4" y1="7" x2="20" y2="7"/><circle cx="9" cy="7" r="2" fill="currentColor" stroke="none"/><line x1="4" y1="12" x2="20" y2="12"/><circle cx="16" cy="12" r="2" fill="currentColor" stroke="none"/><line x1="4" y1="17" x2="20" y2="17"/><circle cx="11" cy="17" r="2" fill="currentColor" stroke="none"/></svg>`,
    search: `<svg ${c} ${s}><circle cx="11" cy="11" r="6"/><line x1="20" y1="20" x2="15.5" y2="15.5"/></svg>`,
    star:   `<svg ${c} fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><polygon points="12,3 14.7,9.3 21.5,9.9 16.3,14.4 17.9,21 12,17.3 6.1,21 7.7,14.4 2.5,9.9 9.3,9.3"/></svg>`,
    starFilled: `<svg ${c} fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"><polygon points="12,3 14.7,9.3 21.5,9.9 16.3,14.4 17.9,21 12,17.3 6.1,21 7.7,14.4 2.5,9.9 9.3,9.3"/></svg>`,
    clock:  `<svg ${c} ${s}><circle cx="12" cy="12" r="8"/><polyline points="12,8 12,12 15,14"/></svg>`,
    edit:   `<svg ${c} ${s}><path d="M4 20h4l10.5-10.5a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16v4Z"/><line x1="13" y1="6" x2="18" y2="11"/></svg>`,
    trash:  `<svg ${c} ${s}><line x1="4" y1="7" x2="20" y2="7"/><path d="M6 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"/><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`,
    camera: `<svg ${c} ${s}><path d="M4 8h3l2-2h6l2 2h3v11H4Z"/><circle cx="12" cy="13.5" r="3.5"/></svg>`,
    image:  `<svg ${c} ${s}><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5" fill="currentColor" stroke="none"/><polyline points="21,16 15,10 6,20"/></svg>`,
    share:  `<svg ${c} ${s}><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><line x1="8.2" y1="10.8" x2="15.8" y2="6.2"/><line x1="8.2" y1="13.2" x2="15.8" y2="17.8"/></svg>`,
    note:   `<svg ${c} ${s}><rect x="4" y="3" width="16" height="18" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="12" y2="16"/></svg>`,
    close:  `<svg ${c} ${s}><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>`,
    check:  `<svg ${c} ${s}><polyline points="4,12 9,17 20,6"/></svg>`,
    plus:   `<svg ${c} ${s}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
    chevLeft: `<svg ${c} ${s}><polyline points="15,4 7,12 15,20"/></svg>`,
    chevRight: `<svg ${c} ${s}><polyline points="9,4 17,12 9,20"/></svg>`,
    home: `<svg ${c} ${s}><path d="M4 11l8-7 8 7"/><path d="M6 9.5V20h12V9.5"/></svg>`,
    compare: `<svg ${c} ${s}><rect x="3" y="4" width="8" height="16" rx="1.5"/><rect x="13" y="4" width="8" height="16" rx="1.5"/><line x1="7" y1="9" x2="7" y2="9"/></svg>`,
    pen: `<svg ${c} ${s}><path d="M4 20l4-1 11-11a2 2 0 0 0-3-3L5 16l-1 4Z"/></svg>`,
    circleTool: `<svg ${c} ${s}><circle cx="12" cy="12" r="8"/></svg>`,
    arrowTool: `<svg ${c} ${s}><line x1="5" y1="19" x2="19" y2="5"/><polyline points="9,5 19,5 19,15"/></svg>`,
    textTool: `<svg ${c} ${s}><line x1="5" y1="6" x2="19" y2="6"/><line x1="12" y1="6" x2="12" y2="19"/></svg>`,
    undo: `<svg ${c} ${s}><path d="M4 8h9a5 5 0 0 1 0 10h-2"/><polyline points="8,4 4,8 8,12"/></svg>`,
    copy: `<svg ${c} ${s}><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>`,
    pin: `<svg ${c} ${s}><path d="M12 21s7-6.6 7-11.5A7 7 0 0 0 5 9.5C5 14.4 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.3"/></svg>`,
    calendarPlus: `<svg ${c} ${s}><rect x="3" y="5" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/><line x1="12" y1="14" x2="12" y2="18"/><line x1="10" y1="16" x2="14" y2="16"/></svg>`,
    rotate: `<svg ${c} ${s}><path d="M3 12a9 9 0 1 0 3-6.7"/><polyline points="3,4 3,9 8,9"/></svg>`
  };
  return icons[name] || '';
}

/* ================= 프리셋 품목 ================= */
const PRESET_CROPS = [
  {name:'고추', color:'#c0453b'},
  {name:'무',   color:'#ffffff'},
  {name:'배추', color:'#4a7c59'},
  {name:'토마토', color:'#e0729a'},
  {name:'수박', color:'#232323'},
  {name:'오이', color:'#7a548f'},
  {name:'멜론', color:'#e8c547'},
];
const COLOR_CATALOG = ['#c0453b','#e0729a','#d99a3c','#e8c547','#4a7c59','#8fb996','#3c6e8f','#5da8c9','#7a548f','#b384c9','#5f6b3f','#b5754f','#232323','#8a8275','#ffffff','#365c42'];

async function ensurePresetCrops(){
  const existing = await idbGetAll('crops');
  const names = new Set(existing.map(c=>c.name));
  for(const p of PRESET_CROPS){
    if(!names.has(p.name)){
      await idbPut('crops', {id:'preset-'+p.name, name:p.name, color:p.color});
    }
  }
}
function textColorFor(bgHex){
  // 밝은 배경(흰색, 노란색 등)엔 어두운 글씨, 아니면 흰 글씨
  const c = bgHex.replace('#','');
  const r=parseInt(c.substr(0,2),16), g=parseInt(c.substr(2,2),16), b=parseInt(c.substr(4,2),16);
  const brightness = (r*299+g*587+b*114)/1000;
  return brightness > 175 ? '#2c2620' : '#ffffff';
}

/* ================= 라우팅 ================= */
let currentTrialId = null;
let currentFieldAddresses = [];
const MAX_ADDRESSES = 5;
function addAddressField(prefix, value){
  const list = document.getElementById(`${prefix}AddressList`);
  const count = list.children.length;
  if(count >= MAX_ADDRESSES){ toast(`주소는 최대 ${MAX_ADDRESSES}개까지 등록할 수 있어요`); return; }
  const idx = count+1;
  const row = document.createElement('div');
  row.className = 'addr-input-row';
  row.innerHTML = `
    <input type="text" placeholder="밭주소 ${idx}" value="${escapeHtml(value||'')}">
    ${count>0 ? `<span class="link addr-remove" onclick="this.parentElement.remove(); renumberAddressFields('${prefix}')">삭제</span>` : ''}
  `;
  list.appendChild(row);
}
function renumberAddressFields(prefix){
  const list = document.getElementById(`${prefix}AddressList`);
  Array.from(list.children).forEach((row,i)=>{
    row.querySelector('input').placeholder = `밭주소 ${i+1}`;
  });
}
function resetAddressFields(prefix, values){
  const list = document.getElementById(`${prefix}AddressList`);
  list.innerHTML = '';
  const vals = (values && values.length) ? values : [''];
  vals.forEach(v=> addAddressField(prefix, v));
}
function getAddressValues(prefix){
  const list = document.getElementById(`${prefix}AddressList`);
  return Array.from(list.querySelectorAll('input')).map(i=>i.value.trim()).filter(Boolean);
}
function copyFieldAddress(idx){
  const addr = currentFieldAddresses[idx];
  if(!addr){ toast('등록된 주소가 없어요'); return; }
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(addr).then(()=>{
      toast('주소를 복사했어요');
    }).catch(()=>{ toast('복사에 실패했어요'); });
  } else {
    toast('이 브라우저는 복사가 지원되지 않아요');
  }
}
function openFieldAddressInMaps(idx){
  const addr = currentFieldAddresses[idx];
  if(!addr){ toast('등록된 주소가 없어요'); return; }
  window.location.href = `geo:0,0?q=${encodeURIComponent(addr)}`;
}
const views = ['home','settings','crops','newtrial','detail','upload','report','xcompare','help','calendar','alllist'];
const topLevelViews = ['home','xcompare','settings','calendar'];
let navStack = [];
async function go(view, arg, fromPopstate){
  views.forEach(v=> document.getElementById('view-'+v).classList.add('hidden'));
  document.getElementById('view-'+view).classList.remove('hidden');
  if(view==='home'){ await renderHome(); }
  if(view==='crops'){ await renderCrops(); }
  if(view==='settings'){
    document.getElementById('feedbackSwitch').classList.toggle('on', appSettings.feedback);
    document.getElementById('scheduleReminderSwitch').classList.toggle('on', appSettings.scheduleReminders);
    document.getElementById('syncEnableSwitch').classList.toggle('on', !!appSettings.syncEnabled);
    document.getElementById('syncPanel').classList.toggle('hidden', !appSettings.syncEnabled);
    const lastMeta = await idbGet('meta','lastBackupAt');
    if(lastMeta && lastMeta.value){
      const statusEl = document.getElementById('syncStatusText');
      if(statusEl) statusEl.textContent = `마지막 백업: ${new Date(lastMeta.value).toLocaleString('ko-KR')}`;
    }
    if(appSettings.syncEnabled) trySilentGoogleSignIn();
  }
  if(view==='newtrial'){ await renderNewTrialForm(); }
  if(view==='detail'){ currentTrialId = arg; await renderDetail(arg); }
  if(view==='upload'){ currentTrialId = arg; await renderUpload(arg); }
  if(view==='report'){ currentTrialId = arg; await renderReport(arg); }
  if(view==='xcompare'){ renderXCompare(); }
  if(view==='calendar'){ await renderCalendar(); }
  if(view==='alllist'){ await renderAllList('recent'); }

  const tabbar = document.getElementById('bottomTabbar');
  tabbar.classList.toggle('hidden', !topLevelViews.includes(view));
  document.getElementById('tabHome').classList.toggle('active', view==='home');
  document.getElementById('tabXCompare').classList.toggle('active', view==='xcompare');
  document.getElementById('tabCalendar').classList.toggle('active', view==='calendar');
  document.getElementById('tabSettings').classList.toggle('active', view==='settings');

  window.scrollTo(0,0);
  bindScrollFloaters(view);

  if(!fromPopstate){
    navStack.push({view, arg});
    history.pushState({navIndex: navStack.length-1}, '');
  }
}
function bindScrollFloaters(view){
  const section = document.getElementById('view-'+view);
  const m = section.querySelector('main');
  const floatBack = document.getElementById('floatBack');
  const floatTop = document.getElementById('floatTop');
  const hasBack = !!section.querySelector('header .back');
  floatBack.classList.toggle('hidden', !hasBack);
  if(!m){ floatTop.classList.add('hidden'); return; }
  m.scrollTop = 0;
  floatTop.classList.add('hidden');
  m.onscroll = ()=>{
    floatTop.classList.toggle('hidden', m.scrollTop <= 260);
  };
}
function floatBackClick(){
  // history.back()은 브라우저/WebView의 실제 이전 히스토리로 갈 수 있어 예측이 안 됨.
  // 현재 화면의 헤더 뒤로가기 버튼을 그대로 눌러서, 항상 그 버튼과 동일하게(항상 정해진 이전 화면으로) 동작하게 함.
  const backBtn = document.querySelector('#app > section:not(.hidden) header .back');
  if(backBtn) backBtn.click();
}
function scrollActiveMainTop(){
  const active = document.querySelector('#app > section:not(.hidden) > main');
  if(active) active.scrollTo({top:0, behavior:'smooth'});
}
window.addEventListener('popstate', ()=>{
  // 모달이 열려있으면 뒤로가기로 모달만 닫기
  const openModal = document.querySelector('.modal-backdrop');
  if(openModal){ openModal.remove(); history.pushState({navIndex: navStack.length-1}, ''); return; }
  const lightbox = document.getElementById('lightboxEl');
  if(lightbox){ lightbox.remove(); history.pushState({navIndex: navStack.length-1}, ''); return; }

  if(navStack.length > 1){
    navStack.pop();
    const prev = navStack[navStack.length-1];
    go(prev.view, prev.arg, true);
  } else {
    // 홈 화면에서는 앱이 그냥 꺼지지 않도록 현재 상태 유지
    history.pushState({navIndex:0}, '');
  }
});
let appSettings = {feedback:true, syncEnabled:false, scheduleReminders:true};
async function loadSettings(){
  const s = await idbGet('meta','settings');
  if(s && s.value) appSettings = Object.assign(appSettings, s.value);
}
async function saveSettings(){
  await idbPut('meta', {key:'settings', value:appSettings});
}
function vibrate(pattern){
  if(navigator.vibrate){
    try{ navigator.vibrate(pattern); }catch(e){}
  }
}
function rawToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 1800);
  vibrate(15);
}
function toast(msg){
  if(!appSettings.feedback) return;
  rawToast(msg);
}
function showStorageError(e){
  console.error(e);
  if(e && (e.name==='QuotaExceededError' || (e.message||'').includes('Quota'))){
    rawToast('저장공간이 부족해요. 기기 용량을 확인해주세요.');
  } else {
    rawToast('저장에 실패했어요. 다시 시도해주세요.');
  }
}

