/* ================= 홈 ================= */
let homeExpandedGroups = new Set();
function toggleHomeCropGroup(cropId){
  if(homeExpandedGroups.has(cropId)) homeExpandedGroups.delete(cropId);
  else homeExpandedGroups.add(cropId);
  const body = document.getElementById(`homeGroupBody-${cropId}`);
  const chev = document.getElementById(`homeGroupChev-${cropId}`);
  if(body) body.classList.toggle('hidden', !homeExpandedGroups.has(cropId));
  if(chev) chev.classList.toggle('open', homeExpandedGroups.has(cropId));
}
async function renderHome(){
  const crops = await idbGetAll('crops');
  const cropMap = Object.fromEntries(crops.map(c=>[c.id,c]));
  const trials = await idbGetAll('trials');
  const favIds = (await idbGet('meta','favorites'))?.value || [];

  // 즐겨찾기 - 세련된 컬러 카드
  const favRow = document.getElementById('favRow');
  const favTrials = trials.filter(t=>favIds.includes(t.id));
  if(favTrials.length===0){
    favRow.innerHTML = '<p class="empty" style="width:100%;">아직 즐겨찾기한 시교가 없어요. 시교 상세에서 별표를 눌러 추가해보세요.</p>';
  } else {
    favRow.innerHTML = favTrials.map(t=>{
      const c = cropMap[t.cropId] || {name:'?',color:'#999'};
      const fg = textColorFor(c.color);
      return `<div class="pin-card" style="background:${c.color};color:${fg}" onclick="go('detail','${t.id}')">
        <div class="ribbon">${icon('starFilled',12)}</div>
        <div class="crop-tag" style="color:${fg}">${c.name}</div>
        <div class="name">${trialTitle(t)}</div>
        <div class="seg">${t.seg}</div>
      </div>`;
    }).join('');
  }

  // 전체 시교 - 품목별 아코디언
  const recentList = document.getElementById('recentList');
  if(trials.length===0){
    recentList.innerHTML = '<p class="empty">등록된 시교가 없어요. 우측 하단 + 로 새 시교를 등록해보세요.</p>';
  } else {
    const grouped = {};
    trials.forEach(t=>{ (grouped[t.cropId]=grouped[t.cropId]||[]).push(t); });
    const cropIds = Object.keys(grouped).sort((a,b)=>{
      const na = (cropMap[a]||{name:''}).name, nb = (cropMap[b]||{name:''}).name;
      return na.localeCompare(nb, 'ko');
    });
    recentList.innerHTML = cropIds.map(cid=>{
      const c = cropMap[cid] || {name:'?', color:'#999'};
      const list = grouped[cid].sort((a,b)=>b.createdAt-a.createdAt);
      const expanded = homeExpandedGroups.has(cid);
      return `
        <div class="home-crop-group">
          <div class="home-crop-header" onclick="toggleHomeCropGroup('${cid}')">
            <span class="crop-dot" style="background:${c.color}"></span>
            <span class="home-crop-name">${c.name}</span>
            <span class="home-crop-count">${list.length}</span>
            <span class="home-crop-chev ${expanded?'open':''}" id="homeGroupChev-${cid}">${icon('chevRight',14)}</span>
          </div>
          <div class="home-crop-body ${expanded?'':'hidden'}" id="homeGroupBody-${cid}">
            ${list.map(t=>`<div class="recent-item" onclick="go('detail','${t.id}')">
              <div class="bar" style="background:${c.color}"></div>
              <div class="info">
                <div class="name">${trialTitle(t)}</div>
                <div class="sub">${t.seg}</div>
              </div>
              <div style="display:flex;align-items:center;gap:6px;">
                <span class="when">${timeAgo(t.createdAt)}</span>
                <span class="chev">›</span>
              </div>
            </div>`).join('')}
          </div>
        </div>`;
    }).join('');
  }
  document.getElementById('searchInput').value='';
  document.getElementById('searchResults').classList.add('hidden');
  document.getElementById('favSection').classList.remove('hidden');
  document.getElementById('recentSection').classList.remove('hidden');
}
async function renderAllList(sortMode){
  sortMode = sortMode || 'recent';
  const tabIds = { recent:'allListSortRecent', name:'allListSortName', crop:'allListSortCrop' };
  Object.entries(tabIds).forEach(([m,id])=>{
    document.getElementById(id).classList.toggle('active', m===sortMode);
  });
  const crops = await idbGetAll('crops');
  const cropMap = Object.fromEntries(crops.map(c=>[c.id,c]));
  const trials = await idbGetAll('trials');
  document.getElementById('allListCount').textContent = `총 ${trials.length}개의 시교`;
  const contentEl = document.getElementById('allListContent');
  if(trials.length===0){
    contentEl.innerHTML = '<p class="empty">등록된 시교가 없어요.</p>';
    return;
  }
  function renderItem(t){
    const c = cropMap[t.cropId] || {name:'?', color:'#999'};
    return `<div class="recent-item" onclick="go('detail','${t.id}')">
      <div class="bar" style="background:${c.color}"></div>
      <div class="info">
        <div class="name">${trialTitle(t)}</div>
        <div class="sub">${c.name} · ${t.seg}</div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;">
        <span class="when">${timeAgo(t.createdAt)}</span>
        <span class="chev">›</span>
      </div>
    </div>`;
  }
  if(sortMode==='name'){
    const sorted = [...trials].sort((a,b)=> trialTitle(a).localeCompare(trialTitle(b), 'ko'));
    contentEl.innerHTML = sorted.map(renderItem).join('');
  } else if(sortMode==='crop'){
    const grouped = {};
    trials.forEach(t=>{
      const cname = (cropMap[t.cropId]||{name:'기타'}).name;
      (grouped[cname]=grouped[cname]||[]).push(t);
    });
    const cropNames = Object.keys(grouped).sort((a,b)=>a.localeCompare(b,'ko'));
    contentEl.innerHTML = cropNames.map(cname=>`
      <div class="section-title" style="margin-top:14px;">${cname} <span style="font-weight:400;color:var(--muted);font-size:11px;">(${grouped[cname].length})</span></div>
      ${grouped[cname].sort((a,b)=>b.createdAt-a.createdAt).map(renderItem).join('')}
    `).join('');
  } else {
    const sorted = [...trials].sort((a,b)=>b.createdAt-a.createdAt);
    contentEl.innerHTML = sorted.map(renderItem).join('');
  }
}
function setAllListSort(mode){ renderAllList(mode); }

