// ============================================================
//   NoCord-P2P -- audio.js
//
//   Audio pipeline via SepiaFW.webAudio.Processor:
//
//   Microphone
//     -> SepiaFW.webAudio.Processor
//           -> speex-resample-switch  (resampling + RMS level)
//                -> buffer-output-switch  (writes output[0])
//                       -> destinationNode -> PeerJS stream
//
//   Sink selection (speaker output) runs independently of SEPIA
//   via HTMLAudioElement.setSinkId() on remote streams.
//
//   Lifecycle:
//     First callPeer()   -> buildProcessor() + start()
//     Further callPeer() -> reuse existing stream
//     Last hangup        -> stop() + release() via onaudioend
//     hangupAll()        -> immediate release
// ============================================================

import { state, resetAudioSession } from './state.js';
import { toast, restoreElementState, isSidebarPanelOpen }  from './ui.js';

let testAreaMicBar = document.getElementById('mic-level-fill');
let chatAreaMicBar = document.getElementById('chat-mic-level-fill');
let chatAreaMicBox = document.getElementById('chat-mic-level-bar');

// -- Setup audio module
export async function setupAudioModule() {
  await enumAudioDevices();
  onConstraintChange();       //init. once
  updateConstraintElements(); //clean-up UI
}

export function debugAudio() {
	toast("MIC DETAILS:\n" + JSON.stringify(state.audioSession, null, 2), "debug");
}

// -- SEPIA Web Audio global audio constraints -----------------
//
// Update SEPIA default constraints from UI checkboxes.
// Takes effect on the next processor build (next call or mic test).
export function onConstraintChange() {
  // NOTE: Only constraints actually supported by the browser are applied
  SepiaFW.webAudio.setDefaultAudioConstraints({
    echoCancellation: document.getElementById('chk-ec')?.checked,
    noiseSuppression: document.getElementById('chk-ns')?.checked,
    voiceIsolation: document.getElementById('chk-vi')?.checked,
    autoGainControl: document.getElementById('chk-agc')?.checked,
    channelCount: 1
  });
}
// Update elements to remove unsupported.
function updateConstraintElements() {
  var suppCon = Object.keys(SepiaFW.webAudio.getSupportedAudioConstraints()) || [];
  [
    {name: 'echoCancellation', id: 'chk-ec'},
    {name: 'noiseSuppression', id: 'chk-ns'},
    {name: 'voiceIsolation', id: 'chk-vi'},
    {name: 'autoGainControl', id: 'chk-agc'}
  ].forEach((con) => {
    if (!suppCon.includes(con.name)){
      let ele = document.getElementById(con.id);
      ele.disabled = true;
      ele.parentNode.style.display = "none";
    }
  });
}
function getActiveAudioConstraints(tryExact) {
  var constraints = {};
  document.getElementById("panel-audio").querySelectorAll(".audio-constraint")
  .forEach((ele) => {
    if (!ele.disabled){
      if (tryExact) constraints[ele.dataset.name] = {exact: ele.checked};
      else constraints[ele.dataset.name] = ele.checked;
    }
  });
  return constraints;
}

// -- State handling of audio processor -----------------------
function processorOnInit(processor){
  state.sepiaProcessor = processor;
  state.sepiaReady     = true;
  state.localStream    = processor.destinationNode.stream;
  enableMicControls();
  updateLevelBar(0);
}
function processorOnInitError(err){
  toast('Audio init error: ' + (err?.message || err?.name || err[0] || 'unknown'), 'error');
}
function processorOnAudioStart(){
  state.sepiaPaused = false;
  updateLevelBar(0);
  setPauseMicButtonUI(false);
}
function processorOnAudioEnd(){
  updateLevelBar(0);
  // Reset pause button regardless of why audio ended
  setPauseMicButtonUI(false);
}
function processorOnRelease(){
  state.sepiaProcessor = null;
  state.sepiaReady     = false;
  state.sepiaPaused    = false;
  state.localStream    = null;
  // Reset all mic buttons to initial state
  resetMicButtonsUI();
}
function processorOnProcessError(err){
  toast('Audio error: ' + (err?.message || err?.name || err[0] || 'unknown'), 'error');
}

