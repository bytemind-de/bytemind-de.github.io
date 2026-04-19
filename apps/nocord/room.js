// ============================================================
//   NoCord-P2P -- room.js
//   Hybrid mesh room logic.
//
//   Host:
//     - Registers with peer ID = SHA-256(roomName + password)[:16]
//     - Maintains the canonical peer list
//     - On new join: sends room-peers list, notifies existing peers
//
//   Member:
//     - Computes same room ID locally
//     - Connects to host via DataChannel
//     - Receives peer list, connects directly to all known peers
//     - Audio calls are initiated manually via the participant list
//
//   Messages (all via DataChannel, JSON):
//     room-join      { type, id, name }           member -> host
//     room-peers     { type, peers: [{id,name}] } host -> new member
//     room-announce  { type, id, name }           host -> all existing members
//     room-leave     { type, id, name }           member -> host (+ broadcast)
//     room-update    { type, peers: [{id,name}] } host -> all (after leave)
//     room-refresh   { type }                     member -> host
//     room-host-leave{ type }                     host -> all members
//     room-ping      { type }                     host -> all members
//     room-pong      { type, id }                 member -> host
// ============================================================

import { state } from './state.js';
import { toast, updateRoomPeerList, addSystemMessage,
  checkConnectionStatus, setStatus } from './ui.js';
import { setupDataConnection, setRoomConnectionHandler,
  setPeerUnavailableHandler, connectToServer, connectWithId,
  hangupAll, disconnectServer } from './peer.js';

// Register our handlers with peer.js immediately on module load --
// this must be synchronous so it's ready before any connection opens
setRoomConnectionHandler(handleRoomConnection);
setPeerUnavailableHandler(handlePeerUnavailable);

// -- Compute room ID from name + password --------------------
// Uses SHA-256 and takes the first 16 hex chars as peer ID prefix.
async function computeRoomId(roomName, password) {
  const raw    = roomName.trim().toLowerCase() + ':' + password;
  const bytes  = new TextEncoder().encode(raw);
  const hash   = await crypto.subtle.digest('SHA-256', bytes);
  const hex    = Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  return 'r-' + hex.slice(0, 34);
}

// -- Handle peer-unavailable errors from peer.js -------------
// Returns true if the error was a failed room join (takes ownership).
function handlePeerUnavailable(failedId) {
  if (!state.room || state.room.isHost) return false;
  if (failedId !== state.room.id) return false;

  const pending = state.pendingConnections.get(state.room.id);
  if (pending) {
    clearTimeout(pending.connTimeout);
    state.pendingConnections.delete(state.room.id);
  }

  toast('Room not found or host offline', 'error');
  state.room = null;
  updateRoomPeerList([]);
  _updateRoomUI();
  checkConnectionStatus();
  return true;
}

// -- Create a room (host) ------------------------------------
export async function createRoom() {
  if (state.room){
    toast("Already joined room: " + state.room.name);
    return;
  }
  const roomName = document.getElementById('room-name').value.trim();
  const password = document.getElementById('room-password').value;
  const myName   = document.getElementById('room-username').value.trim() || 'User';

  if (!roomName) { toast('Please enter a room name', 'error'); return; }

  const roomId = await computeRoomId(roomName, password);

  state.room = {
    id:     roomId,
    name:   roomName,
    isHost: true,
    myName,
    peers:  [],
  };
  _updateRoomUI();

  try {
    await connectWithId(roomId);
    toast('Room created: ' + roomName, 'success');
  } catch (err) {
    toast('Failed to create room: ' + (err?.type || err?.message || err), 'error');
    state.room = null;
    _updateRoomUI();
  }
}