async function renderSearch(){
  const q = document.getElementById('searchInput').value.trim().toLowerCase();
  if(!q){
    document.getElementById('searchResults').classList.add('hidden');
    document.getElementById('favSection').classList.remove('hidden');
    document.getElementById('recentSection').classList.remove('hidden');
    return;
  }
  document.getElementById('favSection').classList.add('hidden');
  document.getElementById('recentSection').classList.add('hidden');
  document.getElementById('searchResults').classList.remove('hidden');

  const crops = await idbGetAll('crops');
  const cropMap = Object.fromEntries(crops.map(c=>[c.id,c]));
  const trials = await idbGetAll('trials');
  const matched = trials.filter(t=>{
    const c = cropMap[t.cropId];
    return t.name.toLowerCase().includes(q) || t.seg.toLowerCase().includes(q) || (c && c.name.toLowerCase().includes(q))
      || (t.region && t.region.toLowerCase().includes(q)) || (t.growerName && t.growerName.toLowerCase().includes(q));
  });
  const list = document.getElementById('searchList');
  if(matched.length===0){
    list.innerHTML = '<p class="empty">일치하는 시교가 없어요.</p>';
  } else {
    list.innerHTML = matched.map(t=>{
      const c = cropMap[t.cropId] || {name:'?',color:'#999'};
      return `<div class="list-item" onclick="go('detail','${t.id}')">
        <div class="info">
          <div class="name"><span class="crop-dot" style="background:${c.color}"></span>${trialTitle(t)}</div>
          <div class="sub">${c.name} · ${t.seg}</div>
        </div>
        <div class="chev">›</div>
      </div>`;
    }).join('');
  }
}