// -- Mic button UI states
function resetMicButtonsUI(){
  setMuteMicButtonUI(false);
  setPauseMicButtonUI(false);
  document.getElementById('btn-test-mic').disabled  = false;
  document.getElementById('btn-stop-mic').disabled  = true;
  document.getElementById('btn-mute-mic').disabled  = true;
  document.getElementById('btn-pause-mic').disabled = true;
  updateLevelBar(0);
  chatAreaMicBox.classList.remove('active', 'issues', 'critical');
  stopMicHealthTracker();
}
function enableMicControls(){
  document.getElementById('btn-mute-mic').disabled  = false;
  document.getElementById('btn-pause-mic').disabled = false;
  chatAreaMicBox.classList.add('active');
  startMicHealthTracker();
}
function indicateMicOk(){
  chatAreaMicBox.classList.remove('issues', 'critical');
}
function indicateMicIssues(){
  chatAreaMicBox.classList.remove('critical');
  chatAreaMicBox.classList.add('issues');
}
function indicateMicCritical(){
  chatAreaMicBox.classList.remove('issues');
  chatAreaMicBox.classList.add('critical');
}
function setMuteMicButtonUI(muted){
  const btn = document.getElementById('btn-mute-mic');
  btn.innerHTML = muted ?
    '<span class="material-icons font-btn" translate="no">mic</span>' //Unmute
    : '<span class="material-icons font-btn" translate="no">mic_off</span>'; //Mute
  btn.classList.toggle('btn-danger', muted);
  btn.classList.toggle('btn-ghost', !muted);
  chatAreaMicBox.classList.toggle('muted', muted);
}
function setPauseMicButtonUI(paused){
  if (paused == undefined) paused = state.sepiaPaused;
  const btn = document.getElementById('btn-pause-mic');
  btn.innerHTML = paused ?
    '<span class="material-icons font-btn" translate="no">play_arrow</span>' //Resume
    : '<span class="material-icons font-btn" translate="no">pause</span>' //Pause
  btn.classList.toggle('btn-danger', paused);
  btn.classList.toggle('btn-ghost', !paused);
  chatAreaMicBox.classList.toggle('paused', paused);
}

// -- Level bar (RMS from SEPIA callback) ---------------------
function updateLevelBar(rms) {
  if (!state.audioSession.maxRms || rms > state.audioSession.maxRms){
    state.audioSession.maxRms = rms;
    if (rms >= 1 && !state.audioSession.rmsWarningSent){
      state.audioSession.rmsWarningSent = true;
      console.warn("Audio clipping. RMS >= 1");
      toast("Your microphone seems to be very loud! " 
        + "You might experience clipping. Consider a smaller gain.", "error");
    }
  }
  if (isSidebarPanelOpen("panel-audio")){
    testAreaMicBar.style.width = Math.min(100, rms * 300) + '%';
  }
  chatAreaMicBar.style.height = rmsToDecibelPercent(rms) + '%';
}
function rmsToDecibelPercent(rms) {
  //RMS to Decibel (dBFS) + prevent log10(0)
  const db = 20 * Math.log10(Math.max(rms, 0.0001));
  //range
  const minDb = -35;
  const maxDb = 0;
  //rescale
  let percent = ((db - minDb) / (maxDb - minDb)) * 100;
  return Math.max(0, Math.min(100, percent));
}

