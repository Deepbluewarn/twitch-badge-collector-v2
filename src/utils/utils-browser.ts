import { Logger } from './logger';

// export const isFirefoxAddon = async () => {
//     if (typeof browser !== 'undefined' && typeof browser.runtime.getBrowserInfo !== 'undefined') {
//         const info = await browser.runtime.getBrowserInfo();
//         return info.name === 'Firefox';
//     }
//     return false;
// }

export const addStorageUpdateListener = (cb: (key: string, newValue: any) => void) => {
    browser.storage.local.onChanged.addListener(changes => {
        for (const key in changes) {
            const oldValue = changes[key].oldValue;
            const newValue = changes[key].newValue;
            
            if (oldValue !== newValue) {
                Logger('Storage Updated', `${key}: ${newValue}`);
                cb(key, newValue);
            }
        }
    });
}