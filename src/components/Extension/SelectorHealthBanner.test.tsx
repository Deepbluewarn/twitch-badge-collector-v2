// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import SelectorHealthBanner from './SelectorHealthBanner';
import { SELECTOR_HEALTH_EVENT, SelectorHealth } from '@/platform/selector-health';

const DEBUG_KEY = 'tbcv2-debug-force-health';

/**
 * 실제 public/_locales/ko/messages.json을 읽어 browser.i18n.getMessage를 흉내낸다.
 *
 * 예전 버전은 이 테스트에서 i18next를 직접 import해 init했는데, 정작 Container는
 * i18next를 init하지 않는다. 그래서 테스트는 통과하는데 화면에는 번역 키가 그대로
 * 찍히는 상태를 못 잡았다. locale 파일을 직접 읽으면 키 누락도 같이 잡힌다.
 */
type LocaleEntry = {
    message: string;
    placeholders?: Record<string, { content: string }>;
};
const MESSAGES: Record<string, LocaleEntry> = JSON.parse(
    readFileSync('public/_locales/ko/messages.json', 'utf-8'),
);

/**
 * 브라우저의 치환 규칙을 그대로 흉내낸다: 먼저 `$NAME$`를 placeholders의 content로
 * 바꾸고, 그 content 안의 `$1`..`$9`를 substitutions로 채운다. 이 순서를 지켜야
 * placeholders 선언을 빼먹은 메시지가 테스트에서 걸린다.
 */
function getMessage(key: string, sub?: string[]): string {
    const entry = MESSAGES[key];
    if (!entry) return ''; // 브라우저와 동일 — 없는 키는 빈 문자열
    let out = entry.message;
    for (const [name, ph] of Object.entries(entry.placeholders ?? {})) {
        out = out.replace(new RegExp(`\\$${name}\\$`, 'gi'), ph.content);
    }
    (sub ?? []).forEach((v, i) => { out = out.split(`$${i + 1}`).join(v); });
    return out;
}

let store: Record<string, unknown> = {};
const listeners: Array<(c: Record<string, { newValue: unknown; oldValue: unknown }>) => void> = [];

beforeEach(() => {
    store = {};
    listeners.length = 0;
    vi.stubGlobal('browser', {
        i18n: { getMessage },
        storage: {
            local: {
                get: (key: string) => Promise.resolve({ [key]: store[key] }),
                onChanged: { addListener: (cb: (typeof listeners)[number]) => { listeners.push(cb); } },
            },
        },
    });
});

afterEach(() => cleanup());

const health = (broken: string[]): SelectorHealth => ({ broken, degraded: [], checkedAt: Date.now() });

describe('SelectorHealthBanner', () => {
    it('정상 상태에서는 아무것도 렌더하지 않는다', () => {
        const { container } = render(<SelectorHealthBanner />);
        expect(container.textContent).toBe('');
    });

    it('감지 이벤트로 broken이 오면 중단 배너가 뜬다', async () => {
        render(<SelectorHealthBanner />);
        window.dispatchEvent(new CustomEvent(SELECTOR_HEALTH_EVENT, {
            detail: health(['displayName', 'messageText']),
        }));
        await waitFor(() => expect(screen.getByText('채팅 수집이 중단됐어요')).toBeTruthy());
        // MUI Button은 라벨을 중첩 노드로 렌더하므로 role로 집는다.
        expect(screen.getByRole('button', { name: '새로고침' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '닫기' })).toBeTruthy();
    });

    it('화면에 번역 키가 노출되지 않는다', async () => {
        // 이게 실제로 났던 버그 — i18next 미초기화로 `selector_health.title`이 그대로 찍혔다.
        render(<SelectorHealthBanner />);
        window.dispatchEvent(new CustomEvent(SELECTOR_HEALTH_EVENT, {
            detail: health(['displayName', 'messageText']),
        }));
        await waitFor(() => expect(screen.getByText('채팅 수집이 중단됐어요')).toBeTruthy());

        const text = document.body.textContent ?? '';
        expect(text).not.toMatch(/selector_health\./);   // i18next 키 형태
        expect(text).not.toMatch(/selectorHealth[A-Z]/); // browser.i18n 키 형태
    });

    it('필요한 메시지 키가 세 언어 모두에 있다', () => {
        const keys = [
            'selectorHealthTitle', 'selectorHealthBody', 'selectorHealthPartial',
            'selectorHealthRefresh', 'selectorHealthDismiss',
        ];
        for (const lang of ['ko', 'en', 'ru']) {
            const msgs = JSON.parse(readFileSync(`public/_locales/${lang}/messages.json`, 'utf-8'));
            for (const k of keys) {
                expect(msgs[k]?.message, `${lang}/${k}`).toBeTruthy();
            }
            // 치환이 있는 메시지는 placeholders를 선언해야 한다 ($1 위치 치환만으로는
            // 브라우저별 동작이 보장되지 않음).
            expect(msgs.selectorHealthPartial?.placeholders?.fields?.content, `${lang} placeholders`)
                .toBe('$1');
            expect(msgs.selectorHealthPartial.message, `${lang} $FIELDS$`).toContain('$FIELDS$');
        }
    });

    it('부분 수집 문구에 $1 치환이 적용된다', async () => {
        store[DEBUG_KEY] = 'partial';
        render(<SelectorHealthBanner />);
        // 닉네임만 못 읽는 상태 → name 필드만 들어가야 하고, $1이 남아 있으면 안 된다.
        await waitFor(() => expect(screen.getByText(/일부 정보만 읽고 있어요 \(name\)/)).toBeTruthy());
        expect(document.body.textContent).not.toContain('$1');
    });

    it('디버그 스위치 stopped — 실제 감지 없이 중단 배너를 띄운다', async () => {
        store[DEBUG_KEY] = 'stopped';
        render(<SelectorHealthBanner />);
        await waitFor(() => expect(screen.getByText('채팅 수집이 중단됐어요')).toBeTruthy());
        expect(screen.getByText(/자동 복구를 요청했습니다/)).toBeTruthy();
    });

    it('디버그 스위치를 콘솔에서 켜면 새로고침 없이 반영된다', async () => {
        render(<SelectorHealthBanner />);
        await waitFor(() => expect(listeners.length).toBeGreaterThan(0));

        store[DEBUG_KEY] = 'stopped';
        listeners.forEach(cb => cb({ [DEBUG_KEY]: { newValue: 'stopped', oldValue: undefined } }));

        await waitFor(() => expect(screen.getByText('채팅 수집이 중단됐어요')).toBeTruthy());
    });
});
