import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import GlobalStyles from "@mui/material/GlobalStyles";
import browser from "webextension-polyfill";
import { GlobalSettingContext } from "./context/GlobalSetting";
import useGlobalSetting from "./hooks/useGlobalSetting";
import {
  chatDisplayMethodOptions,
  toggleOptions,
  fontSizeOptions,
  languageOptions,
  positionOptions,
} from "./interfaces/setting";
import Selector from "./components/Selector";
import Title from "./components/Title";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Divider from "@mui/material/Divider";
import { styled } from "@mui/material/styles";
import ArrowRightIcon from "@mui/icons-material/ArrowRight";

const PopupGlobalStyle = (
  <GlobalStyles
    styles={(theme) => ({
      "*, *::before, *::after": {
        boxSizing: "border-box",
      },
      "*::-webkit-scrollbar": {
        width: "6px",
        backgroundColor: "rgba(255, 255, 255, 0)",
      },
      "*::-webkit-scrollbar-thumb": {
        borderRadius: "4px",
        margin: "2px",
        backgroundColor: "#d3d3d3",
      },
      body: {
        fontFamily:
          "'Pretendard Variable', -apple-system, BlinkMacSystemFont, system-ui, Roboto, 'Helvetica Neue', 'Segoe UI', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif",
        padding: "0",
        margin: "0",
        width: "16rem",
        lineHeight: "1.5",
      },
      "a, a:link, a:visited, a:hover, a:active": {
        color: "inherit",
        textDecoration: "inherit",
        fontWeight: "inherit",
      },
      "#root": {
        height: "21rem",
        overflow: "auto",
        userSelect: "none",
      },
    })}
  ></GlobalStyles>
);

const ButtonLink = styled(Button)({
  width: "100%",
  fontSize: "0.8rem",
});

const Popup = () => {
  const { globalSetting, dispatchGlobalSetting } = useGlobalSetting();
  const onPageButtonClicked = (path: string) => {
    browser.tabs.create({
      url: browser.runtime.getURL(`setting.html?initialPath=${path}`),
    });
  };

  useEffect(() => {
    browser.storage.onChanged.addListener((changed, areaName) => {
      if (areaName !== "local") return;

      for (let key in changed) {
        if (key === "position") {
          browser.storage.local.get('containerRatio').then(res => {
            let cr = res.containerRatio;
            cr = 100 - cr;
            browser.storage.local.set({ containerRatio: cr });
          })
        }
      }
    })
  }, [])

  return (
    <GlobalSettingContext.Provider
      value={{ globalSetting, dispatchGlobalSetting }}
    >
      <Title title={browser.i18n.getMessage("generalSetting")} />

      <Stack alignItems="flex-end">
        <ButtonLink
          endIcon={<ArrowRightIcon />}
          onClick={() => {
            onPageButtonClicked("filter");
          }}
        >
          <Stack direction="row" sx={{ width: "100%" }}>
            <span>{browser.i18n.getMessage("p_filter_btn")}</span>
          </Stack>
        </ButtonLink>
        <ButtonLink
          endIcon={<ArrowRightIcon />}
          onClick={() => {
            onPageButtonClicked("chatsaver");
          }}
        >
          <Stack direction="row" sx={{ width: "100%" }}>
            <span>{browser.i18n.getMessage("p_save_chat_btn")}</span>
          </Stack>
        </ButtonLink>
      </Stack>

      <Divider />

      <Stack>
        <Selector
          title={browser.i18n.getMessage("dispCopiedChatmethod")}
          values={chatDisplayMethodOptions}
          id="chatDisplayMethod"
        />
        <Divider />
        <Selector
          title={browser.i18n.getMessage("chatPosition")}
          values={positionOptions}
          id="position"
        />
        <Divider />
        <Selector
          title={browser.i18n.getMessage("pointBoxAutoClick")}
          values={toggleOptions}
          id="pointBoxAuto"
        />
      </Stack>

      <Title title={browser.i18n.getMessage("chatClientSetting")} />

      <Stack>
        <Selector
          title={browser.i18n.getMessage("language_text")}
          values={languageOptions}
          id="miniLanguage"
        />
        <Divider />
        <Selector
          title={browser.i18n.getMessage("fontSize")}
          values={fontSizeOptions}
          id="miniFontSize"
        />
        <Divider />
        <Selector
          title={browser.i18n.getMessage("chatTime")}
          values={toggleOptions}
          id="miniChatTime"
        />
      </Stack>

      <Title title={browser.i18n.getMessage("extraSetting")} />

      <Stack>
        <Button
          sx={{ width: "100%", fontSize: "0.8rem" }}
          endIcon={<ArrowRightIcon />}
          href="https://discord.gg/ZM6Eazpz5V"
          target="_blank"
        >
          <Stack direction="row" sx={{ width: "100%" }}>
            <span>{browser.i18n.getMessage("discord")}</span>
          </Stack>
        </Button>
      </Stack>
    </GlobalSettingContext.Provider>
  );
};

ReactDOM.createRoot(document.getElementById("root") as Element).render(
  <React.StrictMode>
    {PopupGlobalStyle}
    <Popup />
  </React.StrictMode>
);
