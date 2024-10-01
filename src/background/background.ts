import browser from "webextension-polyfill";
import defaultFilter from "../defaultFilters";
import { ArrayFilterListInterface } from "@interfaces/filter";

const OLD_CHZZK_VERIFIED = 'https://static-cdn.jtvnw.net/jtv_user_pictures/verified.png';
const NEW_CHZZK_VERIFIED = 'https://ssl.pstatic.net/static/nng/glive/resource/p/static/media/icon_official.a53d1555f8f4796d7862.png';

browser.runtime.onInstalled.addListener(async function (details) {
  if (details.reason === "install") {
    browser.storage.local.set({ filter: defaultFilter });

    browser.tabs.create({
      url: browser.runtime.getURL(`src/welcome/welcome.html`),
    });
  }

  // 치지직 인증 배지 URL 수정
  const storageFilter = await browser.storage.local.get(["filter"]);

  const filter: ArrayFilterListInterface[] = storageFilter.filter;

  const updateForChzzkVerifiedBadgeURL = filter.map((f) => {
    f.filters = f.filters.map(filter => {
      filter.value = filter.value === OLD_CHZZK_VERIFIED ? NEW_CHZZK_VERIFIED : filter.value
      return filter;
    })
    return f;
  });
  await browser.storage.local.set({ filter: updateForChzzkVerifiedBadgeURL });

  // ===================================================================== //
  
  browser.storage.local.get(['miniChatTime']).then(res => {
    browser.storage.local.set({'chatTime': res.miniChatTime === 'on' ? 'on' : 'off'});
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