// -- Join a room (member) ------------------------------------
export async function joinRoom() {
  if (state.room){
    toast("Already joined room: " + state.room.name);
    return;
  }
  const roomName = document.getElementById('room-name').value.trim();
  const password = document.getElementById('room-password').value;
  const myName   = document.getElementById('room-username').value.trim() || 'User';

  if (!roomName) { toast('Please enter a room name', 'error'); return; }

  const roomId = await computeRoomId(roomName, password);

  // Set up room state before any async operation
  state.room = {
    id:       roomId,
    name:     roomName,
    isHost:   false,
    myName,
    peers:    [],
  };
  const joinToken = state.room; // capture ref to detect stale callbacks
  _updateRoomUI();

  try {
    // Clean up any stale connections from previous session before connecting
    hangupAll();
    await connectToServer();
  } catch (err) {
    toast('Failed to connect: ' + (err?.type || err?.message || err), 'error');
    if (state.room === joinToken) {   // only reset if this join is still active
      state.room = null;
      _updateRoomUI();
    }
    return;
  }

  // Abort if room state was cleared while connecting (e.g. user left)
  if (state.room !== joinToken) return;

  // Create connection first, assign to hostConn immediately before any
  // event handler could fire -- eliminates the race condition
  const conn = state.peer.connect(roomId, {
    reliable:      true,
    serialization: 'json',
    label:         'room',
    metadata:      { name: myName },
  });
  const connTimeout = setTimeout(() => {
    if (!conn.open) {
      console.warn("Connecting to", roomId, "took too long! Consider force close.");
      toast('Room connection timed out. TODO: clean up.', 'error');
      state.pendingConnections.delete(roomId);
      //conn.close();   //TODO: use?
    }
  }, 15000);
  state.pendingConnections.set(roomId, { conn, connTimeout });
  state.room.hostConn = conn;

  conn.on('open', () => {
    clearTimeout(connTimeout);
    state.pendingConnections.delete(roomId);
    console.log('[Room] host conn open, sending room-join');
    conn.send({ type: 'room-join', id: state.myId, name: myName });
    toast('Joined room: ' + roomName, 'success');
    setStatus('online', 'Peer');
    _updateRoomUI();
  });
  conn.on('data', (data) => {
    _handleRoomMessage(data); 
  });
  conn.on('close', () => {
    // Only react if this conn is still the active host connection
    if (state.room?.hostConn === conn) {
      _onHostLeft(false);
    }
  });
  conn.on('error', (err) => {
    clearTimeout(connTimeout);
    state.pendingConnections.delete(roomId);
    toast('Room connection error: ' + err.message, 'error');
  });
}

// -- Member: handle host leaving (graceful or ungraceful) ----
// Cleans up room state but keeps mesh connections alive.
function _onHostLeft(graceful) {
  if (!state.room) return;
  state.room.hostConn = null;  // null before any close to prevent re-entry
  state.room = null;
  updateRoomPeerList([]);
  _updateRoomUI();
  let msg = graceful ? 'Host left the room' : 'Disconnected from host';
  addSystemMessage(msg);
  toast(msg, graceful ? 'info' : 'error');
}

// -- Request peer list refresh from host ---------------------
export function requestRoomRefresh() {
  if (!state.room) return;
  if (state.room.isHost){
    //ping for dead connections
    sendPingRequest();
  }else{
    //request new list from host
    if (!state.room.hostConn?.open) return;
    console.log('[Room] requesting room-refresh from host');
    state.room.hostConn.send({ type: 'room-refresh' });
  }
}

// -- Check connections and update UI or request refresh ------
// Only for member side -- skips UI update if stale peers detected,
// triggers a refresh instead (fresh data will arrive shortly).
function _checkAndUpdatePeers(peers) {
  const hasStale = peers.some(p =>
    p.id !== state.myId &&
    !state.connections[p.id]?.conn?.open &&
    !state.pendingConnections.has(p.id)
  );
  if (hasStale) {
    console.log('[Room] stale peers detected, requesting refresh');
    requestRoomRefresh();
    return;
  }
  updateRoomPeerList(peers);
}

// -- Leave room ----------------------------------------------
export function leaveRoom() {
  if (!state.room) return;
  const stateRoom = state.room; //grab before its gone ^^

  if (stateRoom.isHost) {
    // Notify all members that host is leaving
    _broadcastExcept(null, { type: 'room-host-leave' });
    disconnectServer();
  } else {
    // Notify host
    if (stateRoom.hostConn?.open) {
      stateRoom.hostConn.send({
        type: 'room-leave',
        id:   state.myId,
        name: stateRoom.myName,
      });
    }
    hangupAll();
  }

  state.room = null;
  updateRoomPeerList([]);
  _updateRoomUI();
  toast('Left room', 'info');
}

// -- Handle incoming DataChannel connections (host side) -----
// Called from peer.js when a new DataChannel with label 'room' opens.
// Returns true if the connection was handled as a room message.
export function handleRoomConnection(conn) {
  if (!state.room?.isHost) return false;
  if (conn.label !== 'room') return false;

  conn.on('data', data => {
    if (!state.room) {
      console.error("Failed to clean-up room connection handler.");
      return;
    }
    if (data.type === 'room-join') {
      _hostOnJoin(conn, data);
    } else if (data.type === 'room-leave') {
      _hostOnLeave(data);
    } else if (data.type === 'room-refresh') {
      _hostOnRefresh();
    } else if (data.type === 'room-pong') {
      _pendingPongs.delete(data.id);
      console.log('[Room] Pong received from', data.id.slice(0, 8), '-- remaining:', _pendingPongs.size);
    }
  });

  // If the member disconnects ungracefully (browser closed, network drop etc.)
  // remove them from the room as if they had sent room-leave
  conn.on('close', () => {
    if (!state.room) return;
    const peer = state.room.peers.find(p => p.conn === conn);
    if (peer) {
      console.log('[Room] Member disconnected ungracefully:', peer.name);
      _hostOnLeave({ id: peer.id, name: peer.name });
    }
    setTimeout(() => { checkConnectionStatus(); }, 500);
  });

  return true;
}

