import React from "react";
import ReactDOM from "react-dom";
import { createGlobalStyle } from "styled-components";
import browser from "webextension-polyfill";
import { GlobalSettingContext } from "./context/globalSetting";
import useGlobalSetting from "./hooks/useGlobalSetting";
import {
  chatDisplayMethodOptions,
  toggleOptions,
  fontSizeOptions,
  languageOptions,
  positionOptions,
} from "./interfaces/setting";
import Link from "./popup/Link";
import ListContainer from "./popup/ListContainer";
import Selector from "./popup/Selector";
import Title from "./popup/Title";

const PopupGlobalStyle = createGlobalStyle`
    *, *::before, *::after {
        box-sizing: border-box;
    }
    *::-webkit-scrollbar{
        width: 6px;
        background-color: rgba(255, 255, 255, 0);
    }
    *::-webkit-scrollbar-thumb{
        border-radius: 4px;
        margin: 2px;
        background-color: #d3d3d3;
    }
    body {
        font-family: 'Pretendard Variable', -apple-system, BlinkMacSystemFont, system-ui, Roboto, 'Helvetica Neue', 'Segoe UI', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif;
        padding: 0;
        margin: 0;
        width: 16rem;
        height: 
        line-height: 1.5;
    }
    a, a:link, a:visited, a:hover, a:active {
      color: inherit;
      text-decoration: inherit;
      font-weight: inherit;
    }
    #root{
        height: 21rem;
        overflow: auto;
        user-select: none;
    }
`;
const Popup = () => {
  const { globalSetting, dispatchGlobalSetting } = useGlobalSetting();
  const extensionVersion = React.useRef(browser.runtime.getManifest().version);

  return (
    <GlobalSettingContext.Provider
      value={{ globalSetting, dispatchGlobalSetting }}
    >
      <Title title={browser.i18n.getMessage('generalSetting')}/>

      <ListContainer>
        <Link title={browser.i18n.getMessage('p_filter_btn')} url={`https://badgecollector.dev/setting/filter?ext_version=${extensionVersion.current}`}/>
        <Link title={browser.i18n.getMessage('p_save_chat_btn')} url={`https://badgecollector.dev/setting/chatsaver?ext_version=${extensionVersion.current}`}/>
      </ListContainer>

      <ListContainer>
        <Selector
          title={browser.i18n.getMessage('dispCopiedChatmethod')}
          values={chatDisplayMethodOptions}
          id="chatDisplayMethod"
        />
        <Selector title={browser.i18n.getMessage('chatPosition')} values={positionOptions} id="position" />
        <Selector
          title={browser.i18n.getMessage('pointBoxAutoClick')}
          values={toggleOptions}
          id="pointBoxAuto"
        />
      </ListContainer>

      <Title title={browser.i18n.getMessage('chatClientSetting')} />

      <ListContainer>
        <Selector title={browser.i18n.getMessage('language_text')} values={languageOptions} id="miniLanguage" />
        <Selector
          title={browser.i18n.getMessage('fontSize')}
          values={fontSizeOptions}
          id="miniFontSize"
        />
        <Selector
          title={browser.i18n.getMessage('chatTime')}
          values={toggleOptions}
          id="miniChatTime"
        />
      </ListContainer>

      <Title title={browser.i18n.getMessage('extraSetting')} />

      <ListContainer>
        <Link title={browser.i18n.getMessage('review')} url='' />
        <Link title={browser.i18n.getMessage('discord')} url='' />
      </ListContainer>
    </GlobalSettingContext.Provider>
  );
};

ReactDOM.render(
  <React.StrictMode>
    <PopupGlobalStyle />
    <Popup />
  </React.StrictMode>,
  document.getElementById("root")
);