// -- Output buffer health tracking ---------------------------
let micHealthTracker = {
  interval: null,
  intervalLength: 5000,
  intervalHealth: null
};
function checkOutputBufferHealth(bufferHealth) {
  if (bufferHealth.status){
    //NOTE: this should be fully init. by 'buffer-output-switch' below
    state.audioSession.outputBufferHealth[bufferHealth.status]++;
    if (micHealthTracker.interval) micHealthTracker.intervalHealth[bufferHealth.status]++;
    if (bufferHealth.status !== 'ok') {
      console.warn('[BufferOutput] Health:', 
        bufferHealth.status, '| avg:', bufferHealth.avgFill,
        'min:', bufferHealth.minFill, 'max:', bufferHealth.maxFill,
        '| underruns:', bufferHealth.underruns, 'overruns:', bufferHealth.overruns);
    }/* else {
      console.log('[BufferOutput] OK | avg fill:', bufferHealth.avgFill);
    }*/
  }
}
function startMicHealthTracker(){
  clearInterval(micHealthTracker.interval);
  micHealthTracker.intervalHealth = {ok: 0, low: 0, high: 0, underrun: 0, overrun: 0};
  micHealthTracker.interval = setInterval(() => {
    let obh = state.audioSession?.outputBufferHealth;
    let ih = micHealthTracker.intervalHealth;
    if (!obh?.released && ih?.ok != undefined){
      //console.log("Mic health:", ih); //DEBUG
      if (ih.underrun > 0 || ih.overrun > 0){
        indicateMicCritical();
      }else if (ih.high || ih.low){
        indicateMicIssues();
      }else{
        indicateMicOk();
      }
      //const sum = Object.values(ih).reduce((a, b) => a + b, 0);
      //if (obh.ok/sum > 0.95){}
      //reset
      micHealthTracker.intervalHealth = {ok: 0, low: 0, high: 0, underrun: 0, overrun: 0};
    }
  }, micHealthTracker.intervalLength);
}
function stopMicHealthTracker(){
  clearInterval(micHealthTracker.interval);
  micHealthTracker.interval = null;
  micHealthTracker.intervalHealth = null;
}
//-- Jitter (experimental)
function initJitterData(){
  state.audioSession.jitter = {lastTs: 0, lastAvg: 0, max: 0, min: 1000, sum: 0, dataPoints: 0};
}
function cleanUpJitterData(){
  state.audioSession.jitter.sum = undefined;
  state.audioSession.jitter.dataPoints = undefined;
  state.audioSession.jitter.lastTs = undefined;
}
function recordJitterData(data){
  //jitter data - already binned
  if (data.avgJitter == undefined) return;
  //state.audioSession.jitter.sum += data.avgJitter;
  //state.audioSession.jitter.dataPoints++;
  if (data.maxJitter > state.audioSession.jitter.max) state.audioSession.jitter.max = data.maxJitter;
  if (data.minJitter < state.audioSession.jitter.min) state.audioSession.jitter.min = data.minJitter;
  state.audioSession.jitter.lastAvg = data.avgJitter;
}
function calculateAndRecordJitterData(){
  //calculate jitter manually every frame
  const now = performance.now();
  if (state.audioSession.jitter.lastTs > 0){
    const delta = now - state.audioSession.jitter.lastTs;
    const jitter = Math.abs(delta - state.audioSession.frameTimeMs);
    state.audioSession.jitter.sum += jitter;
    state.audioSession.jitter.dataPoints++;
  }
  state.audioSession.jitter.lastTs = now;
}
function evalJitterData(){
  //console.log("jitter max:", state.audioSession.jitter.max);   //DEBUG
  let avg = (state.audioSession.jitter.sum / state.audioSession.jitter.dataPoints);
  state.audioSession.jitter.lastAvg = avg;
  if (!state.audioSession.jitter.max){
    state.audioSession.jitter.max = avg;
    state.audioSession.jitter.min = avg;
  }else{
    if (avg > state.audioSession.jitter.max) state.audioSession.jitter.max = avg;
    else if (avg < state.audioSession.jitter.min) state.audioSession.jitter.min = avg;
  }
  state.audioSession.jitter.sum = 0;
  state.audioSession.jitter.dataPoints = 0;
  //NOTE: we keep lastTs until final
}

