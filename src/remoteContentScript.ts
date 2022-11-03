import browser from "webextension-polyfill";

console.log('[extension] Remote Content Script loaded.')
window.onmessage = (event: MessageEvent) => {
    if (event.source != window)
      return;

    if(event.data.sender === 'wtbc' && event.data.type === 'CHATSAVER_RESPONSE_CHANNEL_INFO'){
        browser.runtime.sendMessage({
            from:"remoteContentScript", 
            type:"CHATSAVER_RESPONSE_CHANNEL_INFO",
            value: event.data.value
        });
    }else if(event.data.sender === 'wtbc' && event.data.type === 'CHATSAVER_RESPONSE_CHAT_LIST'){
        browser.runtime.sendMessage({
            from:"remoteContentScript", 
            type:"CHATSAVER_RESPONSE_CHAT_LIST",
            value: event.data.value
        });
    }
}

browser.runtime.onMessage.addListener((message, sender) => {
    if (message.from === 'background' && message.type === 'CHATSAVER_REQUEST_CHANNEL_INFO') {
        window.postMessage({
            sender: 'extension',
            type: 'CHATSAVER_REQUEST_CHANNEL_INFO'
        }, '*');
    }else if (message.from === 'background' && message.type === 'CHATSAVER_REQUEST_CHAT_LIST'){
        window.postMessage({
            sender: 'extension',
            type: 'CHATSAVER_REQUEST_CHAT_LIST',
            value: message.value
        }, '*');
    }
});