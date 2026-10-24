// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act, within } from '@testing-library/react';
import { fakeBrowser } from '@webext-core/fake-browser';
import { GlobalSettingContext } from '@/context/GlobalSetting';
import { initialState } from '@/reducer/setting';
import { DEFAULT_CHZZK_TEMPLATES, buildTemplates } from '@/render/chzzk-templates';
import '@/translate/i18n';
import { EditorView } from '@uiw/react-codemirror';

// fake-browser엔 i18n과 일부 runtime API가 없다 — 하단 SocialFooter가 쓴다.
vi.stubGlobal('browser', {
    ...fakeBrowser,
    i18n: { getMessage: () => '' },
    runtime: { ...fakeBrowser.runtime, getURL: (p: string) => p, getManifest: () => ({ version: '0.0.0' }) },
});
const { default: TemplateSetting } = await import('./TemplateSetting');

function renderPage(custom: 'on' | 'off' = 'off') {
    const dispatch = vi.fn();
    render(
        <GlobalSettingContext.Provider value={{ globalSetting: { ...initialState, chzzkCustomTemplate: custom }, dispatchGlobalSetting: dispatch }}>
            <TemplateSetting />
        </GlobalSettingContext.Provider>,
    );
    return { dispatch };
}

// CodeMirror 편집기는 textarea가 아니라 contenteditable이다 — EditorView로 직접 읽고 쓴다.
const view = () => EditorView.findFromDOM(document.querySelector('.cm-editor') as HTMLElement)!;
const editorValue = () => view().state.doc.toString();
const openEditor = async () => fireEvent.click(await screen.findByRole('button', { name: /HTML/ }));
const typeTemplate = (value: string) => act(() => {
    view().dispatch({ changes: { from: 0, to: view().state.doc.length, insert: value } });
});

