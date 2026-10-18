import React, { useEffect, useState } from 'react';
import { Button, Notice } from '@/ui';

const DISMISSED_KEY = 'tbcv2-translation-notice-dismissed';

/**
 * 원본(한국어)이 아닌 언어로 볼 때 "번역이 어설플 수 있다" 안내. 닫으면 그 언어에선 다시 안 뜬다.
 * 팝업(browser.i18n)과 설정 페이지(i18next)가 번역 체계가 달라서 문구는 호출하는 쪽이 넘긴다.
 */
export default function TranslationNotice({ language, message, dismissLabel, flat }: {
    language: string;
    message: string;
    dismissLabel: string;
    /** 페이지 맨 위 띠로 (설정 페이지) */
    flat?: boolean;
}) {
    const isSource = language.toLowerCase().startsWith('ko');
    const [dismissed, setDismissed] = useState(true);

    useEffect(() => {
        if (isSource) return;
        browser.storage.local.get(DISMISSED_KEY)
            .then(r => setDismissed(r[DISMISSED_KEY] === language))
            .catch(() => setDismissed(false));
    }, [language, isSource]);

    if (isSource || dismissed || !message) return null;

    const dismiss = () => {
        setDismissed(true);
        browser.storage.local.set({ [DISMISSED_KEY]: language }).catch(() => { /* 다음에 또 뜰 뿐 */ });
    };

    return (
        <Notice tone="info" flat={flat} action={<Button variant="text" size="sm" onClick={dismiss}>{dismissLabel}</Button>}>
            {message}
        </Notice>
    );
}
