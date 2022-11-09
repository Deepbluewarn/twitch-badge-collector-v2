import React, { useEffect } from "react";
import Switch from "@mui/material/Switch";
import { useGlobalSettingContext } from "../../context/GlobalSetting";
import List from "@mui/material/List";
import ListSubheader from "@mui/material/ListSubheader";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Box from "@mui/material/Box";
import { useTranslation } from "react-i18next";
import Divider from "@mui/material/Divider";

export default function Setting(props: { expand?: boolean }) {
  const { globalSetting, dispatchGlobalSetting } = useGlobalSettingContext();
  const { t } = useTranslation();

  const handleSwitchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const checked = event.target.checked;
    const id = event.target.id;

    if (id === "dark-theme-switch") {
      dispatchGlobalSetting({
        type: "darkTheme",
        value: checked ? "on" : "off",
      });
    } else if (id === "chat-time-switch") {
      dispatchGlobalSetting({
        type: "chatTime",
        value: checked ? "on" : "off",
      });
    }
  };

  return (
    <Box>
      <List
        subheader={
          <ListSubheader disableSticky={true}>
            {t('common.chat')}
          </ListSubheader>
        }
      >
        <ListItem>
          <ListItemText primary={t('setting.chat_time')} />

          <Switch
            id='chat-time-switch'
            checked={globalSetting.chatTime === 'on'}
            onChange={handleSwitchChange}
          />
        </ListItem>
      </List>

      <Divider />

      <List
        subheader={
          <ListSubheader disableSticky={true}>
            {t("common.general")}
          </ListSubheader>
        }
      >
        <ListItem>
          <ListItemText primary={t("setting.darkTheme")} />

          <Switch
            id="dark-theme-switch"
            checked={globalSetting.darkTheme === 'on'}
            onChange={handleSwitchChange}
          />
        </ListItem>
      </List>
    </Box>
  );
}
