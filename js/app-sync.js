/* ================= 구글 동기화 ================= */
const GOOGLE_CLIENT_ID = '101745594691-bri5ddan44ksiiq72ut2ckb0t501uk8e.apps.googleusercontent.com';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const BACKUP_PREFIX = 'croplog-backup-';
const MAX_BACKUP_VERSIONS = 5; // 오늘/어제/그제/1주일전/1달전, 총 5개 슬롯
function selectBackupsToKeep(files){
  const now = Date.now();
  const DAY = 86400000;
  const targetDays = [0, 1, 2, 7, 30]; // 최근일수록 촘촘하게, 오래될수록 듬성듬성
  const parsed = files.map(f=>{
    const ts = parseInt(f.name.replace(BACKUP_PREFIX,'').replace('.json',''), 10);
    return { id:f.id, name:f.name, ts, ageDays: isNaN(ts) ? null : (now-ts)/DAY };
  }).filter(f=> f.ageDays !== null);

  const keepIds = new Set();
  const used = new Set();
  targetDays.forEach(target=>{
    let best = null, bestDiff = Infinity;
    parsed.forEach(f=>{
      if(used.has(f.id)) return;
      const diff = Math.abs(f.ageDays - target);
      if(diff < bestDiff){ bestDiff = diff; best = f; }
    });
    if(best){ keepIds.add(best.id); used.add(best.id); }
  });
  return keepIds;
}
let gTokenClient = null;
let gAccessToken = null;
let gTokenExpiry = 0;

async function toggleSyncEnabled(){
  appSettings.syncEnabled = !appSettings.syncEnabled;
  document.getElementById('syncEnableSwitch').classList.toggle('on', appSettings.syncEnabled);
  document.getElementById('syncPanel').classList.toggle('hidden', !appSettings.syncEnabled);
  await saveSettings();
}

