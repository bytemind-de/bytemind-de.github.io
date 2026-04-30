// ============================================================
//   NoCord-P2P -- ui.js
//   Chat rendering, toast notifications, bandwidth display,
//   sparkline, lightbox, panel toggle, peer list updates.
// ============================================================

import { state, saveState, loadState } from './state.js';

var uiElements = {};
var mainMenuIsOpen = undefined;
var sidebarPanelStates = {};

// -- Setup UI module -----------------------------------------

export async function setupUi() {
	loadElements();
	//URL parameters
	//TODO: state.getUrlParameter(...)
	//track states and restore if possible
	trackAndRestoreUiStates();
	//we match the media query that changes the grid layout
	if (window.matchMedia('(max-width: 640px)').matches) {
		//... and collapse the menu
		collapseAllSidebarPanels();
	}else{
		initSidebarPanelStates();
	}
	drawSparkline();
	//addSystemMessage('NoCord-P2P ready.');
}
function loadElements() {
	//TODO: complete list
	uiElements = {
		app: document.getElementById('app'),
		headerMenu: document.getElementById('header-context-menu-container'),
		headerMenuButton: document.getElementById('toggle-header-menu-btn'),
		headerMenuSidebar: document.getElementById('sidebar-header-context-menu'),
		headerMenuSidebarButton: document.getElementById('toggle-header-menu-sidebar-btn'),
		sidebar: document.getElementById('sidebar'),
		sidebarToggle: document.getElementById('toggle-menu-btn'),
		promptModalOverlay: document.getElementById('prompt-overlay'),
		sparklineCanvas: document.getElementById('sparkline-canvas'),
		targetBwMax: document.getElementById('kbps-target-max')
	}
	mainMenuIsOpen = !uiElements.app.classList.contains("sidebar-off");
}

// -- Toggle menus ---------------------------------------------
export function toggleHeaderMenu() {
	uiElements.headerMenu.classList.toggle('open');
	//uiElements.headerMenuButton.classList.toggle('active');
	uiElements.headerMenuButton.classList.toggle('rot90');
}
export function toggleHeaderMenuSidebar() {
	uiElements.headerMenuSidebar.classList.toggle('open');
	uiElements.headerMenuSidebarButton.classList.toggle('rot90');
}
export function toggleMenu() {
	uiElements.app.classList.toggle('sidebar-off');
	uiElements.sidebarToggle.classList.toggle("active");
	mainMenuIsOpen = !mainMenuIsOpen;
	//if (app.classList.contains("sidebar-off")){...}
}

// -- Panel toggle --------------------------------------------
export function togglePanel(id) {
	var p = document.getElementById(id);
	p.classList.toggle('collapsed');
	sidebarPanelStates[id] = !p.classList.contains('collapsed');
}
export function collapsePanel(id) {
	document.getElementById(id).classList.add('collapsed');
	sidebarPanelStates[id] = false;
}
export function collapseAllSidebarPanels() {
	uiElements.sidebar.querySelectorAll(".panel").forEach(p => {
		if (p.id) collapsePanel(p.id);
	});
}
export function isSidebarPanelOpen(id) {
	return !!sidebarPanelStates[id];
}
function initSidebarPanelStates() {
	uiElements.sidebar.querySelectorAll(".panel").forEach(p => {
		if (p.id) sidebarPanelStates[p.id] = !p.classList.contains('collapsed');
	});
}

// -- Status indicator ----------------------------------------
export function setStatus(statusClass, text) {
	document.getElementById('global-status').className = statusClass;
	document.getElementById('status-text').textContent = text;
}
export function checkConnectionStatus(debugReport) {
	var status = state.getAppStatusOverview();
	//indicator(s)
	if (status.room.active && status.room.isHost){
		setStatus('online', 'Host');
	}else if (status.room.active && status.room.hostConnOpen){
		setStatus('online', 'Peer');
	}else if (status.room.active || status.connections.dataChannels){
		setStatus('online', 'Connected');
	}else if (status.signaling.connected){
		setStatus('online', 'Online');
	}else{
		//setStatus('offline', 'Disconnected');
		setStatus('offline', 'Offline');
	}
	//ui elements
	document.getElementById('btn-disconnect-server').disabled = !status.signaling.connected;
	document.getElementById('my-peer-id').textContent = status.signaling.myId || '-';
	//document.getElementById('header-peer-id').textContent = status.signaling.myId || '-';

	//debug
	if (debugReport){
		toast("APP STATUS:\n" + JSON.stringify(status, null, 2), "debug");
	}
}