// ============================================================
//   DEVICE ENUMERATION
// ============================================================

// Enumerate microphone and speaker devices and populate UI selectors.
// Includes permission request.
export async function enumAudioDevices() {
  try {
    const {input, output} = await SepiaFW.webAudio.getAudioDevices();
    const micSelElementId = 'mic-select';
    appendAudioDeviceOptionsAndRestorePref(micSelElementId, input);
    const sinkSelElementId = 'sink-select';
    appendAudioDeviceOptionsAndRestorePref(sinkSelElementId, output);
  } catch (e) {
    console.error("enumAudioDevices - Error:", e);
    toast('Failed to load audio devices. Error: ' 
      + (e.message || e.name || e), 'error');
  }
}
function appendAudioDeviceOptionsAndRestorePref(selElementId, devices){
  const sel = document.getElementById(selElementId);
  if (Object.keys(devices)){
    //append device options
    sel.innerHTML = '';
    let devicesN = 0;
    Object.keys(devices).forEach((label, i) => {
      if (label) label = label.trim();
      const opt = document.createElement('option');
      const deviceId = devices[label];
      opt.value = deviceId || "";
      opt.textContent = label || ('Device ' + (i + 1));
      if (opt.value == "default") opt.selected = true;
      sel.appendChild(opt);
      if (opt.value) devicesN++;
    });
    if (devicesN == 0) sel.innerHTML = '<option value="">Default</option>';
    restoreElementState({id: selElementId, type: 'select'});
  }else{
    sel.innerHTML = '<option value="">No device found</option>';
  }
}

// Read the currently selected sink ID from the UI.
export function getSelectedSinkId() {
  return document.getElementById('sink-select')?.value ?? '';
}

// Apply the current sink selection to all active remote audio elements
// and the test player if visible.
export async function applyCurrentSinkToAll() {
  const sinkId = getSelectedSinkId();
  if (typeof HTMLAudioElement.prototype.setSinkId !== 'function') return;

  const elements = [
    ...Object.values(state.connections).filter(c => c.audio).map(c => c.audio),
  ];
  // Include test player if it has a source
  const testPlayer = document.getElementById('mic-test-player');
  if (testPlayer?.src) elements.push(testPlayer);

  const promises = elements.map(el =>
    el.setSinkId(sinkId).catch(e => console.warn('[Audio] setSinkId failed:', e))
  );
  await Promise.all(promises);
  console.log('[Audio] Sink applied to ' + promises.length + ' element(s):', sinkId || 'default');
  state.audioSession.outputDevice = sinkId;
}

// Wrapper for window.onSinkChange (inline onchange in HTML)
export async function onSinkChange() {
  await applyCurrentSinkToAll();
}

