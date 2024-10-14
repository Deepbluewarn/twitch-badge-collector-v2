import browser from "webextension-polyfill";

export function addHistoryStateListener(hostname: string, cb: () => void) {
    let currentPath = '';

    browser.runtime.onMessage.addListener((message) => {
        if (message.action === "onHistoryStateUpdated") {
            if (window.location.hostname !== hostname) return;
            if (currentPath === window.location.pathname) return;
    
            currentPath = window.location.pathname;
    
            cb();
        }
    });
}
