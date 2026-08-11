/* ================= 품종 비교 (교차 비교) ================= */
let xCmpSlots = [null, null]; // 각 원소: {trialId, photoId} 또는 null, 2~4개
function renderXCompare(){
  const row = document.getElementById('xCmpSlotsRow');
  row.innerHTML = xCmpSlots.map((_,i)=>`
    <div class="xcmp-col">
      <div class="imgbox cmp-tap" id="xCmpImg${i}" onclick="openXComparePicker(${i})"></div>
      <div id="xCmpLabel${i}" class="xcmp-label">탭해서<br>시교 선택</div>
    </div>`).join('');
  xCmpSlots.forEach((_,i)=> renderXCompareSide(i));
  [2,3,4].forEach(n=>{
    document.getElementById(`xCmpCount${n}`).classList.toggle('active', xCmpSlots.length===n);
  });
  exitSavedCmpSelectMode('xcompare');
  renderSavedComparisons('xcompare');
}
function setXCompareCount(n){
  const cur = xCmpSlots.length;
  if(n>cur){ while(xCmpSlots.length<n) xCmpSlots.push(null); }
  else if(n<cur){ xCmpSlots = xCmpSlots.slice(0,n); }
  renderXCompare();
}
function buildTrialLabelLines(c, t, p){
  const lines = [`${c.name} · ${t.seg}`, trialTitle(t)];
  const dateBits = [];
  if(t.sowDate) dateBits.push(`파종일 ${t.sowDate}`);
  if(t.transplantDate) dateBits.push(`정식일 ${t.transplantDate}`);
  if(dateBits.length) lines.push(dateBits.join(' · '));
  if(p) lines.push(`촬영일 ${p.date}`);
  return lines;
}
async function renderXCompareSide(index){
  const state = xCmpSlots[index];
  const imgEl = document.getElementById(`xCmpImg${index}`);
  const labelEl = document.getElementById(`xCmpLabel${index}`);
  if(!imgEl || !labelEl) return;
  if(!state){
    imgEl.innerHTML = `<div class="cmp-placeholder">탭해서<br>시교 선택</div>`;
    labelEl.innerHTML = '탭해서<br>시교 선택';
    return;
  }
  const [t, p] = await Promise.all([idbGet('trials', state.trialId), idbGet('photos', state.photoId)]);
  if(!t || !p){ imgEl.innerHTML = `<div class="cmp-placeholder">탭해서<br>시교 선택</div>`; labelEl.innerHTML = '탭해서<br>시교 선택'; return; }
  const c = await idbGet('crops', t.cropId);
  imgEl.innerHTML = `<img src="${getPhotoThumbUrl(p)}">`;
  const lines = buildTrialLabelLines(c, t, p);
  labelEl.innerHTML = `<span class="crop-dot" style="background:${c.color}"></span><b>${lines[0]}</b>` + lines.slice(1).map(l=>`<br>${l}`).join('');
}
function resetXCompare(){
  xCmpSlots = xCmpSlots.map(()=>null);
  renderXCompare();
  toast('비교를 초기화했어요');
}

/* ================= 작황조사 캘린더 ================= */
let calYear = null, calMonth = null;
let scheduleSelectedTrialId = null;
function pad2(n){ return String(n).padStart(2,'0'); }
function ymd(y,m,d){ return `${y}-${pad2(m+1)}-${pad2(d)}`; }