// ============================================================
//   SEPIA WEB AUDIO PROCESSOR
// ============================================================
//protect against multiple calls
let _buildingProcessor = null;
async function buildProcessor(options, eventCallbacks) {
  if (_buildingProcessor) {
    console.log('[SEPIA] processor already being built, waiting...');
    return _buildingProcessor;
  }else{
    _buildingProcessor = new Promise((resolve, reject) => {
      _buildProcessor(options, eventCallbacks)
        .then((res) => {
          _buildingProcessor = null;
          resolve(res);
        })
        .catch((err) => {
          _buildingProcessor = null;
          reject(err);
        });
    });
    return _buildingProcessor;
  }
}
// Pipeline:
//   Microphone
//     -> speex-resample-switch  (index 1: resampling + RMS)
//          -> buffer-output-switch  (index 2: writes resampled
//               samples into output[0] -> destinationNode -> PeerJS)
async function _buildProcessor(options, eventCallbacks) {
  var deviceId = options?.deviceId;
  var targetSampleRate = options?.targetSampleRate;
  var micGain = +(options?.microphoneGain || 1.0);
  //TODO: test option:
  var audioBufferSetttings = +(document.getElementById('audio-buffer-settings')?.value || "0");
  var pipeline = audioBufferSetttings? 2 : 1;
  var bufferSize = 512 * audioBufferSetttings;
  var estmatedJitterMs = 6 * audioBufferSetttings;

  _releaseProcessor();
  resetAudioSession();
  state.audioSession.targetSampleRate = targetSampleRate;

  //TODO: this can lead to overconstraint errors unfortunately
  //var exactConstraints = getActiveAudioConstraints(true);
  //exactConstraints.deviceId = {exact: deviceId};
  var exactConstraints = null;

  return new Promise((resolve, reject) => {
    const modules = [];

    // -- Basic version: only RMS and gain
    if (pipeline == 1) {
      //Volume-processor -> destinationNode -> PeerJS
      const volumeProc = {
        name: 'volume-processor',
        settings: {
          onmessage: (data) => {
            if (data.moduleState == 1){
              console.log("Volume module info:", data.moduleInfo);
              state.audioSession.sourceSamplerate = data.moduleInfo?.sourceSamplerate;
              state.audioSession.gain = data.moduleInfo?.gain;
              state.audioSession.frameTimeMs = data.moduleInfo?.frameTimeMs;
              initJitterData();
              return;
            }else if (data.moduleState == 9){
              cleanUpJitterData();
            }
            if (data.rms !== undefined){
              updateLevelBar(data.rms);
              //eval jitter
              calculateAndRecordJitterData();
              evalJitterData(true);
            }else if (data.isRef){
              //jitter via reference frames
              calculateAndRecordJitterData();
            }
          },
          options: {
            processorOptions: {
              gain: micGain,
              fps: 30,  //update interval for volume calc.
              calculateDbVolume: false,
              sendReferenceFrame: true  //for jitter measurement
            }
          }
        }
      }
      modules.push(volumeProc);
    
    // -- Complex version: only RMS and gain
    } else if (pipeline == 2) {
      //Module 1: speex-resample-switch ----------------------
      const resampler = {
        name: 'speex-resample-switch',
        settings: {
          sendToModules: [],    // filled below with index 2
          onmessage: (data) => {
            if (data.moduleState == 1){
              console.log("Resampler module info:", data.moduleInfo);
              state.audioSession.sourceSamplerate = data.moduleInfo?.sourceSamplerate;
              state.audioSession.resamplingMode = data.moduleInfo?.resamplingMode;
              state.audioSession.resamplerBufferSize = data.moduleInfo?.emitterBufferSize;
              state.audioSession.resampleQuality = state.audioSession.resamplingMode? 
                data.moduleInfo?.resampleQuality : 0;
              state.audioSession.gain = data.moduleInfo?.gain;
            }
            if (data.rms !== undefined && !data.isLast){
              updateLevelBar(data.rms);
            }
          },
          options: {
            processorOptions: {
              targetSampleRate:   targetSampleRate,
              bufferSize:         bufferSize,
              resampleQuality:    7,      // 1 (fast) -- 10 (best quality)
              calculateRmsVolume: true,   // provides data.rms in callback
              gain:               micGain,
              passThroughMode:    0,      // no pass-through needed
            }
          }
        }
      };
      modules.push(resampler);

      // Module 2: buffer-output-switch -----------------------
      // Receives resampled samples from the resampler via postMessage
      // and writes them into output[0] -> destinationNode -> PeerJS
      const bufferOutput = {
        name: 'buffer-output-switch',
        settings: {
          onmessage: (data) => {
            if (data.moduleState == 1){
              console.log("Buffer-switch module info:", data.moduleInfo);
              state.audioSession.outputBufferSize = data.moduleInfo?.ringSize;
              state.audioSession.prebufferThreshold = data.moduleInfo?.prebufferThreshold;
              state.audioSession.expectedLatencyMs = data.moduleInfo?.expectedLatencyMs;
              state.audioSession.outputBufferHealth = {ok: 0, low: 0, high: 0, underrun: 0, overrun: 0};
              initJitterData();
            }else if (data.moduleState == 9){
              cleanUpJitterData();
            }
            if (data.bufferHealth) {
              checkOutputBufferHealth(data.bufferHealth);
              recordJitterData(data.bufferHealth);
            }else if (data.moduleEvent){
              console.log("Buffer-switch module event - prebuffering:", data.prebuffering,
                "- data:", data);   //DEBUG
            }
          },
          options: {
            processorOptions: {
              inputBufferSize: bufferSize,
              channelCount: 1,
              healthReportInterval: 200,  //every N process steps
              //prebufferThreshold: 256,
              jitterMs: estmatedJitterMs, //main thread to audio thread
              disableJitterMeasurement: false,
              skipPrebufferStateEvents: false
            }
          }
        }
      };
      modules.push(bufferOutput);

      // Forward resampler output to buffer-output-switch (module 2)
      resampler.settings.sendToModules.push(2);
    }

    const processor = new SepiaFW.webAudio.Processor(
      {
        onaudiostart: () => {
          console.log('[SEPIA] started');
          processorOnAudioStart();
          if (eventCallbacks?.onaudiostart) eventCallbacks.onaudiostart();
        },
        onaudioend: () => {
          console.log('[SEPIA] ended');
          processorOnAudioEnd();
          if (eventCallbacks?.onaudioend) eventCallbacks.onaudioend();
          // Only release when explicitly tearing down -- not on pause stop()
          if (processor._releasing) processor.release();
        },
        onrelease: () => {
          console.log('[SEPIA] released');
          state.audioProcessorOpen--;
          state.audioSession.released = true;
          processorOnRelease();
          if (eventCallbacks?.onrelease) eventCallbacks.onrelease();
        },
        onerror: (err) => {
          console.error('[SEPIA] processor error', err);
          state.audioSession.processErrors++;
          processorOnProcessError(err);
          if (eventCallbacks?.onerror) eventCallbacks.onerror(err);
          processor.stop();
        },
        modules: modules,
        targetSampleRate: targetSampleRate,
        startSuspended:  true,
        micAudioConstraints: exactConstraints || {
          deviceId: deviceId
        },
      },
      (info) => {
        // Init successful -- processor.destinationNode is now available
        console.log('[SEPIA] ready - info:', info);
        state.audioProcessorOpen++;
        state.audioSession.inputDevice = info.sourceInfo.settings.deviceId;
        state.audioSession.channelCount = info.sourceInfo.settings.channelCount;
        state.audioSession.activeConstraints = Object.entries(info.sourceInfo.settings)
          .filter(([k, v]) => v === true).map(([k]) => k);
        processorOnInit(processor);
        if (eventCallbacks?.onInit) eventCallbacks.onInit(info);
        resolve({
          stream: processor.destinationNode.stream,
          info: info
        });
      },
      (err) => {
        console.error('[SEPIA] init error:', err);
        state.audioSession.initError = true;
        processorOnInitError(err);
        if (eventCallbacks?.onInitError) eventCallbacks.onInitError(err);
        reject(err);
      }
    );
  });
}

