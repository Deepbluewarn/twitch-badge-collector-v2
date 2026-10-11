import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './en/en.json';
import ko from './ko/ko.json';
import ru from './ru/ru.json';
import uk from './uk/uk.json';
import ja from './ja/ja.json';
import es from './es/es.json';
import ptBR from './pt-BR/pt-BR.json';
import de from './de/de.json';
import fr from './fr/fr.json';
import zhCN from './zh-CN/zh-CN.json';
import zhTW from './zh-TW/zh-TW.json';

/** 번역 원본 언어. 이 외의 언어에는 "번역이 어설플 수 있다" 안내를 띄운다. */
export const SOURCE_LANGUAGE = 'ko';

/**
 * 팝업·콘텐츠 스크립트(browser.i18n)와 같은 언어를 쓰도록 브라우저 UI 언어를 따른다.
 * navigator.language는 브라우저 UI 언어와 다를 수 있다.
 */
function uiLanguage(): string {
    try {
        return browser.i18n.getUILanguage();
    } catch {
        return typeof navigator !== 'undefined' ? navigator.language : 'en';
    }
}

i18n
    .use(initReactI18next)
    .init({
        lng: uiLanguage(),
        // 'pt'·'zh' 같은 지역 없는 코드와 홍콩 번체는 가장 가까운 번역으로.
        fallbackLng: {
            pt: ['pt-BR'],
            zh: ['zh-CN'],
            'zh-HK': ['zh-TW'],
            'zh-MO': ['zh-TW'],
            default: ['en'],
        },
        resources: {
            en: { translation: en },
            ko: { translation: ko },
            ru: { translation: ru },
            uk: { translation: uk },
            ja: { translation: ja },
            es: { translation: es },
            'pt-BR': { translation: ptBR },
            de: { translation: de },
            fr: { translation: fr },
            'zh-CN': { translation: zhCN },
            'zh-TW': { translation: zhTW },
        },
    });

export default i18n;
