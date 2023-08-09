import { ChatInterface } from "twitch-badge-collector-cc";
import browser from "webextension-polyfill";

console.log("[extension] Remote Content Script loaded.");

interface MessageList {
  [key: string]: ChatInterface.MessageInterface[];
}

window.postMessage({
  sender: 'extension',
  type: 'CONTENT_SCRIPT_READY',
  value: null
})

window.addEventListener('message', event=> {
  if (event.source != window) return;

  if (
    event.data.sender === "wtbc" &&
    event.data.type === "CHATSAVER_RESPONSE_CHANNEL_INFO"
  ) {
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
  // Save Old Chat
  if (
    event.data.sender === 'wtbc' &&
    event.data.type === 'SOC_REQUEST'
  ) {
    const channel = event.data.value.channel;
    const chat = event.data.value.message as ChatInterface.MessageInterface;

    if(chat.type === 'system') return;

    if(typeof channel === 'undefined' || channel.value === ''){
      return;
    }

    const key = 'SOC_' + channel.value;

    browser.storage.local.get(key).then(res => {
      let list = res[key] as ChatInterface.MessageInterface[];

      chat.soc = true;

      if(typeof list === 'undefined') {
        list = [chat];
      }else{
        list.push(chat);
      }

      if(list.length > 100){
        list.shift();
      }

      const setObj = {} as MessageList;
      setObj[key] = list;

      browser.storage.local.set(setObj);
    })

    window.postMessage({
      sender: 'extension',
      type: 'SOC_RESPONSE', // Save Old Chat (SOC)
      value: null
    })
  } else if (
    event.data.sender === 'wtbc' &&
    event.data.type === 'SOC_LIST_REQUEST'
  ) {
    const channel = event.data.value.channel;
    const key = 'SOC_' + channel.value;
    
    browser.storage.local.get(key).then(res => {
      window.postMessage({
        sender: 'extension',
        type: 'SOC_LIST_RESPONSE', // Save Old Chat (SOC)
        value: res[key]
      })
    })
  }
})

browser.runtime.onMessage.addListener((message) => {
  if (
    message.from === "extension_setting" &&
    message.type === "CHATSAVER_REQUEST_CHANNEL_INFO"
  ) {
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
