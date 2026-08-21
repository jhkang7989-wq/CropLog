/* ================= 업로드 ================= */
let pendingFiles = [];
let pendingRotations = [];
async function renderUpload(trialId){
  pendingFiles = [];
  pendingRotations = [];
  document.getElementById('previewStrip').innerHTML='';
  document.getElementById('uploadDate').value = todayStr();
  const t = await idbGet('trials', trialId);
  const c = await idbGet('crops', t.cropId);
  document.getElementById('uploadClassifyInfo').textContent = `${c.name} / ${t.seg} / ${trialTitle(t)}`;
}
function handlePhotoSelect(e){
  const files = Array.from(e.target.files);
  files.forEach(f=> { pendingFiles.push(f); pendingRotations.push(0); });
  renderPreview();
  e.target.value='';
}
function renderPreview(){
  const strip = document.getElementById('previewStrip');
  strip.innerHTML = pendingFiles.map((f,i)=>`
    <div class="pv">
      <img src="${URL.createObjectURL(f)}" style="transform:rotate(${pendingRotations[i]||0}deg);">
      <div class="rt" onclick="rotatePendingFile(${i})">${icon('rotate',11)}</div>
      <div class="rm" onclick="removePending(${i})">${icon('close',11)}</div>
    </div>`).join('');
}
function rotatePendingFile(i){
  pendingRotations[i] = ((pendingRotations[i]||0) + 90) % 360;
  renderPreview();
}
function removePending(i){
  pendingFiles.splice(i,1);
  pendingRotations.splice(i,1);
  renderPreview();
}
async function processUploadFile(file, rotationDeg){
  rotationDeg = ((rotationDeg||0) % 360 + 360) % 360;
  try{
    const bitmap = await createImageBitmap(file, {imageOrientation:'from-image'});
    const swap = rotationDeg===90 || rotationDeg===270;
    const MAX_FULL = 2000;
    let fw = bitmap.width, fh = bitmap.height;
    if(Math.max(fw,fh) > MAX_FULL){
      const scale = MAX_FULL/Math.max(fw,fh);
      fw = Math.round(fw*scale); fh = Math.round(fh*scale);
    }
    const outW = swap ? fh : fw, outH = swap ? fw : fh;
    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = outW; fullCanvas.height = outH;
    const fctx = fullCanvas.getContext('2d');
    fctx.translate(outW/2, outH/2);
    fctx.rotate(rotationDeg*Math.PI/180);
    fctx.drawImage(bitmap, -fw/2, -fh/2, fw, fh);
    const fullBlob = await new Promise(res=> fullCanvas.toBlob(res, 'image/jpeg', 0.88));

    const MAX_THUMB = 380;
    const tscale = MAX_THUMB/Math.max(outW, outH);
    const tw = Math.round(outW*tscale), th = Math.round(outH*tscale);
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = tw; thumbCanvas.height = th;
    thumbCanvas.getContext('2d').drawImage(fullCanvas, 0, 0, tw, th);
    const thumbBlob = await new Promise(res=> thumbCanvas.toBlob(res, 'image/jpeg', 0.75));

    if(bitmap.close) bitmap.close();
    return { blob: fullBlob || file, thumbBlob: thumbBlob || null };
  }catch(e){
    // 브라우저가 지원 안 하면 원본 그대로 사용 (회전 보정/썸네일만 생략)
    return { blob: file, thumbBlob: null };
  }
}
async function savePhotos(){
  if(pendingFiles.length===0){ toast('사진을 먼저 선택해주세요'); return; }
  const date = document.getElementById('uploadDate').value || todayStr();
  toast('사진을 처리하고 있어요...');
  try{
    const processed = await Promise.all(pendingFiles.map((f,i)=>processUploadFile(f, pendingRotations[i])));
    const records = processed.map(({blob, thumbBlob})=>({
      id: uid(), trialId: currentTrialId, date, blob, thumbBlob, createdAt: Date.now()
    }));
    await idbPutMany('photos', records);
    await touchTrialUpdatedAt(currentTrialId);
    toast(`사진 ${pendingFiles.length}장 저장됐어요`);
    go('detail', currentTrialId);
  }catch(e){
    showStorageError(e);
  }
}

