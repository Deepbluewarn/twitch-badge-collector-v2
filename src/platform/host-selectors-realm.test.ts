// @vitest-environment happy-dom
/**
 * realm 간 manifest 전달 계약 회귀 테스트.
 *
 * 예전 구현은 MAIN world 에서 "manifest 가 올 때까지 200ms 대기 → 타임아웃되면
 * 리스너까지 제거" 였다. 실제 로드 순서(chzzk MAIN 은 document_start, ISOLATED 는
 * document_idle)에서는 200ms 가 HTML 파싱 시간보다 짧아 늘 타임아웃됐고, 그때
 * 리스너가 함께 사라져 뒤늦게 도착한 OTA manifest 를 아무도 받지 못했다.
 * → OTA 를 push 해도 MAIN world(inject) 는 영원히 bundled 로만 동작.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import bundled from './bundled-selectors.prod.json';

const BASE_REV = (bundled as { rev: number }).rev;

function manifestWithRev(rev: number) {
    const m = JSON.parse(JSON.stringify(bundled));
    m.rev = rev;
    return m;
}

/** 모듈 최상단 IIFE 가 realm 을 감지하므로 매번 새로 평가해야 한다. */
async function loadFresh() {
    vi.resetModules();
    return import('./host-selectors');
}

/** 실제 postMessage 는 happy-dom 에서 e.source 가 window 가 아니라 직접 dispatch. */
function deliver(data: unknown) {
    window.dispatchEvent(new MessageEvent('message', { data, source: window as unknown as Window }));
}

function tick() {
    return new Promise((r) => setTimeout(r, 0));
}

afterEach(async () => {
    vi.useRealTimers();
    delete (globalThis as { browser?: unknown }).browser;
    await tick();
});

describe('MAIN world (inject) — browser API 없음', () => {
    it('manifest 를 기다리지 않고 즉시 resolve 한다', async () => {
        // fake timer 를 켜둔 채 통과해야 한다 = 어떤 타임아웃에도 의존하지 않는다는 뜻.
        vi.useFakeTimers();
        const mod = await loadFresh();

        let resolved = false;
        void mod.manifestReady.then(() => { resolved = true; });
        await Promise.resolve();
        await Promise.resolve();

        expect(resolved).toBe(true);
    });

    it('manifestReady 이후 뒤늦게 도착한 manifest 도 적용된다', async () => {
        const mod = await loadFresh();
        await mod.manifestReady;
        await tick();
        expect(mod.getManifest().rev).toBe(BASE_REV);

        // ISOLATED 가 한참 뒤에야 떠서 보낸 경우.
        deliver({ type: mod.SELECTORS_MESSAGE_TYPE, manifest: manifestWithRev(BASE_REV + 1) });

        expect(mod.getManifest().rev).toBe(BASE_REV + 1);
    });

    it('초기 push 를 놓쳤을 경우를 대비해 로드 시 manifest 를 요청한다', async () => {
        const seen: unknown[] = [];
        const spy = (e: MessageEvent) => seen.push(e.data);
        window.addEventListener('message', spy);
        try {
            const mod = await loadFresh();
            await tick();
            expect(seen).toContainEqual({ type: mod.SELECTORS_REQUEST_TYPE });
        } finally {
            window.removeEventListener('message', spy);
        }
    });

    it('초기 push 와 요청 응답이 겹쳐 두 번 와도 rev 단조성이 지켜진다', async () => {
        const mod = await loadFresh();
        await mod.manifestReady;

        deliver({ type: mod.SELECTORS_MESSAGE_TYPE, manifest: manifestWithRev(BASE_REV + 2) });
        expect(mod.getManifest().rev).toBe(BASE_REV + 2);

        // 같은 rev 재전송, 그리고 뒤늦게 도착한 옛 rev — 둘 다 무시돼야 한다.
        deliver({ type: mod.SELECTORS_MESSAGE_TYPE, manifest: manifestWithRev(BASE_REV + 2) });
        deliver({ type: mod.SELECTORS_MESSAGE_TYPE, manifest: manifestWithRev(BASE_REV + 1) });

        expect(mod.getManifest().rev).toBe(BASE_REV + 2);
    });

    it('다른 type 의 postMessage 는 무시한다', async () => {
        const mod = await loadFresh();
        await mod.manifestReady;

        deliver({ type: 'some-other-extension', manifest: manifestWithRev(BASE_REV + 1) });

        expect(mod.getManifest().rev).toBe(BASE_REV);
    });
});

describe('ISOLATED world (content script) — storage 직접 읽기', () => {
    let get: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        get = vi.fn().mockResolvedValue({});
        (globalThis as { browser?: unknown }).browser = { storage: { local: { get } } };
    });

    it('storage 에 저장된 manifest 를 읽어 적용한다', async () => {
        get.mockResolvedValue({ 'tbcv2-selectors-manifest': manifestWithRev(BASE_REV + 1) });

        const mod = await loadFresh();
        await mod.manifestReady;

        expect(get).toHaveBeenCalledWith(mod.SELECTORS_STORAGE_KEY);
        expect(mod.getManifest().rev).toBe(BASE_REV + 1);
    });

    it('storage 읽기가 실패해도 bundled 로 진행한다', async () => {
        get.mockRejectedValue(new Error('storage unavailable'));

        const mod = await loadFresh();
        await expect(mod.manifestReady).resolves.toBeUndefined();

        expect(mod.getManifest().rev).toBe(BASE_REV);
    });

    it('MAIN 용 요청을 보내지 않는다 — 자기 자신에게 되물을 이유가 없다', async () => {
        const seen: unknown[] = [];
        const spy = (e: MessageEvent) => seen.push(e.data);
        window.addEventListener('message', spy);
        try {
            const mod = await loadFresh();
            await mod.manifestReady;
            await tick();
            expect(seen).not.toContainEqual({ type: mod.SELECTORS_REQUEST_TYPE });
        } finally {
            window.removeEventListener('message', spy);
        }
    });
});