function cancelAction(fn, msg){
  toast(msg || '취소했어요');
  fn();
}

async function toggleFeedbackSetting(){
  appSettings.feedback = !appSettings.feedback;
  document.getElementById('feedbackSwitch').classList.toggle('on', appSettings.feedback);
  await saveSettings();
  rawToast(appSettings.feedback ? '진동 피드백을 켰어요' : '진동 피드백을 껐어요');
}
async function toggleScheduleReminderSetting(){
  appSettings.scheduleReminders = !appSettings.scheduleReminders;
  document.getElementById('scheduleReminderSwitch').classList.toggle('on', appSettings.scheduleReminders);
  await saveSettings();
  toast(appSettings.scheduleReminders ? '일정 알림을 켰어요' : '일정 알림을 껐어요');
}

/* ================= 공용 모달 (확인/알림) ================= */
function removeIfExists(id){ document.querySelectorAll('#'+id).forEach(el=>el.remove()); }
function closeModal(id){ removeIfExists(id); }
function attachBackdropDismiss(backdrop, onDismiss){
  backdrop.addEventListener('click', (e)=>{
    if(e.target === backdrop){
      backdrop.remove();
      if(onDismiss) onDismiss();
    }
  });
}

function showConfirm({title, message, confirmLabel='확인', cancelLabel='취소', danger=false}){
  return new Promise(resolve=>{
    removeIfExists('confirmModal');
    const backdrop = document.createElement('div');
    backdrop.className='modal-backdrop'; backdrop.id='confirmModal';
    backdrop.innerHTML = `
      <div class="modal-sheet">
        <h3>${title}</h3>
        <p style="font-size:12.5px;color:var(--muted);line-height:1.6;margin:-8px 0 16px;white-space:pre-line;">${message}</p>
        <div class="btn-row">
          <button class="btn btn-ghost" id="confirmCancelBtn">${cancelLabel}</button>
          <button class="btn ${danger?'btn-danger':'btn-primary'}" id="confirmOkBtn">${confirmLabel}</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    document.getElementById('confirmCancelBtn').onclick = ()=>{ removeIfExists('confirmModal'); resolve(false); };
    document.getElementById('confirmOkBtn').onclick = ()=>{ if(appSettings.feedback) vibrate(danger?[15,60,15]:15); removeIfExists('confirmModal'); resolve(true); };
    attachBackdropDismiss(backdrop, ()=>resolve(false));
  });
}
function showAlert({title, message, okLabel='확인'}){
  return new Promise(resolve=>{
    removeIfExists('alertModal');
    const backdrop = document.createElement('div');
    backdrop.className='modal-backdrop'; backdrop.id='alertModal';
    backdrop.innerHTML = `
      <div class="modal-sheet">
        <h3>${title}</h3>
        <p style="font-size:12.5px;color:var(--muted);line-height:1.6;margin:-8px 0 16px;white-space:pre-line;">${message}</p>
        <button class="btn btn-primary" id="alertOkBtn">${okLabel}</button>
      </div>`;
    document.body.appendChild(backdrop);
    document.getElementById('alertOkBtn').onclick = ()=>{ removeIfExists('alertModal'); resolve(true); };
    attachBackdropDismiss(backdrop, ()=>resolve(true));
  });
}

function promptText({title, placeholder='', defaultValue=''}){
  return new Promise(resolve=>{
    removeIfExists('promptModal');
    const backdrop = document.createElement('div');
    backdrop.className='modal-backdrop'; backdrop.id='promptModal';
    backdrop.innerHTML = `
      <div class="modal-sheet">
        <h3>${title}</h3>
        <div class="field"><input type="text" id="promptInput" value="${defaultValue}" placeholder="${placeholder}"></div>
        <div class="btn-row">
          <button class="btn btn-ghost" id="promptCancelBtn">취소</button>
          <button class="btn btn-primary" id="promptOkBtn">확인</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    attachBackdropDismiss(backdrop, ()=>resolve(null));
    document.getElementById('promptCancelBtn').onclick = ()=>{ removeIfExists('promptModal'); resolve(null); };
    document.getElementById('promptOkBtn').onclick = ()=>{
      const v = document.getElementById('promptInput').value.trim();
      removeIfExists('promptModal'); resolve(v);
    };
    setTimeout(()=>{ const el=document.getElementById('promptInput'); if(el) el.focus(); }, 150);
  });
}

