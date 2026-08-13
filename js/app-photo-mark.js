/* ================= 사진 마킹 ================= */
let markState = null;
async function openMarkingEditor(photoId){
  const p = await idbGet('photos', photoId);
  if(!p) return;
  removeIfExists('markOverlay');
  const overlay = document.createElement('div');
  overlay.className = 'mark-overlay'; overlay.id = 'markOverlay';
  overlay.innerHTML = `
    <div class="mark-topbar">
      <span class="link" onclick="cancelMarking()">취소</span>
      <span>사진 마킹</span>
      <span class="link" onclick="saveMarking()">저장</span>
    </div>
    <div class="mark-canvas-wrap" id="markCanvasWrap"><div class="mark-canvas-inner" id="markCanvasInner"><canvas id="markCanvas"></canvas></div></div>
    <div class="mark-toolbar">
      <div class="mark-extra-row" id="markExtraRow"></div>
      <div class="mark-main-row">
        <div class="mark-tools">
          <button class="mark-tool active" data-tool="pen" onclick="setMarkTool('pen',this)">${icon('pen',17)}</button>
          <button class="mark-tool" data-tool="circle" onclick="setMarkTool('circle',this)">${icon('circleTool',17)}</button>
          <button class="mark-tool" data-tool="arrow" onclick="setMarkTool('arrow',this)">${icon('arrowTool',17)}</button>
          <button class="mark-tool" data-tool="text" onclick="setMarkTool('text',this)">${icon('textTool',17)}</button>
          <button class="mark-tool" onclick="undoMarkShape()">${icon('undo',17)}</button>
        </div>
        <div class="mark-colors">
          <div class="mark-color" style="background:#ffffff" onclick="setMarkColor('#ffffff',this)"></div>
          <div class="mark-color active" style="background:#000000" onclick="setMarkColor('#000000',this)"></div>
          <div class="mark-color" style="background:#e5484d" onclick="setMarkColor('#e5484d',this)"></div>
          <div class="mark-color mark-color-more" id="markColorMoreBtn" onclick="openMarkColorPicker()">${icon('plus',13)}</div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const img = new Image();
  img.onload = ()=> initMarkCanvas(img, photoId);
  img.src = getPhotoUrl(p);
}
function initMarkCanvas(img, photoId){
  const wrap = document.getElementById('markCanvasWrap');
  const inner = document.getElementById('markCanvasInner');
  const canvas = document.getElementById('markCanvas');
  const wrapW = wrap.clientWidth, wrapH = wrap.clientHeight;
  const imgRatio = img.naturalWidth/img.naturalHeight;
  const wrapRatio = wrapW/wrapH;
  let dispW, dispH;
  if(imgRatio > wrapRatio){ dispW = wrapW; dispH = wrapW/imgRatio; }
  else { dispH = wrapH; dispW = wrapH*imgRatio; }
  const dpr = window.devicePixelRatio || 1;
  inner.style.width = dispW+'px';
  inner.style.height = dispH+'px';
  canvas.style.width = dispW+'px';
  canvas.style.height = dispH+'px';
  canvas.width = Math.round(dispW*dpr);
  canvas.height = Math.round(dispH*dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr,dpr);

  markState = { photoId, img, shapes:[], tool:'pen', color:'#000000', lineWidth:4, textBg:'none', canvas, ctx, dispW, dispH, drawing:false, current:null };
  redrawMarkCanvas();
  attachMarkTouchHandlers(canvas);
  renderMarkExtraRow();
}
function redrawMarkCanvas(){
  const {ctx, img, dispW, dispH, shapes, current} = markState;
  ctx.clearRect(0,0,dispW,dispH);
  ctx.drawImage(img, 0,0, dispW, dispH);
  [...shapes, current, pendingShapeData].filter(Boolean).forEach(sh=> drawMarkShape(ctx, sh));
}
function drawMarkShape(ctx, sh){
  ctx.strokeStyle = sh.color; ctx.fillStyle = sh.color;
  ctx.lineWidth = sh.lineWidth || 4; ctx.lineCap='round'; ctx.lineJoin='round';
  if(sh.type==='pen'){
    ctx.beginPath();
    sh.points.forEach((pt,i)=>{ i===0? ctx.moveTo(pt.x,pt.y) : ctx.lineTo(pt.x,pt.y); });
    ctx.stroke();
  } else if(sh.type==='circle'){
    const r = Math.hypot(sh.x2-sh.x1, sh.y2-sh.y1);
    ctx.beginPath(); ctx.arc(sh.x1, sh.y1, r, 0, Math.PI*2); ctx.stroke();
  } else if(sh.type==='arrow'){
    drawMarkArrow(ctx, sh.x1, sh.y1, sh.x2, sh.y2);
  } else if(sh.type==='text'){
    ctx.font = `bold ${sh.fontSize||26}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if(sh.bg && sh.bg!=='none'){
      const padX = 10, padY = 6, r = 6;
      const textW = ctx.measureText(sh.text).width;
      const textH = (sh.fontSize||26) * 1.15;
      const boxW = textW + padX*2, boxH = textH + padY*2;
      const bx = sh.x1 - boxW/2, by = sh.y1 - boxH/2;
      ctx.fillStyle = sh.bg==='white' ? '#ffffff' : '#000000';
      ctx.beginPath();
      ctx.moveTo(bx+r, by);
      ctx.arcTo(bx+boxW, by, bx+boxW, by+boxH, r);
      ctx.arcTo(bx+boxW, by+boxH, bx, by+boxH, r);
      ctx.arcTo(bx, by+boxH, bx, by, r);
      ctx.arcTo(bx, by, bx+boxW, by, r);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = sh.color;
    }
    ctx.fillText(sh.text, sh.x1, sh.y1);
  }
}
function drawMarkArrow(ctx, x1,y1,x2,y2){
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  const angle = Math.atan2(y2-y1, x2-x1);
  const headLen = 14;
  ctx.beginPath();
  ctx.moveTo(x2,y2);
  ctx.lineTo(x2-headLen*Math.cos(angle-Math.PI/6), y2-headLen*Math.sin(angle-Math.PI/6));
  ctx.lineTo(x2-headLen*Math.cos(angle+Math.PI/6), y2-headLen*Math.sin(angle+Math.PI/6));
  ctx.closePath(); ctx.fill();
}
function getMarkPoint(e, canvas){
  const rect = canvas.getBoundingClientRect();
  const t = e.touches && e.touches[0] ? e.touches[0] : e;
  return { x: t.clientX-rect.left, y: t.clientY-rect.top };
}
function attachMarkTouchHandlers(canvas){
  canvas.addEventListener('touchstart', (e)=>{
    e.preventDefault();
    if(!markState || pendingTextData || pendingShapeData) return;
    const pt = getMarkPoint(e, canvas);
    const {tool, color, lineWidth} = markState;
    if(tool==='text'){
      startTextPlacement(pt, color);
      return;
    }
    markState.drawing = true;
    if(tool==='pen'){ markState.current = {type:'pen', points:[pt], color, lineWidth}; }
    else { markState.current = {type:tool, x1:pt.x, y1:pt.y, x2:pt.x, y2:pt.y, color, lineWidth}; }
  }, {passive:false});
  canvas.addEventListener('touchmove', (e)=>{
    if(!markState || !markState.drawing) return;
    e.preventDefault();
    const pt = getMarkPoint(e, canvas);
    if(markState.tool==='pen'){ markState.current.points.push(pt); }
    else { markState.current.x2 = pt.x; markState.current.y2 = pt.y; }
    redrawMarkCanvas();
  }, {passive:false});
  canvas.addEventListener('touchend', ()=>{
    if(!markState || !markState.drawing) return;
    markState.drawing = false;
    if(markState.current){
      if(markState.tool==='pen'){
        markState.shapes.push(markState.current);
        markState.current = null;
      } else {
        // 원/화살표는 바로 확정하지 않고, 위치/크기 조절 가능한 상태로 전환
        const dx = markState.current.x2-markState.current.x1, dy = markState.current.y2-markState.current.y1;
        if(Math.hypot(dx,dy) < 8){ markState.current = null; return; } // 너무 작으면 실수로 간주하고 무시
        pendingShapeData = { ...markState.current };
        markState.current = null;
        redrawMarkCanvas();
        renderPendingShapeHandles();
      }
    }
  });
}
/* ---- 정렬 안내선(파워포인트 스마트가이드 방식) ---- */
const SNAP_THRESHOLD = 6;
function getMarkShapeCenter(sh){
  if(sh.type==='arrow') return { x:(sh.x1+sh.x2)/2, y:(sh.y1+sh.y2)/2 };
  return { x:sh.x1, y:sh.y1 }; // circle, text
}
function computeSnap(centerX, centerY){
  const targets = (markState.shapes||[]).filter(s=>s.type!=='pen');
  let bestX=null, bestXDist=SNAP_THRESHOLD, bestY=null, bestYDist=SNAP_THRESHOLD;
  targets.forEach(s=>{
    const c = getMarkShapeCenter(s);
    const dx = Math.abs(c.x-centerX);
    if(dx<bestXDist){ bestXDist=dx; bestX=c.x; }
    const dy = Math.abs(c.y-centerY);
    if(dy<bestYDist){ bestYDist=dy; bestY=c.y; }
  });
  return {
    x: bestX!==null ? bestX : centerX,
    y: bestY!==null ? bestY : centerY,
    guideX: bestX, guideY: bestY
  };
}
function renderSnapGuides(guideX, guideY){
  removeIfExists('snapGuideV'); removeIfExists('snapGuideH');
  const inner = document.getElementById('markCanvasInner');
  if(guideX!==null && guideX!==undefined){
    const v = document.createElement('div');
    v.id='snapGuideV'; v.className='snap-guide-v'; v.style.left = guideX+'px';
    inner.appendChild(v);
  }
  if(guideY!==null && guideY!==undefined){
    const h = document.createElement('div');
    h.id='snapGuideH'; h.className='snap-guide-h'; h.style.top = guideY+'px';
    inner.appendChild(h);
  }
}
function clearSnapGuides(){ removeIfExists('snapGuideV'); removeIfExists('snapGuideH'); }

