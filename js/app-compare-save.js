/* ================= 비교 저장 (성장비교/품종비교 공용) ================= */
function buildComparisonCanvas({photoInfos, sharedHeader}){
  return new Promise(async (resolve)=>{
    const n = photoInfos.length;
    const S = 1.6; // 해상도 배율 (선명도 개선용, 레이아웃 비율은 그대로 유지)
    const gap = Math.round(14*S), W = Math.round(900*S);
    const cellW = Math.floor((W - gap*(n+1))/n), cellH = cellW;
    const headerH = sharedHeader.length ? Math.round((44 + (sharedHeader.length-1)*28 + 20)*S) : Math.round(20*S);
    const maxLines = Math.max(...photoInfos.map(p=>p.lines.length), 1);
    const capH = Math.round((16 + maxLines*22)*S);
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = headerH + cellH + capH + Math.round(16*S);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle='#f6f4ee'; ctx.fillRect(0,0,canvas.width,canvas.height);
    let hy = Math.round(36*S);
    sharedHeader.forEach((line,i)=>{
      ctx.fillStyle = i===0 ? '#3c3226' : '#635b4d';
      ctx.font = i===0 ? `bold ${Math.round(26*S)}px sans-serif` : `bold ${Math.round(17*S)}px sans-serif`;
      ctx.fillText(line, Math.round(20*S), hy);
      hy += Math.round(28*S);
    });
    for(let i=0;i<n;i++){
      const x = gap + i*(cellW+gap);
      const y = headerH;
      await new Promise(res=>{
        const img = new Image();
        img.onload=()=>{ ctx.drawImage(img, x, y, cellW, cellH); res(); };
        img.src = URL.createObjectURL(photoInfos[i].blob);
      });
      let ly = y+cellH+Math.round(22*S);
      ctx.fillStyle = '#4a463c'; ctx.font=`bold ${Math.round(16*S)}px sans-serif`;
      photoInfos[i].lines.forEach(line=>{ ctx.fillText(line, x, ly); ly+=Math.round(22*S); });
    }
    canvas.toBlob(b=>resolve(b), 'image/png');
  });
}
async function saveDetailComparison(){
  const ids = cmpSlots.filter(Boolean);
  if(ids.length<2){ toast('비교할 사진을 2장 이상 선택해주세요'); return; }
  const t = await idbGet('trials', currentTrialId);
  const c = await idbGet('crops', t.cropId);
  const photoRecords = await Promise.all(ids.map(id=>idbGet('photos', id)));
  const sharedHeader = [`${c.name} · ${t.seg} · ${trialTitle(t)}`];
  const dateBits = buildDateBitsLine(t);
  if(dateBits) sharedHeader.push(dateBits);
  const photoInfos = photoRecords.map(p=>({ blob:p.blob, lines:[p.date] }));
  const blob = await buildComparisonCanvas({photoInfos, sharedHeader});
  try{
    await idbPut('comparisons', {id:uid(), scope:'detail', trialId: currentTrialId, blob, createdAt: Date.now()});
    toast('비교를 저장했어요');
  }catch(e){ showStorageError(e); return; }
  renderSavedComparisons('detail', currentTrialId);
}
async function saveXComparison(){
  const slots = xCmpSlots.filter(Boolean);
  if(slots.length<2){ toast('비교할 시교를 2개 이상 선택해주세요'); return; }
  const photoInfos = [];
  for(const s of slots){
    const [t,p] = await Promise.all([idbGet('trials', s.trialId), idbGet('photos', s.photoId)]);
    if(!t || !p) continue;
    const c = await idbGet('crops', t.cropId);
    photoInfos.push({ blob: p.blob, lines: buildTrialLabelLines(c,t,p) });
  }
  if(photoInfos.length<2){ toast('비교할 사진이 부족해요'); return; }
  const blob = await buildComparisonCanvas({photoInfos, sharedHeader: []});
  try{
    await idbPut('comparisons', {id:uid(), scope:'xcompare', trialId:null, blob, createdAt: Date.now()});
    toast('비교를 저장했어요');
  }catch(e){ showStorageError(e); return; }
  renderSavedComparisons('xcompare');
}
async function renderSavedComparisons(scope, trialId){
  const all = await idbGetAll('comparisons');
  const filtered = all.filter(c=> c.scope===scope && (scope!=='detail' || c.trialId===trialId)).sort((a,b)=>b.createdAt-a.createdAt);
  const containerId = scope==='detail' ? 'savedCompareDetail' : 'savedCompareX';
  const rowId = scope==='detail' ? 'savedCompareDetailRow' : 'savedCompareXRow';
  const container = document.getElementById(containerId);
  const row = document.getElementById(rowId);
  if(!container || !row) return;
  if(filtered.length===0){ container.classList.add('hidden'); row.innerHTML=''; return; }
  container.classList.remove('hidden');
  row.innerHTML = filtered.map(c=>`<div class="saved-cmp-thumb" data-cmp-id="${c.id}"><img draggable="false" oncontextmenu="return false;" src="${getPhotoUrl(c)}"><div class="chk">${icon('check',12)}</div></div>`).join('');
  initSavedCmpLongPress(row, scope);
  updateSavedCmpSelectUI(scope);
}
let savedCmpSelectMode = {detail:false, xcompare:false};
let savedCmpSelectedIds = {detail:new Set(), xcompare:new Set()};
function initSavedCmpLongPress(row, scope){
  if(row.dataset.bound) return;
  row.dataset.bound = '1';
  let timer=null, fired=false;
  row.addEventListener('touchstart', (e)=>{
    const thumb = e.target.closest('.saved-cmp-thumb');
    if(!thumb) return;
    fired=false;
    timer = setTimeout(()=>{
      fired=true;
      timer=null;
      if(appSettings.feedback) vibrate([10,30,10]);
      enterSavedCmpSelectMode(scope, thumb.dataset.cmpId);
    }, 500);
  }, {passive:true});
  row.addEventListener('touchend', ()=>{ if(timer){clearTimeout(timer);timer=null;} });
  row.addEventListener('touchmove', ()=>{ if(timer){clearTimeout(timer);timer=null;} });
  row.addEventListener('click', (e)=>{
    if(fired){ fired=false; return; }
    const thumb = e.target.closest('.saved-cmp-thumb');
    if(!thumb) return;
    if(savedCmpSelectMode[scope]) toggleSavedCmpSelect(scope, thumb.dataset.cmpId);
    else viewSavedComparison(thumb.dataset.cmpId);
  });
}
function enterSavedCmpSelectMode(scope, id){
  savedCmpSelectMode[scope] = true;
  savedCmpSelectedIds[scope] = new Set([id]);
  updateSavedCmpSelectUI(scope);
}
function toggleSavedCmpSelect(scope, id){
  const set = savedCmpSelectedIds[scope];
  if(set.has(id)) set.delete(id); else set.add(id);
  if(set.size===0){ exitSavedCmpSelectMode(scope); return; }
  updateSavedCmpSelectUI(scope);
}
function updateSavedCmpSelectUI(scope){
  const rowId = scope==='detail' ? 'savedCompareDetailRow' : 'savedCompareXRow';
  const row = document.getElementById(rowId);
  if(!row) return;
  row.classList.toggle('select-mode', savedCmpSelectMode[scope]);
  row.querySelectorAll('.saved-cmp-thumb').forEach(el=>{
    el.classList.toggle('selected', savedCmpSelectedIds[scope].has(el.dataset.cmpId));
  });
  if(savedCmpSelectMode[scope]) showSavedCmpSelectBar(scope);
}
function showSavedCmpSelectBar(scope){
  const barId = scope==='detail' ? 'savedCmpSelectBarDetail' : 'savedCmpSelectBarX';
  let bar = document.getElementById(barId);
  if(!bar){
    bar = document.createElement('div');
    bar.id = barId;
    bar.className = 'timeline-select-bar';
    document.body.appendChild(bar);
  }
  const n = savedCmpSelectedIds[scope].size;
  bar.innerHTML = `
    <button class="btn btn-ghost" onclick="exitSavedCmpSelectMode('${scope}')">취소</button>
    <button class="btn btn-danger" onclick="deleteSavedCmpSelected('${scope}')">${n}개의 비교 삭제하기</button>`;
}
function exitSavedCmpSelectMode(scope){
  savedCmpSelectMode[scope] = false;
  savedCmpSelectedIds[scope] = new Set();
  const rowId = scope==='detail' ? 'savedCompareDetailRow' : 'savedCompareXRow';
  const row = document.getElementById(rowId);
  if(row){
    row.classList.remove('select-mode');
    row.querySelectorAll('.saved-cmp-thumb.selected').forEach(el=>el.classList.remove('selected'));
  }
  const barId = scope==='detail' ? 'savedCmpSelectBarDetail' : 'savedCmpSelectBarX';
  removeIfExists(barId);
}
async function deleteSavedCmpSelected(scope){
  const ids = Array.from(savedCmpSelectedIds[scope]);
  if(ids.length===0) return;
  const ok = await showConfirm({title:'비교 삭제', message:`선택한 비교 ${ids.length}개를 삭제할까요?\n되돌릴 수 없어요.`, confirmLabel:'삭제', danger:true});
  if(!ok) return;
  for(const id of ids) await idbDelete('comparisons', id);
  toast(`비교 ${ids.length}개 삭제했어요`);
  exitSavedCmpSelectMode(scope);
  renderSavedComparisons(scope, scope==='detail' ? currentTrialId : null);
}
async function viewSavedComparison(id){
  const c = await idbGet('comparisons', id);
  if(!c) return;
  removeIfExists('savedCmpViewer');
  const overlay = document.createElement('div');
  overlay.className = 'landscape-overlay'; overlay.id='savedCmpViewer';
  overlay.style.flexDirection = 'column';
  overlay.style.alignItems = 'stretch';
  overlay.innerHTML = `
    <div class="lb-top" style="justify-content:flex-end;"><span onclick="removeIfExists('savedCmpViewer')">${icon('close',18)}</span></div>
    <div class="scv-wrap" id="scvWrap"><img id="scvImg" src="${getPhotoUrl(c)}"></div>
    <div class="lb-actions">
      <a class="a primary" onclick="shareSavedComparison('${id}')">공유</a>
      <a class="a" style="background:rgba(181,84,63,0.4);" onclick="deleteSavedComparison('${id}','${c.scope}','${c.trialId||''}')">삭제</a>
    </div>`;
  document.body.appendChild(overlay);
  const wrap = document.getElementById('scvWrap');
  wrap.addEventListener('click', (e)=>{ if(e.target.id==='scvWrap') removeIfExists('savedCmpViewer'); });
  attachSimpleZoomPan(wrap, document.getElementById('scvImg'));
}
function attachSimpleZoomPan(wrap, img){
  if(!wrap || !img) return;
  const overlay = wrap.closest('.landscape-overlay') || wrap.parentElement;
  img.style.transition = 'none';
  wrap.style.touchAction = 'none';
  let scale=1, panX=0, panY=0;
  let startDist=0, startScale=1, startPanX=0, startPanY=0, startTouchX=0, startTouchY=0;
  let mode=null, lastTap=0;
  let swipeStartX=0, swipeStartY=0;
  function getRenderSize(){
    const iw = img.naturalWidth || 1, ih = img.naturalHeight || 1;
    const cw = wrap.clientWidth, ch = wrap.clientHeight;
    const ir = iw/ih, cr = cw/ch;
    if(ir > cr) return { rw: cw, rh: cw/ir };
    return { rw: ch*ir, rh: ch };
  }
  function clampPan(){
    const {rw, rh} = getRenderSize();
    const cw = wrap.clientWidth, ch = wrap.clientHeight;
    const maxX = Math.max(0, (rw*scale - cw)/2);
    const maxY = Math.max(0, (rh*scale - ch)/2);
    panX = Math.min(maxX, Math.max(-maxX, panX));
    panY = Math.min(maxY, Math.max(-maxY, panY));
  }
  function apply(smooth){
    clampPan();
    img.style.transition = smooth ? 'transform .12s ease' : 'none';
    img.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  }
  function dist(t){ const dx=t[0].clientX-t[1].clientX, dy=t[0].clientY-t[1].clientY; return Math.hypot(dx,dy); }
  function applyDismiss(dy, smooth){
    if(!overlay) return;
    overlay.style.transition = smooth ? 'transform .22s ease, opacity .22s ease' : 'none';
    overlay.style.transform = `translateY(${dy}px)`;
    overlay.style.opacity = String(Math.max(0.25, 1 - Math.abs(dy)/400));
  }
  wrap.addEventListener('touchstart', (e)=>{
    if(e.touches.length===2){ mode='pinch'; startDist=dist(e.touches); startScale=scale; }
    else if(e.touches.length===1){
      const t=e.touches[0];
      swipeStartX = t.clientX; swipeStartY = t.clientY;
      if(scale>1){ mode='pan'; startTouchX=t.clientX; startTouchY=t.clientY; startPanX=panX; startPanY=panY; }
      else { mode='tap'; }
    }
  }, {passive:true});
  wrap.addEventListener('touchmove', (e)=>{
    if(mode==='pinch' && e.touches.length===2){
      e.preventDefault();
      const d = dist(e.touches);
      if(startDist>0){ scale = Math.min(4, Math.max(1, startScale*(d/startDist))); apply(false); }
    } else if(mode==='pan' && e.touches.length===1){
      e.preventDefault();
      const t=e.touches[0];
      panX = startPanX + (t.clientX-startTouchX);
      panY = startPanY + (t.clientY-startTouchY);
      apply(false);
    } else if(mode==='tap' && e.touches.length===1){
      const t=e.touches[0];
      const dx=t.clientX-swipeStartX, dy=t.clientY-swipeStartY;
      if(Math.abs(dy)>10 && Math.abs(dy)>Math.abs(dx)*1.2) mode='dismiss';
      if(mode==='dismiss' && dy>0){ e.preventDefault(); applyDismiss(dy, false); }
    } else if(mode==='dismiss' && e.touches.length===1){
      const t=e.touches[0]; const dy=t.clientY-swipeStartY;
      if(dy>0){ e.preventDefault(); applyDismiss(dy, false); }
    }
  }, {passive:false});
  wrap.addEventListener('touchend', (e)=>{
    if(mode==='dismiss'){
      const t=e.changedTouches[0]; const dy=t.clientY-swipeStartY;
      if(dy>110){ applyDismiss(window.innerHeight, true); setTimeout(()=>{ if(overlay) overlay.remove(); }, 220); }
      else { applyDismiss(0, true); }
    } else if(mode==='tap'){
      const now = Date.now();
      if(now-lastTap<300){ scale = scale>1 ? 1 : 2.2; panX=0; panY=0; apply(true); }
      lastTap = now;
    } else if(mode==='pinch' || mode==='pan'){
      if(scale<=1.02){ scale=1; panX=0; panY=0; apply(true); }
    }
    mode=null;
  });
}
async function shareSavedComparison(id){
  const c = await idbGet('comparisons', id);
  if(!c) return;
  if(isNativeApp()){ await nativeShareBlob(c.blob, 'comparison.png', '비교 이미지'); return; }
  const file = new File([c.blob], 'comparison.png', {type:'image/png'});
  if(navigator.share && navigator.canShare && navigator.canShare({files:[file]})){
    try{ await navigator.share({files:[file], title:'비교 이미지'}); }catch(e){}
  } else {
    toast('이 브라우저는 공유가 지원되지 않아요. 이미지를 길게 눌러 저장해보세요.');
  }
}
async function deleteSavedComparison(id, scope, trialId){
  const ok = await showConfirm({title:'비교 삭제', message:'저장된 비교를 삭제할까요?', confirmLabel:'삭제', danger:true});
  if(!ok) return;
  await idbDelete('comparisons', id);
  removeIfExists('savedCmpViewer');
  toast('삭제했어요');
  renderSavedComparisons(scope, trialId||null);
}

