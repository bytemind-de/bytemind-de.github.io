// ============================================================
//   NoCord-P2P -- device.js
//   Functions to interact with the device API like wake-lock.
// ============================================================

import { state } from './state.js';
import { toast } from './ui.js';

let screenUpdateTimer = null;
let screenUpdateBackoffDelay = 500;

let wakeLock = null;
let tryAutoEnableWakeLock = false;

// -- Setup ------------------------------
export async function setupDeviceModule(){
  //run once:
  updateScreenStateAsync();
}

// -- Screen state updates
export function updateScreenStateAsync() {
	clearTimeout(screenUpdateTimer);
	screenUpdateTimer = setTimeout(() => {
		updateScreenState();
	}, screenUpdateBackoffDelay);
}
function updateScreenState() {
	state.screen.updates++;
	state.screen.viewport = {
		width: window.innerWidth,
		height: window.innerHeight,
		safeAreas: getDisplaySafeAreas()
	};
	state.screen.device = {
		width: window.screen.width,
		height: window.screen.height,
		orientation: (window.matchMedia("(orientation: portrait)").matches?
			"portrait" : "landscape")
	};
	state.screen.isVisible = (document.visibilityState === "visible");
	state.screen.wakeLock = !!wakeLock;
	state.screen.fullscreen = document.fullscreenEnabled?
		!!document.fullscreenElement : null;
}
function getDisplaySafeAreas() {
	//safe-areas
  	const styles = window.getComputedStyle(document.documentElement);
	return {
		top: +styles.getPropertyValue('--safe-area-top')?.replace("px", ""),
		bottom: +styles.getPropertyValue('--safe-area-bottom')?.replace("px", ""),
		left: +styles.getPropertyValue('--safe-area-left')?.replace("px", ""),
		right: +styles.getPropertyValue('--safe-area-right')?.replace("px", "")
	};
}

// -- Toggle fullscreen ---------------------------------------
export async function toggleFullscreen() {
	try {
		if (!document.fullscreenElement){
			await requestFullScreen();
			toast("Full-screen mode enabled", "info");
		}else{
			await exitFullScreen();
			toast("Full-screen mode disabled", "info");
		}
	} catch (err) {
		toast("Full-screen mode error: " + (err?.message || err?.name), "error");
	}
}

// -- Toggle screen wake-lock ---------------------------------
export async function toggleScreenWakeLock() {
	try {
		if (wakeLock){
			await releaseWakeLock();
			toast("Wake-Lock is disabled", "info");
			tryAutoEnableWakeLock = false;
		}else{
			await requestWakeLock();
			toast("Wake-Lock is active", "info");
			tryAutoEnableWakeLock = true;
		}
	} catch (err) {
		toast("Wake-Lock error: " + (err?.message || err?.name), "error");
		tryAutoEnableWakeLock = false;
	}
}
function updateWakeLockButtonState() {
	const toggle = document.getElementById('toggle-wake-lock-btn');
	if (wakeLock){
		toggle.classList.add("active");
	}else{
		toggle.classList.remove("active");
	}
	state.screen.wakeLock = !!wakeLock;
}

/**
 * Activate Screen Wake-Lock.
 * Should be triggered by user interaction.
 */
export const requestWakeLock = async function() {
    //already active?
    if (wakeLock !== null) {
        console.log('Wake Lock ist bereits aktiv.');
        return;
    }
    if ('wakeLock' in navigator) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');

            //event listener for automatic release (e.g. tab switch)
            wakeLock.addEventListener('release', () => {
                console.log('Wake Lock was released.');		//DEBUG
                wakeLock = null;
				updateWakeLockButtonState();
            });
            console.log('Wake-Lock is active.');	//DEBUG
			updateWakeLockButtonState();

        } catch (err) {
			console.error('Wake-Lock error:', err);
            //reset and throw (e.g. low-power rejection etc.)
            wakeLock = null;
			updateWakeLockButtonState();
            throw err;
        }
    } else {
		updateWakeLockButtonState();
        throw new Error('Screen Wake-Lock API is not supported by browser.');
    }
};
/**
 * Disable Wake-Lock manually.
 */
export const releaseWakeLock = async function() {
	if (wakeLock !== null) {
		try {
			await wakeLock.release();
			wakeLock = null;
		} catch (err) {
			console.error('Wake-Lock error:', err);
			wakeLock = null;
			updateWakeLockButtonState();
			throw err;
		}
	}
	updateWakeLockButtonState();
};
/**
 * Re-enable Wake-Lock when tab becomes visible again.
 */
document.addEventListener('visibilitychange', async () => {
	//console.log("visibilitychange:", document.visibilityState);		//DEBUG
	if (tryAutoEnableWakeLock && document.visibilityState === 'visible') {
		if (wakeLock == null) await requestWakeLock();
		updateWakeLockButtonState();
	}
	updateScreenStateAsync();
});

/**
 * Activate fullscreen mode for element or page.
 * Should be triggered by user interaction.
 */
export const requestFullScreen = async function(element = document.documentElement) {
    try {
        if (element.requestFullscreen) {
            await element.requestFullscreen();
        } else if (element.webkitRequestFullscreen) { /* Safari Support */
            await element.webkitRequestFullscreen();
        } else {
            throw new Error('Full Screen API is not supported.');
        }
    } catch (err) {
        throw err;
    }
};
/**
 * Quit fullscreen.
 */
export const exitFullScreen = async function() {
    if (document.fullscreenElement) {
        await document.exitFullscreen();
    }
};
//track fullscreen event
document.addEventListener('fullscreenchange', () => {
	updateScreenStateAsync();
});

//-- Device orientation tracking
window.matchMedia("(orientation: portrait)").addEventListener("change", e => {
    //const portrait = e.matches;
    updateScreenStateAsync();
});
