import browser from "webextension-polyfill";
import { BroadcastChannel, createLeaderElection } from "broadcast-channel";
import {
  ArrayFilterListInterface,
  ArrayFilterMessageInterface,
} from "./interfaces/filter";
import { nanoid } from "nanoid";

const filterChannel: BroadcastChannel<ArrayFilterMessageInterface> =
  new BroadcastChannel("ArrayFilter");
const messageIdChannel: BroadcastChannel<string> = new BroadcastChannel(
  "MessageId"
);
const extensionVersionChannel: BroadcastChannel<string> = new BroadcastChannel('ExtensionVersion');
const msgId = nanoid();

messageIdChannel.postMessage(msgId);
extensionVersionChannel.postMessage(browser.runtime.getManifest().version);

browser.storage.local.get("filter").then((res) => {
  const filter: ArrayFilterListInterface[] = res.filter;
  if (filter) {
    filterChannel.postMessage({
      from: "extension",
      filter: filter,
      msgId: msgId,
    });
  }
});

filterChannel.onmessage = (msg) => {
  if (msg.from === "extension") return;
  if (msgId !== msg.msgId) return;

  browser.storage.local.set({ filter: msg.filter });
};

window.postMessage({
  sender: 'extension',
  type: 'CONTENT_SCRIPT_READY'
}, '*')

window.onmessage = (event: MessageEvent) => {
  if (event.source != window)
      return;

  if (event.data.type && (event.data.sender == "wtbc")) {
    if(event.data.type === "CHATSAVER_REQUEST_CHANNEL_INFO"){
      browser.runtime.sendMessage({
        from:"settingContentScript", 
        type:"CHATSAVER_REQUEST_CHANNEL_INFO",
        value: event.data.value
      });
    }else if(event.data.type === 'CHATSAVER_REQUEST_CHAT_LIST'){
      browser.runtime.sendMessage({
        from:"settingContentScript", 
        type:"CHATSAVER_REQUEST_CHAT_LIST",
        value: event.data.value
      });
    }
  }
};

browser.runtime.onMessage.addListener((message, sender) => {
  if (message.from === 'background' && message.type === 'CHATSAVER_RESPONSE_CHANNEL_INFO') {
    window.postMessage({
      sender: 'extension',
      type: 'CHATSAVER_RESPONSE_CHANNEL_INFO',
      value: message.value
    }, '*');
  } else if (message.from === 'background' && message.type === 'CHATSAVER_RESPONSE_CHAT_LIST') {
    window.postMessage({
      sender: 'extension',
      type: 'CHATSAVER_RESPONSE_CHAT_LIST',
      value: message.value
    }, '*');
  }
});