/* ---- 크기 맞춤 안내 (같은 도구끼리 크기가 같아지면 표시) ---- */
const SIZE_SNAP_THRESHOLD = 6; // 원 반지름/화살표 길이 px
const SIZE_SNAP_THRESHOLD_FONT = 2; // 텍스트 폰트 크기 px
function getMarkShapeSize(sh){
  if(sh.type==='circle' || sh.type==='arrow') return Math.hypot(sh.x2-sh.x1, sh.y2-sh.y1);
  if(sh.type==='text') return sh.fontSize;
  return null;
}
function computeSizeSnap(type, currentSize){
  const threshold = type==='text' ? SIZE_SNAP_THRESHOLD_FONT : SIZE_SNAP_THRESHOLD;
  const targets = (markState.shapes||[]).filter(s=>s.type===type);
  let best=null, bestDist=threshold;
  targets.forEach(s=>{
    const sz = getMarkShapeSize(s);
    const dist = Math.abs(sz-currentSize);
    if(dist<bestDist){ bestDist=dist; best=sz; }
  });
  return best;
}
function showSizeMatchBadge(){
  if(document.getElementById('sizeMatchBadge')) return;
  const inner = document.getElementById('markCanvasInner');
  if(!inner) return;
  const b = document.createElement('div');
  b.id='sizeMatchBadge'; b.className='size-match-badge';
  b.textContent = '크기 동일';
  inner.appendChild(b);
}
function hideSizeMatchBadge(){ removeIfExists('sizeMatchBadge'); }

