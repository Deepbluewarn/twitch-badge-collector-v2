import { ChatInterface } from "twitch-badge-collector-cc";
import browser from "webextension-polyfill";

console.log("[extension] Remote Content Script loaded.");

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

    browser.storage.local.get('SOC').then(res => {
      const map = new Map<string, ChatInterface.MessageInterface[]>(res.SOC);

      let chatList = map.get(channel.value);

      // 채팅 중복 방지를 위해 직전 채팅의 time stamp 와 같으면 추가하지 않음.

      if(typeof chatList !== 'undefined' && chat.userstate?.["tmi-sent-ts"] === chatList[0].userstate?.["tmi-sent-ts"]){
        console.log('[extension] remoteContentScript: 같은 채널에서 중복된 채팅입니다. : ', chat);
      }

      chat.soc = true;
      
      if(typeof chatList === 'undefined'){
        chatList = [chat];
      }else{
        chatList.push(chat);
      }

      if(chatList.length > 100){
        chatList.shift();
      }

      map.set(channel.value, chatList);

      browser.storage.local.set({SOC: Array.from(map.entries())});
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

    if(typeof channel === 'undefined' || channel.value === ''){
      return;
    }
    
    browser.storage.local.get('SOC').then(res => {
      const map = new Map<string, ChatInterface.MessageInterface[]>(res.SOC);

      window.postMessage({
        sender: 'extension',
        type: 'SOC_LIST_RESPONSE', // Save Old Chat (SOC)
        value: map.get(channel.value)
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

window.postMessage({
  sender: 'extension',
  type: 'CONTENT_SCRIPT_READY',
  value: null
})