// ============================================================
//   PUBLIC LIFECYCLE FUNCTIONS
// ============================================================

// Start mic test without an active call.
export async function testMic() {
  // Already running (active call) -- just update UI buttons
  if (state.sepiaReady) {
    document.getElementById('btn-test-mic').disabled = true;
    document.getElementById('btn-stop-mic').disabled = false;
    return;
  }
  const deviceId         = document.getElementById('mic-select').value;
  const targetSampleRate = parseInt(document.getElementById('sample-rate-select').value) || null;
  const microphoneGain = +document.getElementById('mic-custom-gain').value || 1.0;
  document.getElementById('btn-test-mic').disabled = true;
  document.getElementById('btn-stop-mic').disabled = false;
  var recCtrl;
  try {
    //processor
    const {stream} = await buildProcessor({
      deviceId,
      targetSampleRate,
      microphoneGain
    }, {
      onaudioend: function(){
        /*if (state.sepiaProcessor?.isProcessing()){
          state.sepiaProcessor.stop();
        }
        recCtrl?.stop();*/
      },
      onrelease: function(){
        recCtrl?.stop();
      },
      onerror: function(err){
        console.error("Mic test - processor error:", err);
      }
    });
    state.sepiaProcessor.start();
    recCtrl = await startTestRecorder(stream);
  } catch (err) {
    console.error('Mic test failed:', err);
    toast('Mic test failed: ' + (err.message || err.name || err), 'error');
    document.getElementById('btn-test-mic').disabled = false;
    document.getElementById('btn-stop-mic').disabled = true;
  }
}
async function startTestRecorder(stream){
  try {
    //recorder
    const chunks = [];
    var recLimit = 15000;
    var recCtrl = await SepiaFW.webAudio.createAudioRecorder(stream, state.sepiaProcessor.sourceInfo, {
      showDebugInfo: true,
      recordLimitMs: recLimit,
      onstart: function(){
        toast('Mic test - recorder started (limit: ' + Math.round(recLimit/1000) + 's)');
      },
      onstop: function(){
        toast('Mic test - recorder stopped');
        state.sepiaProcessor?.release();
        playTestRecording(chunks);
      },
      ondataavailable: function(e){
        if (e.data.size > 0) chunks.push(e.data);
      },
      onerror: function(err){
        console.error("Mic test - recorder error:", err);
        toast('Mic test - recorder error: ' + (err?.message || err?.name || err), 'error');
      }
    });
    recCtrl?.start();
    return recCtrl;
  } catch (err) {
    console.error('Mic test failed - recorder error:', err);
    toast('Mic test failed - recorder error: ' + (err.message || err.name || err), 'error');
    state.sepiaProcessor.release();
  }
}

