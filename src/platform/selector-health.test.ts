// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { inspectSelectors, getRequiredSelectorNames } from './selector-health';
import { CHAT_ATTR } from '@/interfaces/chat-attributes';
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

    /** 채팅이 존재한다는 증거(inject가 박는 data 속성)를 만들어 준다. */
    const withChats = (n: number) =>
        Array.from({ length: n }, () => `<div ${CHAT_ATTR.KEY}="k"></div>`).join('');

    it('required selector가 하나도 안 잡히면 broken으로 기록한다', () => {
        overrideChzzkSelectors({
            chatRoomLive: '.exists',
            chatRoomVod: '.nope-vod',
            displayName: '.gone',
            messageText: '.exists',
            badge: '.exists',
            usernameContainer: '.exists',
        });
        document.body.innerHTML = '<div class="exists"></div>' + withChats(3);

        const health = inspectSelectors(adapterStub('live'), 'chzzk');
        expect(health.verdict).toBe('broken');
        expect(health.broken).toEqual(['displayName']);
        // 레지스트리에도 게시되어 Adapter.extract가 unavailable을 채울 수 있어야 한다.
        expect(getBrokenSelectors().has('displayName')).toBe(true);
    });

    it('채팅이 0개면 채팅 의존 selector를 판정하지 않는다 (조용한 채널)', () => {
        // 실제로 났던 오탐: 시청자 적은 채널 / 방금 시작한 방송은 채팅이 몇 분간
        // 없을 수 있다. 그때 displayName·messageText·badge가 전부 0이라
        // "수집 중단" 빨간 배너가 떴고, broken 레지스트리를 통해 badge/keyword
        // 필터까지 멈췄다.
        overrideChzzkSelectors({
            chatRoomLive: '.exists',
            chatRoomVod: '.nope-vod',
            displayName: '.gone',
            messageText: '.gone',
            badge: '.gone',
            usernameContainer: '.gone',
        });
        document.body.innerHTML = '<div class="exists"></div>'; // 채팅 노드 없음

        const health = inspectSelectors(adapterStub('live'), 'chzzk');
        expect(health.verdict).toBe('unknown');
        expect(health.broken).toEqual([]);
        expect(health.chatCount).toBe(0);
        // L3로 새어나가지 않아야 한다 — 필터가 멈추면 안 된다.
        expect(getBrokenSelectors().size).toBe(0);
    });

    it('채팅이 0개여도 채팅과 무관한 chatRoomLive는 판정한다', () => {
        // 채팅창 자체가 사라진 건 채팅 유무와 무관하게 확정할 수 있다.
        overrideChzzkSelectors({
            chatRoomLive: '.gone',
            chatRoomVod: '.nope-vod',
            displayName: '.gone',
            messageText: '.gone',
            badge: '.gone',
            usernameContainer: '.gone',
        });
        document.body.innerHTML = '<div class="other"></div>';

        const health = inspectSelectors(adapterStub('live'), 'chzzk');
        expect(health.verdict).toBe('broken');
        expect(health.broken).toEqual(['chatRoomLive']);
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
        document.body.innerHTML = '<div class="exists"></div>' + withChats(3);

        const health = inspectSelectors(adapterStub('live'), 'chzzk');
        expect(health.verdict).toBe('ok');
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
        document.body.innerHTML = '<div class="exists"></div>' + withChats(3);

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
        document.body.innerHTML = '<div class="exists"></div>' + withChats(3);

        const health = inspectSelectors(adapterStub('live'), 'chzzk');
        expect(health.broken).toEqual([]);
        expect(health.degraded).toEqual([]);
    });
});
