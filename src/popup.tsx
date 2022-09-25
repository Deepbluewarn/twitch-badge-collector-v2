import React from "react";
import ReactDOM from "react-dom";
import { createGlobalStyle } from "styled-components";
import { GlobalSettingContext } from "./context/globalSetting";
import useGlobalSetting from "./hooks/useGlobalSetting";
import {
  chatDisplayMethodOptions,
  toggleOptions,
  fontSizeOptions,
  languageOptions,
  positionOptions,
  themeOptions,
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

  return (
    <GlobalSettingContext.Provider
      value={{ globalSetting, dispatchGlobalSetting }}
    >
      <Title title="일반 설정" />

      <ListContainer>
        <Link title="필터 설정" url='https://wtbclight.bluewarn.dev/filter'/>
        <Link title="채팅을 이미지로 저장" url='https://wtbclight.bluewarn.dev/chatsaver' />
      </ListContainer>

      <ListContainer>
        <Selector
          title="채팅 표시 방법"
          values={chatDisplayMethodOptions}
          id="chatDisplayMethod"
        />
        <Selector title="채팅 위치" values={positionOptions} id="position" />
        <Selector
          title="포인트 상자 자동 클릭"
          values={toggleOptions}
          id="pointBoxAuto"
        />
      </ListContainer>

      <Title title="채팅 클라이언트 설정" />

      <ListContainer>
        <Selector title="채팅창 테마" values={themeOptions} id="miniTheme" />
        <Selector title="언어" values={languageOptions} id="miniLanguage" />
        <Selector
          title="폰트 크기"
          values={fontSizeOptions}
          id="miniFontSize"
        />
        <Selector
          title="채팅 시간 표시"
          values={toggleOptions}
          id="miniChatTime"
        />
      </ListContainer>

      <Title title="기타" />

      <ListContainer>
        <Link title="확장 프로그램 평가" url='' />
        <Link title="지원" url=''/>
        <Link title="디스코드" url='' />
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