// -- Copy peer ID to clipboard -------------------------------
export function copyPeerId() {
	if (!state.myId) return;
	navigator.clipboard.writeText(state.myId)
		.then(() => toast('Peer ID copied!', 'success'));
}

// -- Toast notifications -------------------------------------
export function toast(msg, type = 'info', dur) {
	if (dur == undefined){
		if (type == 'error') dur = 6500;
		else if (type == 'debug') dur = Number.MAX_SAFE_INTEGER;
		else dur = 4000;
	}
	const el = document.createElement('div');
	el.className = 'toast ' + type;
	const msgEle = document.createElement('div');
	msgEle.className = "toast-msg";
	msgEle.textContent = msg;
	el.appendChild(msgEle);
	if (dur > 30000){
		//add close button
		const closeBtn = document.createElement('button');
		closeBtn.className = 'btn btn-sm btn-circ toast-close-btn';
		closeBtn.innerHTML = '<span class="material-icons font-inherit" translate="no">close</span>';
		closeBtn.onclick = () => { _closeToast(el, dur); };
		el.appendChild(closeBtn);
	}
	document.getElementById('toast-container').appendChild(el);
	// Trigger fade-in on next frame (class add needs a paint cycle to transition)
	requestAnimationFrame(() => el.classList.add('visible'));
	// Fade out after dur
	if (dur != Number.MAX_SAFE_INTEGER){
		_closeToast(el, dur);
	}
}
function _closeToast(el, dur) {
	const TRANSITION_MS = 200; // must match transition duration in main.css
	// Fade out after dur
	setTimeout(() => el.classList.remove('visible'), dur);
	// Remove element after fade-out transition completes
	setTimeout(() => el.remove(), dur + TRANSITION_MS);
}

