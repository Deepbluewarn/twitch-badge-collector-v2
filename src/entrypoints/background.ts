import { CompositeFilterElement } from "@/interfaces/filter";
import defaultFilter from "@/defaultFilters";
import { fetchAndApplyOta, fetchIfStale } from "@/platform/ota-fetch";

export default defineBackground(() => {
  console.log('Hello background!', { id: browser.runtime.id });

  // storage.session은 기본적으로 background/popup 등 trusted context에서만 접근 가능.
  // 채팅 유지 기능이 content script에서 set/get 하므로 untrusted까지 풀어줌.
  // SW 재시작 시마다 호출해도 안전(idempotent).
  //
  // setAccessLevel은 Chrome 전용 — Firefox엔 함수 자체가 없어 호출 시 동기 TypeError.
  // .catch는 sync throw 못 잡으므로 typeof check로 가드. 가드 없으면 background 전체
  // crash → onInstalled 등록 안 됨 → 기본 필터 set 안 됨.
  if (typeof browser.storage.session?.setAccessLevel === 'function') {
    browser.storage.session.setAccessLevel({
      accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS',
    }).catch((e) => console.warn('storage.session setAccessLevel failed', e));
  }

  // OTA selectors fetch — install/update 시 즉시 + browser startup + 매 SW wake 시 stale 체크.
  // alarms permission 안 씀 — MV3 SW는 다양한 이벤트(content msg, tab nav 등)로 자주 깨므로
  // 능동 사용자에겐 사실상 6시간 내 갱신됨. 비활동 사용자는 다음 사용 시 갱신.
  browser.runtime.onInstalled.addListener(() => { fetchAndApplyOta(); });
  browser.runtime.onStartup.addListener(() => { fetchIfStale(); });
  fetchIfStale();


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
      darkTheme: settings.darkTheme ? settings.darkTheme : "system",
      chatTime: settings.chatTime ? settings.chatTime : "off",
      maximumNumberChats: settings.maximumNumberChats ? settings.maximumNumberChats : (import.meta.env.VITE_MAXNUMCHATS_DEFAULT as unknown) as number,
      advancedFilter: settings.advancedFilter ? settings.advancedFilter : "off",
      platform: settings.platform ? settings.platform : "chzzk",
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
    if (!browser.downloads?.download) {
      // manifest엔 있지만 runtime에 미적용 — extension reload 필요
      const msg = 'downloads API unavailable — 확장 관리 페이지에서 확장 새로고침 필요';
      console.warn('[tbcv2 bg]', msg);
      return { error: msg };
    }
    try {
      // Firefox downloads.download는 content script가 만든 URL을 cross-origin으로 거부
      // (blob URL ↔ data URL 둘 다). background context에서 직접 fetch → blob → URL을
      // 만들어야 함. dataURL을 background에서 fetch하면 같은 origin(확장) blob URL이 생성됨.
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      try {
        await browser.downloads.download({
          url: objectUrl,
          filename: filename ?? 'capture.png',
          saveAs: false,
        });
        return { ok: true };
      } finally {
        // Chrome downloads는 URL을 비동기로 fetch 시작하므로 즉시 revoke하면 실패.
        // 충분히 큰 지연 후 revoke.
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      }
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

  // URL filter로 우리 사이트(트위치/치지직) 탭에서만 발화. content script 리스너가
  // 없는 탭에 메시지 보내면 "Could not establish connection" 발생하므로 미연 차단.
  // 그래도 timing 이슈(content script 로딩 전 이벤트)는 남을 수 있어 sendMessage는 catch.
  browser.webNavigation.onHistoryStateUpdated.addListener(
    (details) => {
      browser.tabs.sendMessage(details.tabId, {
        action: "onHistoryStateUpdated",
        url: details.url,
      }).catch(() => { /* receiver 부재(네비게이션 직후 등) — 무시 */ });
    },
    {
      url: [
        { hostSuffix: '.twitch.tv' },
        { hostEquals: 'twitch.tv' },
        { hostEquals: 'chzzk.naver.com' },
      ],
    }
  );
});
