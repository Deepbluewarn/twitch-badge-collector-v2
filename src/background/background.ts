import browser from "webextension-polyfill";
import defaultFilter from "../defaultFilters";
import { ArrayFilterListInterface } from "@interfaces/filter";

browser.runtime.onInstalled.addListener(async function (details) {
  if (details.reason === "install") {
    await browser.storage.local.set({ filter: defaultFilter });

    browser.tabs.create({
      url: browser.runtime.getURL(`src/welcome/welcome.html`),
    });
  }

  let updatedFilter: ArrayFilterListInterface[] = [];
  const filter: ArrayFilterListInterface[] = (await browser.storage.local.get('filter')).filter;
  const chzzkBadgeList = await fetch('https://api.badgecollector.dev/chzzk/badges', { method: 'GET' }).then(res => res.json());
  const chzzkBadgeMap = new Map();
  chzzkBadgeList.forEach((b: any) => {
    chzzkBadgeMap.set(b.name, b.image);
  })

  updatedFilter = filter ? (
    filter.map((f) => {
      f.platform = !f.platform ? 'twitch' : f.platform;
      return f;
    })
  ) : (
    defaultFilter
  )
  
  updatedFilter = updatedFilter.map(filterObj => {
    if (filterObj.platform !== 'chzzk') {
      return filterObj;
    }
    filterObj.filters = filterObj.filters.map(f => {
      const name = f.badgeName?.split(':')[1]?.trim();

      if (chzzkBadgeMap.has(name) && f.category === 'badge') {
        f.value = chzzkBadgeMap.get(name);
      }
      
      return f;
    })
    return filterObj;
  })

  await browser.storage.local.set({ filter: updatedFilter });
  
  const miniChatTime = (await browser.storage.local.get('miniChatTime')).miniChatTime;
  await browser.storage.local.set({ 'chatTime': miniChatTime === 'on' ? 'on' : 'off' });

  const SETTING_LIST = [
    "position", "pointBoxAuto", "darkTheme",
    "chatTime", "maximumNumberChats", "advancedFilter"
  ]

  const settings = await browser.storage.local.get(SETTING_LIST);
  await browser.storage.local.set({
    position: settings.position ? settings.position : "up",
    pointBoxAuto: settings.pointBoxAuto ? settings.pointBoxAuto : "on",
    darkTheme: settings.darkTheme ? settings.darkTheme : "off",
    chatTime: settings.chatTime ? settings.chatTime : "off",
    maximumNumberChats: settings.maximumNumberChats ? settings.maximumNumberChats : (import.meta.env.VITE_MAXNUMCHATS_DEFAULT as unknown) as number,
    advancedFilter: settings.advancedFilter ? settings.advancedFilter : "off",
    platform: settings.platform ? settings.platform : "twitch",
    containerRatio: settings.containerRatio ? settings.containerRatio : 30,
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