/* ---- 원/화살표 배치(이동/크기조절) ---- */
let pendingShapeData = null;
function renderPendingShapeHandles(){
  removeIfExists('shapeHandles');
  const inner = document.getElementById('markCanvasInner');
  const s = pendingShapeData;
  const wrap = document.createElement('div');
  wrap.id = 'shapeHandles';
  wrap.style.cssText = 'position:absolute;inset:0;';
  const topY = Math.min(s.y1, s.y2) - 36;
  const midX = (s.x1+s.x2)/2;
  let handlesHtml = '';
  if(s.type==='circle'){
    const r = Math.hypot(s.x2-s.x1, s.y2-s.y1);
    handlesHtml += `<div class="shape-move-zone" id="shMove" style="left:${s.x1-r}px;top:${s.y1-r}px;width:${r*2}px;height:${r*2}px;"></div>`;
    handlesHtml += `<div class="shape-handle" id="shResize" style="left:${s.x2}px;top:${s.y2}px;"></div>`;
  } else {
    const midX2 = (s.x1+s.x2)/2, midY2 = (s.y1+s.y2)/2;
    handlesHtml += `<div class="shape-move-mid" id="shMoveMid" style="left:${midX2}px;top:${midY2}px;"></div>`;
    handlesHtml += `<div class="shape-handle" id="shA" style="left:${s.x1}px;top:${s.y1}px;"></div>`;
    handlesHtml += `<div class="shape-handle" id="shB" style="left:${s.x2}px;top:${s.y2}px;"></div>`;
  }
  handlesHtml += `<div class="shp-btn mte-cancel" style="left:${midX-16}px;top:${topY}px;" onclick="cancelPendingShape()">${icon('close',14)}</div>`;
  handlesHtml += `<div class="shp-btn mte-confirm" style="left:${midX+16}px;top:${topY}px;" onclick="confirmPendingShape()">${icon('check',14)}</div>`;
  wrap.innerHTML = handlesHtml;
  inner.appendChild(wrap);
  attachShapeHandleDrag();
}
function attachShapeHandleDrag(){
  const s = pendingShapeData;
  function makeDraggable(el, onMove, opts){
    opts = opts || {};
    if(!el) return;
    let startX=0, startY=0, orig=null;
    el.addEventListener('touchstart', (e)=>{
      e.stopPropagation();
      const t = e.touches[0];
      startX = t.clientX; startY = t.clientY;
      orig = { x1:s.x1, y1:s.y1, x2:s.x2, y2:s.y2 };
    }, {passive:true});
    el.addEventListener('touchmove', (e)=>{
      e.preventDefault(); e.stopPropagation();
      const t = e.touches[0];
      const dx = t.clientX-startX, dy = t.clientY-startY;
      onMove(dx, dy, orig);
      if(opts.posSnap){
        const c = getMarkShapeCenter(s);
        const snapped = computeSnap(c.x, c.y);
        const adjX = snapped.x-c.x, adjY = snapped.y-c.y;
        if(adjX || adjY){ s.x1+=adjX; s.x2+=adjX; s.y1+=adjY; s.y2+=adjY; }
        renderSnapGuides(snapped.guideX, snapped.guideY);
      }
      if(opts.sizeSnap){
        const curSize = getMarkShapeSize(s);
        const matched = curSize>0 ? computeSizeSnap(s.type, curSize) : null;
        if(matched!==null){
          const scale = matched/curSize;
          if(opts.sizeSnap==='fromP1'){ s.x2 = s.x1+(s.x2-s.x1)*scale; s.y2 = s.y1+(s.y2-s.y1)*scale; }
          else { s.x1 = s.x2+(s.x1-s.x2)*scale; s.y1 = s.y2+(s.y1-s.y2)*scale; }
          showSizeMatchBadge();
        } else {
          hideSizeMatchBadge();
        }
      }
      redrawMarkCanvas();
      renderPendingShapeHandles();
    }, {passive:false});
    el.addEventListener('touchend', (e)=>{
      e.stopPropagation();
      if(opts.posSnap) clearSnapGuides();
      if(opts.sizeSnap) hideSizeMatchBadge();
    }, {passive:true});
  }
  if(s.type==='circle'){
    makeDraggable(document.getElementById('shMove'), (dx,dy,orig)=>{
      s.x1 = orig.x1+dx; s.y1 = orig.y1+dy; s.x2 = orig.x2+dx; s.y2 = orig.y2+dy;
    }, {posSnap:true});
    makeDraggable(document.getElementById('shResize'), (dx,dy,orig)=>{
      s.x2 = orig.x2+dx; s.y2 = orig.y2+dy;
    }, {sizeSnap:'fromP1'});
  } else {
    makeDraggable(document.getElementById('shMoveMid'), (dx,dy,orig)=>{
      s.x1 = orig.x1+dx; s.y1 = orig.y1+dy; s.x2 = orig.x2+dx; s.y2 = orig.y2+dy;
    }, {posSnap:true});
    makeDraggable(document.getElementById('shA'), (dx,dy,orig)=>{ s.x1 = orig.x1+dx; s.y1 = orig.y1+dy; }, {sizeSnap:'fromP2'});
    makeDraggable(document.getElementById('shB'), (dx,dy,orig)=>{ s.x2 = orig.x2+dx; s.y2 = orig.y2+dy; }, {sizeSnap:'fromP1'});
  }
}
function confirmPendingShape(){
  if(!pendingShapeData || !markState) return;
  markState.shapes.push(pendingShapeData);
  pendingShapeData = null;
  removeIfExists('shapeHandles');
  clearSnapGuides();
  hideSizeMatchBadge();
  redrawMarkCanvas();
}
function cancelPendingShape(){
  pendingShapeData = null;
  removeIfExists('shapeHandles');
  clearSnapGuides();
  hideSizeMatchBadge();
  redrawMarkCanvas();
}
/* ---- 텍스트 배치(이동/크기조절) ---- */
let pendingTextData = null;
function startTextPlacement(pt, color){
  promptText({title:'텍스트 입력', placeholder:'예: 병해충 의심'}).then(text=>{
    if(!text || !markState) return;
    pendingTextData = { text, color, x: pt.x, y: pt.y, fontSize: 26, bg: markState.textBg };
    renderPendingTextEditor();
  });
}
function renderPendingTextEditor(){
  removeIfExists('markTextEditor');
  const inner = document.getElementById('markCanvasInner');
  const el = document.createElement('div');
  el.className = 'mte'; el.id = 'markTextEditor';
  el.style.left = pendingTextData.x + 'px';
  el.style.top = pendingTextData.y + 'px';
  el.style.color = pendingTextData.color;
  el.style.fontSize = pendingTextData.fontSize + 'px';
  const bgStyle = pendingTextData.bg && pendingTextData.bg!=='none'
    ? `background:${pendingTextData.bg==='white'?'#fff':'#000'};padding:5px 10px;border-radius:6px;`
    : '';
  el.innerHTML = `
    <div class="mte-text" style="${bgStyle}">${escapeHtml(pendingTextData.text)}</div>
    <div class="mte-btn mte-confirm" id="mteConfirm">${icon('check',14)}</div>
    <div class="mte-btn mte-cancel" id="mteCancel">${icon('close',14)}</div>
    <div class="mte-resize" id="mteResize"></div>`;
  inner.appendChild(el);
  document.getElementById('mteConfirm').onclick = confirmPendingText;
  document.getElementById('mteCancel').onclick = ()=> removePendingTextEditor(true);
  attachPendingTextGestures(el);
}
function attachPendingTextGestures(el){
  const textEl = el.querySelector('.mte-text');
  let mode = null; // 'move' | 'resize'
  let startX=0, startY=0, startLeft=0, startTop=0, startSize=0, startDist=0;
  textEl.addEventListener('touchstart', (e)=>{
    e.stopPropagation();
    mode = 'move';
    const t = e.touches[0];
    startX = t.clientX; startY = t.clientY;
    startLeft = parseFloat(el.style.left); startTop = parseFloat(el.style.top);
  }, {passive:true});
  document.getElementById('mteResize').addEventListener('touchstart', (e)=>{
    e.stopPropagation();
    mode = 'resize';
    const t = e.touches[0];
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width/2, cy = rect.top + rect.height/2;
    startDist = Math.max(20, Math.hypot(t.clientX-cx, t.clientY-cy));
    startSize = pendingTextData.fontSize;
  }, {passive:true});
  el.addEventListener('touchmove', (e)=>{
    e.preventDefault(); e.stopPropagation();
    const t = e.touches[0];
    if(mode==='move'){
      const dx = t.clientX-startX, dy = t.clientY-startY;
      const snapped = computeSnap(startLeft+dx, startTop+dy);
      pendingTextData.x = snapped.x; pendingTextData.y = snapped.y;
      el.style.left = pendingTextData.x+'px'; el.style.top = pendingTextData.y+'px';
      renderSnapGuides(snapped.guideX, snapped.guideY);
    } else if(mode==='resize'){
      // 핸들을 텍스트 중심에서 멀리 끌면 커지고 가까이 끌면 작아짐 (대각선 방향 무관)
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width/2, cy = rect.top + rect.height/2;
      const curDist = Math.hypot(t.clientX-cx, t.clientY-cy);
      let newSize = Math.max(12, Math.min(90, startSize * (curDist/startDist)));
      const matched = computeSizeSnap('text', newSize);
      if(matched!==null){ newSize = matched; showSizeMatchBadge(); } else { hideSizeMatchBadge(); }
      pendingTextData.fontSize = newSize;
      el.style.fontSize = pendingTextData.fontSize+'px';
    }
  }, {passive:false});
  el.addEventListener('touchend', (e)=>{ e.stopPropagation(); mode=null; clearSnapGuides(); hideSizeMatchBadge(); }, {passive:true});
}
function confirmPendingText(){
  if(!pendingTextData || !markState) return;
  markState.shapes.push({
    type:'text', text: pendingTextData.text, color: pendingTextData.color,
    x1: pendingTextData.x, y1: pendingTextData.y, fontSize: pendingTextData.fontSize, bg: pendingTextData.bg
  });
  removePendingTextEditor(false);
  redrawMarkCanvas();
}
function removePendingTextEditor(){
  pendingTextData = null;
  removeIfExists('markTextEditor');
  clearSnapGuides();
  hideSizeMatchBadge();
}