// -- Host: handle join ---------------------------------------
function _hostOnJoin(conn, data) {
  const { id, name } = data;

  // Send current peer list to the new member -- include host itself
  const peersForNewMember = [
    { id: state.myId, name: state.room.myName },
    ...state.room.peers.map(p => ({ id: p.id, name: p.name })),
  ];
  console.log('[Room] sending peers to new member:', peersForNewMember);
  conn.send({ type: 'room-peers', peers: peersForNewMember });

  // Add new member to list
  state.room.peers.push({ id, name, conn });

  // Announce new member to all existing peers
  _broadcastExcept(id, { type: 'room-announce', id, name });

  updateRoomPeerList(state.room.peers);
  toast(name + ' joined the room', 'info');
}

// -- Host: handle leave --------------------------------------
function _hostOnLeave(data) {
  const { id, name } = data;
  state.room.peers = state.room.peers.filter(p => p.id !== id);

  // Broadcast updated list
  _broadcastExcept(null, {
    type:  'room-update',
    peers: state.room.peers.map(p => ({ id: p.id, name: p.name })),
  });

  updateRoomPeerList(state.room.peers);
  toast(name + ' left the room', 'info');
}

// -- Host: handle refresh ------------------------------------
let _onRefreshStates = {
  debounceDelay: 1500,      // Debounce: Warte auf weitere Events
  requestLimit: 60,
  cooldown: 60000,
  timer: null,
  count: 0,
  blockUntil: 0,
  windowStart: 0
};
function _hostOnRefresh() {
  const now = Date.now();
  if (now < _onRefreshStates.blockUntil) return;
  if (now - _onRefreshStates.windowStart > _onRefreshStates.cooldown) {
    _onRefreshStates.count = 0;
    _onRefreshStates.windowStart = now;
  }
  _onRefreshStates.count++;
  if (_onRefreshStates.count > _onRefreshStates.requestLimit) {
    _onRefreshStates.blockUntil = now + _onRefreshStates.cooldown;
    let msg = "Warning: Too many 'room-refresh' requests! Temporarily blocked.";
    console.warn(msg);
    toast(msg, 'error');
    return;
  }
  if (_onRefreshStates.timer) return;
  _onRefreshStates.timer = setTimeout(() => {
    _onRefreshStates.timer = null;
    if (!state.room) return;
    // Remove peers with closed connections before broadcasting
    _hostCleanUpDeadConnections();
    const peers = [
      { id: state.myId, name: state.room.myName },
      ...state.room.peers.map(p => ({ id: p.id, name: p.name })),
    ];
    console.log('[Room] Broadcasting peer list');
    _broadcastExcept(null, { type: 'room-peers', peers });
  }, _onRefreshStates.debounceDelay);
}

// -- Host: send ping to all peers and remove non-responders --
const PING_TIMEOUT_MS = 5000;
let _pingTimer = null;
let _pendingPongs = new Set();

export function sendPingRequest() {
  if (!state.room?.isHost) return;
  if (_pingTimer) {
    console.log('[Room] Ping already in progress');
    return;
  }

  _pendingPongs = new Set(state.room.peers.map(p => p.id));
  if (_pendingPongs.size === 0) return;

  console.log('[Room] Sending ping to', _pendingPongs.size, 'peer(s)');
  _broadcastExcept(null, { type: 'room-ping' });

  _pingTimer = setTimeout(() => {
    _pingTimer = null;
    if (!state.room) return;
    if (_pendingPongs.size === 0) return;
    console.log('[Room]', _pendingPongs.size, 'peer(s) did not respond to ping:', [..._pendingPongs]);
    _hostCleanUpDeadConnections(_pendingPongs);
    _pendingPongs.clear();
    // Broadcast updated list after cleanup
    const peers = [
      { id: state.myId, name: state.room.myName },
      ...state.room.peers.map(p => ({ id: p.id, name: p.name })),
    ];
    _broadcastExcept(null, { type: 'room-peers', peers });
  }, PING_TIMEOUT_MS);
}

