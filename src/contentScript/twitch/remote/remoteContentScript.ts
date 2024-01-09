import browser from "webextension-polyfill";

console.log("[extension] Remote Content Script loaded.");

window.addEventListener('message', event=> {
  if (event.source != window) return;

  if (
    event.data.sender === "wtbc" &&
    event.data.type === "CHATSAVER_RESPONSE_CHANNEL_INFO"
  ) {
    // ChatSaver 채널 목록 요청 4
    // Frame to Extension
    browser.runtime.sendMessage({
      from: "remoteContentScript",
      type: "CHATSAVER_RESPONSE_CHANNEL_INFO",
      value: event.data.value,
    });
  } else if (
    event.data.sender === "wtbc" &&
    event.data.type === "CHATSAVER_RESPONSE_CHAT_LIST"
  ) {
    // Frame to Extension
    browser.runtime.sendMessage({
      from: "remoteContentScript",
      type: "CHATSAVER_RESPONSE_CHAT_LIST",
      value: event.data.value,
    });
  }
})

browser.runtime.onMessage.addListener((message) => {
  if (
    message.from === "extension_setting" &&
    message.type === "CHATSAVER_REQUEST_CHANNEL_INFO"
  ) {
    // ChatSaver 채널 목록 요청 2
    // Extension to Frame
    window.postMessage(
      {
        sender: "extension",
        type: "CHATSAVER_REQUEST_CHANNEL_INFO",
      },
      "*"
    );
  } else if (
    message.from === "extension_setting" &&
    message.type === "CHATSAVER_REQUEST_CHAT_LIST"
  ) {
    // Extension to Frame
    window.postMessage(
      {
        sender: "extension",
        type: "CHATSAVER_REQUEST_CHAT_LIST",
        value: message.value,
      },
      "*"
    );
  }
});

window.postMessage({
  sender: 'extension',
  type: 'CONTENT_SCRIPT_READY',
  value: null
})