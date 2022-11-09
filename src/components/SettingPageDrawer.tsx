import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Toolbar from '@mui/material/Toolbar';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from '@mui/material/ListItemIcon';
import List from "@mui/material/List";
import ListItemText from "@mui/material/ListItemText";
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import ImageIcon from '@mui/icons-material/Image';
import Setting from "./setting/Setting";
import Donation from "./Donation";
import React from 'react';
import { redirect } from "react-router-dom";
import Alert from '@mui/material/Alert';

export default function SettingPageDrawer() {
    const { t } = useTranslation();
    const navigate = useNavigate();

    const onListButtonClicked = (path: string) => {
        navigate(`/${path}`)
    }

    return (
      <>
        <Toolbar />
        <Divider />
        <Alert severity="info">
          <span>{t('alert.extensionNotice')}</span>
        </Alert>
        <Stack justifyContent="space-between">
          <List dense={false}>
            <ListItemButton
              href={process.env.BASE_URL as string}
              target="_blank"
            >
              <ListItemIcon>
                <PlayArrowIcon />
              </ListItemIcon>
              <ListItemText primary={t("common.web_player")} />
            </ListItemButton>
            <ListItemButton
              onClick={() => {
                onListButtonClicked("filter");
              }}
            >
              <ListItemIcon>
                <FilterAltIcon />
              </ListItemIcon>
              <ListItemText primary={t("setting.filter_setting")} />
            </ListItemButton>
            <ListItemButton
              onClick={() => {
                onListButtonClicked("chatsaver");
              }}
            >
              <ListItemIcon>
                <ImageIcon />
              </ListItemIcon>
              <ListItemText primary={t("setting.save_chat")} />
            </ListItemButton>
          </List>
          <Divider />
          <Setting expand={false} />
          <Divider />
          <Donation />
        </Stack>
      </>
    );
}