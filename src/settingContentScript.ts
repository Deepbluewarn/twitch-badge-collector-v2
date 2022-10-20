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
