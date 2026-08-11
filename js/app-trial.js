/* ================= 새 시교 등록 ================= */
let selectedCropId = null;
let useCustomCrop = false;

async function renderNewTrialForm(){
  await ensurePresetCrops();
  selectedCropId = null;
  useCustomCrop = false;
  document.getElementById('customCropBox').classList.add('hidden');
  document.getElementById('ntSeg').value='';
  document.getElementById('ntName').value='';
  document.getElementById('ntRegion').value='';
  document.getElementById('ntGrowerName').value='';
  document.getElementById('ntSowDate').value='';
  document.getElementById('ntTransplantDate').value='';
  document.getElementById('ntReferenceVariety').value='';
  resetAddressFields('nt');
  document.getElementById('customCropName').value='';

  const cat = document.getElementById('colorCatalog');
  cat.innerHTML = COLOR_CATALOG.map((col,i)=>`<div class="color-dot ${i===4?'sel':''}" style="background:${col}" onclick="pickCustomColor('${col}', this)"></div>`).join('');
  window._customColor = ()=> COLOR_CATALOG[4];
  document.getElementById('customColorPicker').oninput = (e)=>{
    document.querySelectorAll('#colorCatalog .color-dot').forEach(d=>d.classList.remove('sel'));
    window._customColor = ()=> e.target.value;
  };

  const crops = await idbGetAll('crops');
  const tiles = document.getElementById('cropTiles');
  tiles.innerHTML = crops.map(c=>{
    return `<div class="crop-tile" data-id="${c.id}" onclick="selectCropTile('${c.id}', this)">
      <span class="swatch" style="background:${c.color};"></span>
      <span class="label">${escapeHtml(c.name)}</span>
    </div>`;
  }).join('') + `
    <div class="crop-tile add" onclick="selectCustomCrop(this)">
      <span class="label">+ 직접입력</span>
    </div>`;
}
function pickCustomColor(col, el){
  window._customColor = ()=>col;
  document.querySelectorAll('#colorCatalog .color-dot').forEach(d=>d.classList.remove('sel'));
  el.classList.add('sel');
}
function selectCropTile(cropId, el){
  selectedCropId = cropId; useCustomCrop = false;
  document.querySelectorAll('.crop-tile').forEach(t=>t.classList.remove('sel'));
  el.classList.add('sel');
  document.getElementById('customCropBox').classList.add('hidden');
}
function selectCustomCrop(el){
  selectedCropId = null; useCustomCrop = true;
  document.querySelectorAll('.crop-tile').forEach(t=>t.classList.remove('sel'));
  el.classList.add('sel');
  document.getElementById('customCropBox').classList.remove('hidden');
}
async function createTrial(){
  const seg = document.getElementById('ntSeg').value.trim();
  const name = document.getElementById('ntName').value.trim();
  const region = document.getElementById('ntRegion').value.trim();
  const growerName = document.getElementById('ntGrowerName').value.trim();
  const sowDate = document.getElementById('ntSowDate').value;
  const transplantDate = document.getElementById('ntTransplantDate').value;
  const referenceVariety = document.getElementById('ntReferenceVariety').value.trim();
  const fieldAddresses = getAddressValues('nt');
  if(!seg || !name){ toast('SEG·제품/시교명을 입력해주세요'); return; }

  let cropId = selectedCropId;
  if(useCustomCrop){
    const cname = document.getElementById('customCropName').value.trim();
    if(!cname){ toast('품목명을 입력해주세요'); return; }
    const color = window._customColor ? window._customColor() : '#4a7c59';
    cropId = uid();
    await idbPut('crops', {id:cropId, name:cname, color});
  }
  if(!cropId){ toast('품목을 선택해주세요'); return; }

  const id = uid();
  await idbPut('trials', {id, cropId, seg, name, region, growerName, sowDate, transplantDate, referenceVariety, fieldAddresses, createdAt: Date.now()});
  await idbPut('meta', {key:'lastUsed', value:{cropId, seg, trialId:id}});
  toast('시교가 등록됐어요');
  go('upload', id);
}