// -- Room peer list ------------------------------------------
// peers: [{ id, name, audioKbps? }]
export function updateRoomPeerList(peers) {
	if (!peers) peers = state.room?.peers || [];
	//make sure we have no abandoned connections 
	Object.keys(state.connections).forEach((pid) => {
		if (!state.room?.peers?.length || !state.room.peers.find(p => p.id == pid)){
			//const c = state.connections[pid];
			console.warn("Peer ID:", pid, "has no room!");	//TODO: improve handling
		}
	});
	//get list and update entries
	const list = document.getElementById('room-peer-list');
	if (!list) return;
	if (!peers || peers.length === 0) {
		list.innerHTML = '<div class="room-info-text">Room is empty</div>';
	} else {
		list.innerHTML = '';
		peers.forEach((peer) => {
			list.appendChild(makeRoomPeerListEntry(peer));
		});
	}
}
export function updateRoomPeerListEntry(pid) {
	const c = state.connections?.[pid];
	const hasCall = !!c?.stream;
	const isCalling = !!c?._calling;
	const hasData = !!c?.conn?.open;
	const peDiv = document.querySelector("[data-pid='" + pid + "']");
	if (peDiv){
		let curentBtn = peDiv.querySelector(".peer-call-btn");
		curentBtn?.replaceWith(makeCallOrHangupButton(pid, hasCall, isCalling));
	}
}
function makeRoomPeerListEntry(peer) {
	const c = state.connections?.[peer.id];
	const hasCall = !!c?.stream;
	const isCalling = !!c?._calling;
	const hasData = !!c?.conn?.open;
	//item container
	var peDiv = document.createElement("div");
	peDiv.className = "peer-entry";
	peDiv.dataset.pid = peer.id;
	//name and (dis)connect button
	var subDiv = document.createElement("div");
	subDiv.className = "group";
	peDiv.appendChild(subDiv);
	var peName = document.createElement("span");
	peName.className = "peer-name";
	peName.title = peer.id;
	peName.textContent = peer.name || peer.id.slice(0, 8);
	subDiv.appendChild(makeConnectionOpenIndicator(peer, hasData));
	subDiv.appendChild(peName);
	subDiv.appendChild(makeCallOrHangupButton(peer.id, hasCall, isCalling));
	//bandwidth indicator
	peDiv.appendChild(makeBandwidthIndicator(peer));
	return peDiv;
}
function makeConnectionOpenIndicator(peer, hasData) {
	var sp = document.createElement("span");
	sp.className = "peer-status";
	if (hasData){
		sp.innerHTML = '<span class="material-icons font-btn" translate="no">check_circle_outline</span>';	//chat
	}else{
		sp.innerHTML = '<span class="material-icons font-btn" translate="no">hourglass_top</span>';	//speaker_notes_off
	}
	return sp;
}
function makeCallOrHangupButton(pid, hasCall, isCalling) {
	var btn = document.createElement("button");
	btn.className = "btn btn-sm peer-call-btn";
	btn.dataset.pid = pid;
	if (isCalling) {
		btn.classList.add("btn-ghost");
		btn.dataset.action = "hangup-peer";
		btn.innerHTML = '<span class="material-icons font-btn" translate="no">notifications_active</span>Calling';
	}else if (hasCall) {
		btn.classList.add("btn-danger");
		btn.dataset.action = "hangup-peer";
		btn.innerHTML = '<span class="material-icons font-btn" translate="no">close</span>Hang up';
	} else {
		btn.classList.add("btn-primary");
		btn.dataset.action = "call-peer";
		btn.innerHTML = '<span class="material-icons font-btn" translate="no">call</span>Call';
	}
	return btn;
}
function makeBandwidthIndicator(peer) {
	var indicatorEle = document.createElement("div");
	indicatorEle.style.cssText = "font-size:.65rem; color:var(--accent); padding-left:2px; padding-bottom: 2px;";  //TODO: move to CSS file
	indicatorEle.textContent = '';
	peer._showRoomPeerListAudioKbps = function (kbpsVal) {
		indicatorEle.textContent = (kbpsVal !== undefined)? (kbpsVal.toFixed(1) + ' kb/s') : '';
	};
	return indicatorEle;
}

function updatePeerBandwidthCounter(peer, audioKbps) {
	if (peer) {
		peer.audioKbps = audioKbps;
		if (peer._showRoomPeerListAudioKbps) peer._showRoomPeerListAudioKbps(audioKbps);
		if (peer._showPeerBadgeAudioKbps) peer._showPeerBadgeAudioKbps(audioKbps);
	}
}

// -- Peer badges ---------------------------------------------
export function updateConnectedBadges() {
	const badgesContainer = document.getElementById('connected-peers-badges');
	badgesContainer.innerHTML = '';
	Object.keys(state.connections).forEach((pid) => {
		badgesContainer.append(makeConnectedBadge(pid));
	});
}
function makeConnectedBadge(pid) {
	if (!state.room?.peers?.length || !state.room.peers.find(p => p.id == pid)){
			//const c = state.connections[pid];
			console.warn("Peer ID:", pid, "has no room!");	//TODO: improve handling
		}
	var peer = state.room?.peers?.find(p => p.id == pid);
	if (!peer) peer = {id: pid};
	var sp = document.createElement("span");
	sp.className = "badge";
	sp.title = peer.id;
	sp.innerHTML = "● " + (peer.name || (peer.id.slice(0, 6) + "..."));
	var kbpsInd = document.createElement("span");
	kbpsInd.textContent = '';
	//TODO: use different badge colors properly (badge-green, badge-red, badge-amber)
	if (peer.name){
		peer._showPeerBadgeAudioKbps = function (kbpsVal) {
			kbpsInd.textContent = (!mainMenuIsOpen && kbpsVal !== undefined)? ('(' + kbpsVal.toFixed(1) + ' kb/s)') : '';
		};
		sp.classList.add("badge-green");
	}else{
		sp.classList.add("badge-amber");
	}
	sp.appendChild(kbpsInd);
	return sp;
}