function setMarkTool(tool, el){
  markState.tool = tool;
  document.querySelectorAll('.mark-tool[data-tool]').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  renderMarkExtraRow();
}
function renderMarkExtraRow(){
  const row = document.getElementById('markExtraRow');
  if(!row || !markState) return;
  if(markState.tool==='text'){
    row.innerHTML = `
      <span class="mark-extra-label">배경</span>
      <div class="mark-textbg-opt ${markState.textBg==='none'?'active':''}" onclick="setMarkTextBg('none',this)">없음</div>
      <div class="mark-textbg-opt ${markState.textBg==='white'?'active':''}" style="background:#fff;color:#222;" onclick="setMarkTextBg('white',this)">흰색</div>
      <div class="mark-textbg-opt ${markState.textBg==='black'?'active':''}" style="background:#000;color:#fff;" onclick="setMarkTextBg('black',this)">검정</div>`;
  } else if(markState.tool==='pen' || markState.tool==='circle' || markState.tool==='arrow'){
    row.innerHTML = `
      <span class="mark-extra-label">굵기</span>
      <div class="mark-thick-dot ${markState.lineWidth===2?'active':''}" onclick="setMarkThickness(2,this)"><span style="width:4px;height:4px;"></span></div>
      <div class="mark-thick-dot ${markState.lineWidth===4?'active':''}" onclick="setMarkThickness(4,this)"><span style="width:8px;height:8px;"></span></div>
      <div class="mark-thick-dot ${markState.lineWidth===7?'active':''}" onclick="setMarkThickness(7,this)"><span style="width:13px;height:13px;"></span></div>`;
  } else {
    row.innerHTML = '';
  }
}
function setMarkThickness(w, el){
  markState.lineWidth = w;
  document.querySelectorAll('.mark-thick-dot').forEach(d=>d.classList.remove('active'));
  el.classList.add('active');
}
function setMarkTextBg(bg, el){
  markState.textBg = bg;
  document.querySelectorAll('.mark-textbg-opt').forEach(d=>d.classList.remove('active'));
  el.classList.add('active');
  if(pendingTextData){
    // 텍스트박스를 이미 입력한 뒤에도 배경색을 바로 바꿔서 미리보기에 반영
    pendingTextData.bg = bg;
    renderPendingTextEditor();
  }
}
function setMarkColor(color, el){
  markState.color = color;
  document.querySelectorAll('.mark-color').forEach(c=>c.classList.remove('active'));
  el.classList.add('active');
  if(pendingTextData){
    // 텍스트박스를 이미 입력한 뒤에도 글자색을 바로 바꿔서 미리보기에 반영
    pendingTextData.color = color;
    renderPendingTextEditor();
  }
}
function openMarkColorPicker(){
  removeIfExists('markColorPopup');
  const backdrop = document.createElement('div');
  backdrop.className = 'mark-color-popup-backdrop'; backdrop.id = 'markColorPopup';
  backdrop.innerHTML = `
    <div class="mark-color-popup-sheet">
      <div class="mark-color-grid">
        ${COLOR_CATALOG.map(c=>`<div class="mark-color-dot" style="background:${c}" onclick="pickMoreMarkColor('${c}')"></div>`).join('')}
      </div>
      <div class="mark-color-custom-row">
        <input type="color" id="markCustomColorInput" value="${markState.color}">
        <span>직접 선택</span>
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  attachBackdropDismiss(backdrop);
  document.getElementById('markCustomColorInput').oninput = (e)=> pickMoreMarkColor(e.target.value);
}
function pickMoreMarkColor(color){
  const moreBtn = document.getElementById('markColorMoreBtn');
  if(moreBtn){ moreBtn.style.background = color; setMarkColor(color, moreBtn); }
  else { markState.color = color; }
  removeIfExists('markColorPopup');
}
function undoMarkShape(){
  if(!markState) return;
  markState.shapes.pop();
  redrawMarkCanvas();
}
function cancelMarking(){
  markState = null;
  pendingShapeData = null;
  pendingTextData = null;
  removeIfExists('markOverlay');
}
async function saveMarking(){
  if(!markState) return;
  if(pendingShapeData) confirmPendingShape();
  if(markState.shapes.length===0){
    const ok = await showConfirm({title:'마킹 없음', message:'표시한 내용이 없어요. 그래도 저장할까요?', confirmLabel:'저장'});
    if(!ok) return;
  }
  const original = await idbGet('photos', markState.photoId);
  const canvas = markState.canvas;
  // 타임라인 등 목록에 쓸 가벼운 썸네일도 같이 생성
  const MAX_THUMB = 380;
  const tscale = MAX_THUMB/Math.max(canvas.width, canvas.height);
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = Math.round(canvas.width*tscale);
  thumbCanvas.height = Math.round(canvas.height*tscale);
  thumbCanvas.getContext('2d').drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);

  // 코멘트 입력 팝업에 답하길 기다리는 동안 이미지 인코딩을 동시에 진행 —
  // 예전엔 팝업 응답을 먼저 기다린 "다음에" 인코딩을 시작해서 두 번 기다리는 구조였음
  const [comment, blob, thumbBlob] = await Promise.all([
    promptText({title:'코멘트 (선택)', placeholder:'예: 잎마름병 의심'}),
    new Promise(res=> canvas.toBlob(res, 'image/jpeg', 0.9)),
    new Promise(res=> thumbCanvas.toBlob(res, 'image/jpeg', 0.75))
  ]);

  try{
    await idbPut('photos', {
      id: uid(), trialId: original.trialId, date: original.date, createdAt: Date.now(),
      blob, thumbBlob, isMarked:true, originalPhotoId: markState.photoId, markNote: comment||''
    });
    toast('마킹한 사진을 저장했어요');
    removeIfExists('markOverlay');
    closeLightbox();
    markState = null;
    if(currentTrialId) renderDetail(currentTrialId);
  }catch(e){
    showStorageError(e);
  }
}

function openLightbox(photoId){
  lightboxIndex = allPhotosCache.findIndex(p=>p.id===photoId);
  if(lightboxIndex<0) return;
  renderLightbox();
}
function renderLightbox(){
  const p = allPhotosCache[lightboxIndex];
  if(!p) return;
  const url = URL.createObjectURL(p.blob);
  let lb = document.getElementById('lightboxEl');
  if(!lb){
    lb = document.createElement('div');
    lb.className='lightbox'; lb.id='lightboxEl';
    document.body.appendChild(lb);
  }
  lb.innerHTML = `
    <div class="lb-top"><span>${p.date} · ${lightboxIndex+1}/${allPhotosCache.length}</span><span onclick="closeLightbox()">${icon('close',18)}</span></div>
    ${p.isMarked && p.markNote ? `<div class="lb-comment">${icon('pen',15)} ${escapeHtml(p.markNote)}</div>` : ''}
    <div class="lb-imgwrap" id="lbImgWrap">
      ${lightboxIndex>0? `<div class="lb-nav lb-prev" onclick="lightboxNav(-1)">${icon('chevLeft',20)}</div>`:''}
      <img id="lbImg" src="${url}">
      ${lightboxIndex<allPhotosCache.length-1? `<div class="lb-nav lb-next" onclick="lightboxNav(1)">${icon('chevRight',20)}</div>`:''}
    </div>
    <div class="lb-actions">
      <a class="a" onclick="downloadBlob('${p.id}')">저장</a>
      <a class="a primary" onclick="shareBlob('${p.id}')">공유</a>
      <a class="a" onclick="openMarkingEditor('${p.id}')">마킹</a>
      <a class="a" onclick="rotateLightboxPhoto()">${icon('rotate',13)} 회전</a>
      <a class="a" style="background:rgba(181,84,63,0.4);" onclick="deleteLightboxPhoto()">삭제</a>
    </div>`;
  attachLightboxGestures();
}
function attachLightboxGestures(){
  const wrap = document.getElementById('lbImgWrap');
  const img = document.getElementById('lbImg');
  const lb = document.getElementById('lightboxEl');
  if(!wrap || !img || !lb) return;
  img.style.transition = 'none';
  lb.style.transition = 'none';
  wrap.style.touchAction = 'none';
  let scale=1, panX=0, panY=0;
  let startDist=0, startScale=1;
  let startPanX=0, startPanY=0, startTouchX=0, startTouchY=0;
  let mode=null; // 'pinch' | 'pan' | 'swipe' | 'dismiss'
  let swipeStartX=0, swipeStartY=0;
  let lastTap=0;
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
    lb.style.transition = smooth ? 'transform .22s ease, opacity .22s ease' : 'none';
    lb.style.transform = `translateY(${dy}px)`;
    lb.style.opacity = String(Math.max(0.25, 1 - Math.abs(dy)/400));
  }

  wrap.addEventListener('touchstart', (e)=>{
    if(e.touches.length===2){
      mode='pinch';
      startDist = dist(e.touches);
      startScale = scale;
    } else if(e.touches.length===1){
      const t = e.touches[0];
      swipeStartX = t.clientX; swipeStartY = t.clientY;
      if(scale>1){
        mode='pan';
        startTouchX = t.clientX; startTouchY = t.clientY;
        startPanX = panX; startPanY = panY;
      } else {
        mode='swipe';
      }
    }
  }, {passive:true});

  wrap.addEventListener('touchmove', (e)=>{
    if(mode==='pinch' && e.touches.length===2){
      e.preventDefault();
      const d = dist(e.touches);
      if(startDist>0){ scale = Math.min(4, Math.max(1, startScale*(d/startDist))); apply(false); }
    } else if(mode==='pan' && e.touches.length===1){
      e.preventDefault();
      const t = e.touches[0];
      panX = startPanX + (t.clientX-startTouchX);
      panY = startPanY + (t.clientY-startTouchY);
      apply(false);
    } else if(mode==='swipe' && e.touches.length===1){
      const t = e.touches[0];
      const dx = t.clientX-swipeStartX, dy = t.clientY-swipeStartY;
      if(mode==='swipe' && (Math.abs(dy) > 10) && Math.abs(dy) > Math.abs(dx)*1.2){
        mode = 'dismiss';
      }
      if(mode==='dismiss' && dy>0){
        e.preventDefault();
        applyDismiss(dy, false);
      }
    } else if(mode==='dismiss' && e.touches.length===1){
      const t = e.touches[0];
      const dy = t.clientY-swipeStartY;
      if(dy>0){ e.preventDefault(); applyDismiss(dy, false); }
    }
  }, {passive:false});

  wrap.addEventListener('touchend', (e)=>{
    if(mode==='dismiss'){
      const t = e.changedTouches[0];
      const dy = t.clientY-swipeStartY;
      if(dy > 110){
        applyDismiss(window.innerHeight, true);
        setTimeout(()=> closeLightbox(), 220);
      } else {
        applyDismiss(0, true);
      }
    } else if(mode==='pinch' || mode==='pan'){
      if(scale<=1.02){
        scale = 1; panX = 0; panY = 0;
        apply(true);
      }
    } else if(mode==='swipe'){
      const t = e.changedTouches[0];
      const dx = t.clientX-swipeStartX, dy = t.clientY-swipeStartY;
      if(Math.abs(dx)>45 && Math.abs(dx)>Math.abs(dy)*1.2){
        if(dx<0) lightboxNav(1); else lightboxNav(-1);
      } else {
        const now = Date.now();
        if(now-lastTap<300){
          scale = scale>1 ? 1 : 2.2;
          panX=0; panY=0;
          apply(true);
        }
        lastTap = now;
      }
    }
    if(e.touches.length===0) mode=null;
  });
}
function lightboxNav(dir){
  const newIdx = lightboxIndex + dir;
  if(newIdx<0 || newIdx>=allPhotosCache.length) return;
  lightboxIndex = newIdx;
  renderLightbox();
}
function closeLightbox(){ removeIfExists('lightboxEl'); }
function rotateImageBlob(blob, degrees){
  return new Promise((resolve, reject)=>{
    createImageBitmap(blob).then(bitmap=>{
      const swap = Math.abs(degrees % 180) === 90;
      const w = bitmap.width, h = bitmap.height;
      const canvas = document.createElement('canvas');
      canvas.width = swap ? h : w;
      canvas.height = swap ? w : h;
      const ctx = canvas.getContext('2d');
      ctx.translate(canvas.width/2, canvas.height/2);
      ctx.rotate(degrees*Math.PI/180);
      ctx.drawImage(bitmap, -w/2, -h/2);
      if(bitmap.close) bitmap.close();
      canvas.toBlob(async (outBlob)=>{
        const MAX_THUMB = 380;
        const tscale = MAX_THUMB/Math.max(canvas.width, canvas.height);
        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = Math.round(canvas.width*tscale);
        thumbCanvas.height = Math.round(canvas.height*tscale);
        thumbCanvas.getContext('2d').drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
        const thumbBlob = await new Promise(res=> thumbCanvas.toBlob(res, 'image/jpeg', 0.75));
        resolve({ blob: outBlob, thumbBlob });
      }, 'image/jpeg', 0.9);
    }).catch(reject);
  });
}
async function rotateLightboxPhoto(){
  const p = allPhotosCache[lightboxIndex];
  if(!p) return;
  try{
    const { blob, thumbBlob } = await rotateImageBlob(p.blob, 90);
    p.blob = blob; p.thumbBlob = thumbBlob;
    await idbPut('photos', p);
    if(photoUrlCache.has(p.id)){ URL.revokeObjectURL(photoUrlCache.get(p.id)); photoUrlCache.delete(p.id); }
    const thumbKey = p.id+'_thumb';
    if(photoThumbUrlCache.has(thumbKey)){ URL.revokeObjectURL(photoThumbUrlCache.get(thumbKey)); photoThumbUrlCache.delete(thumbKey); }
    renderLightbox();
    if(currentTrialId) renderDetail(currentTrialId);
  }catch(e){
    showStorageError(e);
  }
}
async function deleteLightboxPhoto(){
  const p = allPhotosCache[lightboxIndex];
  if(!p) return;
  const ok = await showConfirm({title:'사진 삭제', message:'이 사진을 삭제할까요?\n되돌릴 수 없어요.', confirmLabel:'삭제', danger:true});
  if(!ok) return;
  await idbDelete('photos', p.id);
  if(photoUrlCache.has(p.id)){ URL.revokeObjectURL(photoUrlCache.get(p.id)); photoUrlCache.delete(p.id); }
  toast('사진을 삭제했어요');
  closeLightbox();
  if(currentTrialId) renderDetail(currentTrialId);
}
async function showNativeDiagnostics(){
  const lines = [];
  lines.push(`window.Capacitor 존재: ${typeof window.Capacitor !== 'undefined' ? '예' : '아니오'}`);
  if(window.Capacitor){
    lines.push(`isNativePlatform(): ${typeof window.Capacitor.isNativePlatform==='function' ? window.Capacitor.isNativePlatform() : '함수 없음'}`);
    lines.push(`getPlatform(): ${typeof window.Capacitor.getPlatform==='function' ? window.Capacitor.getPlatform() : '함수 없음'}`);
    const pluginNames = window.Capacitor.Plugins ? Object.keys(window.Capacitor.Plugins) : [];
    lines.push(`등록된 플러그인 (${pluginNames.length}개): ${pluginNames.join(', ')||'없음'}`);
  }
  lines.push(`isNativeApp() 결과: ${isNativeApp()}`);
  lines.push(`현재 주소: ${window.location.href}`);
  lines.push(`User Agent: ${navigator.userAgent}`);
  await showAlert({title:'네이티브 진단 정보', message: lines.join('\n\n')});
}
function isNativeApp(){
  if(typeof window === 'undefined' || !window.Capacitor) return false;
  try{
    if(typeof window.Capacitor.isNativePlatform === 'function') return window.Capacitor.isNativePlatform();
    if(typeof window.Capacitor.getPlatform === 'function') return window.Capacitor.getPlatform() !== 'web';
  }catch(e){}
  return true; // Capacitor 객체 자체가 있다는 건 네이티브 앱 안이라는 뜻
}
async function nativeShareBlob(blob, filename, title){
  try{
    const plugins = window.Capacitor && window.Capacitor.Plugins;
    if(!plugins || !plugins.Filesystem || !plugins.Share){
      toast('앱에 저장/공유 기능이 아직 설치 안 됐어요. 안드로이드 스튜디오에서 다시 빌드해주세요.');
      return false;
    }
    const { Filesystem, Share } = plugins;
    const base64 = await blobToBase64(blob);
    const result = await Filesystem.writeFile({ path: filename, data: base64, directory: 'CACHE' });
    await Share.share({ title: title||filename, url: result.uri, dialogTitle: '공유 / 저장하기' });
    return true;
  }catch(e){
    console.error(e);
    toast('저장/공유에 실패했어요: ' + (e && e.message ? e.message : e));
    return false;
  }
}
async function downloadBlob(photoId){
  const p = await idbGet('photos', photoId);
  if(isNativeApp()){ await nativeShareBlob(p.blob, `${p.date}.jpg`, '사진 저장'); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(p.blob); a.download = `${p.date}.jpg`; a.click();
}
async function shareBlob(photoId){
  const p = await idbGet('photos', photoId);
  if(isNativeApp()){ await nativeShareBlob(p.blob, `${p.date}.jpg`, '작황 사진'); return; }
  const file = new File([p.blob], `${p.date}.jpg`, {type:p.blob.type||'image/jpeg'});
  if(navigator.share && navigator.canShare && navigator.canShare({files:[file]})){
    try{ await navigator.share({files:[file], title:'작황 사진'}); }catch(e){}
  } else {
    toast('이 브라우저는 공유가 지원되지 않아요. 저장 후 공유해주세요.');
  }
}