function playTestRecording(chunks) {
  if (!chunks.length) return;
  try {
    // Revoke previous object URL to free memory before creating a new one
    clearTestRecording();
    const blob   = new Blob(chunks, { type: 'audio/webm' });
    const url    = URL.createObjectURL(blob);
    const player = document.getElementById('mic-test-player');
    player._objectUrl    = url; // store ref for later revocation
    player.src           = url;
    player.style.display = 'block';
    document.getElementById('btn-clear-recording').style.removeProperty("display");
    // Apply selected sink if supported
    const sinkId = getSelectedSinkId();
    if (sinkId && typeof player.setSinkId === 'function') {
      player.setSinkId(sinkId)
      .then(() => {
        state.audioSession.outputDevice = sinkId;
      })
      .catch(e =>
        console.warn('[Audio] test player setSinkId failed:', e)
      );
    }
  } catch (err) {
    console.error('Mic test - playback error:', err);
    toast('Mic test - playback error: ' + (err?.message || err?.name || err), 'error');
  }
}

export function clearTestRecording() {
  const player = document.getElementById('mic-test-player');
  if (player._objectUrl) {
    URL.revokeObjectURL(player._objectUrl);
    player._objectUrl = null;
  }
  player.pause();
  player.src           = '';
  player.style.display = 'none';
  document.getElementById('btn-clear-recording').style.display = 'none';
}
export function stopMic() {
  if (state.activeCallCount === 0) _releaseProcessor();
}

