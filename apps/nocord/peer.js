// ============================================================
//   NoCord-P2P -- peer.js
//   Signaling, connection setup, call and DataChannel handling.
// ============================================================

import { state }                                    from './state.js';
import { toast, addSystemMessage,
         checkConnectionStatus, setStatus,
         updateRoomPeerList, updateRoomPeerListEntry, updateConnectedBadges,
         startStatsLoop, stopStatsLoop,
         showPlayButton }                           from './ui.js';
import { getLocalStream, releaseLocalStream,
         mungeSDP, getSelectedBitrateKbps,
         onCallEnded, applyCurrentSinkToAll,
         getSelectedSinkId }                        from './audio.js';
import { handleIncomingData }                       from './transfer.js';

// -- Setup ---------------------------------------------------

export async function setupPeerModule(){
  //run once for state restore:
  onSignalingChange();
}

// -- Room connection handler (set by room.js on load) --------
// Avoids circular import while keeping the handler synchronous
let _roomConnectionHandler = null;
export function setRoomConnectionHandler(fn) {
  _roomConnectionHandler = fn;
}

// -- Peer-unavailable error handler (set by room.js on load) -
let _peerUnavailableHandler = null;
export function setPeerUnavailableHandler(fn) {
  _peerUnavailableHandler = fn;
}

// -- Signaling server selection ------------------------------
export function onSignalingChange() {
  const val = document.getElementById('signaling-preset').value;
  document.getElementById('custom-server-field').style.display =
    val === 'custom' ? 'block' : 'none';
}

function buildPeerConfig() {
  if (state.inviteEvent?.server){
    if (state.inviteEvent.server == "default" || state.inviteEvent.server == "peerjs"){
      return {};
    }else{
      return _buildPeerConfigObject(state.inviteEvent.server);
    }
  }

  const preset = document.getElementById('signaling-preset').value;
  if (preset === 'peerjs') return {};

  const url = document.getElementById('custom-server-url').value.trim();
  if (!url) { toast('Please enter a server URL', 'error'); return null; }
  return _buildPeerConfigObject(url);
}
function _buildPeerConfigObject(url) {
  try {
    const u = new URL(url);
    return {
      host:   u.hostname,
      port:   u.port || (u.protocol === 'wss:' ? 443 : 9000),
      path:   u.pathname || '/peerjs',
      secure: u.protocol === 'wss:',
    };
  } catch {
    toast('Invalid server URL', 'error');
    return null;
  }
}
export function getSignalingServer() {
  if (state.inviteEvent?.server){
    return state.inviteEvent.server;
  }
  const preset = document.getElementById('signaling-preset').value;
  if (preset === 'peerjs') return null;
  const customUrl = document.getElementById('custom-server-url').value.trim();
  try { return (new URL(customUrl)).href; } catch { return null; };
}

// -- Internal: connect to signaling server -------------------
// If peerId is provided, registers with that fixed ID (host).
// Otherwise registers with a random ID (member).
function _connectPeer(peerId) {
  return new Promise((resolve, reject) => {
    if (state.peer && !state.peer.destroyed) {
      state.peer.destroy();
    }
    state.peer = null;
    const applyAsHost = !!peerId;
    let promiseFinished = false;

    const cfg = buildPeerConfig();
    if (cfg === null) { reject('No config'); return; }

    setStatus('calling', 'Connecting...');
    state.peer = applyAsHost ? new Peer(peerId, cfg) : new Peer(cfg);

    state.peer.on('open', id => {
      state.myId = id;
      checkConnectionStatus();
      startStatsLoop();
      if (!promiseFinished){
        promiseFinished = true;
        resolve(id);
      }
    });
    state.peer.on('call',         incomingCall => answerCall(incomingCall));
    state.peer.on('connection',   conn => setupDataConnection(conn));
    state.peer.on('disconnected', () => setStatus('offline', 'Disconnected'));
    state.peer.on('error', (err) => {
      if (!err) err = {};
      if (!err.type){
        err.type = "unknown";
        console.error('PeerJS error:', err);
      }else{
        console.error('PeerJS error:', err.type, "-", err.message);
      }
      switch (err.type) {
        //info: https://github.com/peers/peerjs/blob/master/lib/enums.ts
        case 'peer-unavailable':
          //peer ID you're trying to connect to does not exist
          _handlePeerUnavailable(err);
          break;
        case 'unavailable-id':
          //peer ID you're trying to use is already taken
          toast("The peer ID you are trying to use is already taken! Please reconnect with a new one.", 'error');
          break;
        case 'disconnected':
          toast("Disconnected from signaling-server.", 'error');
          break;
        case 'network':
        case 'server-error':
          toast("Network or signaling-server error: " + err.message, 'error');
          break;      
        default:
          toast("PeerJS error '" + err.type + "': " + err.message, 'error');
          break;
      }
      if (!promiseFinished){
        promiseFinished = true;
        reject(err);
      }
    });
  });
}
function _handlePeerUnavailable(err) {
  const failedId = err.message?.match(/Could not connect to peer (.+)/i)?.[1];
  if (failedId && _peerUnavailableHandler?.(failedId)) {
    // handler returned true -- it took ownership, skip generic toast
  } else {
    toast('Failed to connect to peer. ' + (err.message || err.type), 'error');
  }
  if (state.pendingConnections.size){
    const oldestPending = state.pendingConnections.entries().next().value;
    console.error("Potentially problematic connection:", oldestPending);  //DEBUG
  }
}

