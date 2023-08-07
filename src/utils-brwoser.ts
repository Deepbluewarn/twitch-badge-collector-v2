import browser from 'webextension-polyfill';

export const isFirefoxAddon = async () => {
    if (typeof browser !== 'undefined' && typeof browser.runtime.getBrowserInfo !== 'undefined') {
        const info = await browser.runtime.getBrowserInfo();
        return info.name === 'Firefox';
    }
    return false;
}