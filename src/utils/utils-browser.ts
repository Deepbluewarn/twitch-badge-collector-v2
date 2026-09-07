import { Logger } from './logger';

// export const isFirefoxAddon = async () => {
//     if (typeof browser !== 'undefined' && typeof browser.runtime.getBrowserInfo !== 'undefined') {
//         const info = await browser.runtime.getBrowserInfo();
//         return info.name === 'Firefox';
//     }
//     return false;
// }

// oldValue를 넘기는 이유: "값이 바뀌었다"와 "키가 처음 생겼다"를 구분해야 하는
// 구독자가 있다. 기본값 backfill(background ensureDefaultSettings)도 onChanged를
// 발화시키므로, 사용자의 실제 조작에만 반응해야 하는 쪽은 oldValue로 걸러야 한다.
export const addStorageUpdateListener = (
    cb: (key: string, newValue: any, oldValue: any) => void,
) => {
    browser.storage.local.onChanged.addListener(changes => {
        for (const key in changes) {
            const oldValue = changes[key].oldValue;
            const newValue = changes[key].newValue;

            if (oldValue !== newValue) {
                Logger('Storage Updated', `${key}: ${newValue}`);
                cb(key, newValue, oldValue);
            }
        }
    });
}