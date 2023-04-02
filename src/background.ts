import browser from "webextension-polyfill";

const defaultFilter = [
  {
    filterType: "include",
    id: "D3vnlEqK-CNmYHe8zkvIJ",
    filters: [
      {
        category: "badge",
        id: "FFWMIjmuhi_CA1LEqQ54a",
        type: "include",
        value: "5527c58c-fb7d-422d-b71b-f309dcb85cc1",
        badgeName: "Broadcaster",
      },
    ],
  },
  {
    filterType: "include",
    id: "4bb2qQg-CDc9XRWFeeq5O",
    filters: [
      {
        category: "badge",
        id: "GNv9Z1B871ELNn9Dpi0aL",
        type: "include",
        value: "d12a2e27-16f6-41d0-ab77-b780518f00a3",
        badgeName: "Verified",
      },
    ],
  },
  {
    filterType: "include",
    id: "j7jfgsFu6pcqQyqyMkDi8",
    filters: [
      {
        category: "badge",
        id: "zeBtJOVDokIsJnqvR7vKl",
        type: "include",
        value: "3267646d-33f0-4b17-b3df-f923a41db1d0",
        badgeName: "Moderator",
      },
    ],
  },
  {
    filterType: "include",
    id: "c3J9E9R0jz5Xoep0mWqWn",
    filters: [
      {
        category: "badge",
        id: "h8POvmrJvxXFcy_RmeAcB",
        type: "include",
        value: "b817aba4-fad8-49e2-b88a-7cc744dfa6ec",
        badgeName: "VIP",
      },
    ],
  },
];

browser.runtime.onInstalled.addListener(function (details: any) {
  if (details.reason === "install") {
    browser.storage.local.set({ filter: defaultFilter });

    browser.tabs.create({
      url: browser.runtime.getURL(`welcome.html`),
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
        maximumNumberChats: res.maximumNumberChats ? res.maximumNumberChats : (process.env.MAXNUMCHATS_DEFAULT as unknown) as number,
        miniLanguage: res.miniLanguage ? res.miniLanguage : navigator.language,
        miniFontSize: res.miniFontSize ? res.miniFontSize : "default",
        miniChatTime: res.miniChatTime ? res.miniChatTime : "on",
      });
    });
});

browser.webNavigation.onHistoryStateUpdated.addListener(function (details) {
  browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
    if (tabs.length === 0) return;

    let id = tabs[0].id;
    let url = tabs[0].url;
    if (!(id && url)) return;
    browser.tabs.sendMessage(id, { action: "onHistoryStateUpdated", url: url });
  });
});