// -- File upload zone ----------------------------------------
export function toggleFileZone() {
	document.getElementById('file-drop-zone').classList.toggle('visible');
}

// -- Chat messages -------------------------------------------
export function addMessage(from, content, type = 'text', incoming = true) {
	document.getElementById('empty-chat').style.display = 'none';

	const wrap = document.createElement('div');
	wrap.className = 'msg ' + (incoming ? 'incoming' : 'outgoing');

	// Resolve display name: look up in room peers, fall back to truncated ID
	let displayName;
	if (!incoming) {
		displayName = state.room?.myName || 'Me';
	} else {
		const roomPeer = state.room?.peers?.find(p => p.id === from);
		displayName = roomPeer?.name || from.slice(0, 8);
	}

	const meta = document.createElement('div');
	meta.className = 'msg-meta';
	meta.innerHTML = '<span>' + displayName + '</span>' +
		'<span>' + new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) + '</span>';

	const bubble = document.createElement('div');
	if (type === 'text') {
		bubble.className = 'msg-bubble';
		bubble.textContent = content;
	} else {
		bubble.appendChild(content); // DOM element (image or file)
	}

	wrap.appendChild(meta);
	wrap.appendChild(bubble);
	_appendMsg(wrap);
	return wrap;
}

export function addSystemMessage(text) {
	const wrap = document.createElement('div');
	wrap.className = 'msg system';
	const bubble = document.createElement('div');
	bubble.className = 'msg-bubble';
	//let logDate = new Date().toISOString().replace("T", " ").replace(/\..*/, "");
	let logDate = _getLogTimestamp();
	bubble.textContent = logDate + " - " + text;
	wrap.appendChild(bubble);
	_appendMsg(wrap);
}
function _getLogTimestamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}
	 ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function _appendMsg(el) {
	const msgs = document.getElementById('chat-messages');
	msgs.appendChild(el);
	msgs.scrollTop = msgs.scrollHeight;
}

export function filterChatMessages() {
	//TODO: make a little selector for message types
	var chatClassList = document.getElementById('chat-messages').classList;
	chatClassList.toggle('filter-system-messages');
	toast("Show system messages: " + !chatClassList.contains('filter-system-messages'));
}

// -- Chat input helpers --------------------------------------
export function onChatKey(e) {
	if (e.key === 'Enter' && !e.shiftKey) {
		e.preventDefault();
		// sendChatMessage is in transfer.js -- wired in main.js
		document.getElementById('chat-input').dispatchEvent(
			new CustomEvent('nocord:send', { bubbles: true })
		);
	}
}

export function autoResize(el) {
	el.style.height = '';
	el.style.height = (Math.min(el.scrollHeight, 100) + 2) + 'px';
}

// -- Outgoing transfer progress ------------------------------
export function showOutgoingTransfer(id, name, size) {
	const wrap = document.createElement('div');
	wrap.className = 'msg outgoing';
	wrap.id = 'transfer-' + id;

	const meta = document.createElement('div');
	meta.className = 'msg-meta';
	meta.innerHTML = '<span>Sending...</span>' +
		'<span>' + new Date().toLocaleTimeString() + '</span>';

	const prog = document.createElement('div');
	prog.className = 'transfer-progress';
	prog.innerHTML = '<div>' + name + ' <span style="color:var(--text-2)">(' + formatBytes(size) + ')</span></div>' +
		'<div class="transfer-bar-track">' +
		'<div class="transfer-bar-fill" id="tprog-' + id + '" style="width:0%"></div>' +
		'</div>';

	wrap.appendChild(meta);
	wrap.appendChild(prog);
	_appendMsg(wrap);
	return document.getElementById('tprog-' + id);
}

export function updateTransferProgress(el, pct) {
	if (el) el.style.width = (pct * 100) + '%';
}