// -- Host: remove dead peers and update UI -------------------
// peerIds: optional Set of IDs to remove -- if omitted, removes all with closed conn
function _hostCleanUpDeadConnections(peerIds) {
  //TODO: what about abandonned dataChannels?
  const dead = peerIds
    ? state.room.peers.filter(p => peerIds.has(p.id))
    : state.room.peers.filter(p => !p.conn?.open);
  if (!dead.length) return;
  console.log('[Room] Removing', dead.length, 'dead peer(s):', dead.map(p => p.name));
  dead.forEach(p => toast(p.name + ' left the room', 'info'));
  const deadIds = new Set(dead.map(p => p.id));
  state.room.peers = state.room.peers.filter(p => !deadIds.has(p.id));
  updateRoomPeerList(state.room.peers);
  //TODO: add peer badge clean-up
}

// -- Host: broadcast to all peers except one -----------------
function _broadcastExcept(excludeId, msg) {
  state.room.peers
    .filter(p => p.id !== excludeId && p.conn?.open)
    .forEach(p => p.conn.send(msg));
}

// -- Member: filter own ID from peer list --------------------
function _filterRoomPeers(peers) {
  return peers.filter(p => p.id !== state.myId);
}

// -- Member: handle messages from host -----------------------
function _handleRoomMessage(data) {
  console.log('[Room] message received:', data);
  if (!state.room) return;

  switch (data.type) {
    case 'room-peers':
      // Initial peer list from host -- connect DataChannel to each.
      // Small delay to allow all peers to finish registering with the signaling server.
      state.room.peers = _filterRoomPeers(data.peers);
      setTimeout(() => {
        state.room.peers.forEach(p => _connectToPeer(p));
        _checkAndUpdatePeers(state.room.peers);
      }, 500);
      break;

    case 'room-announce':
      // New peer joined -- add and connect
      if (!state.room.peers.find(p => p.id === data.id)) {
        const filtered = _filterRoomPeers([{ id: data.id, name: data.name }]);
        if (filtered.length) {
          state.room.peers.push(filtered[0]);
          _connectToPeer(filtered[0]);
          _checkAndUpdatePeers(state.room.peers);
          toast(data.name + ' joined the room', 'info');
        }
      }
      break;

    case 'room-update':
      // Peer left -- update list
      state.room.peers = _filterRoomPeers(data.peers);
      _checkAndUpdatePeers(state.room.peers);
      break;

    case 'room-host-leave':
      _onHostLeft(true);
      break;

    case 'room-ping':
      if (state.room?.hostConn?.open) {
        state.room.hostConn.send({ type: 'room-pong', id: state.myId });
      }
      break;
  }
}

// -- Connect DataChannel to a peer (mesh) --------------------
function _connectToPeer(peer) {
  if (peer.id === state.myId) return;          // don't connect to self

  const existing = state.connections[peer.id];
  // Skip if already open or currently connecting (conn exists but not yet open)
  if (existing?.conn?.open) return;
  if (state.pendingConnections.has(peer.id)) return;

  // Mark as connecting to prevent duplicate attempts from both sides
  // Use the lower peer ID to decide who initiates -- only one side connects
  if (state.myId > peer.id) {
    console.log('[Room] Skipping connect to', peer.id.slice(0,8), '-- they will initiate');
    return;
  }

  if (!state.connections[peer.id]) state.connections[peer.id] = {};
  
  const conn = state.peer.connect(peer.id, {
    reliable:      true,
    serialization: 'binary',
    label:         'data',
  });
  const connTimeout = setTimeout(() => {
    if (!conn.open) {
      let peerIdShort = peer.id.slice(0, 6) + "...";
      console.warn("Connecting to", peerIdShort, "took too long! Consider force close.");
      toast('Connection to ' + peerIdShort + ' timed out. TODO: clean up.', 'error');
      state.pendingConnections.delete(peer.id);
      //conn.close();   //TODO: use?
    }
  }, 15000);
  state.pendingConnections.set(peer.id, { conn, connTimeout });

  conn.on('open', () => {
    clearTimeout(connTimeout);
    state.pendingConnections.delete(peer.id);
  });
  conn.on('error', () => {
    clearTimeout(connTimeout);
    state.pendingConnections.delete(peer.id);
  });
  setupDataConnection(conn);
}

// -- UI helpers ----------------------------------------------
function _updateRoomUI() {
  const inRoom = !!state.room;
  const roomStatusEle = document.getElementById('room-status');
  if (roomStatusEle) {
    const isHost = state.room?.isHost;
    const roomName = inRoom? (document.getElementById('room-name')?.value.trim() || "?") : '';
    roomStatusEle.textContent = !roomName? '' : ((isHost? 'Host' : 'Peer') + ' · ' + roomName);
  }
  document.getElementById('btn-create-room').disabled = inRoom;
  document.getElementById('btn-join-room').disabled   = inRoom;
  document.getElementById('btn-leave-room').disabled  = !inRoom;
  document.getElementById('room-name').disabled       = inRoom;
  document.getElementById('room-password').disabled   = inRoom;
  document.getElementById('room-username').disabled   = inRoom;
}