function openXComparePicker(which){
  removeIfExists('xTrialPickModal');
  const backdrop = document.createElement('div');
  backdrop.className='modal-backdrop'; backdrop.id='xTrialPickModal';
  backdrop.innerHTML = `
    <div class="modal-sheet" style="max-height:75vh;">
      <h3>비교할 시교 선택</h3>
      <div class="search-box" style="margin-bottom:10px;">
        ${icon('search',16)}
        <input type="text" id="xTrialSearch" placeholder="품목, SEG, 시교명으로 검색" oninput="renderXTrialList('${which}')">
      </div>
      <div id="xTrialList"></div>
    </div>`;
  document.body.appendChild(backdrop);
  attachBackdropDismiss(backdrop);
  renderXTrialList(which);
}
async function renderXTrialList(which){
  const q = (document.getElementById('xTrialSearch')?.value || '').trim().toLowerCase();
  const crops = await idbGetAll('crops');
  const cropMap = Object.fromEntries(crops.map(c=>[c.id,c]));
  const trials = await idbGetAll('trials');
  const filtered = trials.filter(t=>{
    if(!q) return true;
    const c = cropMap[t.cropId];
    return t.name.toLowerCase().includes(q) || t.seg.toLowerCase().includes(q) || (c && c.name.toLowerCase().includes(q));
  }).sort((a,b)=>b.createdAt-a.createdAt);
  const list = document.getElementById('xTrialList');
  if(filtered.length===0){
    list.innerHTML = '<p class="empty">일치하는 시교가 없어요.</p>';
    return;
  }
  list.innerHTML = filtered.map(t=>{
    const c = cropMap[t.cropId] || {name:'?',color:'#999'};
    return `<div class="list-item" onclick="openXPhotoPicker('${which}','${t.id}')">
      <div class="info">
        <div class="name"><span class="crop-dot" style="background:${c.color}"></span>${trialTitle(t)}</div>
        <div class="sub">${c.name} · ${t.seg}</div>
      </div>
      <div class="chev">${icon('chevRight',14)}</div>
    </div>`;
  }).join('');
}
async function openXPhotoPicker(which, trialId){
  const photos = (await idbGetAllByIndex('photos','trialId',trialId)).sort((a,b)=>a.date.localeCompare(b.date));
  const t = await idbGet('trials', trialId);
  removeIfExists('xTrialPickModal');
  removeIfExists('xPhotoPickModal');
  const grouped = {};
  photos.forEach(p=>{ (grouped[p.date]=grouped[p.date]||[]).push(p); });
  const dateKeys = Object.keys(grouped).sort((a,b)=>b.localeCompare(a));
  const backdrop = document.createElement('div');
  backdrop.className='modal-backdrop'; backdrop.id='xPhotoPickModal';
  backdrop.innerHTML = `
    <div class="modal-sheet" style="max-height:75vh;">
      <h3>${trialTitle(t)} · 사진 선택</h3>
      ${dateKeys.length===0 ? '<p class="empty">이 시교엔 아직 사진이 없어요.</p>' : dateKeys.map(d=>`
        <div class="date-group">
          <div class="date-head">${d}</div>
          <div class="photo-grid">
            ${grouped[d].map(p=>`<div class="photo-thumb" onclick="pickXComparePhoto('${which}','${trialId}','${p.id}')"><img loading="lazy" decoding="async" src="${getPhotoThumbUrl(p)}"></div>`).join('')}
          </div>
        </div>`).join('')}
    </div>`;
  document.body.appendChild(backdrop);
  attachBackdropDismiss(backdrop);
}
function pickXComparePhoto(which, trialId, photoId){
  xCmpSlots[which] = {trialId, photoId};
  removeIfExists('xPhotoPickModal');
  renderXCompareSide(which);
}
/* ================= 메모 ================= */
async function renderNotes(trialId){
  const notes = (await idbGetAllByIndex('notes','trialId',trialId)).sort((a,b)=>b.date.localeCompare(a.date) || b.createdAt-a.createdAt);
  const list = document.getElementById('noteList');
  if(notes.length===0){
    list.innerHTML = '<p class="empty">등록된 메모가 없어요. "+ 추가"로 남겨보세요.</p>';
  } else {
    list.innerHTML = notes.map(n=>`
      <div class="list-item" style="align-items:flex-start;cursor:default;">
        <div class="info" style="flex:1;">
          <div class="sub" style="margin-bottom:3px;">${n.date}</div>
          <div class="name" style="font-weight:400;font-size:13px;line-height:1.5;">${escapeHtml(n.text)}</div>
        </div>
        <div style="display:flex;gap:4px;flex:0 0 auto;">
          <button class="action" style="color:var(--muted);font-size:14px;" onclick="openNoteModal('${n.id}')">${icon('edit',15)}</button>
          <button class="action" style="color:var(--danger);font-size:14px;" onclick="deleteNote('${n.id}')">${icon('trash',16)}</button>
        </div>
      </div>`).join('');
  }
}
function escapeHtml(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function openNoteModal(noteId){
  removeIfExists('noteModal');
  const backdrop = document.createElement('div');
  backdrop.className='modal-backdrop'; backdrop.id='noteModal';
  backdrop.innerHTML = `
    <div class="modal-sheet">
      <h3>${noteId? '메모 수정':'메모 추가'}</h3>
      <div class="field">
        <label>날짜</label>
        <input type="date" id="noteDate" value="${todayStr()}">
      </div>
      <div class="field">
        <label>내용</label>
        <textarea id="noteText" placeholder="생육상태, 특이사항 등"></textarea>
      </div>
      <div class="btn-row">
        ${noteId? '<button class="btn btn-ghost" onclick="cancelAction(()=>closeModal(\'noteModal\'))">취소</button>':''}
        <button class="btn btn-primary" onclick="saveNote('${noteId||''}')">저장</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  attachBackdropDismiss(backdrop);
  if(noteId){
    idbGet('notes', noteId).then(n=>{
      if(n){ document.getElementById('noteDate').value = n.date; document.getElementById('noteText').value = n.text; }
    });
  }
}
async function saveNote(noteId){
  const date = document.getElementById('noteDate').value || todayStr();
  const text = document.getElementById('noteText').value.trim();
  if(!text){ toast('메모 내용을 입력해주세요'); return; }
  const id = noteId || uid();
  await idbPut('notes', {id, trialId: currentTrialId, date, text, createdAt: Date.now()});
  closeModal('noteModal');
  toast('메모를 저장했어요');
  renderNotes(currentTrialId);
}
async function deleteNote(noteId){
  const ok = await showConfirm({title:'메모 삭제', message:'이 메모를 삭제할까요?', confirmLabel:'삭제', danger:true});
  if(!ok) return;
  await idbDelete('notes', noteId);
  toast('삭제했어요');
  renderNotes(currentTrialId);
}

let lightboxIndex = -1;
/* ================= 타임라인 롱프레스 다중 선택 ================= */
let timelineSelectMode = false;
let timelineSelectedIds = new Set();
let tlLongPressTimer = null;
let tlLongPressFired = false;
function tlTouchStart(e){
  const thumb = e.target.closest('.photo-thumb');
  if(!thumb) return;
  tlLongPressFired = false;
  tlLongPressTimer = setTimeout(()=>{
    tlLongPressTimer = null;
    tlLongPressFired = true;
    enterTimelineSelectMode(thumb.dataset.photoId);
    if(appSettings.feedback) vibrate([10,30,10]);
  }, 500);
}
function tlTouchEnd(){
  if(tlLongPressTimer){ clearTimeout(tlLongPressTimer); tlLongPressTimer=null; }
}
function tlTouchMove(){
  if(tlLongPressTimer){ clearTimeout(tlLongPressTimer); tlLongPressTimer=null; }
}
function tlClick(e){
  const thumb = e.target.closest('.photo-thumb');
  if(!thumb) return;
  if(tlLongPressFired){ tlLongPressFired=false; return; }
  const photoId = thumb.dataset.photoId;
  if(timelineSelectMode){
    toggleTimelinePhotoSelect(photoId);
  } else {
    openLightbox(photoId);
  }
}
function initTimelineDelegation(){
  const c = document.getElementById('timelineAll');
  if(!c || c.dataset.bound) return;
  c.dataset.bound = '1';
  c.addEventListener('touchstart', tlTouchStart, {passive:true});
  c.addEventListener('touchend', tlTouchEnd, {passive:true});
  c.addEventListener('touchmove', tlTouchMove, {passive:true});
  c.addEventListener('click', tlClick);
}
function enterTimelineSelectMode(photoId){
  timelineSelectMode = true;
  timelineSelectedIds = new Set([photoId]);
  const c = document.getElementById('timelineAll');
  if(c) c.classList.add('select-mode');
  updateTimelineThumbUI(photoId);
  showTimelineSelectBar();
}
function toggleTimelinePhotoSelect(photoId){
  if(timelineSelectedIds.has(photoId)) timelineSelectedIds.delete(photoId);
  else timelineSelectedIds.add(photoId);
  updateTimelineThumbUI(photoId);
  if(timelineSelectedIds.size===0){ exitTimelineSelectMode(); return; }
  showTimelineSelectBar();
}
function updateTimelineThumbUI(photoId){
  const thumb = document.querySelector(`#timelineAll .photo-thumb[data-photo-id="${photoId}"]`);
  if(thumb) thumb.classList.toggle('selected', timelineSelectedIds.has(photoId));
}
function showTimelineSelectBar(){
  let bar = document.getElementById('timelineSelectBar');
  if(!bar){
    bar = document.createElement('div');
    bar.id = 'timelineSelectBar';
    bar.className = 'timeline-select-bar';
    document.body.appendChild(bar);
  }
  bar.innerHTML = `
    <button class="btn btn-ghost" onclick="exitTimelineSelectMode()">취소</button>
    <button class="btn btn-danger" onclick="deleteTimelineSelected()">${timelineSelectedIds.size}개의 사진 삭제하기</button>`;
}
function exitTimelineSelectMode(){
  timelineSelectMode = false;
  timelineSelectedIds = new Set();
  const c = document.getElementById('timelineAll');
  if(c){
    c.classList.remove('select-mode');
    c.querySelectorAll('.photo-thumb.selected').forEach(el=>el.classList.remove('selected'));
  }
  removeIfExists('timelineSelectBar');
}
async function deleteTimelineSelected(){
  const ids = Array.from(timelineSelectedIds);
  if(ids.length===0) return;
  const ok = await showConfirm({
    title:'사진 삭제',
    message:`선택한 사진 ${ids.length}장을 삭제할까요?\n되돌릴 수 없어요.`,
    confirmLabel:'삭제', danger:true
  });
  if(!ok) return;
  for(const id of ids){
    await idbDelete('photos', id);
    if(photoUrlCache.has(id)){ URL.revokeObjectURL(photoUrlCache.get(id)); photoUrlCache.delete(id); }
  }
  toast(`사진 ${ids.length}장 삭제했어요`);
  exitTimelineSelectMode();
  if(currentTrialId) renderDetail(currentTrialId);
}