// -- Incoming image thumbnail (while transfer is in progress) -
export function showImageThumbnail(pid, msg) {
	const wrap = document.createElement('div');
	wrap.className = 'msg-image-wrap';
	wrap.id = 'imgwrap-' + msg.id;

	const img = document.createElement('img');
	img.src = msg.thumb;
	img.style.filter = 'blur(4px)';
	img.style.transition = 'filter .4s';

	const overlay = document.createElement('div');
	overlay.className = 'img-loading-overlay';
	overlay.id = 'imgoverlay-' + msg.id;
	overlay.textContent = 'Loading...';

	const bar = document.createElement('div');
	bar.className = 'img-progress-bar';
	const fill = document.createElement('div');
	fill.className = 'img-progress-fill';
	fill.id = 'prog-' + msg.id;
	fill.style.width = '0%';
	bar.appendChild(fill);

	wrap.appendChild(img);
	wrap.appendChild(overlay);
	wrap.appendChild(bar);

	addMessage(pid, wrap, 'image', true);
}
// -- Outgoing image
export function showImageSent(pid, fileUrl) {
	const wrap = document.createElement('div');
	wrap.className = 'msg-image-wrap';

	const img = document.createElement('img');
	img.src = fileUrl;
	img.onclick    = () => {
      openLightbox(fileUrl);
    };

	wrap.appendChild(img);
	addMessage(pid, wrap, 'image', false);
}

// -- Finalize image receive (replace blur with full image) ---
export function finalizeImageReceive(id, url) {
	const wrap = document.getElementById('imgwrap-' + id);
	if (!wrap) return;
	const img = wrap.querySelector('img');
	img.src = url;
	img.style.filter = '';
	img.onclick = () => openLightbox(url);
	document.getElementById('imgoverlay-' + id)?.remove();
}

// -- File download bubble ------------------------------------
export function buildFileBubble(name, size, url) {
	const a = document.createElement('a');
	a.href = url;
	a.download = name;
	a.className = 'msg-file';
	a.innerHTML = '<span class="file-icon">📄</span>' +
		'<div class="file-info">' +
		'<div class="file-name">' + name + '</div>' +
		'<div class="file-size">' + formatBytes(size) + '</div>' +
		'</div>' +
		'<span style="color:var(--accent);font-size:.7rem">↓</span>';
	return a;
}

// -- Lightbox ------------------------------------------------
export function openLightbox(src) {
	document.getElementById('modal-img').src = src;
	document.getElementById('modal-overlay').classList.add('open');
}
export function closeLightbox() {
	document.getElementById('modal-overlay').classList.remove('open');
}

// -- Autoplay fallback: play button in chat header -----------
// Shown when the browser blocks audio.play() (NotAllowedError).
// One click as user gesture is enough to start all blocked streams.
export function showPlayButton(pid) {
	const id = 'play-btn-' + pid;
	if (document.getElementById(id)) return; // already present

	const btn = document.createElement('button');
	btn.id = id;
	btn.className = 'btn btn-primary btn-sm';
	btn.textContent = '▶ Start audio';
	btn.onclick = () => {
		// Start all blocked audio elements within one user gesture
		import('./state.js').then(({ state }) => {
			Object.values(state.connections).forEach(c => {
				c.audio?.play().catch(() => { });
			});
		});
		btn.remove();
	};

	document.getElementById('chat-header').appendChild(btn);
}