/* ================= PDF 내보내기 (시교별) ================= */
/* ---- 순수 JS PDF 생성기 (외부 라이브러리 없이, 오프라인 지원) ---- */
function buildPdfBytes(pages){
  const enc = new TextEncoder();
  const chunks = [];
  let offset = 0;
  const objOffsets = {};
  function writeStr(s){ const b = enc.encode(s); chunks.push(b); offset += b.length; }
  function writeBytes(b){ chunks.push(b); offset += b.length; }
  function beginObj(num){ objOffsets[num] = offset; writeStr(`${num} 0 obj\n`); }
  function endObj(){ writeStr('endobj\n'); }

  const N = pages.length;
  const catalogNum = 1, pagesNum = 2;
  let nextNum = 3;
  const pageNums=[], imgNums=[], contentNums=[];
  for(let i=0;i<N;i++){ pageNums.push(nextNum++); imgNums.push(nextNum++); contentNums.push(nextNum++); }
  const totalObjs = nextNum - 1;

  writeStr('%PDF-1.4\n');
  beginObj(catalogNum); writeStr(`<< /Type /Catalog /Pages ${pagesNum} 0 R >>\n`); endObj();
  beginObj(pagesNum); writeStr(`<< /Type /Pages /Kids [${pageNums.map(n=>n+' 0 R').join(' ')}] /Count ${N} >>\n`); endObj();

  const PAGE_W = 595, PAGE_H = 842;
  for(let i=0;i<N;i++){
    const p = pages[i];
    beginObj(pageNums[i]);
    writeStr(`<< /Type /Page /Parent ${pagesNum} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /XObject << /Im0 ${imgNums[i]} 0 R >> >> /Contents ${contentNums[i]} 0 R >>\n`);
    endObj();
    beginObj(imgNums[i]);
    writeStr(`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);
    writeBytes(p.jpeg);
    writeStr('\nendstream\n');
    endObj();
    const content = `q\n${PAGE_W} 0 0 ${PAGE_H} 0 0 cm\n/Im0 Do\nQ`;
    beginObj(contentNums[i]);
    writeStr(`<< /Length ${content.length} >>\nstream\n${content}\nendstream\n`);
    endObj();
  }

  const xrefOffset = offset;
  writeStr(`xref\n0 ${totalObjs+1}\n`);
  writeStr('0000000000 65535 f \n');
  for(let n=1;n<=totalObjs;n++) writeStr(`${String(objOffsets[n]).padStart(10,'0')} 00000 n \n`);
  writeStr(`trailer\n<< /Size ${totalObjs+1} /Root ${catalogNum} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  const total = chunks.reduce((s,c)=>s+c.length,0);
  const result = new Uint8Array(total);
  let pos = 0;
  for(const c of chunks){ result.set(c, pos); pos += c.length; }
  return result;
}
function loadImageFromBlob(blob){
  return new Promise((resolve, reject)=>{
    const img = new Image();
    img.onload = ()=>resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
}
function drawImageContain(ctx, img, x, y, w, h){
  const ir = img.width/img.height, br = w/h;
  let dw=w, dh=h, dx=x, dy=y;
  if(ir > br){ dh = w/ir; dy = y + (h-dh)/2; }
  else { dw = h*ir; dx = x + (w-dw)/2; }
  ctx.fillStyle = '#f6f4ee'; ctx.fillRect(x,y,w,h);
  ctx.drawImage(img, dx, dy, dw, dh);
}
function wrapPdfText(ctx, text, maxWidth){
  const words = text.split('');
  let lines = [], cur = '';
  for(const ch of words){
    const test = cur + ch;
    if(ctx.measureText(test).width > maxWidth && cur){ lines.push(cur); cur = ch; }
    else cur = test;
  }
  if(cur) lines.push(cur);
  return lines;
}

async function exportTrialPdf(){
  const t = await idbGet('trials', currentTrialId);
  const c = await idbGet('crops', t.cropId);
  const photos = (await idbGetAllByIndex('photos','trialId',currentTrialId)).sort((a,b)=>a.date.localeCompare(b.date)||a.createdAt-b.createdAt);
  const notes = (await idbGetAllByIndex('notes','trialId',currentTrialId)).sort((a,b)=>a.date.localeCompare(b.date));

  toast('PDF 생성 중이에요, 잠시만요...');

  const infoLines = [];
  if(t.sowDate) infoLines.push(`파종일: ${t.sowDate}`);
  if(t.transplantDate) infoLines.push(`정식일: ${t.transplantDate}`);
  if(t.referenceVariety) infoLines.push(`대비종: ${t.referenceVariety}`);
  const addresses = t.fieldAddresses || (t.fieldAddress ? [t.fieldAddress] : []);
  if(addresses.length) infoLines.push(`밭주소: ${addresses.join(' / ')}`);

  let loadedPhotos = [];
  try{
    for(const p of photos) loadedPhotos.push({ img: await loadImageFromBlob(p.blob), date:p.date, isMarked:p.isMarked });
  }catch(e){ console.error(e); }

  const SCALE = 2;
  const PAGE_W = 595*SCALE, PAGE_H = 842*SCALE;
  const MARGIN = 36*SCALE, GAP = 16*SCALE, COLS = 2;
  const cellW = (PAGE_W - MARGIN*2 - GAP*(COLS-1))/COLS;
  const cellH = cellW;
  const capH = 20*SCALE;
  const rowH = cellH + capH + GAP;

  const pageCanvases = [];
  let photoIdx = 0, pageNum = 0;
  do{
    const canvas = document.createElement('canvas');
    canvas.width = PAGE_W; canvas.height = PAGE_H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,PAGE_W,PAGE_H);
    let y = MARGIN;
    if(pageNum===0){
      ctx.fillStyle = '#2c2620'; ctx.font = `bold ${26*SCALE}px sans-serif`;
      ctx.fillText(trialTitle(t), MARGIN, y + 24*SCALE);
      y += 38*SCALE;
      ctx.fillStyle = '#8a8275'; ctx.font = `${14*SCALE}px sans-serif`;
      ctx.fillText(`${c?c.name:''} · ${t.seg}`, MARGIN, y);
      y += 24*SCALE;
      if(infoLines.length){
        const boxH = infoLines.length*(21*SCALE) + 14*SCALE;
        ctx.fillStyle = '#f6f4ee'; ctx.fillRect(MARGIN, y, PAGE_W-MARGIN*2, boxH);
        ctx.strokeStyle = '#e2ddd0'; ctx.lineWidth = 1; ctx.strokeRect(MARGIN, y, PAGE_W-MARGIN*2, boxH);
        let iy = y + 19*SCALE;
        ctx.fillStyle = '#2c2620'; ctx.font = `${12.5*SCALE}px sans-serif`;
        infoLines.forEach(l=>{ ctx.fillText(l, MARGIN+14*SCALE, iy); iy += 21*SCALE; });
        y += boxH + 18*SCALE;
      }
      ctx.fillStyle = '#2c2620'; ctx.font = `bold ${15*SCALE}px sans-serif`;
      ctx.fillText(`촬영 사진 (${loadedPhotos.length}장)`, MARGIN, y);
      y += 16*SCALE;
    }
    const gridTop = y + GAP;
    const availH = PAGE_H - MARGIN - gridTop;
    const rowsThisPage = Math.max(1, Math.floor((availH+GAP)/rowH));
    for(let r=0; r<rowsThisPage && photoIdx<loadedPhotos.length; r++){
      for(let col=0; col<COLS && photoIdx<loadedPhotos.length; col++){
        const ph = loadedPhotos[photoIdx];
        const x = MARGIN + col*(cellW+GAP), yy = gridTop + r*rowH;
        drawImageContain(ctx, ph.img, x, yy, cellW, cellH);
        ctx.strokeStyle = '#e2ddd0'; ctx.lineWidth = 1; ctx.strokeRect(x,yy,cellW,cellH);
        ctx.fillStyle = '#8a8275'; ctx.font = `${10.5*SCALE}px sans-serif`; ctx.textAlign = 'center';
        ctx.fillText(ph.date + (ph.isMarked?' · 마킹':''), x+cellW/2, yy+cellH+15*SCALE);
        ctx.textAlign = 'left';
        photoIdx++;
      }
    }
    pageCanvases.push(canvas);
    pageNum++;
  } while(photoIdx < loadedPhotos.length);

  if(notes.length){
    let noteIdx = 0;
    while(noteIdx < notes.length){
      const canvas = document.createElement('canvas');
      canvas.width = PAGE_W; canvas.height = PAGE_H;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,PAGE_W,PAGE_H);
      let y = MARGIN + 18*SCALE;
      ctx.fillStyle = '#2c2620'; ctx.font = `bold ${17*SCALE}px sans-serif`;
      ctx.fillText('메모', MARGIN, y);
      y += 30*SCALE;
      const maxTextW = PAGE_W - MARGIN*2 - 90*SCALE;
      while(noteIdx < notes.length && y < PAGE_H - MARGIN){
        const n = notes[noteIdx];
        ctx.fillStyle = '#2c2620'; ctx.font = `bold ${12.5*SCALE}px sans-serif`;
        ctx.fillText(n.date, MARGIN, y);
        ctx.font = `${12.5*SCALE}px sans-serif`;
        const lines = wrapPdfText(ctx, n.text||'', maxTextW);
        lines.forEach((line,li)=>{ ctx.fillText(line, MARGIN + 82*SCALE, y + li*(18*SCALE)); });
        y += Math.max(1,lines.length)*(18*SCALE) + 12*SCALE;
        noteIdx++;
      }
      pageCanvases.push(canvas);
    }
  }

  const pages = [];
  for(const canvas of pageCanvases){
    const blob = await new Promise(res=> canvas.toBlob(res, 'image/jpeg', 0.86));
    const jpeg = new Uint8Array(await blob.arrayBuffer());
    pages.push({ jpeg, w: canvas.width, h: canvas.height });
  }

  try{
    const pdfBytes = buildPdfBytes(pages);
    const pdfBlob = new Blob([pdfBytes], {type:'application/pdf'});
    if(isNativeApp()){
      await nativeShareBlob(pdfBlob, `${trialTitle(t)}_리포트.pdf`, 'PDF 리포트');
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(pdfBlob);
    a.download = `${trialTitle(t)}_리포트.pdf`;
    a.click();
    toast('PDF 파일을 저장했어요');
  }catch(e){
    showStorageError(e);
  }
}

/* ================= 리포트 공유 ================= */
let reportPhotosCache = [];
let selectedReportIds = new Set();
let reportMode = 'individual';

async function renderReport(trialId){
  const t = await idbGet('trials', trialId);
  const c = await idbGet('crops', t.cropId);
  const photos = (await idbGetAllByIndex('photos','trialId',trialId)).sort((a,b)=>a.date.localeCompare(b.date) || a.createdAt-b.createdAt);
  reportPhotosCache = photos;
  window._reportMeta = {t, c};

  // 처음 진입 시 아무 사진도 선택돼있지 않은 상태로 시작 (전체선택 버튼으로 직접 고름)
  selectedReportIds = new Set();
  reportMode = 'individual';
  document.getElementById('modeIndividual').classList.add('active');
  document.getElementById('modeCollage').classList.remove('active');
  document.getElementById('reportPreviewCard').classList.add('hidden');

  renderReportPicker();
}
function renderReportPicker(){
  const grouped = {};
  reportPhotosCache.forEach(p=>{ (grouped[p.date]=grouped[p.date]||[]).push(p); });
  const dateKeys = Object.keys(grouped).sort((a,b)=>b.localeCompare(a));
  const picker = document.getElementById('reportPhotoPicker');
  if(dateKeys.length===0){
    picker.innerHTML = '<p class="empty">등록된 사진이 없어요.</p>';
  } else {
    picker.innerHTML = dateKeys.map(d=>`
      <div class="date-group">
        <div class="date-head">${d}</div>
        <div class="photo-grid">
          ${grouped[d].map(p=>`
            <div class="photo-thumb ${selectedReportIds.has(p.id)?'selected':''}" id="rpThumb-${p.id}" onclick="toggleReportPhoto('${p.id}')">
              <img loading="lazy" decoding="async" src="${getPhotoThumbUrl(p)}">
              <div class="chk">${icon('check',12)}</div>
              <div class="rp-preview-btn" onclick="event.stopPropagation(); previewReportPhoto('${p.id}')">${icon('search',12)}</div>
            </div>`).join('')}
        </div>
      </div>`).join('');
  }
  updateReportSelectionUI();
  if(reportMode==='collage') renderCollagePreview();
}
function previewReportPhoto(photoId){
  const p = reportPhotosCache.find(x=>x.id===photoId);
  if(!p) return;
  removeIfExists('reportPreviewOverlay');
  const overlay = document.createElement('div');
  overlay.className = 'report-preview-overlay'; overlay.id = 'reportPreviewOverlay';
  overlay.innerHTML = `
    <div class="report-preview-top"><span onclick="closeReportPhotoPreview()">${icon('close',20)}</span></div>
    <div class="report-preview-imgwrap"><img src="${getPhotoUrl(p)}"></div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e)=>{ if(e.target===overlay) closeReportPhotoPreview(); });
  attachReportPreviewSwipeDismiss(overlay);
}
function attachReportPreviewSwipeDismiss(overlay){
  const wrap = overlay.querySelector('.report-preview-imgwrap');
  let startY=0, dy=0, dragging=false;
  function apply(smooth){
    overlay.style.transition = smooth ? 'transform .22s ease, opacity .22s ease' : 'none';
    overlay.style.transform = `translateY(${dy}px)`;
    overlay.style.opacity = String(Math.max(0.25, 1 - Math.abs(dy)/400));
  }
  wrap.addEventListener('touchstart', (e)=>{
    if(e.touches.length!==1) return;
    dragging = true;
    startY = e.touches[0].clientY;
  }, {passive:true});
  wrap.addEventListener('touchmove', (e)=>{
    if(!dragging) return;
    dy = e.touches[0].clientY - startY;
    if(dy>0){ e.preventDefault(); apply(false); }
  }, {passive:false});
  wrap.addEventListener('touchend', ()=>{
    if(!dragging) return;
    dragging = false;
    if(dy > 110){
      overlay.style.transition = 'transform .22s ease, opacity .22s ease';
      overlay.style.transform = `translateY(${window.innerHeight}px)`;
      overlay.style.opacity = '0';
      setTimeout(()=> closeReportPhotoPreview(), 220);
    } else {
      dy = 0; apply(true);
    }
  });
}
function closeReportPhotoPreview(){ removeIfExists('reportPreviewOverlay'); }
function updateReportSelectionUI(){
  document.getElementById('reportSelCount').textContent = `${selectedReportIds.size}장 선택`;
  const allSelected = reportPhotosCache.length>0 && selectedReportIds.size===reportPhotosCache.length;
  document.getElementById('reportSelectAllBtn').textContent = allSelected ? '전체해제' : '전체선택';
}
function toggleReportPhoto(photoId){
  if(selectedReportIds.has(photoId)) selectedReportIds.delete(photoId);
  else selectedReportIds.add(photoId);
  const thumb = document.getElementById(`rpThumb-${photoId}`);
  if(thumb) thumb.classList.toggle('selected', selectedReportIds.has(photoId));
  updateReportSelectionUI();
  if(reportMode==='collage') renderCollagePreview();
}
function toggleSelectAllReportPhotos(){
  const allSelected = reportPhotosCache.length>0 && selectedReportIds.size===reportPhotosCache.length;
  if(allSelected){
    selectedReportIds.clear();
  } else {
    reportPhotosCache.forEach(p=> selectedReportIds.add(p.id));
  }
  reportPhotosCache.forEach(p=>{
    const thumb = document.getElementById(`rpThumb-${p.id}`);
    if(thumb) thumb.classList.toggle('selected', selectedReportIds.has(p.id));
  });
  updateReportSelectionUI();
  if(reportMode==='collage') renderCollagePreview();
}
function setReportMode(mode){
  reportMode = mode;
  document.getElementById('modeIndividual').classList.toggle('active', mode==='individual');
  document.getElementById('modeCollage').classList.toggle('active', mode==='collage');
  document.getElementById('reportPreviewCard').classList.toggle('hidden', mode!=='collage');
  if(mode==='collage') renderCollagePreview();
}
function getSelectedPhotos(){
  return reportPhotosCache.filter(p=>selectedReportIds.has(p.id)).sort((a,b)=>a.date.localeCompare(b.date));
}
function trialTitle(t){
  return [t.name, t.region, t.growerName].filter(Boolean).join(' ');
}
function buildDateBitsLine(t){
  const bits = [];
  if(t.sowDate) bits.push(`파종일 ${t.sowDate}`);
  if(t.transplantDate) bits.push(`정식일 ${t.transplantDate}`);
  return bits.join(' · ');
}
function renderCollagePreview(){
  const {t,c} = window._reportMeta;
  const sel = getSelectedPhotos();
  const dateBits = buildDateBitsLine(t);
  document.getElementById('reportPreviewCard').innerHTML = `
    <div class="report-head">${trialTitle(t)} 생육 리포트</div>
    <div class="report-sub">${c.name} · ${t.seg} · ${sel[0]?.date||'-'}~${sel[sel.length-1]?.date||'-'}</div>
    ${dateBits ? `<div class="report-sub">${dateBits}</div>` : ''}
    <div class="report-row" style="flex-wrap:wrap;">
      ${sel.map(p=>`<div class="cell" style="flex:0 0 30%;"><img src="${getPhotoThumbUrl(p)}"><div class="cap">${p.date}</div></div>`).join('') || '<p class="empty">선택된 사진이 없어요.</p>'}
    </div>`;
}
async function buildReportCanvas(){
  const {t,c} = window._reportMeta;
  const sel = getSelectedPhotos();
  const canvas = document.getElementById('reportCanvas');
  const n = Math.max(sel.length,1);
  const cols = Math.min(4, Math.ceil(Math.sqrt(n)));
  const rows = Math.ceil(n/cols);
  const dateBits = buildDateBitsLine(t);
  const S = 1.6;
  const W = Math.round(900*S), gap=Math.round(14*S), headerH= Math.round((dateBits ? 116 : 90)*S);
  const cellW = Math.floor((W - gap*(cols+1))/cols), cellH = cellW;
  canvas.width = W; canvas.height = headerH + rows*(cellH+Math.round(34*S)) + Math.round(20*S);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle='#f6f4ee'; ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#3c3226'; ctx.font=`bold ${Math.round(28*S)}px sans-serif`;
  ctx.fillText(`${trialTitle(t)} 생육 리포트`, Math.round(20*S), Math.round(38*S));
  ctx.fillStyle='#8a8275'; ctx.font=`${Math.round(16*S)}px sans-serif`;
  ctx.fillText(`${c.name} · ${t.seg}`, Math.round(20*S), Math.round(66*S));
  if(dateBits){ ctx.fillText(dateBits, Math.round(20*S), Math.round(92*S)); }

  for(let i=0;i<sel.length;i++){
    const p = sel[i];
    const row = Math.floor(i/cols), col = i%cols;
    const x = gap + col*(cellW+gap);
    const y = headerH + row*(cellH+Math.round(34*S));
    await new Promise(res=>{
      const img = new Image();
      img.onload=()=>{ ctx.drawImage(img, x, y, cellW, cellH); res(); };
      img.src = URL.createObjectURL(p.blob);
    });
    ctx.fillStyle='#8a8275'; ctx.font=`${Math.round(14*S)}px sans-serif`;
    ctx.fillText(p.date, x, y+cellH+Math.round(20*S));
  }
  return canvas;
}
async function downloadReport(){
  const sel = getSelectedPhotos();
  if(sel.length===0){ toast('공유할 사진을 선택해주세요'); return; }
  if(reportMode==='collage'){
    const canvas = await buildReportCanvas();
    canvas.toBlob(async blob=>{
      if(isNativeApp()){ await nativeShareBlob(blob, `${window._reportMeta.t.name}_리포트.png`, '생육 리포트'); return; }
      const a = document.createElement('a'); a.href=URL.createObjectURL(blob);
      a.download=`${window._reportMeta.t.name}_리포트.png`; a.click();
    });
  } else {
    if(isNativeApp()){
      for(let i=0;i<sel.length;i++){
        await nativeShareBlob(sel[i].blob, `${window._reportMeta.t.name}_${sel[i].date}_${i+1}.jpg`, '작황 사진');
      }
      toast(`사진 ${sel.length}장 저장했어요`);
      return;
    }
    sel.forEach((p,i)=>{
      setTimeout(()=>{
        const a = document.createElement('a'); a.href=URL.createObjectURL(p.blob);
        a.download=`${window._reportMeta.t.name}_${p.date}_${i+1}.jpg`; a.click();
      }, i*150);
    });
  }
  toast(`이미지 ${sel.length}장 저장했어요`);
}
async function shareReport(){
  const sel = getSelectedPhotos();
  if(sel.length===0){ toast('공유할 사진을 선택해주세요'); return; }
  if(reportMode==='collage'){
    const canvas = await buildReportCanvas();
    canvas.toBlob(async blob=>{
      if(isNativeApp()){ await nativeShareBlob(blob, 'report.png', '생육 리포트'); return; }
      const file = new File([blob], 'report.png', {type:'image/png'});
      if(navigator.share && navigator.canShare && navigator.canShare({files:[file]})){
        try{ await navigator.share({files:[file], title:'생육 리포트'}); }catch(e){}
      } else {
        toast('이 브라우저는 공유가 지원되지 않아요. 이미지 저장 후 공유해주세요.');
      }
    });
  } else {
    if(isNativeApp()){
      for(let i=0;i<sel.length;i++){
        await nativeShareBlob(sel[i].blob, `${sel[i].date}_${i+1}.jpg`, '작황 사진');
      }
      return;
    }
    const files = sel.map((p,i)=> new File([p.blob], `${p.date}_${i+1}.jpg`, {type:p.blob.type||'image/jpeg'}));
    if(navigator.share && navigator.canShare && navigator.canShare({files})){
      try{ await navigator.share({files, title:'작황 사진'}); }catch(e){}
    } else {
      toast('이 브라우저는 여러 장 동시 공유가 지원되지 않아요. 이미지 저장 후 공유해주세요.');
    }
  }
}