// Mute: disable the local track -- sends silence, processor keeps running.
// UI is updated via onaudiostart/onaudioend/onrelease events.
export function muteToggle() {
  //get the source stream
  if (!state.sepiaProcessor?.source?.mediaStream) return;
  const track = state.sepiaProcessor.source.mediaStream.getAudioTracks().at(0);
  //this is the destination stream:
  //if (!state.localStream) return;
  //const track = state.localStream.getAudioTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  const muted = !track.enabled;
  console.log('[Audio] Mute:', muted);
  setMuteMicButtonUI(muted);
  if (muted) toast("Microphone muted");
  else toast("Microphone unmuted");
}

// Pause: stop the SEPIA processor -- no CPU, no data sent.
// Resumes with processor.start() without needing a full rebuild.
// UI is updated reactively via onaudiostart / onaudioend.
export function pauseToggle() {
  if (!state.sepiaProcessor) return;
  if (state.sepiaPaused) {
    state.sepiaProcessor.start();
    toast("Microphone resumed");
    // UI update handled by onaudiostart
  } else {
    state.sepiaPaused = true;
    state.sepiaProcessor.stop();
    // Use a short delay so onaudioend fires first, then we set paused state
    // TODO: set a 'requestPause' flag and handle it in 'onaudioend' instead
    setTimeout(() => {
      setPauseMicButtonUI();
    }, 150);
    toast("Microphone paused");
  }
  console.log('[Audio] Pause toggled, paused:', state.sepiaPaused);
}

// Get local stream for a call.
// First call  -> build processor + start()
// Further calls -> return the already running stream
export async function getLocalStream() {
  if (state.sepiaReady && state.localStream) {
    state.activeCallCount++;
    console.log('[SEPIA] stream reused (calls: ' + state.activeCallCount + ')');
    return state.localStream;
  }
  const deviceId         = document.getElementById('mic-select').value;
  const targetSampleRate = parseInt(document.getElementById('sample-rate-select').value) || null;
  const microphoneGain = +document.getElementById('mic-custom-gain').value || 1.0;
  try {
    const {stream} = await buildProcessor({
      deviceId,
      targetSampleRate,
      microphoneGain
    });
    state.sepiaProcessor.start();
    state.activeCallCount++;
    console.log('[SEPIA] processor started (calls: ' + state.activeCallCount + ')');
    return stream;
  } catch (err) {
    toast('Microphone error: ' + (err.message || err.name || err), 'error');
    return null;
  }
}

// Called by peer.js after each individual call ends.
// Processor is only stopped when the last call has ended.
export function onCallEnded() {
  state.activeCallCount = Math.max(0, state.activeCallCount - 1);
  console.log('[SEPIA] call ended (calls: ' + state.activeCallCount + ')');
  if (state.activeCallCount === 0) _releaseProcessor();
}

// Immediately release all calls (hangupAll path).
export function releaseLocalStream() {
  state.activeCallCount = 0;
  _releaseProcessor();
}

// Internal teardown -- release() follows in onaudioend when _releasing is set.
function _releaseProcessor() {
  if (!state.sepiaProcessor) return;
  try {
    state.sepiaProcessor._releasing = true;
    state.sepiaProcessor.stop();
  } catch (e) {
    console.warn('[SEPIA] error during stop:', e);
  }
}

// ============================================================
//   SDP + BITRATE
// ============================================================

// Set Opus bitrate and FEC via SDP munging.
export function mungeSDP(sdp, bitrateKbps) {
  const lines = sdp.split('\r\n');
  let opusPayload = null;
  for (const line of lines) {
    const m = line.match(/a=rtpmap:(\d+) opus\/48000/i);
    if (m) { opusPayload = m[1]; break; }
  }
  return lines.map(line => {
    if (opusPayload && line.startsWith('a=fmtp:' + opusPayload)) {
      return 'a=fmtp:' + opusPayload +
        ' minptime=10;useinbandfec=1;stereo=0;maxaveragebitrate=' + (bitrateKbps * 1000);
    }
    return line;
  }).join('\r\n');
}

export function getSelectedBitrateKbps() {
  return parseInt(document.getElementById('bitrate-select').value) / 1000;
}
