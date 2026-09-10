// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { inspectSelectors, getRequiredSelectorNames } from './selector-health';
import { getBrokenSelectors, setBrokenSelectors, setManifest, getManifest } from './host-selectors';
import type { PlatformAdapter } from './index';

/** getPageMode만 쓰는 최소 adapter 스텁. */
const adapterStub = (pageMode: 'live' | 'video' | 'unknown' = 'live') =>
    ({ type: 'chzzk', getPageMode: () => pageMode } as unknown as PlatformAdapter);

/** bundled manifest를 건드리지 않고 chzzk selector만 갈아끼운다. */
function overrideChzzkSelectors(selectors: Record<string, string>) {
    const cur = getManifest();
    const next = {
        ...cur,
        rev: cur.rev + 1,
        platforms: {
            ...cur.platforms,
            chzzk: { ...cur.platforms.chzzk, selectors: selectors as never },
        },
    };
    setManifest(next);
}

describe('getRequiredSelectorNames', () => {
    it('라이브에서는 chatRoomLive를 필수로 본다', () => {
        const s = getRequiredSelectorNames('live');
        expect(s.has('chatRoomLive')).toBe(true);
        expect(s.has('chatRoomVod')).toBe(false);
        expect(s.has('displayName')).toBe(true);
    });

    it('VOD에서는 chatRoomVod를 필수로 본다', () => {
        const s = getRequiredSelectorNames('video');
        expect(s.has('chatRoomVod')).toBe(true);
        expect(s.has('chatRoomLive')).toBe(false);
    });
});

describe('inspectSelectors', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        setBrokenSelectors([]);
    });

    afterEach(() => {
        document.body.innerHTML = '';
        setBrokenSelectors([]);
    });

    it('required selector가 하나도 안 잡히면 broken으로 기록한다', () => {
        overrideChzzkSelectors({
            chatRoomLive: '.exists',
            chatRoomVod: '.nope-vod',
            displayName: '.gone',
            messageText: '.exists',
            badge: '.exists',
            usernameContainer: '.exists',
        });
        document.body.innerHTML = '<div class="exists"></div>';

        const health = inspectSelectors(adapterStub('live'), 'chzzk');
        expect(health.broken).toEqual(['displayName']);
        // 레지스트리에도 게시되어 Adapter.extract가 unavailable을 채울 수 있어야 한다.
        expect(getBrokenSelectors().has('displayName')).toBe(true);
    });

    it('전부 살아있으면 broken이 비어 있다', () => {
        overrideChzzkSelectors({
            chatRoomLive: '.exists',
            chatRoomVod: '.nope-vod',
            displayName: '.exists',
            messageText: '.exists',
            badge: '.exists',
            usernameContainer: '.exists',
        });
        document.body.innerHTML = '<div class="exists"></div>';

        const health = inspectSelectors(adapterStub('live'), 'chzzk');
        expect(health.broken).toEqual([]);
    });

    it('selector list 중 일부 branch만 죽으면 degraded로 잡고 broken엔 넣지 않는다', () => {
        overrideChzzkSelectors({
            chatRoomLive: '.exists',
            chatRoomVod: '.nope-vod',
            displayName: '.exists, .dead-branch',
            messageText: '.exists',
            badge: '.exists',
            usernameContainer: '.exists',
        });
        document.body.innerHTML = '<div class="exists"></div>';

        const health = inspectSelectors(adapterStub('live'), 'chzzk');
        expect(health.broken).toEqual([]);
        expect(health.degraded).toEqual([
            { name: 'displayName', deadBranches: ['.dead-branch'] },
        ]);
    });

    it('foldedClassSubstring은 selector가 아니므로 검사 대상에서 뺀다', () => {
        overrideChzzkSelectors({
            chatRoomLive: '.exists',
            chatRoomVod: '.nope-vod',
            displayName: '.exists',
            messageText: '.exists',
            badge: '.exists',
            usernameContainer: '.exists',
            // 그냥 class substring — querySelectorAll에 넣으면 엉뚱한 판정이 된다.
            foldedClassSubstring: '_is_folded_',
        });
        document.body.innerHTML = '<div class="exists"></div>';

        const health = inspectSelectors(adapterStub('live'), 'chzzk');
        expect(health.broken).toEqual([]);
        expect(health.degraded).toEqual([]);
    });
});
