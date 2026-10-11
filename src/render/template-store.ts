import { useEffect, useState } from "react";
import { parseTemplate, TemplateError } from "./template";
import type { ChzzkTemplates } from "./chzzk-render";

/**
 * 사용자 템플릿 저장소 — storage.local `chzzkTemplates`.
 *
 * 켜고 끄는 건 설정 `chzzkCustomTemplate`이고, 여기엔 본문만 둔다. 고치지 않은 종류는
 * 저장하지 않는다(없으면 기본 템플릿). storage엔 스키마가 없으니 읽을 때마다 걸러낸다.
 */

export const TEMPLATE_STORAGE_KEY = 'chzzkTemplates';
export const TEMPLATE_KINDS = ['chat', 'donation', 'subscription'] as const;
/** 템플릿 하나의 최대 길이. 채팅마다 렌더하므로 비정상적으로 큰 값은 받지 않는다. */
export const TEMPLATE_MAX_LENGTH = 20000;

export type StoredTemplates = Partial<ChzzkTemplates>;

/** storage에서 읽은 값을 알려진 종류의 문자열만 남겨 정리한다. */
export function sanitizeStoredTemplates(v: unknown): StoredTemplates {
    if (!v || typeof v !== 'object') return {};
    const out: StoredTemplates = {};
    for (const kind of TEMPLATE_KINDS) {
        const src = (v as Record<string, unknown>)[kind];
        if (typeof src === 'string' && src.length <= TEMPLATE_MAX_LENGTH) out[kind] = src;
    }
    return out;
}

export type TemplateValidation = { ok: true } | { ok: false; message: string; index: number };

export function validateTemplate(src: string): TemplateValidation {
    if (src.length > TEMPLATE_MAX_LENGTH) {
        return { ok: false, message: `템플릿이 너무 깁니다 (최대 ${TEMPLATE_MAX_LENGTH}자)`, index: TEMPLATE_MAX_LENGTH };
    }
    try {
        parseTemplate(src);
        return { ok: true };
    } catch (e) {
        if (e instanceof TemplateError) return { ok: false, message: e.message, index: e.index };
        throw e;
    }
}

export async function loadTemplates(): Promise<StoredTemplates> {
    const res = await browser.storage.local.get(TEMPLATE_STORAGE_KEY);
    return sanitizeStoredTemplates(res[TEMPLATE_STORAGE_KEY]);
}

export async function saveTemplates(templates: StoredTemplates): Promise<void> {
    await browser.storage.local.set({ [TEMPLATE_STORAGE_KEY]: sanitizeStoredTemplates(templates) });
}

/** 저장된 템플릿을 읽고, 다른 곳(설정 페이지)에서 바꾸면 따라간다. */
export function useStoredTemplates(): StoredTemplates {
    const [templates, setTemplates] = useState<StoredTemplates>({});
    useEffect(() => {
        let alive = true;
        loadTemplates().then(t => { if (alive) setTemplates(t); });
        const listener = (changes: Record<string, { newValue?: unknown }>) => {
            if (TEMPLATE_STORAGE_KEY in changes) setTemplates(sanitizeStoredTemplates(changes[TEMPLATE_STORAGE_KEY].newValue));
        };
        browser.storage.local.onChanged.addListener(listener);
        return () => {
            alive = false;
            browser.storage.local.onChanged.removeListener(listener);
        };
    }, []);
    return templates;
}
