// ============================================================
//   NoCord-P2P -- main.js
//   Entry point. Imports all modules, binds event handlers,
//   initializes the app.
//
//   Loaded as <script type="module" src="main.js">.
//   ES modules are automatically deferred, so DOMContentLoaded
//   has already fired by the time this executes.
// ============================================================

import {
	enumAudioDevices, testMic, stopMic,
	onSinkChange, muteToggle, pauseToggle,
	onConstraintChange, clearTestRecording,
	debugAudio, setupAudioModule
} from './audio.js';
import {
	connectToServer, disconnectServer,
	callPeer, hangupAll,
	removePeerConnection, onSignalingChange,
	setupPeerModule
} from './peer.js';
import { createRoom, joinRoom, leaveRoom, requestRoomRefresh } from './room.js';
import { sendChatMessage, sendFile } from './transfer.js';
import {
	toggleHeaderMenu, toggleMenu, togglePanel, collapseAllSidebarPanels,
	checkConnectionStatus, filterChatMessages, copyPeerId,
	toggleFileZone, onChatKey, autoResize, closeLightbox,
	setupUi
} from './ui.js';
import { toggleScreenWakeLock, toggleFullscreen,
	updateScreenStateAsync, setupDeviceModule
} from './device.js';

// -- Service Worker ------------------------------------------
if ('serviceWorker' in navigator) {
	navigator.serviceWorker.register('sw.js').catch(() => { });
}

// -- Global function exports for inline onclick in HTML ------
// ES modules have no global scope -- expose explicitly to window.
Object.assign(window, {
	// Panel
	togglePanel,
	// Audio
	enumAudioDevices,
	testMic,
	stopMic,
	onSinkChange,
	muteToggle,
	pauseToggle,
	onConstraintChange,
	clearTestRecording,
	debugAudio,
	// Connection & Room
	checkConnectionStatus,
	onSignalingChange,
	connectToServer,
	disconnectServer,
	callPeer,
	hangupAll,
	copyPeerId,
	createRoom,
	joinRoom,
	leaveRoom,
	requestRoomRefresh,
	// Chat & transfer
	sendChatMessage,
	toggleFileZone,
	onChatKey,
	autoResize,
	handleFileSelect,
	// UI
	closeLightbox,
	filterChatMessages,
	toggleMenu,
	toggleHeaderMenu,
	// Device
	toggleScreenWakeLock,
	toggleFullscreen
});

// -- Event delegation: room peer list (call / hangup) --------
document.getElementById('room-peer-list').addEventListener('click', e => {
	const btn = e.target.closest('[data-action]');
	if (!btn) return;
	const pid = btn.dataset.pid;
	switch (btn.dataset.action) {
		case 'call-peer':
			callPeer(pid);
			break;
		case 'hangup-peer':
			removePeerConnection(pid);
			break;
	}
});

// -- Event delegation: file drop zone ------------------------
const dropZone = document.getElementById('file-drop-zone');
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', async e => {
	e.preventDefault();
	dropZone.classList.remove('dragover');
	const f = e.dataTransfer.files[0];
	if (f) await sendFile(f);
});

// -- Chat input: Enter key and custom event ------------------
const chatInput = document.getElementById('chat-input');
chatInput.addEventListener('keydown', onChatKey);
chatInput.addEventListener('input', () => autoResize(chatInput));
// Custom event dispatched from ui.js on Enter (without Shift)
document.addEventListener('nocord:send', sendChatMessage);

// -- File input (click upload) -------------------------------
function handleFileSelect(e) {
	const file = e.target.files[0];
	if (!file) return;
	e.target.value = '';
	sendFile(file);
}

// -- Modal overlay: click closes lightbox -------------------
document.getElementById('modal-overlay').addEventListener('click', closeLightbox);

// -- Cleanup on page close/reload ----------------------------
// Best-effort: send room-leave before the page unloads.
// Not guaranteed by all browsers but works in most cases.
window.addEventListener('beforeunload', () => {
	leaveRoom();
});

// -- Init ----------------------------------------------------
await setupUi();
await setupAudioModule();
await setupPeerModule();
await setupDeviceModule();