async function renderCalendar(){
  if(calYear===null){ const now=new Date(); calYear=now.getFullYear(); calMonth=now.getMonth(); }
  await renderCalGrid();
  await renderCalUpcoming();
}
function calShiftMonth(delta){
  calMonth += delta;
  if(calMonth<0){ calMonth=11; calYear--; }
  if(calMonth>11){ calMonth=0; calYear++; }
  renderCalGrid(delta); renderCalUpcoming();
}
function calGoToday(){
  const now = new Date();
  calYear = now.getFullYear(); calMonth = now.getMonth();
  renderCalGrid(); renderCalUpcoming();
}
async function renderCalGrid(slideDir){
  document.getElementById('calTitle').textContent = `${calYear}년 ${calMonth+1}월`;
  const firstWeekday = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
  const monthStart = ymd(calYear, calMonth, 1);
  const monthEnd = ymd(calYear, calMonth, daysInMonth);
  const schedules = await idbGetAllByRange('schedules', 'date', IDBKeyRange.bound(monthStart, monthEnd));
  const byDate = {};
  schedules.forEach(s=>{ (byDate[s.date]=byDate[s.date]||[]).push(s); });
  const today = todayStr();

  let cells = '';
  for(let i=0;i<firstWeekday;i++) cells += `<div class="cal-day other-month"></div>`;
  for(let d=1; d<=daysInMonth; d++){
    const dateStr = ymd(calYear, calMonth, d);
    const list = byDate[dateStr]||[];
    const dow = new Date(calYear, calMonth, d).getDay();
    const dowClass = dow===0 ? 'sun' : (dow===6 ? 'sat' : '');
    let mark = '';
    if(list.length){
      const shown = list.slice(0,3);
      mark = `<div class="cal-labels">${shown.map(s=>`<div class="cal-label ${s.status==='done'?'done':''}">${escapeHtml(s.targetText||'')}</div>`).join('')}${list.length>3?`<div class="cal-more">+${list.length-3}건 더</div>`:''}</div>`;
    }
    cells += `<div class="cal-day ${dowClass} ${dateStr===today?'today':''}" onclick="openDayModal('${dateStr}')"><div class="cal-daynum">${d}</div>${mark}</div>`;
  }
  document.getElementById('calGrid').innerHTML = cells;
  const gridEl = document.getElementById('calGrid');
  gridEl.classList.remove('slide-in-left','slide-in-right');
  if(slideDir){
    void gridEl.offsetWidth; // 리플로우 강제로 애니메이션 재시작
    gridEl.classList.add(slideDir>0 ? 'slide-in-left' : 'slide-in-right');
  }
  initCalSwipe(gridEl);
}
function initCalSwipe(gridEl){
  if(gridEl.dataset.swipeBound) return;
  gridEl.dataset.swipeBound = '1';
  let startX=0, startY=0;
  gridEl.addEventListener('touchstart', (e)=>{
    startX = e.touches[0].clientX; startY = e.touches[0].clientY;
  }, {passive:true});
  gridEl.addEventListener('touchend', (e)=>{
    const dx = e.changedTouches[0].clientX-startX;
    const dy = e.changedTouches[0].clientY-startY;
    if(Math.abs(dx)>55 && Math.abs(dx)>Math.abs(dy)*1.3){
      calShiftMonth(dx<0 ? 1 : -1);
    }
  }, {passive:true});
}
async function renderCalUpcoming(){
  const today = todayStr();
  const all = (await idbGetAllByRange('schedules', 'date', IDBKeyRange.lowerBound(today)))
    .filter(s=>s.status!=='done')
    .sort((a,b)=> a.date.localeCompare(b.date) || (a.time||'').localeCompare(b.time||''));
  const upcoming = all.slice(0,8);
  const el = document.getElementById('calUpcoming');
  if(upcoming.length===0){ el.innerHTML = '<p class="empty">예정된 일정이 없어요.</p>'; return; }
  el.innerHTML = upcoming.map(s=>`
    <div class="sched-item" onclick="openDayModal('${s.date}')">
      <div class="sched-check" onclick="event.stopPropagation(); toggleScheduleDone('${s.id}')">${icon('check',12)}</div>
      <div class="sched-body">
        <div class="sched-title">${escapeHtml(s.targetText||'')}</div>
        <div class="sched-sub">${s.date}${s.time? ' '+s.time:''}${s.purpose? ' · '+escapeHtml(s.purpose):''}</div>
      </div>
    </div>`).join('');
}
async function openDayModal(dateStr){
  removeIfExists('dayModal');
  const list = (await idbGetAllByRange('schedules', 'date', IDBKeyRange.only(dateStr))).sort((a,b)=>(a.time||'').localeCompare(b.time||''));
  const backdrop = document.createElement('div');
  backdrop.className='modal-backdrop'; backdrop.id='dayModal';
  backdrop.innerHTML = `
    <div class="modal-sheet">
      <h3>${dateStr} 일정</h3>
      <div id="dayModalList">
        ${list.length===0? '<p class="empty">등록된 일정이 없어요.</p>' : list.map(s=>renderScheduleItemHtml(s)).join('')}
      </div>
      <button class="btn btn-primary" style="margin-top:10px;" onclick="closeModal('dayModal'); openScheduleModal('${dateStr}')">+ 일정 추가</button>
    </div>`;
  document.body.appendChild(backdrop);
  attachBackdropDismiss(backdrop);
}
function renderScheduleItemHtml(s){
  return `
    <div class="sched-item ${s.status==='done'?'done':''}">
      <div class="sched-check" onclick="toggleScheduleDone('${s.id}')">${icon('check',12)}</div>
      <div class="sched-body">
        <div class="sched-title">${escapeHtml(s.targetText||'')}</div>
        <div class="sched-sub">${s.time? s.time+' · ':''}${escapeHtml(s.purpose||'')}</div>
        <div style="margin-top:7px;"><a href="${googleCalendarUrl(s)}" target="_blank" rel="noopener" class="cal-add-btn">${icon('calendarPlus',13)} 캘린더에 추가</a></div>
      </div>
      <div class="sched-actions">
        <button class="action" style="color:var(--muted);" onclick="closeModal('dayModal'); openScheduleModal('${s.date}','${s.id}')">${icon('edit',15)}</button>
        <button class="action" style="color:var(--danger);" onclick="deleteScheduleConfirm('${s.id}')">${icon('trash',16)}</button>
      </div>
    </div>`;
}
function googleCalendarUrl(s){
  const startDate = s.date.replace(/-/g,'');
  let datesParam;
  if(s.time){
    const [hh,mm] = s.time.split(':');
    const startDT = `${startDate}T${hh}${mm}00`;
    const endObj = new Date(`${s.date}T${s.time}:00`);
    endObj.setHours(endObj.getHours()+1);
    const endDT = `${endObj.getFullYear()}${pad2(endObj.getMonth()+1)}${pad2(endObj.getDate())}T${pad2(endObj.getHours())}${pad2(endObj.getMinutes())}00`;
    datesParam = `${startDT}/${endDT}`;
  } else {
    const endObj = new Date(s.date+'T00:00:00'); endObj.setDate(endObj.getDate()+1);
    const endDate = `${endObj.getFullYear()}${pad2(endObj.getMonth()+1)}${pad2(endObj.getDate())}`;
    datesParam = `${startDate}/${endDate}`;
  }
  const text = encodeURIComponent(s.targetText||'방문 일정');
  const details = encodeURIComponent(s.purpose||'');
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${datesParam}&details=${details}`;
}
async function toggleScheduleDone(id){
  const s = await idbGet('schedules', id);
  if(!s) return;
  s.status = s.status==='done' ? 'planned' : 'done';
  await idbPut('schedules', s);
  toast(s.status==='done' ? '완료로 표시했어요' : '예정으로 되돌렸어요');
  removeIfExists('dayModal');
  renderCalendar();
}
async function deleteScheduleConfirm(id){
  const ok = await showConfirm({title:'일정 삭제', message:'이 일정을 삭제할까요?', confirmLabel:'삭제', danger:true});
  if(!ok) return;
  await idbDelete('schedules', id);
  toast('삭제했어요');
  removeIfExists('dayModal');
  renderCalendar();
}
async function openScheduleModal(dateStr, scheduleId){
  removeIfExists('scheduleModal');
  let existing = null;
  if(scheduleId) existing = await idbGet('schedules', scheduleId);
  scheduleSelectedTrialId = existing ? (existing.trialId||null) : null;
  const backdrop = document.createElement('div');
  backdrop.className='modal-backdrop'; backdrop.id='scheduleModal';
  backdrop.innerHTML = `
    <div class="modal-sheet">
      <h3>${scheduleId? '일정 수정':'일정 추가'}</h3>
      <div class="field">
        <label>날짜</label>
        <input type="date" id="schedDate" value="${existing? existing.date : dateStr}">
      </div>
      <div class="field">
        <label>시간 <span class="autofill-tag" style="background:var(--cream);color:var(--muted);">선택</span></label>
        <input type="time" id="schedTime" value="${existing? (existing.time||''):''}">
      </div>
      <div class="field">
        <label>방문 대상</label>
        <input type="text" id="schedTarget" placeholder="내역 검색 또는 직접 입력" value="${existing? escapeHtml(existing.targetText||''):''}" oninput="renderScheduleSuggestions()">
        <div id="schedSuggestList"></div>
      </div>
      <div class="field">
        <label>메모 (선택)</label>
        <textarea id="schedPurpose" placeholder="예: 생육 상태 점검">${existing? escapeHtml(existing.purpose||''):''}</textarea>
      </div>
      <div class="btn-row">
        <button class="btn btn-ghost" onclick="cancelAction(()=>closeModal('scheduleModal'))">취소</button>
        <button class="btn btn-primary" onclick="saveSchedule('${scheduleId||''}')">저장</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  attachBackdropDismiss(backdrop);
}
async function renderScheduleSuggestions(){
  const q = document.getElementById('schedTarget').value.trim().toLowerCase();
  scheduleSelectedTrialId = null;
  const listEl = document.getElementById('schedSuggestList');
  if(!q){ listEl.innerHTML=''; return; }
  const trials = await idbGetAll('trials');
  const matched = trials.filter(t=> trialTitle(t).toLowerCase().includes(q) || t.seg.toLowerCase().includes(q)).slice(0,5);
  listEl.innerHTML = matched.map(t=>`<div class="settings-row" style="padding:9px 10px;" onclick="pickScheduleTrial('${t.id}')"><span style="font-size:12.5px;">${trialTitle(t)}</span></div>`).join('');
}
async function pickScheduleTrial(trialId){
  const t = await idbGet('trials', trialId);
  scheduleSelectedTrialId = trialId;
  document.getElementById('schedTarget').value = trialTitle(t);
  document.getElementById('schedSuggestList').innerHTML='';
}
async function saveSchedule(scheduleId){
  const date = document.getElementById('schedDate').value;
  const time = document.getElementById('schedTime').value;
  const targetText = document.getElementById('schedTarget').value.trim();
  const purpose = document.getElementById('schedPurpose').value.trim();
  if(!date || !targetText){ toast('날짜와 방문 대상을 입력해주세요'); return; }
  const id = scheduleId || uid();
  const existing = scheduleId ? await idbGet('schedules', id) : null;
  await idbPut('schedules', {
    id, date, time, targetText, purpose,
    trialId: scheduleSelectedTrialId,
    status: existing ? existing.status : 'planned',
    createdAt: existing ? existing.createdAt : Date.now()
  });
  closeModal('scheduleModal');
  toast(scheduleId? '일정을 수정했어요':'일정을 등록했어요');
  renderCalendar();
}
async function checkTodaySchedules(){
  if(!appSettings.scheduleReminders) return;
  const today = todayStr();
  const list = (await idbGetAllByRange('schedules', 'date', IDBKeyRange.only(today))).filter(s=>s.status!=='done');
  if(list.length===0) return;
  rawToast(`오늘 방문 예정 일정이 ${list.length}건 있어요`);
}

