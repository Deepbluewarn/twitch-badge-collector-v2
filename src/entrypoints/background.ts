import { CompositeFilterElement } from "@/interfaces/filter";
import defaultFilter from "@/defaultFilters";

export default defineBackground(() => {
  console.log('Hello background!', { id: browser.runtime.id });


  browser.runtime.onInstalled.addListener(async function (details) {
    if (details.reason === "install") {
      await browser.storage.local.set({ filter: defaultFilter });
    }

    let updatedFilter: CompositeFilterElement[] = [];
    const filter: CompositeFilterElement[] = (await browser.storage.local.get('filter')).filter;
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
    const SETTING_LIST = [
      "position", "pointBoxAuto", "darkTheme",
      "chatTime", "maximumNumberChats", "advancedFilter",
      "platform", "containerRatio",
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

  // 채팅 이미지 캡쳐: 호스트 페이지의 fetch는 CORS 막혀서 배지/이모트 이미지 못 읽음.
  // 확장 background는 host_permissions origin에 ACAO 없어도 fetch 가능 →
  // blob → data URL로 변환해서 content로 회신.
  //
  // MV3 service worker에선 async 리스너 + Promise 반환이 채널 닫힘으로 이어지는
  // 케이스가 있어, sendResponse + `return true` 정석 패턴 사용.
  async function handleImageFetch(url: string): Promise<{ dataUrl?: string; error?: string }> {
    try {
      const res = await fetch(url);
      if (!res.ok) return { error: `HTTP ${res.status}` };
      const blob = await res.blob();
      const buf = await blob.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);
      const contentType = blob.type || res.headers.get('Content-Type') || 'image/png';
      return { dataUrl: `data:${contentType};base64,${base64}` };
    } catch (e) {
      console.warn('[tbcv2 bg] image fetch failed', url, e);
      return { error: String(e) };
    }
  }

  async function handleDownload(dataUrl: string, filename?: string): Promise<{ ok?: boolean; error?: string }> {
    try {
      await browser.downloads.download({
        url: dataUrl,
        filename: filename ?? 'capture.png',
        saveAs: false,
      });
      return { ok: true };
    } catch (e) {
      console.warn('[tbcv2 bg] download failed', e);
      return { error: String(e) };
    }
  }

  browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'fetchImageAsDataUrl' && typeof msg.url === 'string') {
      handleImageFetch(msg.url).then(sendResponse);
      return true; // 비동기 응답 — 채널 유지.
    }
    if (msg?.type === 'downloadDataUrl' && typeof msg.dataUrl === 'string') {
      handleDownload(msg.dataUrl, msg.filename).then(sendResponse);
      return true;
    }
    return false; // 다른 핸들러로 패스.
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
});