// -- Public: connect with random ID (called by joinRoom) -----
export function connectToServer() {
  return _connectPeer();
}

// -- Public: connect with fixed room ID (called by createRoom) -
export function connectWithId(peerId) {
  return _connectPeer(peerId);
}

export function disconnectServer(keepConnections) {
  //NOTE: this is actually 'destroy' not 'disconnect'
  //TODO: we probably need to call 'leaveRoom()' or clean up the UI
  if (keepConnections) {
    cutServerConnection();
    toast('Disconnected', 'info');
  } else {
    hangupAll();
    resetServer();
    toast('Disconnected and closed', 'info');
  }
}
function cutServerConnection() {
  state.peer?.disconnect();
  state.myId = null;  //TODO: consequences?
  setTimeout(() => { checkConnectionStatus(); }, 500);
}
function resetServer() {
  state.peer?.destroy();
  state.peer = null;
  state.myId = null;
  stopStatsLoop();
  //setStatus('offline', 'Offline');
  setTimeout(() => { checkConnectionStatus(); }, 500);
}

// -- Call a peer ---------------------------------------------
export async function callPeer(pid) {
  pid = pid || document.getElementById('peer-call-id')?.value.trim();
  if (!pid || !state.peer) return;
  if (state.connections[pid]?.call || state.connections[pid]?._calling) {
    toast('Already in a call with ' + pid.slice(0, 8), 'info');
    return;
  }

  // Mark as calling immediately to block answerCall during async getLocalStream gap
  if (!state.connections[pid]) state.connections[pid] = {};
  state.connections[pid]._calling = true;
  updateRoomPeerListEntry(pid);

  const stream = await getLocalStream();
  if (!stream) {
    delete state.connections[pid];
    return;
  }

  const bitrate = getSelectedBitrateKbps();
  const call    = state.peer.call(pid, stream, {
    sdpTransform: sdp => mungeSDP(sdp, bitrate)
  });
  if (!call) { toast('Call failed', 'error'); onCallEnded(); delete state.connections[pid]; return; }

  initConnection(pid, call);

  // Open data channel in parallel -- skip if one already exists or is pending
  if (!state.connections[pid]?.conn?.open && !state.pendingConnections.has(pid)) {
    const conn = state.peer.connect(pid, {
      reliable:      true,
      serialization: 'binary',
      label:         'data',
    });
    const connTimeout = setTimeout(() => {
      if (!conn.open) {
        let peerIdShort = pid.slice(0, 6) + "...";
        console.warn("Connecting to", peerIdShort, "took too long! Consider force close.");
        toast('Connection to ' + peerIdShort + ' timed out. TODO: clean up.', 'error');
        state.pendingConnections.delete(pid);
        //conn.close();   //TODO: use?
      }
    }, 15000);
    state.pendingConnections.set(pid, { conn, connTimeout });

    conn.on('open', () => {
      clearTimeout(connTimeout);
      state.pendingConnections.delete(pid);
    });
    conn.on('error', () => {
      clearTimeout(connTimeout);
      state.pendingConnections.delete(pid);
    });
    setupDataConnection(conn);
  }

  toast('Calling ' + pid.slice(0, 8) + '...', 'info');
}