function enableRotatorZoom(rotator){
  const overlay = rotator.closest('.landscape-overlay');
  let scale=1, startDist=0, startScale=1, lastTap=0;
  let panX=0, panY=0;         // 로컬(회전 전) 좌표계 기준 누적 이동량
  let dragStartX=0, dragStartY=0, dragStartPanX=0, dragStartPanY=0, dragging=false;
  let mode=null; // 'dismiss' 감지용 (스케일 1일 때 아래로 스와이프)
  let swipeStartX=0, swipeStartY=0;
  rotator.style.transition = 'transform .15s ease';
  rotator.style.touchAction = 'none';
  function dist(t){ const dx=t[0].clientX-t[1].clientX, dy=t[0].clientY-t[1].clientY; return Math.hypot(dx,dy); }
  function clampPan(){
    // 로컬(회전 전) 좌표계 기준: rotator 크기는 항상 100vh x 100vw
    const localW = window.innerHeight, localH = window.innerWidth;
    const maxX = Math.max(0, (localW*scale - localW)/2);
    const maxY = Math.max(0, (localH*scale - localH)/2);
    panX = Math.min(maxX, Math.max(-maxX, panX));
    panY = Math.min(maxY, Math.max(-maxY, panY));
  }
  function apply(withTransition){
    clampPan();
    rotator.style.transition = withTransition===false ? 'none' : 'transform .15s ease';
    rotator.style.transform = `rotate(90deg) translate(${panX}px, ${panY}px) scale(${scale})`;
  }
  function applyDismiss(dy, smooth){
    if(!overlay) return;
    overlay.style.transition = smooth ? 'transform .22s ease, opacity .22s ease' : 'none';
    overlay.style.transform = `translateY(${dy}px)`;
    overlay.style.opacity = String(Math.max(0.25, 1 - Math.abs(dy)/400));
  }
  rotator.addEventListener('touchstart', (e)=>{
    if(e.touches.length===2){
      startDist = dist(e.touches); startScale = scale; dragging=false; mode=null;
    } else if(e.touches.length===1){
      if(scale>1.01){
        dragging = true; mode=null;
        dragStartX = e.touches[0].clientX; dragStartY = e.touches[0].clientY;
        dragStartPanX = panX; dragStartPanY = panY;
      } else {
        mode = 'tap';
        swipeStartX = e.touches[0].clientX; swipeStartY = e.touches[0].clientY;
      }
    }
  }, {passive:true});
  rotator.addEventListener('touchmove', (e)=>{
    if(e.touches.length===2){
      e.preventDefault();
      const d = dist(e.touches);
      if(startDist>0){
        scale = Math.min(3.5, Math.max(1, startScale * (d/startDist)));
        apply(false);
      }
    } else if(e.touches.length===1 && dragging){
      e.preventDefault();
      // 화면(시각) 기준 이동량을 회전 전 로컬 좌표계로 변환 (rotate(90deg) 보정)
      const moveX = e.touches[0].clientX - dragStartX;
      const moveY = e.touches[0].clientY - dragStartY;
      panX = dragStartPanX + moveY;
      panY = dragStartPanY - moveX;
      apply(false);
    } else if(e.touches.length===1 && mode==='tap'){
      const t = e.touches[0];
      const dx = t.clientX-swipeStartX, dy = t.clientY-swipeStartY;
      if(Math.abs(dy)>10 && Math.abs(dy)>Math.abs(dx)*1.2) mode='dismiss';
      if(mode==='dismiss' && dy>0){ e.preventDefault(); applyDismiss(dy, false); }
    } else if(e.touches.length===1 && mode==='dismiss'){
      const t = e.touches[0]; const dy = t.clientY-swipeStartY;
      if(dy>0){ e.preventDefault(); applyDismiss(dy, false); }
    }
  }, {passive:false});
  rotator.addEventListener('touchend', (e)=>{
    if(mode==='dismiss'){
      const t = e.changedTouches[0]; const dy = t.clientY-swipeStartY;
      if(dy>110){ applyDismiss(window.innerHeight, true); setTimeout(()=>{ if(overlay) overlay.remove(); }, 220); }
      else { applyDismiss(0, true); }
      mode=null;
      return;
    }
    if(e.touches.length===0){
      dragging = false;
      const now = Date.now();
      if(mode==='tap' && now - lastTap < 300){
        scale = scale>1 ? 1 : 2.2;
        if(scale===1){ panX=0; panY=0; }
        apply();
      }
      lastTap = now;
      mode=null;
    }
  });
}
function showLandscapePhotos(photoIds){
  const ids = photoIds.filter(Boolean);
  if(ids.length<2){ toast('비교할 사진을 2장 이상 선택해주세요'); return; }
  removeIfExists('landscapeOverlay');
  Promise.all(ids.map(id=>idbGet('photos', id))).then((photosArr)=>{
    const overlay = document.createElement('div');
    overlay.className = 'landscape-overlay'; overlay.id = 'landscapeOverlay';
    overlay.innerHTML = `
      <div class="landscape-rotator" id="landscapeRotator">
        ${photosArr.map(p=>`<div class="lr-imgbox"><img src="${getPhotoUrl(p)}"></div>`).join('')}
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e)=>{ if(e.target===overlay) overlay.remove(); });
    enableRotatorZoom(document.getElementById('landscapeRotator'));
  });
}
function openXCompareLandscape(){
  showLandscapePhotos(xCmpSlots.map(s=>s? s.photoId : null));
}
function openDetailCompareLandscape(){
  showLandscapePhotos(cmpSlots);
}

