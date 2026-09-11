// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import SelectorHealthBanner from './SelectorHealthBanner';
import { SELECTOR_HEALTH_EVENT, SelectorHealth } from '@/platform/selector-health';
import i18n from '@/translate/i18n';

const DEBUG_KEY = 'tbcv2-debug-force-health';

/** browser.storage.local 최소 스텁. 값은 테스트마다 바꿔 넣는다. */
let store: Record<string, unknown> = {};
const listeners: Array<(c: Record<string, { newValue: unknown; oldValue: unknown }>) => void> = [];

beforeEach(async () => {
    // LanguageDetector가 테스트 환경에서 en으로 떨어지므로 언어를 고정한다.
    await i18n.changeLanguage('ko');
    store = {};
    listeners.length = 0;
    vi.stubGlobal('browser', {
        storage: {
            local: {
                get: (key: string) => Promise.resolve({ [key]: store[key] }),
                onChanged: { addListener: (cb: (typeof listeners)[number]) => { listeners.push(cb); } },
            },
        },
    });
});

// vitest config에 globals:true가 없어 RTL 자동 cleanup이 걸리지 않는다.
// 명시적으로 정리하지 않으면 렌더가 누적돼 getByText가 중복 매칭으로 실패한다.
afterEach(() => cleanup());

const health = (broken: string[]): SelectorHealth => ({ broken, degraded: [], checkedAt: Date.now() });

describe('SelectorHealthBanner', () => {
    it('정상 상태에서는 아무것도 렌더하지 않는다', () => {
        const { container } = render(<SelectorHealthBanner />);
        expect(container.textContent).toBe('');
    });

    it('감지 이벤트로 broken이 오면 배너가 뜬다', async () => {
        render(<SelectorHealthBanner />);
        window.dispatchEvent(new CustomEvent(SELECTOR_HEALTH_EVENT, {
            detail: health(['displayName', 'messageText']),
        }));
        // i18n 키가 실제로 해석되는지까지 확인 — 키 문자열이 그대로 노출되면 실패.
        await waitFor(() => expect(screen.getByText('채팅 수집이 중단됐어요')).toBeTruthy());
        // MUI Button은 라벨을 중첩 노드로 렌더하므로 role로 집는다.
        expect(screen.getByRole('button', { name: '새로고침' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '닫기' })).toBeTruthy();
    });

    it('디버그 스위치 stopped — 실제 감지 없이 중단 배너를 띄운다', async () => {
        store[DEBUG_KEY] = 'stopped';
        render(<SelectorHealthBanner />);
        await waitFor(() => expect(screen.getByText('채팅 수집이 중단됐어요')).toBeTruthy());
        expect(screen.getByText(/자동 복구를 시도했습니다/)).toBeTruthy();
    });

    it('디버그 스위치 partial — 부분 수집 문구로 뜬다', async () => {
        store[DEBUG_KEY] = 'partial';
        render(<SelectorHealthBanner />);
        // 닉네임만 못 읽는 상태 → name 필드만 언급되어야 한다.
        await waitFor(() => expect(screen.getByText(/일부 정보만 읽고 있어요 \(name\)/)).toBeTruthy());
    });

    it('디버그 스위치를 콘솔에서 켜면 새로고침 없이 반영된다', async () => {
        render(<SelectorHealthBanner />);
        await waitFor(() => expect(listeners.length).toBeGreaterThan(0));

        store[DEBUG_KEY] = 'stopped';
        listeners.forEach(cb => cb({ [DEBUG_KEY]: { newValue: 'stopped', oldValue: undefined } }));

        await waitFor(() => expect(screen.getByText('채팅 수집이 중단됐어요')).toBeTruthy());
    });
});