// -- Prompt --------------------------------------------------
export function createPrompt(data, callbackFun) {
	let promptId;
	if (data?.promptId) promptId = data.promptId;
	else promptId = ++promptIdIndex;
	const pm = document.createElement('div');
	pm.className = "prompt-modal";
	pm.dataset.promptId = promptId;
	if (data.targetWidth){
		pm.style.width = data.targetWidth;
	}
	const pmCloseBtn = document.createElement('button');
	pmCloseBtn.className = "btn btn-sm btn-circ prompt-modal-close-btn";
	pmCloseBtn.innerHTML = '<span class="material-icons font-inherit" translate="no">close</span>';
	pmCloseBtn.onclick = () => { closePrompt(pm); };
	pm.appendChild(pmCloseBtn);
	const pmBody = document.createElement('div');
	pmBody.className = "prompt-modal-content";
	const dataCollector = [];
	if (data?.contentHtml){
		pmBody.innerHTML = data.contentHtml;
	}else if (data?.contentForm){
		/* example: [
			{type: "section-header", value: "Section Header"},
			{type: "info-text", value: "Info Text"},
			{type: "input", name: "input", value: "hello world"},
			{type: "checkbox", name: "ok", uiName: "ok?", value: false}
		] */
		const form = document.createElement("form");
		data.contentForm.forEach((field) => {
			const fieldEle = document.createElement("field");
			fieldEle.className = "field";
			const type = field.type || "input";
			if ((field.uiName ?? field.name) && !field.skipLabel){
				const label = document.createElement("label");
				label.textContent = field.uiName ?? field.name;
				//label.htmlFor = field.name;
				fieldEle.appendChild(label);
			}
			let inputEle;
			switch (type) {
				case 'section-header':
					inputEle = document.createElement("h3");
					inputEle.textContent = field.value;
					break;
				case 'info-text':
					inputEle = document.createElement("p");
					inputEle.textContent = field.value;
					break;
				case 'input':
				case 'text':
				case 'password':
				case 'url':
				case 'number':
					inputEle = document.createElement("input");
					inputEle.type = (type == "input")? "text" : type;
					inputEle.value = field.value;
					dataCollector.push(() => {
						let val = (type == "number")? +inputEle.value : inputEle.value;
						return [field.name, val];
					});
					break;
				case 'checkbox':
				case 'boolean':
					inputEle = document.createElement("input");
					inputEle.type = "checkbox";
					inputEle.checked = !!field.value;
					fieldEle.classList.add("flex-group");
					dataCollector.push(() => {
						return [field.name, !!inputEle.checked];
					});
					break;
				case 'select':
					inputEle = document.createElement("select");
					field.selectOptions?.forEach((o, index) => {
						//{name: "My Option", value: "my_opt"}
						const so = document.createElement("option");
						so.textContent = o.name || index;
						so.value = o.value ?? index;
					});
					inputEle.value = field.value;
					dataCollector.push(() => {
						return [field.name, inputEle.value];
					});
					break;
				case 'datetime':
				case 'datetime-local':
					inputEle = document.createElement("input");
					inputEle.type = "datetime-local";
					inputEle.value = _convertIsoToInputDate(field.value);
					dataCollector.push(() => {
						return [field.name, _convertInputToIsoDate(inputEle.value)];
					});
					break;
				default:
					break;
			}
			if (field.name) inputEle.name = field.name;
			if (field.disabled) inputEle.disabled = true;
			fieldEle.appendChild(inputEle);
			form.appendChild(fieldEle);
		});
		pmBody.appendChild(form);
	}else{
		pmBody.innerHTML = "<p>Hello World</p>";
	}
	pm.appendChild(pmBody);
	const buttons = data?.buttons || ['ok'];  //'ok', 'cancel', {...}
	const buttonBox = buttons?.length? document.createElement("div") : null;
	const submitFun = function(eventName, eventData){
		if (callbackFun) callbackFun(eventName, eventData);
		closePrompt(pm);
	}
	buttons.forEach((btn) => {
		const btnEle = document.createElement("button");
		btnEle.className = "btn btn-sm";
		if (btn == 'ok'){
			btnEle.textContent = "Ok";
			btnEle.classList.add('btn-primary');
			btnEle.onclick = function(){
				let data = Object.fromEntries(dataCollector.map(fn => fn()));
				submitFun(btn, data);
			};
		}else if (btn == 'cancel'){
			btnEle.textContent = "Cancel";
			btnEle.classList.add('btn-ghost');
			btnEle.onclick = function(){ submitFun(btn); };
		}else if (typeof btn == 'object'){
			//{name: "My Button", value: "event_name"}
			btnEle.textContent = btn.name || "Button";
			if (btn.addClass) btnEle.classList.add(btn.addClass);
			btnEle.onclick = function(){
				let data = Object.fromEntries(dataCollector.map(fn => fn()));
				submitFun(btn.value, data);
			};
		}else{
			btnEle.textContent = btn;
			btnEle.onclick = function(){ submitFun(btn); };
		}
		buttonBox.appendChild(btnEle);
	});
	if (buttonBox){
		buttonBox.className = "field btn-row";
		buttonBox.style.cssText = "margin: 10px 8px; justify-content: center;";
		pm.appendChild(buttonBox);
	}
	uiElements.promptModalOverlay.appendChild(pm);
	uiElements.promptModalOverlay.classList.add("open");
	return pm;
}
export function closePrompt(promptIdOrEle) {
	let pm;
	if (typeof promptIdOrEle == "string") {
		pm = uiElements.promptModalOverlay.querySelector("[data-prompt-id='" + promptIdOrEle + "']");
	}else{
		pm = promptIdOrEle;
	}
	if (pm){
		//const TRANSITION_MS = 0; // must match transition duration in main.css
		pm.remove();
		if (uiElements.promptModalOverlay.children.length == 0){
			uiElements.promptModalOverlay.classList.remove("open");
		}
	}
}
var promptIdIndex = 0;

