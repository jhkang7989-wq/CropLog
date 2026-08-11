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
      video: { facingMode:'environment', width:{ideal:1920} },
      audio: false
    });
    // 폰마다 후면 카메라가 여러 개(메인/광각/망원)일 수 있는데, facingMode만으로는
    // 브라우저가 어떤 렌즈를 고를지 보장이 안 됨(기종에 따라 초광각이 잡히기도 함).
    // 권한을 받아 라벨이 채워진 뒤 목록에서 "메인" 렌즈로 추정되는 걸 다시 지정해봄.
    const mainDeviceId = await pickMainRearCameraId();
    if(mainDeviceId){
      cameraStream.getTracks().forEach(t=>t.stop());
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId:{exact:mainDeviceId}, width:{ideal:1920} },
        audio: false
      });
    }
    const video = document.getElementById('cameraVideo');
    if(video) video.srcObject = cameraStream;
  }catch(e){
    stopContinuousCamera();
    toast('연속 촬영을 시작할 수 없어요. 기본 카메라로 촬영할게요.');
    document.getElementById('cameraInput').click();
  }
}
async function pickMainRearCameraId(){
  try{
    const devices = await navigator.mediaDevices.enumerateDevices();
    const backCams = devices.filter(d=> d.kind==='videoinput' && d.label && !/front|user|selfie|facetime/i.test(d.label));
    if(backCams.length<2) return null; // 후면 카메라가 1개뿐이면 고를 필요 없음
    const notWideOrTele = /ultra|telephoto|periscope|0\.5x|2x|3x|5x|10x/i;
    const main = backCams.find(d=> !notWideOrTele.test(d.label));
    return main ? main.deviceId : null;
  }catch(e){
    return null;
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
