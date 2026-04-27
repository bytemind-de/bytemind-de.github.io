// ============================================================
//   NoCord-P2P -- transfer.js
//   File chunking, backpressure control, image compression,
//   incoming chunk reassembly.
// ============================================================

import { state }                                          from './state.js';
import { toast, addMessage, addSystemMessage,
         showOutgoingTransfer, updateTransferProgress,
         showImageThumbnail, showImageSent, finalizeImageReceive,
         buildFileBubble }                                from './ui.js';

// -- Constants -----------------------------------------------
const CHUNK_SIZE   = 16384; // 16 KB -- SCTP optimized
const MAX_BUFFERED = 65536; // 64 KB backpressure threshold

// -- Incoming transfer registry ------------------------------
// id -> { pid, name, size, mime, isImage, totalChunks, chunks[], received }
const receives = {};

// -- Helpers -------------------------------------------------
function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

function getOpenPeers() {
  return Object.keys(state.connections)
    .filter(p => state.connections[p].conn?.open);
}

// -- Route incoming data -------------------------------------
export function handleIncomingData(pid, raw) {
  if (raw instanceof ArrayBuffer || raw instanceof Uint8Array) {
    handleFileChunk(pid, raw instanceof ArrayBuffer ? new Uint8Array(raw) : raw);
    return;
  }
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }

  switch (msg.type) {
    case 'chat':
      addMessage(pid, msg.text, 'text', true);
      break;
    case 'file-meta':
      initFileReceive(pid, msg);
      break;
    case 'img-thumbnail':
      showImageThumbnail(pid, msg);
      break;
    case 'file-complete':
      finalizeFileReceive(pid, msg.id);
      break;
    case 'new-host-announce':
      //NOTE: we can add more 'new-host-..' events here if required
      _newHostEventsHandler?.(pid, msg);
      break;
  }
}

let _newHostEventsHandler = null;
export function setNewHostEventsHandler(fn) {
  _newHostEventsHandler = fn;
}

// -- Send a file ---------------------------------------------
export async function sendFile(file) {
  const peers = getOpenPeers();
  if (peers.length === 0)            { toast('No active data channel', 'error'); return; }
  if (file.size > 50 * 1024 * 1024) { toast('File too large (max 50 MB)', 'error'); return; }

  const id      = generateId();
  const isImage = file.type.startsWith('image/');
  let   fileData, sendMime = file.type, sendName = file.name;

  if (isImage) {
    const { webp, thumb } = await compressImage(file);
    fileData  = webp;
    sendMime  = 'image/webp';
    sendName  = file.name.replace(/\.[^.]+$/, '') + '.webp';
    // Send thumbnail immediately (< 2 KB Base64) for instant preview
    const thumbMsg = JSON.stringify({ type: 'img-thumbnail', id, thumb, name: sendName });
    peers.forEach(pid => {
      try { state.connections[pid].conn.send(thumbMsg); } catch (e) {}
    });
  } else {
    fileData = await file.arrayBuffer();
  }

  const totalChunks = Math.ceil(fileData.byteLength / CHUNK_SIZE);
  const meta = JSON.stringify({
    type: 'file-meta', id,
    name: sendName, size: fileData.byteLength,
    mime: sendMime, chunks: totalChunks, isImage,
  });
  peers.forEach(pid => {
    try { state.connections[pid].conn.send(meta); } catch (e) {}
  });

  const progressEl = showOutgoingTransfer(id, sendName, fileData.byteLength);
  const arr        = new Uint8Array(fileData);
  let   chunkIdx   = 0;
  const enc        = new TextEncoder();

  while (chunkIdx < totalChunks) {
    for (const pid of peers) {
      const conn = state.connections[pid]?.conn;
      if (!conn || !conn.open) continue;

      // Backpressure: wait until send buffer has drained
      while (conn._dc && conn._dc.bufferedAmount > MAX_BUFFERED) {
        await new Promise(r => setTimeout(r, 20));
      }

      const start = chunkIdx * CHUNK_SIZE;
      const chunk = arr.slice(start, Math.min(start + CHUNK_SIZE, arr.byteLength));

      // Packet header: [id: 8 bytes ASCII | chunkIdx: 4 bytes uint32 | totalChunks: 4 bytes uint32]
      const header = new Uint8Array(16);
      header.set(enc.encode(id.padEnd(8, '0').slice(0, 8)), 0);
      new DataView(header.buffer).setUint32(8,  chunkIdx,    false);
      new DataView(header.buffer).setUint32(12, totalChunks, false);

      const packet = new Uint8Array(16 + chunk.length);
      packet.set(header, 0);
      packet.set(chunk,  16);
      try { conn.send(packet.buffer); } catch (e) {}
    }

    chunkIdx++;
    updateTransferProgress(progressEl, chunkIdx / totalChunks);
    if (chunkIdx % 4 === 0) await new Promise(r => setTimeout(r, 5)); // yield
  }

  const doneMsg = JSON.stringify({ type: 'file-complete', id });
  peers.forEach(pid => {
    try { state.connections[pid].conn.send(doneMsg); } catch (e) {}
  });
  progressEl?.closest('.msg')?.remove();
  toast(sendName + ' sent', 'success');

  // Show sent image/file to sender as outgoing message
  const sentBlob = new Blob([arr], { type: sendMime });
  const sentUrl  = URL.createObjectURL(sentBlob);
  if (isImage) {
    showImageSent(state.myId, sentUrl);
  } else {
    addMessage(state.myId, buildFileBubble(sendName, arr.byteLength, sentUrl), 'file', false);
  }
}

