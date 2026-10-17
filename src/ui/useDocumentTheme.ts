import { useEffect } from 'react';
import './tokens.css';

/** 디자인 토큰(tokens.css)이 고를 수 있게 <html data-theme>을 맞춘다. */
export function useDocumentTheme(dark: boolean) {
    useEffect(() => {
        document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    }, [dark]);
}
