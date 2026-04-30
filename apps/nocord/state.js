// ============================================================
//   NoCord-P2P -- state.js
//   Central shared application state.
//   All modules import this object and mutate it directly.
// ============================================================

export const state = {
	appVersion: "0.9.0",
	// -- Invite overwrites ---------------------------------------
	// {server, roomId, meetTime}
	inviteEvent: null,

	// -- Room ----------------------------------------------------
	// { id, name, isHost, myName, peers: [{id, name, conn?}], hostConn? }
	room: null,

	// -- PeerJS --------------------------------------------------
	peer: null,				// Peer instance
	myId: null,				// own peer ID (string)

	// -- Connections ---------------------------------------------
	connections: {},		// {peerId: { call, conn, stream, audio }}
	pendingConnections: new Map(),	// {peerId: {conn, connTimeout}}

	// -- SEPIA Audio Pipeline ------------------------------------
	sepiaProcessor: null,   // SepiaFW.webAudio.Processor instance
	audioProcessorOpen: 0,
	audioSession: {
		//reset when a new processor is created (see below)
	},
	sepiaReady: false,		// true once init callback has fired
	sepiaPaused: false,		// true when processor is stopped but not released
	localStream: null,		// processor.destinationNode.stream -> PeerJS
	activeCallCount: 0,		// processor runs as long as this is > 0

	// -- Bandwidth tracking --------------------------------------
	sparklineData: new Array(60).fill(0),
	statsIntervalId: null,
	// peerId -> { audio: bytes, data: bytes, ts: ms }
	prevBytesMap: {},

	// -- Screen -------------------------------------------------
	screen: {
		updates: 0,
		viewport: {},
		device: {},
		isVisible: null,
		wakeLock: null,
		fullscreen: null
	},

	// -- Other --------------------------------------------------
	isPWA: window.matchMedia('(display-mode: standalone)').matches
};

window.state = state; //for debugging

// -- Helper functions

state.getUrlParameter = function(name) {
	let params = new URLSearchParams(document.location.search);
	let val = params.get(name);
	if (!!val?.match(/^(\d+)$/i)) return +val;
	else if (val?.match(/^(true)$/i)) return true;
	else return val;
}

state.getAppStatusOverview = function() {
	const status = {
		appVersion: state.appVersion,
		signaling: {
			connected: !!state.peer && !state.peer.destroyed && !state.peer.disconnected,
			myId: state.myId || null,
		},
		room: {
			active: !!state.room,
			isHost: state.room?.isHost ?? false,
			name: state.room?.name || null,
			memberCount: state.room?.peers?.length ?? 0,
			hostConnOpen: !state.room?.isHost ? (state.room?.hostConn?.open ?? false) : null,
		},
		connections: {
			dataChannels: Object.values(state.connections).filter(c => c.conn?.open).length,
			activeCalls: Object.values(state.connections).filter(c => c.call).length,
			pending: state.pendingConnections.size,
		},
		audio: {
			streams: Object.values(state.connections).filter(c => c.stream).length,
			blocked: Object.values(state.connections).filter(c => c.audio?.paused && c.stream).length,
			processorsOpen: state.audioProcessorOpen
		},
		screen: state.screen,
		isPWA: state.isPWA
	};
	// Derived warnings
	status.warnings = [];
	if (!status.signaling.connected)
		status.warnings.push('Not connected to signaling server');
	if (status.room.active && !status.room.isHost && !status.room.hostConnOpen)
		status.warnings.push('Host connection lost');
	if (status.connections.pending > 0)
		status.warnings.push(status.connections.pending + ' pending connection(s)');
	if (status.audio.blocked > 0)
		status.warnings.push(status.audio.blocked + ' audio stream(s) blocked by browser');
	return status;
}

state.getAllPeerConnections = function() {
	let peerCons = {};
	Object.values(state.peer?.connections || []).forEach((pc) => {
		pc?.forEach((ci) => {
			let pcs = peerCons[ci.peer];
			if (!pcs){
				pcs = [];
				peerCons[ci.peer] = pcs;
			}
			pcs.push({
				type: ci.type,
				open: ci.open,
				label: ci.label
			});
		});
	});
	return peerCons;
};

// -- Session statistics

export const resetAudioSession = () => {
	state.audioSession = {
		maxRms: null,
		rmsWarningSent: false,
		gain: null,
		inputDevice: '',
		outputDevice: '',
		activeConstraints: [],
		channelCount: null,
		sourceSamplerate: null,
		targetSampleRate: null,
		resamplingMode: undefined,
		resamplerBufferSize: undefined,
		resampleQuality: undefined,
		outputBufferSize: undefined,
		prebufferThreshold: undefined,
		expectedLatencyMs: undefined,
		outputBufferHealth: undefined,
		frameTimeMs: null,
		jitter: null,
		processErrors: 0,
		released: false	 //or: initError
	};
};

// -- Store and load states

export const saveState = (key, value) => {
	try {
		const serializedValue = JSON.stringify(value);
		//NOTE: for now we use session storage, might change later
		localStorage.setItem(key, serializedValue);
	} catch (error) {
		console.error("Failed to save state. Error:", error);
	}
};
export const loadState = (key) => {
	try {
		//NOTE: for now we use session storage, might change later
		const data = localStorage.getItem(key);
		if (data === null) return null;
		//convert back to JSON or plain string
		return JSON.parse(data);
	} catch (error) {
		console.error("Failed to load state. Error:", error);
		return null;
	}
};