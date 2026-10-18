import { CompositeFilterElement } from "@/interfaces/filter";
import defaultFilter from "@/defaultFilters";
import { fetchChzzkBadgeGroups } from "@/api/chzzk";
import { fetchAndApplyOta, fetchIfStale } from "@/platform/ota-fetch";
import { installChzzkApiOriginRule } from "@/api/chzzk-channel";
import { CHAT_PICK_HAS, CHAT_PICK_MENU_ID, CHAT_PICK_PENDING_KEY, CHAT_PICK_TAKE, type ChatPick } from "@/interfaces/chat-pick";

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

  installChzzkApiOriginRule().catch(e => console.warn('[tbcv2 bg] chzzk api rule failed', e));

  setupChatPickMenu();


  // 설정 기본값 채우기 — 없는 key만 write. 몇 번 호출해도 안전(idempotent).
  //
  // onInstalled 본문에 인라인으로 두지 않는 이유:
  //  1) 예전엔 chzzk 배지 fetch 뒤에 있어서, 그 fetch가 실패하면(오프라인 설치,
  //     API 장애, 차단기/브라우저의 요청 차단) listener가 그 자리에서 reject →
  //     기본값 write가 통째로 스킵됐다. filter만 있고 position/containerRatio는
  //     없는 반쪽 상태가 되고, position이 없으면 applyRatio가 비율을 반전 적용해
  //     "새로고침하면 조정한 비율이 안 먹는다"로 드러난다.
  //  2) 이미 그 상태로 설치된 사용자는 재설치 전엔 복구가 안 되므로 SW wake마다
  //     한 번 더 돌려 자가 복구시킨다 (fetchIfStale과 같은 패턴).
  async function ensureDefaultSettings() {
    const DEFAULTS: Record<string, unknown> = {
      position: "up",
      pointBoxAuto: "on",
      darkTheme: "system",
      chatTime: "off",
      maximumNumberChats: (import.meta.env.VITE_MAXNUMCHATS_DEFAULT as unknown) as number,
      advancedFilter: "off",
      platform: "chzzk",
      containerRatio: 30,
      collectedChatMarker: "on",
      jumpToBottomButton: "on",
      chatPersistence: "on",
      displayMode: "inline",
      floatingBgColor: '',
      chzzkChatSide: "right",
      chzzkCustomTemplate: "off",
    };

    const keys = Object.keys(DEFAULTS);
    const stored = await browser.storage.local.get(keys);

    // truthy 체크(||)가 아니라 undefined 체크 — containerRatio 0은 "한쪽 100%"를
    // 뜻하는 합법 값이고 floatingBgColor ''도 "자동 감지"라는 의미 있는 값이다.
    // ||로 덮으면 업데이트마다 사용자 설정이 default로 되돌아간다.
    const missing: Record<string, unknown> = {};
    for (const key of keys) {
      if (stored[key] === undefined || stored[key] === null) {
        missing[key] = DEFAULTS[key];
      }
    }

    // 채울 게 없으면 write 생략 — 불필요한 onChanged broadcast 방지.
    if (Object.keys(missing).length === 0) return;

    await browser.storage.local.set(missing);
  }

  // 구버전 필터엔 platform 필드가 없음 → twitch로 간주. 네트워크 불필요.
  async function normalizeFilterPlatform() {
    const filter: CompositeFilterElement[] = (await browser.storage.local.get('filter')).filter;

    const updatedFilter = filter ? filter.map((f) => {
      f.platform = !f.platform ? 'twitch' : f.platform;
      return f;
    }) : defaultFilter;

    await browser.storage.local.set({ filter: updatedFilter });
  }

  // chzzk 배지 이미지 URL은 서버에서 바뀔 수 있어 install/update마다 재동기화.
  // 필터 매칭은 이미지 URL 기준이라, 실패하면 URL이 바뀐 배지의 필터는 다음 동기화까지 안 걸린다.
  async function syncChzzkBadgeImages() {
    const groups = await fetchChzzkBadgeGroups();

    const chzzkBadgeMap = new Map<string, string>();
    groups.forEach(g => g.badges.forEach(b => {
      chzzkBadgeMap.set(b.name, b.imageUrl);
    }));

    const filter: CompositeFilterElement[] = (await browser.storage.local.get('filter')).filter ?? [];

    const updatedFilter = filter.map(filterObj => {
      if (filterObj.platform !== 'chzzk') {
        return filterObj;
      }
      filterObj.filters = filterObj.filters.map(f => {
        // badgeName은 `그룹: 이름`. 공식 이름 자체에 ':'가 들어간 배지가 있어 첫 ':' 뒤 전부를 쓴다.
        const sep = f.badgeName?.indexOf(':') ?? -1;
        const name = sep >= 0 ? f.badgeName!.slice(sep + 1).trim() : undefined;

        if (name && f.category === 'badge' && chzzkBadgeMap.has(name)) {
          f.value = chzzkBadgeMap.get(name)!;
        }

        return f;
      })
      return filterObj;
    })

    await browser.storage.local.set({ filter: updatedFilter });
  }

  // 기본값은 네트워크와 무관하게 항상. SW wake마다 불리지만 위 조기 return 덕에
  // 정상 상태에선 storage read 1회로 끝난다.
  ensureDefaultSettings().catch(e => console.warn('[tbcv2 bg] ensureDefaultSettings failed', e));

  browser.runtime.onInstalled.addListener(async function (details) {
    // 기존 필터가 있으면 두지 않는다. Firefox는 같은 ID의 확장을 about:debugging으로 임시 로드해도
    // reason이 install이고 storage를 같이 쓴다 — 무조건 덮어쓰면 쓰던 필터가 기본 필터로 바뀐다.
    if (details.reason === "install") {
      const { filter } = await browser.storage.local.get('filter');
      if (!Array.isArray(filter) || filter.length === 0) {
        await browser.storage.local.set({ filter: defaultFilter });
      }
    }

    // 네트워크 없이 되는 것부터 — 아래 fetch가 죽어도 설정/필터는 유효한 상태로 남는다.
    await ensureDefaultSettings();
    await normalizeFilterPlatform();

    try {
      await syncChzzkBadgeImages();
    } catch (e) {
      console.warn('[tbcv2 bg] chzzk badge sync skipped', e);
    }
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
      // 브라우저별 갈래:
      //  - Firefox(background script): URL.createObjectURL 사용 가능. dataURL은
      //    content script origin 묶임 문제로 downloads.download가 거부 → bg에서
      //    fetch → blob → createObjectURL로 변환 후 downloads.
      //  - Chrome MV3 SW: URL.createObjectURL 미지원. 대신 dataURL을 그대로
      //    downloads.download에 전달 가능 (Chrome은 dataURL 수락).
      if (typeof URL.createObjectURL === 'function') {
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
          setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
        }
      } else {
        await browser.downloads.download({
          url: dataUrl,
          filename: filename ?? 'capture.png',
          saveAs: false,
        });
        return { ok: true };
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
    if (msg?.type === 'tbc-force-ota-fetch') {
      // content script가 selector 매칭 실패 감지 시 즉시 OTA fetch 요청.
      // chzzk가 selector 깨뜨린 직후 자동 복구 경로.
      fetchAndApplyOta().then(sendResponse);
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

/**
 * 원본 채팅창 우클릭 메뉴 '필터 시험에 넣기'. 채팅창 조작(클릭·드래그·닉네임)을 건드리지 않으려고 메뉴로 한다.
 * 누르면 그 탭이 읽어 둔 채팅을 받아 storage에 넣고 설정 페이지를 연다 — 설정 페이지가 꺼내 필터 시험을 연다.
 * Firefox는 메뉴가 열릴 때 채팅 위가 아니면 항목을 숨긴다(menus.onShown). Chrome엔 그런 이벤트가 없어
 * 치지직·트위치 페이지에선 늘 보이고, 채팅이 아닌 곳에서 누르면 아무 일도 하지 않는다.
 */
function setupChatPickMenu() {
  const menus = browser.contextMenus;
  if (!menus) return;
  const pages = ['*://chzzk.naver.com/*', '*://*.twitch.tv/*'];
  menus.removeAll().then(() => menus.create({
    id: CHAT_PICK_MENU_ID,
    title: browser.i18n.getMessage('filterTestMenu'),
    contexts: ['page', 'selection', 'link', 'image'],
    documentUrlPatterns: pages,
  })).catch(e => console.warn('[tbcv2 bg] chat pick menu failed', e));

  menus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== CHAT_PICK_MENU_ID || tab?.id == null) return;
    const pick = await browser.tabs.sendMessage(tab.id, { type: CHAT_PICK_TAKE }, { frameId: info.frameId ?? 0 })
      .catch(() => null) as ChatPick | null;
    if (!pick) return;
    await browser.storage.local.set({ [CHAT_PICK_PENDING_KEY]: { ...pick, at: Date.now() } });
    await browser.tabs.create({ url: browser.runtime.getURL('/setting.html?initialPath=filter'), index: tab.index + 1 });
  });

  type FxMenus = {
    onShown?: { addListener(cb: (info: { menuIds: (string | number)[]; frameId?: number }, tab?: { id?: number }) => void): void };
    onHidden?: { addListener(cb: () => void): void };
    update(id: string, props: { visible: boolean }): Promise<void>;
    refresh(): void;
  };
  const fx = (browser as unknown as { menus?: FxMenus }).menus;
  if (!fx?.onShown) return;
  fx.onShown.addListener(async (info, tab) => {
    if (!info.menuIds.includes(CHAT_PICK_MENU_ID) || tab?.id == null) return;
    const has = await browser.tabs.sendMessage(tab.id, { type: CHAT_PICK_HAS }, { frameId: info.frameId ?? 0 }).catch(() => false);
    await fx.update(CHAT_PICK_MENU_ID, { visible: !!has });
    fx.refresh();
  });
  fx.onHidden?.addListener(() => { fx.update(CHAT_PICK_MENU_ID, { visible: true }).catch(() => {}); });
}
