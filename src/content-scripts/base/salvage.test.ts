// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { snapshotLeftoverChats, takeLeftoverChats } from './salvage';

const chat = (key: string, time: number, channel = 'ch1') =>
    `<div class="_item" data-tbc-chat-key="${key}" data-tbc-chat-time="${time}" title="채널: ${channel}"><span data-tbc-chat-key="inner">${key}</span></div>`;
const pane = (id: string, ...chats: string[]) =>
    `<div id="${id}"><div id="tbc-clone__chzzkui">${chats.join('')}</div></div>`;

describe('salvage — 업데이트 때 옛 창의 채팅 넘기기', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        snapshotLeftoverChats('chzzk');
        takeLeftoverChats('reset');
    });

    it('옛 창의 채팅을 화면 순서대로 떠 두고, title은 빼서 내준다', () => {
        document.body.innerHTML = pane('chzzk-container', chat('b', 2), chat('a', 1));
        snapshotLeftoverChats('chzzk');
        const taken = takeLeftoverChats('ch1');
        expect(taken.map(c => [c.key, c.time])).toEqual([['b', 2], ['a', 1]]);
        expect(taken[0].html).not.toContain('title=');
    });

    it('팝오버 창, 이미 숨긴(-stale) 2.23.0 창에서도 뜬다', () => {
        document.body.innerHTML = pane('tbc-floating-chzzk', chat('a', 1)) + pane('chzzk-container-stale', chat('b', 2));
        snapshotLeftoverChats('chzzk');
        expect(takeLeftoverChats('ch1').map(c => c.key)).toEqual(['a', 'b']);
    });

    it('한 번만 내준다', () => {
        document.body.innerHTML = pane('chzzk-container', chat('a', 1));
        snapshotLeftoverChats('chzzk');
        expect(takeLeftoverChats('ch1')).toHaveLength(1);
        expect(takeLeftoverChats('ch1')).toHaveLength(0);
    });

    it('채널이 정해지기 전에는 남겨 두고, 다른 채널 채팅은 버린다', () => {
        document.body.innerHTML = pane('chzzk-container', chat('a', 1, 'other'), chat('b', 2));
        snapshotLeftoverChats('chzzk');
        expect(takeLeftoverChats(null)).toEqual([]);
        expect(takeLeftoverChats('ch1').map(c => c.key)).toEqual(['b']);
    });

    it('옛 창이 없으면 아무것도 없다', () => {
        snapshotLeftoverChats('chzzk');
        expect(takeLeftoverChats('ch1')).toEqual([]);
    });
});