/* ================= 시교 상세 ================= */
async function toggleFav(){
  const favMeta = (await idbGet('meta','favorites')) || {key:'favorites', value:[]};
  const list = favMeta.value;
  const idx = list.indexOf(currentTrialId);
  if(idx>=0) list.splice(idx,1); else list.push(currentTrialId);
  await idbPut('meta', {key:'favorites', value:list});
  document.getElementById('favBtn').innerHTML = idx>=0 ? icon('star',17) : icon('starFilled',17);
  if(appSettings.feedback) vibrate(idx>=0 ? 10 : [10,40,10]);
}
async function openTrialEditModal(){
  removeIfExists('trialEditModal');
  const t = await idbGet('trials', currentTrialId);
  const crops = await idbGetAll('crops');
  const backdrop = document.createElement('div');
  backdrop.className='modal-backdrop'; backdrop.id='trialEditModal';
  backdrop.innerHTML = `
    <div class="modal-sheet">
      <h3>분류 수정</h3>
      <div class="field">
        <label>품목</label>
        <select id="editTrialCrop">
          ${crops.map(c=>`<option value="${c.id}" ${c.id===t.cropId?'selected':''}>${c.name}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>SEG</label>
        <input type="text" id="editTrialSeg" value="${t.seg}">
      </div>
      <div class="field-row">
        <div class="field">
          <label>제품/시교명</label>
          <input type="text" id="editTrialName" value="${t.name}">
        </div>
        <div class="field">
          <label>지역</label>
          <input type="text" id="editTrialRegion" value="${t.region||''}" placeholder="예: 인제">
        </div>
        <div class="field">
          <label>성함</label>
          <input type="text" id="editTrialGrowerName" value="${t.growerName||''}" placeholder="예: 송재호">
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>파종일 <span class="autofill-tag" style="background:var(--cream);color:var(--muted);">선택</span></label>
          <input type="date" id="editTrialSowDate" value="${t.sowDate||''}">
        </div>
        <div class="field">
          <label>정식일 <span class="autofill-tag" style="background:var(--cream);color:var(--muted);">선택</span></label>
          <input type="date" id="editTrialTransplantDate" value="${t.transplantDate||''}">
        </div>
      </div>
      <div class="field">
        <label>대비종 <span class="autofill-tag" style="background:var(--cream);color:var(--muted);">선택</span></label>
        <input type="text" id="editTrialReferenceVariety" value="${t.referenceVariety||''}" placeholder="예: 칼라탄">
      </div>
      <div class="field">
        <label style="display:flex;align-items:center;">밭 주소 <span class="autofill-tag" style="background:var(--cream);color:var(--muted);">선택</span> <span class="link" style="margin-left:auto;" onclick="addAddressField('editTrial')">+ 주소 추가</span></label>
        <div id="editTrialAddressList"></div>
      </div>
      <div class="btn-row">
        <button class="btn btn-ghost" onclick="cancelAction(()=>closeModal('trialEditModal'))">취소</button>
        <button class="btn btn-primary" onclick="saveTrialEdit()">저장</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  attachBackdropDismiss(backdrop);
  const existingAddresses = (t.fieldAddresses && t.fieldAddresses.length) ? t.fieldAddresses : (t.fieldAddress ? [t.fieldAddress] : []);
  resetAddressFields('editTrial', existingAddresses);
}
async function saveTrialEdit(){
  const cropId = document.getElementById('editTrialCrop').value;
  const seg = document.getElementById('editTrialSeg').value.trim();
  const name = document.getElementById('editTrialName').value.trim();
  const region = document.getElementById('editTrialRegion').value.trim();
  const growerName = document.getElementById('editTrialGrowerName').value.trim();
  const sowDate = document.getElementById('editTrialSowDate').value;
  const transplantDate = document.getElementById('editTrialTransplantDate').value;
  const referenceVariety = document.getElementById('editTrialReferenceVariety').value.trim();
  const fieldAddresses = getAddressValues('editTrial');
  if(!seg || !name){ toast('SEG·제품/시교명을 입력해주세요'); return; }
  const t = await idbGet('trials', currentTrialId);
  t.cropId = cropId; t.seg = seg; t.name = name; t.region = region; t.growerName = growerName; t.sowDate = sowDate; t.transplantDate = transplantDate; t.referenceVariety = referenceVariety; t.fieldAddresses = fieldAddresses;
  delete t.fieldAddress;
  await idbPut('trials', t);
  closeModal('trialEditModal');
  toast('수정했어요');
  renderDetail(currentTrialId);
}

