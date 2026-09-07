// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { applyRatio } from './layout';

function setupDom() {
    document.body.innerHTML = `
        <div id="tbc-chzzk-chat-list-container">
            <div id="chzzk-container"></div>
            <div id="tbc-chzzk-chat-list-wrapper"></div>
        </div>
    `;
}

const orig = () => (document.getElementById('tbc-chzzk-chat-list-wrapper') as HTMLElement).style.height;
const clone = () => (document.getElementById('chzzk-container') as HTMLElement).style.height;

describe('applyRatio', () => {
    beforeEach(setupDom);

    it('position up: ratio가 모아보기(clone) 아닌 원본 높이로 접힌다', () => {
        applyRatio('chzzk', 30, 'up');
        expect(orig()).toBe('30%');
        expect(clone()).toBe('70%');
    });

    it('position down: up과 반대로 배분된다', () => {
        applyRatio('chzzk', 30, 'down');
        expect(orig()).toBe('70%');
        expect(clone()).toBe('30%');
    });

    // storage 미초기화(구버전 설치 잔재)로 position이 없을 때 down으로 취급되면
    // DOM 순서는 up인데 높이만 뒤집혀 "저장한 비율이 새로고침하면 안 먹는" 증상이 난다.
    it('position 미설정은 up과 동일하게 취급된다', () => {
        applyRatio('chzzk', 30, undefined as never);
        expect(orig()).toBe('30%');
        expect(clone()).toBe('70%');
    });

    it('ratio가 없거나 범위 밖이면 30으로 fallback', () => {
        applyRatio('chzzk', undefined as never, 'up');
        expect(orig()).toBe('30%');

        setupDom();
        applyRatio('chzzk', 140, 'up');
        expect(orig()).toBe('30%');
    });

    it('ratio 0은 사용자 의도로 존중된다', () => {
        applyRatio('chzzk', 0, 'up');
        expect(orig()).toBe('0%');
        expect(clone()).toBe('100%');
    });
});
