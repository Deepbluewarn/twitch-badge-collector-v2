import browser from "webextension-polyfill";
import defaultFilter from "../defaultFilters";
import { FilterInterface } from "twitch-badge-collector-cc";
import Logger from "@utils/logger";

browser.storage.local.set({SOC: null}).then(() => {
  console.debug('[tbc-extension] SOC 초기화.');
});

browser.runtime.onInstalled.addListener(function (details) {
  if (details.reason === "install") {
    browser.storage.local.set({ filter: defaultFilter });

    browser.tabs.create({
      url: browser.runtime.getURL(`src/welcome/welcome.html`),
    });
  }
  
  browser.storage.local.get(['miniChatTime']).then(res => {
    browser.storage.local.set({'chatTime': res.miniChatTime ?? 'off'});
  })

  browser.storage.local.get(["filter"]).then((res) => {
    const filter: FilterInterface.ArrayFilterListInterface[] = res.filter;
    
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
      "chatDisplayMethod",
      "position",
      "pointBoxAuto",
      "darkTheme",
      "chatTime",
      "maximumNumberChats",
      "advancedFilter",
      "miniLanguage",
      "miniFontSize",
      "miniChatTime",
    ])
    .then((res) => {
      browser.storage.local.set({
        chatDisplayMethod: res.chatDisplayMethod
          ? res.chatDisplayMethod
          : "local",
        position: res.position ? res.position : "up",
        pointBoxAuto: res.pointBoxAuto ? res.pointBoxAuto : "on",
        darkTheme: res.darkTheme ? res.darkTheme : "off",
        chatTime: res.chatTime ? res.chatTime : "off",
        maximumNumberChats: res.maximumNumberChats ? res.maximumNumberChats : (import.meta.env.VITE_MAXNUMCHATS_DEFAULT as unknown) as number,
        advancedFilter: res.advancedFilter ? res.advancedFilter : "off",
        platform: res.platform ? res.platform : "twitch",
        miniLanguage: res.miniLanguage ? res.miniLanguage : navigator.language,
        miniFontSize: res.miniFontSize ? res.miniFontSize : "default",
        miniChatTime: res.miniChatTime ? res.miniChatTime : "on",
      });
    });
});

browser.webNavigation.onHistoryStateUpdated.addListener(function () {
  Logger("background onHistoryStateUpdated", 'onHistoryStateUpdated');
  browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
    Logger("background onHistoryStateUpdated tabs", JSON.stringify(tabs));
    
    if (tabs.length === 0) {
      Logger("background onHistoryStateUpdated", '열린 탭이 없습니다.');
      return;
    }

    const id = tabs[0].id;
    const url = tabs[0].url;
    if (!(id && url)) {
      Logger("background onHistoryStateUpdated", 'id 또는 url이 없습니다.');
      return;
    }
    browser.tabs.sendMessage(id, { action: "onHistoryStateUpdated", url: url });

    Logger("background onHistoryStateUpdated", url);
  });
});