function _convertIsoToInputDate(isoDate){
	if (!isoDate) return "";
    const date = new Date(isoDate);
    //NOTE: we compensate for the local time offset
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
function _convertInputToIsoDate(inputDate){
	if (!inputDate) return null;
	//NOTE: "yyyy-MM-ddTHH:mm" is a valid format for new Date()
    return new Date(inputDate).toISOString();
}

// -- Bandwidth stats -----------------------------------------
export function startStatsLoop() {
	clearInterval(state.statsIntervalId);
	state.statsIntervalId = setInterval(updateStats, 1000);
}
export function stopStatsLoop() {
	clearInterval(state.statsIntervalId);
}

async function updateStats() {
	let totalAudio = 0;

	for (const [pid, c] of Object.entries(state.connections)) {
		let audioKbps = 0;

		if (c.call?.peerConnection) {
			const stats = await c.call.peerConnection.getStats();
			let currentTs = Date.now();
			let newAudio = 0;

			stats.forEach(s => {
				const isAudio = s.kind === 'audio' || s.mediaType === 'audio';
				if (isAudio && s.type === 'outbound-rtp') {	newAudio += (s.bytesSent ?? 0);	}
				if (isAudio && s.type === 'inbound-rtp') { newAudio += (s.bytesReceived ?? 0); }
				currentTs = s.timestamp; //more precise TS?
			});

			const prev = state.prevBytesMap[pid] ?? { audio: 0, ts: currentTs };
			const dt = (currentTs - prev.ts) / 1000;
			const deltaBytes = Math.max(0, newAudio - prev.audio);
			audioKbps = dt > 0 ? (deltaBytes * 8) / (dt * 1000) : 0;
			state.prevBytesMap[pid] = { audio: newAudio, ts: currentTs };

			// Update per-peer kbps in room peer list
			if (state.room?.peers) {
				const peer = state.room.peers.find(p => p.id === pid);
				updatePeerBandwidthCounter(peer, audioKbps);
			}
		}
		totalAudio += audioKbps;
	}

	//const MAX_BW = +uiElements.targetBwMax.value;
	//document.getElementById('bw-audio-bar').style.width = Math.min(100, totalAudio / MAX_BW * 100) + '%';
	document.getElementById('bw-audio-val').textContent = totalAudio.toFixed(1) + ' kb/s';

	state.sparklineData.push(totalAudio);
	if (state.sparklineData.length > 60) state.sparklineData.shift();
	drawSparkline();
}

export function drawSparkline() {
	if (!isSidebarPanelOpen("panel-bw")) return;	//skip if panel is closed

	const canvas = uiElements.sparklineCanvas;
	const ctx = canvas.getContext('2d');
	const w = canvas.offsetWidth || 268;
	const h = 30;
	canvas.width = w;
	ctx.clearRect(0, 0, w, h);

	const data = state.sparklineData;
	//const max = Math.max(...data, 50);
	const max = +uiElements.targetBwMax.value || 300;

	ctx.beginPath();
	ctx.strokeStyle = '#00d4ff';
	ctx.lineWidth = 1.5;
	ctx.lineJoin = 'round';
	data.forEach((v, i) => {
		const x = (i / (data.length - 1)) * w;
		const y = h - (v / max) * (h - 4) - 2;
		i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
	});
	ctx.stroke();
	ctx.lineTo(w, h); ctx.lineTo(0, h);
	ctx.closePath();
	ctx.fillStyle = 'rgba(0,212,255,0.07)';
	ctx.fill();
}

// -- Helpers -------------------------------------------------
export function formatBytes(b) {
	if (b < 1024) return b + ' B';
	if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
	return (b / (1024 * 1024)).toFixed(2) + ' MB';
}

// -- Track and restore UI states -----------------------------

function trackAndRestoreUiStates() {
	//audio state
	const audioStatesToTrack = [
		{ id: 'mic-select', type: 'select' },
		{ id: 'sink-select', type: 'select' },
		{ id: 'sample-rate-select', type: 'select', restoreAtStartUp: true },
		{ id: 'bitrate-select', type: 'select', restoreAtStartUp: true },
		{ id: 'chk-ec', type: 'checkbox', restoreAtStartUp: true },
		{ id: 'chk-ns', type: 'checkbox', restoreAtStartUp: true },
		{ id: 'chk-vi', type: 'checkbox', restoreAtStartUp: true },
		{ id: 'chk-agc', type: 'checkbox', restoreAtStartUp: true },
		{ id: 'mic-custom-gain', type: 'input', restoreAtStartUp: true,
			onrestore: function(inputEle, rVal){
				inputEle.dispatchEvent(new Event('input', {bubbles: false}));
			}
		},
		{ id: 'audio-buffer-settings', type: 'select', restoreAtStartUp: true }
	];
	//server states
	const serverStatesToTrack = [
		{ id: 'signaling-preset', type: 'select', restoreAtStartUp: true },
		{ id: 'custom-server-url', type: 'input', restoreAtStartUp: true }
	]
	//room states
	const roomStatesToTrack = [
		{ id: 'room-username', type: 'input', restoreAtStartUp: true },
		{ id: 'room-name', type: 'input', restoreAtStartUp: true },
		{ id: 'room-password', type: 'input', restoreAtStartUp: true }
	];
	//bandwidth states
	const bwStatesToTrack = [
		{ id: 'kbps-target-max', type: 'input', restoreAtStartUp: true }
	];

	[audioStatesToTrack, serverStatesToTrack, roomStatesToTrack, bwStatesToTrack]
	.forEach((s) => assignStateTracker(s));
}
function assignStateTracker(statesToTrack){
	statesToTrack.forEach((thisState) => {
		var inputEle = getUiElementAndOptionallyRestore(thisState);
		registerChangeListener(thisState, inputEle);
	});
}

//listener and restore function
function getUiElementAndOptionallyRestore(thisState) {
	return (thisState.restoreAtStartUp) ?
		restoreElementState(thisState) : document.getElementById(thisState.id);
}
function registerChangeListener(thisState, inputEle) {
	inputEle?.addEventListener('change', function () {
		switch (thisState.type) {
			case 'input':
			case 'select':
				saveState(thisState.id, this.value);
				break;
			case 'checkbox':
				saveState(thisState.id, this.checked);
				break;
			default:
				saveState(thisState.id, this.textContent);
				break;
		}
	});
}
export function restoreElementState(thisState) {
	var inputEle = document.getElementById(thisState.id);
	if (!inputEle) {
		console.error("Failed to restore UI state. Element not found: " + thisState.id);
		return;
	}
	var restoreState = loadState(thisState.id);
	if (restoreState != null) {
		switch (thisState.type) {
			case 'input':
				inputEle.value = restoreState;
				break;
			case 'select':
				if (Object.values(inputEle.options || {})?.find(o => o.value == restoreState)){
					inputEle.value = restoreState;
				}else{
					console.warn("Previously selected value for '" + thisState.id + "' was not available:", restoreState);
				}
				break;
			case 'checkbox':
				inputEle.checked = restoreState;
				break;
			default:
				inputEle.textContent = restoreState;
				break;
		}
		if (typeof thisState.onrestore == "function"){
			thisState.onrestore(inputEle, restoreState);
		}
	}
	return inputEle;
}
