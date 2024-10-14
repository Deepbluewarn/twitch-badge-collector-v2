import browser from 'webextension-polyfill';
import { Logger } from './logger';

export const isFirefoxAddon = async () => {
    if (typeof browser !== 'undefined' && typeof browser.runtime.getBrowserInfo !== 'undefined') {
        const info = await browser.runtime.getBrowserInfo();
        return info.name === 'Firefox';
    }
    return false;
}

export const addStorageUpdateListener = (cb: (key: string, newValue: any) => void) => {
    browser.storage.onChanged.addListener((changed, areaName) => {
        if (areaName !== "local") return;
        
        for (const key in changed) {
            const newValue = changed[key].newValue;
            Logger('Storage Updated', `${key}: ${newValue}`);
            cb(key, newValue);
        }
    });
}