import browser from "webextension-polyfill";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, Firestore } from "firebase/firestore";
import { FilterInterface } from "twitch-badge-collector-cc";
import { nanoid } from 'nanoid';
import { getRandomBooleanWithProbability } from "./utils";
import defaultFilter from "./defaultFilters";
let db: Firestore;

try {
  const firebaseConfig = {
    apiKey: "AIzaSyBQZrivissM5QvINptD0RFkrgV9hD4_c6Y",
    authDomain: "twitch-badge-collector.firebaseapp.com",
    projectId: "twitch-badge-collector",
    storageBucket: "twitch-badge-collector.appspot.com",
    messagingSenderId: "933598780752",
    appId: "1:933598780752:web:4b72960eca0cce837fe055",
    measurementId: "G-VMF9V945NN",
    databaseURL: "https://twitch-badge-collector-default-rtdb.firebaseio.com/"
  };
  const app = initializeApp(firebaseConfig);

  db = getFirestore(app);
} catch (e) {
  console.error(e);
}

const setFbDoc = (key: string, id: string, value: any) => {
  setDoc(doc(db, key, id), value);
}

const getExtensionUserId = async () => {
  let res = await browser.storage.local.get('extensionUserId');

  if (typeof res.extensionUserId === 'undefined') {
    const extUserId = nanoid(24);
    await browser.storage.local.set({ extensionUserId: extUserId });
    return extUserId;
  }

  return res.extensionUserId;
}

const sendFbSettings = (ignoreLimit: boolean) => {

  if (!getRandomBooleanWithProbability(0.2) && !ignoreLimit) return;

  browser.storage.local.get([
    "chatDisplayMethod",
    "position",
    "pointBoxAuto",
    "darkTheme",
    "chatTime",
    "maximumNumberChats",
    "miniLanguage",
    "miniFontSize",
    "miniChatTime",
    "filter"
  ]
  ).then(async res => {
    // 필터 요소가 모두 제외로 설정되어 있으면 사용자의 의도와 다르게 동작할 수 있음.
    // 필터 구조의 데이터를 수집하여 통계 작성.

    const id = await getExtensionUserId();

    const {filter, extensionUserId, ...newRes} = res;

    if (typeof res.filter !== 'undefined') {
      const filter: Array<FilterInterface.ArrayFilterListInterface> = res.filter;

      const r = filter.some(v => {
        return v.filters.every(f => f.type === 'exclude') && v.filterType !== 'sleep';
      });
      newRes.hasAllExcludedFilter = {
        filterCount: filter.length,
        value: r
      }
    }
    setFbDoc('userSetting', id, newRes);
  })
}

browser.runtime.onInstalled.addListener(function (details) {
  if (details.reason === "install") {
    browser.storage.local.set({ filter: defaultFilter });

    browser.tabs.create({
      url: browser.runtime.getURL(`welcome.html`),
    });
  }

  sendFbSettings(true);

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
        maximumNumberChats: res.maximumNumberChats ? res.maximumNumberChats : (process.env.MAXNUMCHATS_DEFAULT as unknown) as number,
        advancedFilter: res.advancedFilter ? res.advancedFilter : "off",
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