// -- Answer an incoming call ---------------------------------
async function answerCall(call) {
  if (state.connections[call.peer]?.call || state.connections[call.peer]?._calling) {
    console.warn('[Peer] Glare detected with', call.peer.slice(0, 8));
    toast('Call conflict detected – please try calling again', 'info');
    return;
  }

  // Mark immediately to block callPeer during async getLocalStream gap
  if (!state.connections[call.peer]) state.connections[call.peer] = {};
  state.connections[call.peer]._calling = true;
  updateRoomPeerListEntry(call.peer);

  const stream = await getLocalStream();
  if (!stream) { delete state.connections[call.peer]; call.close(); return; }

  const bitrate = getSelectedBitrateKbps();
  call.answer(stream, { sdpTransform: sdp => mungeSDP(sdp, bitrate) });
  initConnection(call.peer, call);
}

// -- Initialize a connection entry ---------------------------
const CALL_STREAM_TIMEOUT_MS = 15000; // give up waiting for stream after 15s

function initConnection(pid, call) {
  if (!state.connections[pid]) state.connections[pid] = {};

  // Defensive: should never happen due to guards in callPeer and answerCall
  if (state.connections[pid].call) {
    console.warn('[Peer] initConnection: call already exists for', pid.slice(0, 8), '-- this should not happen');
    toast('Call error: unexpected duplicate call with ' + pid.slice(0, 8), 'error');
    return;
  }

  state.connections[pid].call = call;

  // Timeout: if no stream arrives within CALL_STREAM_TIMEOUT_MS,
  // treat the call as failed and clean up
  const streamTimeout = setTimeout(() => {
    if (!state.connections[pid]?.stream) {
      console.warn('[Peer] Stream timeout for', pid, '-- closing call');
      toast('Call to ' + pid.slice(0, 8) + ' timed out', 'error');
      removePeerConnection(pid);
    }
  }, CALL_STREAM_TIMEOUT_MS);

  // Store timeout ref so removePeerConnection can cancel it
  state.connections[pid]._streamTimeout = streamTimeout;

  call.on('stream', remoteStream => {
    clearTimeout(streamTimeout);
    state.connections[pid]._streamTimeout = null;
    state.connections[pid]._calling = false;
    updateRoomPeerListEntry(pid);

    const audio     = new Audio();
    audio.srcObject = remoteStream;

    // Apply selected output device if supported
    const sinkId = getSelectedSinkId();
    if (sinkId && typeof audio.setSinkId === 'function') {
      audio.setSinkId(sinkId)
      .then(() => {
        state.audioSession.outputDevice = sinkId;
      })
      .catch(e =>
        console.warn('[Peer] setSinkId failed:', e)
      );
    }

    state.connections[pid].audio  = audio;
    state.connections[pid].stream = remoteStream;

    // Explicit play() instead of autoplay -- browsers can silently block
    // autoplay without prior user interaction (NotAllowedError).
    audio.play().catch(err => {
      if (err.name === 'NotAllowedError') {
        console.warn('[Peer] Autoplay blocked for', pid, '-- showing play button');
        addSystemMessage('Audio blocked -- please click Play above');
        showPlayButton(pid);
      } else {
        console.error('[Peer] play() error:', err);
      }
    });

    let roomPeer = state.room?.peers.find(p => p.id == pid);
    let name = roomPeer?.name?
      (roomPeer.name + " (" + pid.slice(0, 6) + "..)") : pid.slice(0, 8) + "..";
    addSystemMessage('Audio stream received from ' + name);
    updateRoomPeerList();
    updateConnectedBadges();
  });

  call.on('close', () => {
    clearTimeout(streamTimeout);
    console.log('[Peer] Call closed by remote:', pid.slice(0, 8));
    removePeerConnection(pid);
  });
  call.on('error', e => {
    clearTimeout(streamTimeout);
    console.error('[Peer] Call error:', e);
    toast('Call error: ' + e.message, 'error');
    removePeerConnection(pid);
  });
}

