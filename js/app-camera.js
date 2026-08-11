/* ================= 연속 촬영 (앱 내 카메라) ================= */
let cameraStream = null;
async function startContinuousCamera(){
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    document.getElementById('cameraInput').click();
    return;
  }
  if(cameraStream){ cameraStream.getTracks().forEach(t=>t.stop()); cameraStream = null; } // 혹시 남아있던 이전 스트림 정리
  removeIfExists('cameraOverlay');
  const overlay = document.createElement('div');
  overlay.className = 'camera-overlay'; overlay.id = 'cameraOverlay';
  overlay.innerHTML = `
    <div class="mark-topbar">
      <span id="cameraShotCount">${pendingFiles.length}장 촬영됨</span>
      <span>연속 촬영</span>
      <span class="link" onclick="stopContinuousCamera()">완료</span>
    </div>
    <div class="camera-preview-wrap" id="cameraPreviewWrap">
      <video id="cameraVideo" autoplay playsinline muted></video>
      <div class="camera-hint">버튼을 눌러 계속 촬영하세요</div>
    </div>
    <div class="camera-filmstrip" id="cameraFilmstrip"></div>
    <div class="camera-shutter-row"><button class="camera-shutter-btn" onclick="captureCameraShot()"></button></div>`;
  document.body.appendChild(overlay);
  renderCameraFilmstrip();
  try{
    cameraStream = await navigator.mediaDevices.getUserMedia({
      // 가로/세로를 둘 다 못박으면(특히 정사각형 비율) 카메라가 센서 일부만 잘라 쓰거나
      // 다른 렌즈(망원 등)를 고를 수 있어 실제 카메라 앱보다 확대돼 보이는 원인이 됨.
      // width만 제안하고 height/비율은 카메라가 자기 기본값(광각 풀 화각)을 쓰도록 비워둠.
      video: { facingMode:'environment', width:{ideal:1920} },
      audio: false
    });
    const video = document.getElementById('cameraVideo');
    if(video) video.srcObject = cameraStream;
  }catch(e){
    stopContinuousCamera();
    toast('연속 촬영을 시작할 수 없어요. 기본 카메라로 촬영할게요.');
    document.getElementById('cameraInput').click();
  }
}
function captureCameraShot(){
  const video = document.getElementById('cameraVideo');
  if(!video || !video.videoWidth) return;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  canvas.toBlob((blob)=>{
    if(!blob) return;
    pendingFiles.push(new File([blob], `capture_${Date.now()}.jpg`, {type:'image/jpeg'}));
    pendingRotations.push(0);
    updateCameraShotCount();
    renderCameraFilmstrip();
    if(appSettings.feedback) vibrate(15);
    flashCameraShutter();
  }, 'image/jpeg', 0.9);
}
function flashCameraShutter(){
  const wrap = document.getElementById('cameraPreviewWrap');
  if(!wrap) return;
  wrap.classList.add('flash');
  setTimeout(()=> wrap.classList.remove('flash'), 260);
}
function updateCameraShotCount(){
  const el = document.getElementById('cameraShotCount');
  if(el) el.textContent = `${pendingFiles.length}장 촬영됨`;
}
function renderCameraFilmstrip(){
  const strip = document.getElementById('cameraFilmstrip');
  if(!strip) return;
  strip.innerHTML = pendingFiles.map((f,i)=>`
    <div class="cam-film-thumb">
      <img src="${URL.createObjectURL(f)}" style="transform:rotate(${pendingRotations[i]||0}deg);">
      <div class="rt" onclick="rotatePendingFile(${i})">${icon('rotate',9)}</div>
      <div class="rm" onclick="removePending(${i})">${icon('close',10)}</div>
    </div>`).join('');
  strip.scrollLeft = strip.scrollWidth;
}
function stopContinuousCamera(){
  if(cameraStream){ cameraStream.getTracks().forEach(t=>t.stop()); cameraStream = null; }
  removeIfExists('cameraOverlay');
  renderPreview();
}