async function deleteTrialConfirm(){
  const t = await idbGet('trials', currentTrialId);
  const ok = await showConfirm({
    title:'시교 삭제',
    message:`"${trialTitle(t)}" 시교를 삭제할까요?\n등록된 사진과 메모도 함께 삭제되고 되돌릴 수 없어요.`,
    confirmLabel:'삭제', danger:true
  });
  if(!ok) return;
  await idbDeleteWhere('photos', p=>p.trialId===currentTrialId);
  await idbDeleteWhere('notes', n=>n.trialId===currentTrialId);
  await idbDelete('trials', currentTrialId);
  const favMeta = (await idbGet('meta','favorites')) || {key:'favorites', value:[]};
  favMeta.value = favMeta.value.filter(id=>id!==currentTrialId);
  await idbPut('meta', favMeta);
  toast('삭제했어요');
  go('home');
}
let allPhotosCache = [];
let cmpSlots = [null, null]; // 2~4개 photoId (또는 null)
function switchDetailTab(tab){
  if(tab!=='timeline') exitTimelineSelectMode();
  document.getElementById('detailTabTimeline').classList.toggle('active', tab==='timeline');
  document.getElementById('detailTabMemo').classList.toggle('active', tab==='memo');
  document.getElementById('detailTabCompare').classList.toggle('active', tab==='compare');
  document.getElementById('detailPanelTimeline').classList.toggle('hidden', tab!=='timeline');
  document.getElementById('detailPanelMemo').classList.toggle('hidden', tab!=='memo');
  document.getElementById('detailPanelCompare').classList.toggle('hidden', tab!=='compare');
}
async function renderDetail(trialId){
  switchDetailTab('timeline');
  exitTimelineSelectMode();
  const t = await idbGet('trials', trialId);
  if(!t){ go('home'); return; }
  const c = await idbGet('crops', t.cropId);
  document.getElementById('detailTitle').textContent = trialTitle(t);
  const dateParts = [];
  if(t.sowDate) dateParts.push(['파종일', t.sowDate]);
  if(t.transplantDate) dateParts.push(['정식일', t.transplantDate]);
  if(t.referenceVariety) dateParts.push(['대비종', t.referenceVariety]);
  const detailDatesEl = document.getElementById('detailDates');
  if(dateParts.length){
    detailDatesEl.innerHTML = dateParts.map(([label,value])=>`<div class="dd-row">${label}<b>${escapeHtml(value)}</b></div>`).join('');
    detailDatesEl.classList.remove('hidden');
  } else { detailDatesEl.classList.add('hidden'); }
  currentFieldAddresses = (t.fieldAddresses && t.fieldAddresses.length) ? t.fieldAddresses : (t.fieldAddress ? [t.fieldAddress] : []);
  const addrListEl = document.getElementById('detailAddressList');
  if(currentFieldAddresses.length){
    addrListEl.innerHTML = currentFieldAddresses.map((addr,i)=>`
      <div class="detail-address">
        <div class="addr-text">${currentFieldAddresses.length>1?`밭주소 ${i+1} : `:''}${escapeHtml(addr)}</div>
        <button class="action" onclick="copyFieldAddress(${i})">${icon('copy',17)}</button>
        <button class="action" onclick="openFieldAddressInMaps(${i})">${icon('pin',17)}</button>
      </div>`).join('');
  } else {
    addrListEl.innerHTML = '';
  }
  const favMeta = (await idbGet('meta','favorites'))?.value || [];
  document.getElementById('favBtn').innerHTML = favMeta.includes(trialId) ? icon('starFilled',17) : icon('star',17);

  const photos = (await idbGetAllByIndex('photos','trialId',trialId)).sort((a,b)=>a.date.localeCompare(b.date) || a.createdAt-b.createdAt);
  allPhotosCache = photos;

  if(photos.length===0){
    cmpSlots = cmpSlots.map(()=>null);
  } else {
    cmpSlots = cmpSlots.map(id => (id && photos.find(p=>p.id===id)) ? id : null);
  }
  renderCompareCountTabs();
  renderCompare();

  const grouped = {};
  photos.forEach(p=>{ (grouped[p.date] = grouped[p.date]||[]).push(p); });
  const dateKeys = Object.keys(grouped).sort((a,b)=>b.localeCompare(a));
  const timelineAll = document.getElementById('timelineAll');
  if(dateKeys.length===0){
    timelineAll.innerHTML = '<p class="empty">아직 등록된 사진이 없어요.</p>';
  } else {
    timelineAll.innerHTML = dateKeys.map(d=>`
      <div class="date-group">
        <div class="date-head">${d} <span class="cnt">${grouped[d].length}장</span></div>
        <div class="photo-grid">
          ${grouped[d].map(p=>`<div class="photo-thumb" data-photo-id="${p.id}"><img loading="lazy" decoding="async" draggable="false" oncontextmenu="return false;" src="${getPhotoThumbUrl(p)}">${p.isMarked?'<div class="mark-badge">'+icon('pen',11)+'</div>':''}<div class="chk">${icon('check',12)}</div></div>`).join('')}
        </div>
      </div>`).join('');
  }
  initTimelineDelegation();

  await renderNotes(trialId);
  exitSavedCmpSelectMode('detail');
  await renderSavedComparisons('detail', trialId);
}
function renderCompareCountTabs(){
  [2,3,4].forEach(n=>{
    document.getElementById(`cmpCount${n}`).classList.toggle('active', cmpSlots.length===n);
  });
}
function setDetailCompareCount(n){
  const cur = cmpSlots.length;
  if(n>cur){
    while(cmpSlots.length<n) cmpSlots.push(null);
  } else if(n<cur){
    cmpSlots = cmpSlots.slice(0,n);
  }
  renderCompareCountTabs();
  renderCompare();
}
function renderCompare(){
  const row = document.getElementById('cmpSlotsRow');
  row.innerHTML = cmpSlots.map((pid,i)=>{
    const p = allPhotosCache.find(x=>x.id===pid);
    return `<div class="xcmp-col">
      <div class="imgbox cmp-tap" onclick="openComparePicker(${i})">${p? `<img src="${getPhotoThumbUrl(p)}">` : '<div class="cmp-placeholder">탭해서<br>사진 선택</div>'}</div>
      <div class="xcmp-label">${p? p.date : '-'}</div>
    </div>`;
  }).join('');
}
function openComparePicker(slotIndex){
  removeIfExists('comparePickModal');
  const grouped = {};
  allPhotosCache.forEach(p=>{ (grouped[p.date]=grouped[p.date]||[]).push(p); });
  const dateKeys = Object.keys(grouped).sort((a,b)=>b.localeCompare(a));
  const backdrop = document.createElement('div');
  backdrop.className='modal-backdrop'; backdrop.id='comparePickModal';
  backdrop.innerHTML = `
    <div class="modal-sheet" style="max-height:75vh;">
      <h3>비교할 사진 선택</h3>
      ${dateKeys.length===0 ? '<p class="empty">등록된 사진이 없어요. 먼저 사진을 등록해주세요.</p>' : dateKeys.map(d=>`
        <div class="date-group">
          <div class="date-head">${d}</div>
          <div class="photo-grid">
            ${grouped[d].map(p=>`<div class="photo-thumb" onclick="pickComparePhoto(${slotIndex},'${p.id}')"><img loading="lazy" decoding="async" src="${getPhotoThumbUrl(p)}"></div>`).join('')}
          </div>
        </div>`).join('')}
    </div>`;
  document.body.appendChild(backdrop);
  attachBackdropDismiss(backdrop);
}
function pickComparePhoto(slotIndex, photoId){
  cmpSlots[slotIndex] = photoId;
  removeIfExists('comparePickModal');
  renderCompare();
}
function resetDetailCompare(){
  cmpSlots = cmpSlots.map(()=>null);
  renderCompare();
  toast('비교를 초기화했어요');
}

