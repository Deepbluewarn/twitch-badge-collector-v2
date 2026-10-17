import { useEffect } from 'react';
import './base.css';

/** 디자인 토큰(tokens.css)이 고를 수 있게 <html data-theme>을 맞춘다. 페이지 바탕 스타일(base.css)도 함께 싣는다. */
export function useDocumentTheme(dark: boolean) {
    useEffect(() => {
        document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    }, [dark]);
}