function ensureTokenClient(){
  if(gTokenClient) return true;
  if(!window.google || !google.accounts || !google.accounts.oauth2) return false;
  gTokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: DRIVE_SCOPE,
    callback: ()=>{}
  });
  return true;
}
function requestAccessToken(interactive){
  return new Promise((resolve, reject)=>{
    if(!ensureTokenClient()){ reject(new Error('구글 로그인 스크립트를 아직 불러오는 중이에요. 잠시 후 다시 시도해주세요.')); return; }
    gTokenClient.callback = (resp)=>{
      if(resp.error){ reject(new Error(resp.error)); return; }
      gAccessToken = resp.access_token;
      gTokenExpiry = Date.now() + (resp.expires_in*1000 - 60000);
      resolve(gAccessToken);
    };
    gTokenClient.requestAccessToken({ prompt: interactive ? 'consent' : '' });
  });
}
async function getValidToken(){
  if(gAccessToken && Date.now() < gTokenExpiry) return gAccessToken;
  return await requestAccessToken(!gAccessToken);
}
async function trySilentGoogleSignIn(){
  if(gAccessToken && Date.now() < gTokenExpiry) return; // 이미 유효한 토큰 있음
  if(!ensureTokenClient()) return;
  try{
    await new Promise((resolve, reject)=>{
      gTokenClient.callback = (resp)=>{
        if(resp.error){ reject(new Error(resp.error)); return; }
        gAccessToken = resp.access_token;
        gTokenExpiry = Date.now() + (resp.expires_in*1000 - 60000);
        resolve();
      };
      gTokenClient.requestAccessToken({prompt:''});
    });
    document.getElementById('syncSignedOutBox').classList.add('hidden');
    document.getElementById('syncSignedInBox').classList.remove('hidden');
    try{
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {headers:{Authorization:'Bearer '+gAccessToken}});
      const info = await res.json();
      document.getElementById('syncAccountInfo').textContent = `${info.email || '구글 계정'}으로 로그인됨`;
    }catch(e){
      document.getElementById('syncAccountInfo').textContent = '로그인됨';
    }
  }catch(e){
    // 조용한 재로그인 실패 시 그냥 로그인 안 된 상태로 둠 (사용자가 직접 로그인 버튼 눌러야 함)
  }
}
async function startGoogleSignIn(){
  try{
    await requestAccessToken(true);
    document.getElementById('syncSignedOutBox').classList.add('hidden');
    document.getElementById('syncSignedInBox').classList.remove('hidden');
    try{
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {headers:{Authorization:'Bearer '+gAccessToken}});
      const info = await res.json();
      document.getElementById('syncAccountInfo').textContent = `${info.email || '구글 계정'}으로 로그인됨`;
    }catch(e){
      document.getElementById('syncAccountInfo').textContent = '로그인됨';
    }
    toast('구글 로그인 완료했어요');
  }catch(e){
    toast('로그인에 실패했어요');
  }
}
function signOutGoogle(){
  if(gAccessToken && window.google && google.accounts && google.accounts.oauth2){
    google.accounts.oauth2.revoke(gAccessToken, ()=>{});
  }
  gAccessToken = null; gTokenExpiry = 0;
  document.getElementById('syncSignedInBox').classList.add('hidden');
  document.getElementById('syncSignedOutBox').classList.remove('hidden');
  document.getElementById('syncStatusText').textContent = '';
  toast('로그아웃했어요');
}
async function listBackupFiles(token){
  const q = encodeURIComponent(`name contains '${BACKUP_PREFIX}' and trashed=false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,name,modifiedTime)&orderBy=name desc`, {
    headers:{ Authorization:'Bearer '+token }
  });
  const data = await res.json();
  return (data.files||[]).filter(f=>f.name.startsWith(BACKUP_PREFIX)).sort((a,b)=> b.name.localeCompare(a.name));
}
function blobToBase64(blob){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onloadend = ()=> resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
function blobToDataUrl(blob){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onloadend = ()=> resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
function base64ToBlob(base64, mime){
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for(let i=0;i<byteChars.length;i++) byteNumbers[i] = byteChars.charCodeAt(i);
  return new Blob([new Uint8Array(byteNumbers)], {type: mime || 'image/jpeg'});
}
let syncOperationActive = false;
let syncCancelRequested = false;
function showSyncProgress(){
  syncCancelRequested = false;
  const box = document.getElementById('syncProgressBox');
  if(box) box.classList.remove('hidden');
  updateSyncProgress(0, '준비 중...');
}
function hideSyncProgress(){
  const box = document.getElementById('syncProgressBox');
  if(box) box.classList.add('hidden');
}
function updateSyncProgress(pct, label){
  const fill = document.getElementById('syncProgressFill');
  const lbl = document.getElementById('syncProgressLabel');
  const pctEl = document.getElementById('syncProgressPct');
  const clamped = Math.min(100, Math.max(0, pct));
  if(fill) fill.style.width = clamped+'%';
  if(lbl) lbl.textContent = label;
  if(pctEl) pctEl.textContent = Math.round(clamped)+'%';
}
function cancelSyncOperation(){
  syncCancelRequested = true;
  toast('취소 요청했어요...');
}
function makeProgressTracker(totalSteps, silent){
  let done = 0;
  const startTime = Date.now();
  return function bump(label){
    done++;
    const pct = totalSteps>0 ? (done/totalSteps)*100 : 100;
    const elapsed = Date.now()-startTime;
    const estTotal = done>0 ? (elapsed/done)*totalSteps : 0;
    const remainSec = Math.max(0, Math.round((estTotal-elapsed)/1000));
    const remainLabel = remainSec>=60 ? `약 ${Math.ceil(remainSec/60)}분 남음` : (remainSec>0 ? `약 ${remainSec}초 남음` : '');
    if(!silent) updateSyncProgress(pct, `${label}${remainLabel? ' · '+remainLabel:''}`);
  };
}
async function performBackup(silent){
  if(syncOperationActive){ if(!silent) toast('이미 백업이 진행 중이에요'); return false; }
  syncOperationActive = true;
  if(!silent) showSyncProgress();
  const statusEl = document.getElementById('syncStatusText');
  const setStatus = (msg)=>{ if(statusEl) statusEl.textContent = msg; };
  try{
    setStatus('백업 준비 중...');
    const token = await getValidToken();
    const [crops, trials, photos, notes, metaAll, comparisons, schedules] = await Promise.all([
      idbGetAll('crops'), idbGetAll('trials'), idbGetAll('photos'), idbGetAll('notes'), idbGetAll('meta'), idbGetAll('comparisons'), idbGetAll('schedules')
    ]);

    // 안전장치: 로컬에 시교가 하나도 없는데 예전 백업은 있는 상태라면, 실수로 빈 데이터를 덮어쓰는 걸 막음
    if(trials.length===0){
      const existing = await listBackupFiles(token);
      if(existing.length>0){
        if(silent){ setStatus(''); return false; }
        const proceed = await showConfirm({
          title:'빈 데이터 백업 주의',
          message:'지금 이 기기에 등록된 시교가 하나도 없어요.\n이 상태로 백업하면 기존에 저장해둔 데이터를 잃을 수 있어요. 정말 진행할까요?',
          confirmLabel:'그래도 백업', danger:true
        });
        if(!proceed){ setStatus(''); return false; }
      }
    }

    const totalSteps = photos.length + comparisons.length + 1; // +1은 업로드 단계
    const bump = makeProgressTracker(totalSteps, silent);

    const photosOut = [];
    for(let i=0;i<photos.length;i++){
      if(syncCancelRequested) throw new Error('사용자가 취소했어요');
      const p = photos[i];
      setStatus(`사진 변환 중 (${i+1}/${photos.length})`);
      const b64 = await blobToBase64(p.blob);
      photosOut.push({id:p.id, trialId:p.trialId, date:p.date, createdAt:p.createdAt, mime:p.blob.type||'image/jpeg', data:b64});
      bump(`사진 변환 중 (${i+1}/${photos.length})`);
    }
    const comparisonsOut = [];
    for(const c of comparisons){
      if(syncCancelRequested) throw new Error('사용자가 취소했어요');
      const b64 = await blobToBase64(c.blob);
      comparisonsOut.push({id:c.id, scope:c.scope, trialId:c.trialId||null, createdAt:c.createdAt, mime:c.blob.type||'image/png', data:b64});
      bump('비교 이미지 변환 중');
    }
    const backup = { version:3, exportedAt: Date.now(), crops, trials, notes, meta: metaAll, photos: photosOut, comparisons: comparisonsOut, schedules };
    const json = JSON.stringify(backup);

    if(syncCancelRequested) throw new Error('사용자가 취소했어요');
    setStatus('업로드 중...');
    if(!silent) updateSyncProgress(95, '업로드 중...');
    const filename = `${BACKUP_PREFIX}${Date.now()}.json`;
    const metadata = { name: filename, mimeType:'application/json' };
    const boundary = 'croplog_boundary_' + Date.now();
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${json}\r\n` +
      `--${boundary}--`;
    const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`, {
      method: 'POST',
      headers:{ Authorization:'Bearer '+token, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body
    });
    if(!res.ok) throw new Error('upload failed: '+res.status);
    bump('업로드 완료');

    // 오래된 백업 정리 — 최근 며칠은 촘촘하게, 오래된 건 듬성듬성(오늘/어제/그제/1주일전/1달전) 보관
    const allBackups = await listBackupFiles(token);
    const keepIds = selectBackupsToKeep(allBackups);
    const toDelete = allBackups.filter(f=>!keepIds.has(f.id));
    for(const f of toDelete){
      await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}`, { method:'DELETE', headers:{ Authorization:'Bearer '+token } }).catch(()=>{});
    }

    await idbPut('meta', {key:'lastBackupAt', value: Date.now()});
    if(!silent) updateSyncProgress(100, '완료');
    setStatus(`마지막 백업: ${new Date().toLocaleString('ko-KR')}`);
    if(silent){ if(appSettings.feedback) rawToast('자동 백업을 완료했어요'); }
    else { toast('백업 완료했어요'); }
    return true;
  }catch(e){
    console.error(e);
    setStatus('');
    if(e.message==='사용자가 취소했어요'){ if(!silent) toast('백업을 취소했어요'); }
    else if(!silent) toast(`백업에 실패했어요: ${e.message || e}`);
    return false;
  }finally{
    syncOperationActive = false;
    if(!silent) setTimeout(hideSyncProgress, 900);
  }
}
async function backupToDrive(){ return performBackup(false); }

/* ================= 기기 로컬 백업/복원 (구글 로그인 불필요) ================= */
async function backupToDevice(){
  if(syncOperationActive){ toast('이미 다른 백업/복원 작업이 진행 중이에요'); return; }
  syncOperationActive = true;
  showSyncProgress();
  const statusEl = document.getElementById('syncStatusText');
  const setStatus = (msg)=>{ if(statusEl) statusEl.textContent = msg; };
  try{
    setStatus('백업 준비 중...');
    const [crops, trials, photos, notes, metaAll, comparisons, schedules] = await Promise.all([
      idbGetAll('crops'), idbGetAll('trials'), idbGetAll('photos'), idbGetAll('notes'), idbGetAll('meta'), idbGetAll('comparisons'), idbGetAll('schedules')
    ]);
    if(trials.length===0){
      const proceed = await showConfirm({
        title:'빈 데이터 백업 주의',
        message:'지금 이 기기에 등록된 시교가 하나도 없어요.\n이 상태로 백업하면 예전에 저장해둔 백업 파일을 빈 내용으로 덮어쓸 수 있어요. 정말 진행할까요?',
        confirmLabel:'그래도 백업', danger:true
      });
      if(!proceed){ setStatus(''); return; }
    }
    const totalSteps = photos.length + comparisons.length + 1;
    const bump = makeProgressTracker(totalSteps, false);
    const photosOut = [];
    for(let i=0;i<photos.length;i++){
      const p = photos[i];
      setStatus(`사진 변환 중 (${i+1}/${photos.length})`);
      const b64 = await blobToBase64(p.blob);
      photosOut.push({id:p.id, trialId:p.trialId, date:p.date, createdAt:p.createdAt, mime:p.blob.type||'image/jpeg', data:b64});
      bump(`사진 변환 중 (${i+1}/${photos.length})`);
    }
    const comparisonsOut = [];
    for(const c of comparisons){
      const b64 = await blobToBase64(c.blob);
      comparisonsOut.push({id:c.id, scope:c.scope, trialId:c.trialId||null, createdAt:c.createdAt, mime:c.blob.type||'image/png', data:b64});
      bump('비교 이미지 변환 중');
    }
    const backup = { version:3, exportedAt: Date.now(), crops, trials, notes, meta: metaAll, photos: photosOut, comparisons: comparisonsOut, schedules };
    const json = JSON.stringify(backup);
    setStatus('파일 저장 중...');
    updateSyncProgress(95, '파일 저장 중...');
    const blob = new Blob([json], {type:'application/json'});
    if(isNativeApp()){
      await nativeShareBlob(blob, 'croplog-backup.json', 'CropLog 백업 파일');
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'croplog-backup.json'; // 항상 같은 파일명 — 다시 저장하면 기존 파일을 덮어씀
      a.click();
    }
    bump('완료');
    updateSyncProgress(100, '완료');
    await idbPut('meta', {key:'lastLocalBackupAt', value: Date.now()});
    setStatus(`마지막 기기 백업: ${new Date().toLocaleString('ko-KR')}`);
    toast('기기에 백업 파일을 저장했어요');
  }catch(e){
    console.error(e);
    setStatus('');
    showStorageError(e);
  }finally{
    syncOperationActive = false;
    setTimeout(hideSyncProgress, 900);
  }
}
async function restoreFromDeviceFile(event){
  const file = event.target.files && event.target.files[0];
  event.target.value = '';
  if(!file) return;
  const ok = await showConfirm({
    title:'기기 파일로 복원',
    message:`"${file.name}" 파일로 복원할까요?\n지금 이 기기에 있는 데이터는 그 파일 내용으로 덮어써져요.`,
    confirmLabel:'복원', danger:true
  });
  if(!ok) return;
  if(syncOperationActive){ toast('이미 다른 백업/복원 작업이 진행 중이에요'); return; }
  syncOperationActive = true;
  showSyncProgress();
  const statusEl = document.getElementById('syncStatusText');
  try{
    statusEl.textContent = '파일 읽는 중...';
    updateSyncProgress(5, '파일 읽는 중...');
    const text = await file.text();
    const backup = JSON.parse(text);
    statusEl.textContent = '복원 중...';
    await idbClearAll();
    const totalSteps = (backup.crops||[]).length + (backup.trials||[]).length + (backup.notes||[]).length + (backup.meta||[]).length + (backup.photos||[]).length + (backup.comparisons||[]).length + (backup.schedules||[]).length + 1;
    const bump = makeProgressTracker(totalSteps, false);
    for(const c of backup.crops||[]) { await idbPut('crops', c); bump('복원 중'); }
    for(const t of backup.trials||[]) { await idbPut('trials', t); bump('복원 중'); }
    for(const n of backup.notes||[]) { await idbPut('notes', n); bump('복원 중'); }
    for(const m of backup.meta||[]) { await idbPut('meta', m); bump('복원 중'); }
    for(const p of backup.photos||[]){
      const blob = base64ToBlob(p.data, p.mime);
      await idbPut('photos', {id:p.id, trialId:p.trialId, date:p.date, createdAt:p.createdAt, blob});
      bump('사진 복원 중');
    }
    for(const c of backup.comparisons||[]){
      const blob = base64ToBlob(c.data, c.mime);
      await idbPut('comparisons', {id:c.id, scope:c.scope, trialId:c.trialId, createdAt:c.createdAt, blob});
      bump('비교 이미지 복원 중');
    }
    for(const s of backup.schedules||[]) { await idbPut('schedules', s); bump('복원 중'); }
    await loadSettings();
    bump('완료');
    updateSyncProgress(100, '완료');
    statusEl.textContent = `마지막 복원: ${new Date().toLocaleString('ko-KR')}`;
    toast('복원 완료했어요');
    go('home');
  }catch(e){
    console.error(e);
    statusEl.textContent = '';
    toast(`복원에 실패했어요: ${e.message || e}`);
  }finally{
    syncOperationActive = false;
    setTimeout(hideSyncProgress, 900);
  }
}
async function autoBackupCheckAndRun(){
  if(!appSettings.syncEnabled) return;
  if(!ensureTokenClient()) return;
  const lastMeta = await idbGet('meta','lastBackupAt');
  const last = lastMeta ? lastMeta.value : 0;
  const TWELVE_HOURS = 12*60*60*1000;
  if(Date.now() - last < TWELVE_HOURS) return;
  try{
    await new Promise((resolve, reject)=>{
      gTokenClient.callback = (resp)=>{
        if(resp.error){ reject(new Error(resp.error)); return; }
        gAccessToken = resp.access_token;
        gTokenExpiry = Date.now() + (resp.expires_in*1000 - 60000);
        resolve();
      };
      gTokenClient.requestAccessToken({prompt:''});
    });
    await performBackup(true);
  }catch(e){
    // 자동(무인) 로그인이 안 되면 조용히 넘어감 — 사용자가 직접 로그인해야 다음 백업이 가능함
  }
}
async function restoreFromDrive(){
  if(syncOperationActive){ toast('이미 다른 백업/복원 작업이 진행 중이에요'); return; }
  const statusEl = document.getElementById('syncStatusText');
  try{
    statusEl.textContent = '백업 목록 확인 중...';
    const token = await getValidToken();
    const files = await listBackupFiles(token);
    statusEl.textContent = '';
    if(files.length===0){ toast('드라이브에 백업 파일이 없어요'); return; }
    openBackupPickerModal(files);
  }catch(e){
    console.error(e);
    statusEl.textContent = '';
    toast(`백업 목록을 불러오지 못했어요: ${e.message || e}`);
  }
}
function openBackupPickerModal(files){
  removeIfExists('backupPickModal');
  const backdrop = document.createElement('div');
  backdrop.className='modal-backdrop'; backdrop.id='backupPickModal';
  backdrop.innerHTML = `
    <div class="modal-sheet">
      <h3>복원할 백업 선택</h3>
      <p style="font-size:12px;color:var(--muted);margin:-8px 0 14px;">최근 ${files.length}개의 백업 중 하나를 골라주세요.</p>
      ${files.map(f=>{
        const ts = parseInt(f.name.replace(BACKUP_PREFIX,'').replace('.json',''), 10);
        const dateLabel = ts ? new Date(ts).toLocaleString('ko-KR') : f.name;
        const ageDays = ts ? Math.floor((Date.now()-ts)/86400000) : null;
        const rel = ageDays===null ? '' : ageDays===0 ? '오늘' : ageDays===1 ? '어제' : `${ageDays}일 전`;
        const fullLabel = rel ? `${rel} · ${dateLabel}` : dateLabel;
        return `<div class="settings-row" onclick="confirmRestoreFile('${f.id}','${dateLabel.replace(/'/g,"")}')"><span>${fullLabel}</span><span class="chev">${icon('chevRight',14)}</span></div>`;
      }).join('')}
      <button class="btn btn-ghost" style="margin-top:14px;" onclick="closeModal('backupPickModal')">취소</button>
    </div>`;
  document.body.appendChild(backdrop);
  attachBackdropDismiss(backdrop);
}
async function confirmRestoreFile(fileId, label){
  closeModal('backupPickModal');
  const ok = await showConfirm({
    title:'복원하기',
    message:`"${label}" 시점의 백업으로 복원할까요?\n지금 이 기기에 있는 데이터는 그 시점 내용으로 덮어써져요.`,
    confirmLabel:'복원', danger:true
  });
  if(!ok) return;
  if(syncOperationActive){ toast('이미 다른 백업/복원 작업이 진행 중이에요'); return; }
  syncOperationActive = true;
  showSyncProgress();
  const statusEl = document.getElementById('syncStatusText');
  try{
    statusEl.textContent = '다운로드 중...';
    updateSyncProgress(5, '다운로드 중...');
    const token = await getValidToken();
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers:{ Authorization:'Bearer '+token }
    });
    if(!res.ok) throw new Error(`다운로드 실패 (${res.status})`);
    const backup = await res.json();
    if(syncCancelRequested) throw new Error('사용자가 취소했어요');
    statusEl.textContent = '복원 중...';
    await idbClearAll();
    const totalSteps = (backup.crops||[]).length + (backup.trials||[]).length + (backup.notes||[]).length + (backup.meta||[]).length + (backup.photos||[]).length + (backup.comparisons||[]).length + (backup.schedules||[]).length + 1;
    const bump = makeProgressTracker(totalSteps, false);
    for(const c of backup.crops||[]){ if(syncCancelRequested) throw new Error('사용자가 취소했어요'); await idbPut('crops', c); bump('복원 중'); }
    for(const t of backup.trials||[]){ if(syncCancelRequested) throw new Error('사용자가 취소했어요'); await idbPut('trials', t); bump('복원 중'); }
    for(const n of backup.notes||[]){ if(syncCancelRequested) throw new Error('사용자가 취소했어요'); await idbPut('notes', n); bump('복원 중'); }
    for(const m of backup.meta||[]){ if(syncCancelRequested) throw new Error('사용자가 취소했어요'); await idbPut('meta', m); bump('복원 중'); }
    for(const p of backup.photos||[]){
      if(syncCancelRequested) throw new Error('사용자가 취소했어요');
      const blob = base64ToBlob(p.data, p.mime);
      await idbPut('photos', {id:p.id, trialId:p.trialId, date:p.date, createdAt:p.createdAt, blob});
      bump(`사진 복원 중`);
    }
    for(const c of backup.comparisons||[]){
      if(syncCancelRequested) throw new Error('사용자가 취소했어요');
      const blob = base64ToBlob(c.data, c.mime);
      await idbPut('comparisons', {id:c.id, scope:c.scope, trialId:c.trialId, createdAt:c.createdAt, blob});
      bump('비교 이미지 복원 중');
    }
    for(const s of backup.schedules||[]){ if(syncCancelRequested) throw new Error('사용자가 취소했어요'); await idbPut('schedules', s); bump('복원 중'); }
    await loadSettings();
    bump('완료');
    updateSyncProgress(100, '완료');
    statusEl.textContent = `마지막 복원: ${new Date().toLocaleString('ko-KR')}`;
    toast('복원 완료했어요');
    go('home');
  }catch(e){
    console.error(e);
    statusEl.textContent = '';
    if(e.message==='사용자가 취소했어요') toast('복원을 취소했어요 — 데이터가 일부만 반영됐을 수 있어요');
    else toast(`복원에 실패했어요: ${e.message || e}`);
  }finally{
    syncOperationActive = false;
    setTimeout(hideSyncProgress, 900);
  }
}

/* ================= 설정 ================= */
async function exportCSV(){
  const [crops, trials, photos] = await Promise.all([idbGetAll('crops'), idbGetAll('trials'), idbGetAll('photos')]);
  const cropMap = Object.fromEntries(crops.map(c=>[c.id,c]));
  const photoCount = {};
  photos.forEach(p=>{ photoCount[p.trialId] = (photoCount[p.trialId]||0)+1; });
  const header = ['품목','SEG','제품/시교명','지역','성함','파종일','정식일','대비종','밭 주소','사진 수','등록일'];
  const rows = trials.map(t=>{
    const c = cropMap[t.cropId] || {name:''};
    return [
      c.name||'', t.seg||'', t.name||'', t.region||'', t.growerName||'', t.sowDate||'', t.transplantDate||'',
      t.referenceVariety||'', (t.fieldAddresses||(t.fieldAddress?[t.fieldAddress]:[])).join('; '), String(photoCount[t.id]||0),
      new Date(t.createdAt).toLocaleDateString('ko-KR')
    ];
  });
  const escapeCell = (v)=>{
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
  };
  const csv = [header, ...rows].map(row=>row.map(escapeCell).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8;'});
  if(isNativeApp()){
    await nativeShareBlob(blob, `CropLog_시교목록_${todayStr()}.csv`, 'CSV 내보내기');
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `CropLog_시교목록_${todayStr()}.csv`;
  a.click();
  toast('CSV 파일을 저장했어요');
}
async function confirmResetData(){
  const ok = await showConfirm({
    title:'전체 데이터 초기화',
    message:'정말 모든 데이터(품목, 시교, 사진, 메모)를 삭제할까요?\n이 작업은 되돌릴 수 없어요.',
    confirmLabel:'초기화', danger:true
  });
  if(ok){
    await idbClearAll();
    toast('초기화됐어요');
    go('home');
  }
}

/* ================= 초기화 ================= */
/* ================= 모달 열림 시 배경 스크롤 잠금 ================= */
let _scrollLockY = 0;
new MutationObserver(()=>{
  const hasModal = !!document.querySelector('.modal-backdrop, .lightbox, .landscape-overlay');
  const alreadyLocked = document.body.classList.contains('scroll-locked');
  if(hasModal && !alreadyLocked){
    _scrollLockY = window.scrollY || window.pageYOffset || 0;
    document.body.classList.add('scroll-locked');
    document.body.style.top = `-${_scrollLockY}px`;
  } else if(!hasModal && alreadyLocked){
    document.body.classList.remove('scroll-locked');
    document.body.style.top = '';
    window.scrollTo(0, _scrollLockY);
  }
  document.getElementById('app').classList.toggle('modal-lock', hasModal);
}).observe(document.body, {childList:true});

/* ================= 이미지 롱프레스 시 브라우저 기본 메뉴 차단 ================= */
document.addEventListener('contextmenu', (e)=>{
  if(e.target && e.target.tagName==='IMG') e.preventDefault();
});

/* ================= 폰을 가로로 기울이면 성장비교/품종비교를 자동으로 가로 확대 ================= */
function handleAutoLandscape(isLandscape){
  const overlayOpen = !!document.getElementById('landscapeOverlay');
  if(isLandscape){
    if(overlayOpen) return;
    const activeSection = document.querySelector('#app > section:not(.hidden)');
    if(!activeSection) return;
    if(activeSection.id==='view-detail'){
      const compareTabOn = document.getElementById('detailTabCompare')?.classList.contains('active');
      if(compareTabOn) openDetailCompareLandscape();
    } else if(activeSection.id==='view-xcompare'){
      openXCompareLandscape();
    }
  } else if(overlayOpen){
    removeIfExists('landscapeOverlay');
  }
}
if(window.matchMedia){
  const orientMq = window.matchMedia('(orientation: landscape)');
  const onOrientChange = (e)=> handleAutoLandscape(e.matches);
  if(orientMq.addEventListener) orientMq.addEventListener('change', onOrientChange);
  else if(orientMq.addListener) orientMq.addListener(onOrientChange); // 구형 브라우저 호환
}

if('serviceWorker' in navigator){
  if(isNativeApp()){
    // 네이티브 앱 안에서는 서비스워커가 필요 없고, 오히려 예전 버전을 계속 캐시해서 보여주는 원인이 될 수 있어
    // 혹시 이미 등록된 게 있으면 해제하고 캐시도 정리함
    navigator.serviceWorker.getRegistrations().then(regs=>{
      regs.forEach(r=> r.unregister());
    }).catch(()=>{});
    if(window.caches && caches.keys){
      caches.keys().then(names=> names.forEach(n=> caches.delete(n))).catch(()=>{});
    }
  } else {
    window.addEventListener('load', ()=>{
      navigator.serviceWorker.register('./sw.js').catch(()=>{});
    });
  }
}

openDB().then(async ()=>{
  await loadSettings();
  await ensurePresetCrops();
  go('home');
  window.addEventListener('load', ()=>{
    setTimeout(()=>{ autoBackupCheckAndRun(); }, 2000);
    setTimeout(()=>{ checkTodaySchedules(); }, 1200);
  });
});