describe('TemplateSetting', () => {
    beforeEach(() => fakeBrowser.reset());
    afterEach(cleanup);

    it('기본 템플릿으로 시작하고 샘플 채팅을 미리보기에 그린다', async () => {
        renderPage();
        expect(document.querySelector('.cm-editor')).toBeNull();   // 편집기는 접혀 있다
        await openEditor();
        await waitFor(() => expect(editorValue()).toBe(DEFAULT_CHZZK_TEMPLATES.chat));
        expect(document.querySelectorAll('.tbc-chat').length).toBeGreaterThan(0);
        expect(document.querySelector('details.tbc-chat-cleanbot')).not.toBeNull();
    });

    it('토글을 켜면 설정을 dispatch', async () => {
        const { dispatch } = renderPage('off');
        fireEvent.click(screen.getByRole('switch'));
        expect(dispatch).toHaveBeenCalledWith({ type: 'SET_CHZZK_CUSTOM_TEMPLATE', payload: 'on' });
    });

    it('편집하면 미리보기가 바뀌고, 저장하면 기본값과 다른 종류만 저장한다', async () => {
        renderPage();
        await openEditor();
        await waitFor(() => expect(editorValue()).toBe(DEFAULT_CHZZK_TEMPLATES.chat));
        typeTemplate('<b class="mine">{{nickname}}</b>');
        expect(document.querySelector('.mine')).not.toBeNull();
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: /저장|Save/ })); });
        const stored = await fakeBrowser.storage.local.get('chzzkTemplates');
        expect(stored.chzzkTemplates).toEqual({ chat: '<b class="mine">{{nickname}}</b>' });
    });

    it('문법 오류면 줄·칸과 함께 알리고 저장을 막는다', async () => {
        renderPage();
        await openEditor();
        await waitFor(() => expect(editorValue()).toBe(DEFAULT_CHZZK_TEMPLATES.chat));
        typeTemplate('a\nbc{{#badges}}');
        expect(screen.getByRole('alert').textContent).toMatch(/2.*3/);
        expect((screen.getByRole('button', { name: /저장|Save/ }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('창 전체에서 배치를, 배지에서 숨김을 고르면 네 종류를 바꾸고 바로 저장한다', async () => {
        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: /창 전체|Whole window/ }));
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^(말풍선|Bubble)$/ }));
        await waitFor(() => expect(document.querySelector('.tbc-chat-bubble')).not.toBeNull());
        fireEvent.click(screen.getByRole('button', { name: /^(배지|Badges)/ }));
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^(숨김|Hide)$/ }));
        await waitFor(async () => {
            const stored = (await fakeBrowser.storage.local.get('chzzkTemplates')).chzzkTemplates;
            expect(stored).toEqual(buildTemplates({ layout: 'bubble', badges: false, size: 'normal' }));
        });
        expect(document.querySelector('.tbc-chat-badge')).toBeNull();
    });

    it('직접 고친 템플릿이 저장돼 있으면 편집기를 펼치고 배치는 선택 없이 보인다', async () => {
        await fakeBrowser.storage.local.set({ chzzkTemplates: { chat: '<b>{{nickname}}</b>' } });
        renderPage();
        await waitFor(() => expect(editorValue()).toBe('<b>{{nickname}}</b>'));
        fireEvent.click(screen.getByRole('button', { name: /창 전체|Whole window/ }));
        expect(within(screen.getByRole('dialog')).getByRole('button', { name: /^(한 줄|One line)$/ }).getAttribute('aria-pressed')).toBe('false');
    });

    it('직접 고친 템플릿은 묻고 나서 덮는다 — 취소하면 그대로', async () => {
        await fakeBrowser.storage.local.set({ chzzkTemplates: { chat: '<b>{{nickname}}</b>' } });
        const confirm = vi.fn(() => false);
        vi.stubGlobal('confirm', confirm);
        renderPage();
        await waitFor(() => expect(editorValue()).toBe('<b>{{nickname}}</b>'));
        fireEvent.click(screen.getByRole('button', { name: /창 전체|Whole window/ }));
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^(두 줄|Two lines)$/ }));
        expect(confirm).toHaveBeenCalled();
        expect(editorValue()).toBe('<b>{{nickname}}</b>');
        vi.stubGlobal('confirm', () => true);
    });

    it('스타일은 미리보기에 바로 걸리고 저장되며, 바꾼 부분에 점이 붙는다', async () => {
        renderPage();
        const chip = await screen.findByRole('button', { name: /채팅 줄|Chat line/ });
        expect(chip.querySelector('span')).toBeNull();
        fireEvent.click(chip);
        const [divider] = within(screen.getByRole('dialog')).getAllByRole('switch');
        fireEvent.click(divider);
        expect(document.querySelector('.tbc-styled--divider')).not.toBeNull();
        expect(chip.querySelector('span')).not.toBeNull();
        await waitFor(async () => {
            const stored = (await fakeBrowser.storage.local.get('chzzkTemplateStyle')).chzzkTemplateStyle;
            expect(stored.divider).toBe(true);
        });
        fireEvent.click(screen.getByRole('button', { name: /이 부분 되돌리기|Reset this part/ }));
        expect(document.querySelector('.tbc-styled--divider')).toBeNull();
    });

    it('미리보기의 닉네임을 누르면 닉네임 설정이 열린다', async () => {
        renderPage();
        await screen.findByRole('button', { name: /창 전체|Whole window/ });
        fireEvent.click(document.querySelector('.tbc-chat-nick')!);
        expect(screen.getByRole('dialog', { name: /^(닉네임|Nickname)$/ })).not.toBeNull();
    });

    it('시각 표시는 채팅 시간 표시 설정과 같은 값이다', async () => {
        const { dispatch } = renderPage();
        fireEvent.click(await screen.findByRole('button', { name: /^(시각|Time)/ }));
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('switch'));
        expect(dispatch).toHaveBeenCalledWith({ type: 'SET_CHAT_TIME', payload: 'on' });
    });

    it('완성된 모양을 고르면 템플릿과 스타일을 함께 바꾼다', async () => {
        renderPage();
        fireEvent.change(await screen.findByRole('combobox', { name: /모양 불러오기|Load a look/ }), { target: { value: 'compact' } });
        await waitFor(async () => {
            const r = await fakeBrowser.storage.local.get(['chzzkTemplates', 'chzzkTemplateStyle']);
            expect(r.chzzkTemplates).toEqual(buildTemplates({ layout: 'inline', badges: false, size: 'normal' }));
            expect(r.chzzkTemplateStyle.zebra).toBe(true);
        });
    });

    it('값 목록을 누르면 편집기 커서 자리에 넣는다', async () => {
        renderPage();
        await openEditor();
        await waitFor(() => expect(editorValue()).toBe(DEFAULT_CHZZK_TEMPLATES.chat));
        typeTemplate('');
        fireEvent.click(screen.getByRole('button', { name: '{{nickname}}' }));
        expect(editorValue()).toBe('{{nickname}}');
    });
});