// -- Send a chat message -------------------------------------
export function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const text  = input.value.trim();
  if (!text) return;

  const peers = getOpenPeers();
  if (peers.length === 0) { toast('No active data channel', 'error'); return; }

  const msg = { type: 'chat', text, from: state.myId, ts: Date.now() };
  peers.forEach(pid => {
    try { state.connections[pid].conn.send(JSON.stringify(msg)); } catch (e) {}
  });

  addMessage('me', text, 'text', false);
  input.value        = '';
  input.style.height = '';
}

// -- Image compression via Canvas API ------------------------
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      // Full image: max 1200px on the longest side
      let w = img.width, h = img.height;
      if      (w > 1200) { h = Math.round(h * 1200 / w); w = 1200; }
      else if (h > 1200) { w = Math.round(w * 1200 / h); h = 1200; }

      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);

      // Thumbnail: max 80px wide for instant preview
      const tw = Math.min(80, w), th = Math.round(h * tw / w);
      const tc = document.createElement('canvas');
      tc.width = tw; tc.height = th;
      tc.getContext('2d').drawImage(img, 0, 0, tw, th);

      canvas.toBlob(blob => {
        blob.arrayBuffer().then(buf =>
          resolve({ webp: buf, thumb: tc.toDataURL('image/webp', 0.5) })
        );
      }, 'image/webp', 0.82);
    };

    img.onerror = reject;
    img.src     = url;
  });
}

// -- Initialize incoming file receive ------------------------
function initFileReceive(pid, meta) {
  receives[meta.id] = {
    pid,
    name:        meta.name,
    size:        meta.size,
    mime:        meta.mime,
    isImage:     meta.isImage,
    totalChunks: meta.chunks,
    chunks:      new Array(meta.chunks),
    received:    0,
  };
}

// -- Store an incoming chunk ---------------------------------
function handleFileChunk(pid, packet) {
  const dec      = new TextDecoder();
  const id       = dec.decode(packet.slice(0, 8)).replace(/\0/g, '').trim();
  const dv       = new DataView(packet.buffer, packet.byteOffset);
  const chunkIdx = dv.getUint32(8, false);
  const data     = packet.slice(16);

  const r = receives[id];
  if (!r) return;
  r.chunks[chunkIdx] = data;
  r.received++;

  const prog = document.getElementById('prog-' + id);
  if (prog) prog.style.width = (r.received / r.totalChunks * 100) + '%';
}

// -- Assemble and display completed transfer -----------------
function finalizeFileReceive(pid, id) {
  const r = receives[id];
  if (!r) return;

  const totalSize = r.chunks.reduce((a, c) => a + (c?.length ?? 0), 0);
  const full      = new Uint8Array(totalSize);
  let   offset    = 0;
  for (const chunk of r.chunks) {
    if (chunk) { full.set(chunk, offset); offset += chunk.length; }
  }

  const blob = new Blob([full], { type: r.mime });
  const url  = URL.createObjectURL(blob);

  if (r.isImage) {
    finalizeImageReceive(id, url);
  } else {
    addMessage(pid, buildFileBubble(r.name, r.size, url), 'file', true);
  }

  delete receives[id];
  toast(r.name + ' received', 'success');
}
