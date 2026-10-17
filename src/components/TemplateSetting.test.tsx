// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
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

    it('모양을 고르면 네 종류를 한꺼번에 바꾸고 저장한다', async () => {
        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: /말풍선|Bubble/ }));
        fireEvent.click(screen.getByRole('button', { name: /숨김|Hide/ }));
        expect(document.querySelector('.tbc-chat-bubble')).not.toBeNull();
        expect(document.querySelector('.tbc-chat-badge')).toBeNull();
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: /저장|Save/ })); });
        const stored = (await fakeBrowser.storage.local.get('chzzkTemplates')).chzzkTemplates;
        expect(stored).toEqual(buildTemplates({ layout: 'bubble', badges: false, size: 'normal' }));
    });

    it('직접 고친 템플릿이 저장돼 있으면 편집기를 펼치고 모양은 선택 없이 보인다', async () => {
        await fakeBrowser.storage.local.set({ chzzkTemplates: { chat: '<b>{{nickname}}</b>' } });
        renderPage();
        await waitFor(() => expect(editorValue()).toBe('<b>{{nickname}}</b>'));
        expect(screen.getByRole('button', { name: /한 줄|One line/ }).getAttribute('aria-pressed')).toBe('false');
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
