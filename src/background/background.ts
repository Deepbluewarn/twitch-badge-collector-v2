import browser from "webextension-polyfill";
import defaultFilter from "../defaultFilters";

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
        miniLanguage: res.miniLanguage ? res.miniLanguage : navigator.language,
        miniFontSize: res.miniFontSize ? res.miniFontSize : "default",
        miniChatTime: res.miniChatTime ? res.miniChatTime : "on",
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