// -- Set up a DataChannel connection -------------------------
export function setupDataConnection(conn) {
  const pid = conn.peer;
  if (!state.connections[pid]) state.connections[pid] = {};
  state.connections[pid].conn = conn;

  const onOpen = () => {
    // Only intercept room signaling channel -- synchronous, no await
    if (conn.label === 'room' && _roomConnectionHandler?.(conn)) return;

    let roomPeer = state.room?.peers.find(p => p.id == pid);
    let name = roomPeer?.name?
      (roomPeer.name + " (" + pid.slice(0, 6) + "..)") : pid.slice(0, 8) + "..";
    addSystemMessage('Data channel open with ' + name);
    updateRoomPeerList();
    updateConnectedBadges();
    document.getElementById('empty-chat').style.display = 'none';
    document.getElementById('btn-send').disabled        = false;
  };
  //register data handler
  conn.on('data', (data) => {
    handleIncomingData(pid, data);
  });
  conn.on('error', (err) => {
    toast('Data channel error: ' + err.message, 'error');
  });
  conn.on('close', () => {
    //NOTE: it seems this can trigger multiple times for the same ID
    if (!state.connections[pid]?.conn) return;  //already cleaned up
    let roomPeer = state.room?.peers.find(p => p.id == pid);
    let name = roomPeer?.name?
      (roomPeer.name + " (" + pid.slice(0, 6) + "..)") : pid.slice(0, 8) + "..";
    addSystemMessage('Connection closed: ' + name);
    removePeerConnection(pid);
  });
  //handle already-open connections (TODO: can PeerJS fire 'open' before we registered it??)
  if (conn.open) {
    onOpen();
  } else {
    conn.on('open', onOpen);
  }
}

// -- Remove a single peer connection -------------------------
export function removePeerConnection(pid) {
  const c = state.connections[pid];
  if (!c) return;

  // Cancel pending stream timeout if any
  if (c._streamTimeout) {
    clearTimeout(c._streamTimeout);
    c._streamTimeout = null;
  }

  const hadCall  = !!c.call;
  const callRef  = c.call;
  const audioRef = c.audio;
  // Null out first to prevent re-entrant calls from close/error events
  c.call    = null;
  c.audio   = null;
  c.stream  = null;
  c._calling = false;
  callRef?.close();
  if (audioRef) { audioRef.pause(); audioRef.srcObject = null; }

  if (hadCall) onCallEnded();

  // Only fully remove if there is no open data channel left
  if (!c.conn?.open) {
    delete state.connections[pid];
  }

  updateRoomPeerList();
  updateConnectedBadges();

  // Disable send only if no open data channels remain at all
  const anyOpen = Object.values(state.connections).some(c => c.conn?.open);
  if (!anyOpen) document.getElementById('btn-send').disabled = true;
}

// -- Hang up all connections ---------------------------------
export function hangupAll(silent) {
  let closedCalls = 0;
  let closedDataConn = 0;
  let closedPending = 0;
  //close pending
  state.pendingConnections.forEach((v, k) => {
    v.conn?.close();
    clearTimeout(v.connTimeout);
    closedPending++;
  });
  state.pendingConnections.clear();
  //close active
  for (const c of Object.values(state.connections)) {
    //close calls
    if (c.call?.open) {
      c.call.close();
      closedCalls++;
    }
    //close data connections
    if (c.conn?.open) {
      c.conn.close();
      closedDataConn++;
    }
    if (c.audio) {
      c.audio.pause(); c.audio.srcObject = null;
    }
  }
  state.connections = {};
  //release processor (sets activeCallCount to 0)
  releaseLocalStream();
  updateRoomPeerList([]);
  updateConnectedBadges();
  document.getElementById('btn-send').disabled = true;
  if (!silent){
    if (closedDataConn || closedCalls){
      toast('All connections closed', 'info');
    }else if (closedPending){
      toast('All pending connections closed', 'info');
    }else{
      toast('No active connections', 'info');
    }
  }
}
