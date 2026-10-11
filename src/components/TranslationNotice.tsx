import React, { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';

const DISMISSED_KEY = 'tbcv2-translation-notice-dismissed';

/**
 * 원본(한국어)이 아닌 언어로 볼 때 "번역이 어설플 수 있다" 안내. 닫으면 그 언어에선 다시 안 뜬다.
 * 팝업(browser.i18n)과 설정 페이지(i18next)가 번역 체계가 달라서 문구는 호출하는 쪽이 넘긴다.
 */
export default function TranslationNotice({ language, message, dismissLabel, sx }: {
    language: string;
    message: string;
    dismissLabel: string;
    sx?: object;
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
        <Alert
            severity="info"
            sx={{ py: 0, alignItems: 'center', '& .MuiAlert-message': { fontSize: '0.75rem' }, ...sx }}
            action={<Button color="inherit" size="small" onClick={dismiss} sx={{ textTransform: 'none' }}>{dismissLabel}</Button>}
        >
            {message}
        </Alert>
    );
}
