import browser from "webextension-polyfill";
import defaultFilter from "../defaultFilters";
import { ArrayFilterListInterface } from "@interfaces/filter";

browser.runtime.onInstalled.addListener(function (details) {
  if (details.reason === "install") {
    browser.storage.local.set({ filter: defaultFilter });

    browser.tabs.create({
      url: browser.runtime.getURL(`src/welcome/welcome.html`),
    });
  }
  
  browser.storage.local.get(['miniChatTime']).then(res => {
    browser.storage.local.set({'chatTime': res.miniChatTime === true ? 'on' : 'off'});
  })

  browser.storage.local.get(["filter"]).then((res) => {
    const filter: ArrayFilterListInterface[] = res.filter;
    
    if (!filter) {
      browser.storage.local.set({ filter: defaultFilter });
      return;
    }

    const newTwitchFilter = filter.map((f) => {
      if (!f.platform) {
        f.platform = "twitch";
      }
      return f;
    });
    browser.storage.local.set({ filter: newTwitchFilter });
  });

  browser.storage.local
    .get([
      "position",
      "pointBoxAuto",
      "darkTheme",
      "chatTime",
      "maximumNumberChats",
      "advancedFilter",
    ])
    .then((res) => {
      browser.storage.local.set({
        position: res.position ? res.position : "up",
        pointBoxAuto: res.pointBoxAuto ? res.pointBoxAuto : "on",
        darkTheme: res.darkTheme ? res.darkTheme : "off",
        chatTime: res.chatTime ? res.chatTime : "off",
        maximumNumberChats: res.maximumNumberChats ? res.maximumNumberChats : (import.meta.env.VITE_MAXNUMCHATS_DEFAULT as unknown) as number,
        advancedFilter: res.advancedFilter ? res.advancedFilter : "off",
        platform: res.platform ? res.platform : "twitch",
      });
    });
});

browser.webNavigation.onHistoryStateUpdated.addListener(function () {
  browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
    
    if (tabs.length === 0) return;

    const id = tabs[0].id;
    const url = tabs[0].url;
    if (!(id && url)) return;

    browser.tabs.sendMessage(id, { action: "onHistoryStateUpdated", url: url });
  });
});