/* ================= 품목 관리 ================= */
let editingCropId = null;

async function renderCrops(){
  const crops = await idbGetAll('crops');
  const list = document.getElementById('cropList');
  document.getElementById('cropEmpty').style.display = crops.length? 'none':'block';
  list.innerHTML = crops.map(c=>`
    <div class="list-item" onclick="openCropEditModal('${c.id}')">
      <div class="info">
        <div class="name"><span class="crop-dot" style="background:${c.color}"></span>${c.name}</div>
      </div>
      <div class="chev">›</div>
    </div>`).join('');
}
function openCropEditModal(cropId){
  removeIfExists('cropEditModal');
  idbGet('crops', cropId).then(c=>{
    editingCropId = cropId;
    const backdrop = document.createElement('div');
    backdrop.className='modal-backdrop'; backdrop.id='cropEditModal';
    backdrop.innerHTML = `
      <div class="modal-sheet">
        <h3>품목 수정</h3>
        <div class="field"><label>품목명</label><input type="text" id="editCropName" value="${c.name}"></div>
        <label style="display:block;font-size:11.5px;color:var(--muted);margin-bottom:6px;font-weight:700;">카드 색상</label>
        <div class="color-catalog" id="editColorCatalog"></div>
        <div class="btn-row" style="margin-top:10px;">
          <button class="btn btn-danger" onclick="deleteCropConfirm()">삭제</button>
          <button class="btn btn-primary" onclick="saveEditedCrop()">저장</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    attachBackdropDismiss(backdrop);
    const cat = document.getElementById('editColorCatalog');
    let sel = c.color;
    cat.innerHTML = COLOR_CATALOG.map(col=>`<div class="color-dot ${col===sel?'sel':''}" style="background:${col}" onclick="pickEditColor('${col}', this)"></div>`).join('');
    window._editColor = ()=>sel;
    window.pickEditColor = (col, el)=>{ sel=col; document.querySelectorAll('#editColorCatalog .color-dot').forEach(d=>d.classList.remove('sel')); el.classList.add('sel'); window._editColor=()=>col; };
  });
}
async function saveEditedCrop(){
  const name = document.getElementById('editCropName').value.trim();
  if(!name){ toast('품목명을 입력해주세요'); return; }
  const color = window._editColor ? window._editColor() : '#4a7c59';
  await idbPut('crops', {id:editingCropId, name, color});
  document.getElementById('cropEditModal').remove();
  toast('저장했어요'); renderCrops();
}
async function deleteCropConfirm(){
  const ok = await showConfirm({title:'품목 삭제', message:'이 품목을 삭제할까요? 이미 등록된 시교의 분류 표시에 영향을 줄 수 있어요.', confirmLabel:'삭제', danger:true});
  if(!ok) return;
  await idbDelete('crops', editingCropId);
  document.getElementById('cropEditModal').remove();
  toast('삭제했어요'); renderCrops();
}

