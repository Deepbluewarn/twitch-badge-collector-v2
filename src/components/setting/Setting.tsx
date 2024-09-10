import Switch from "@mui/material/Switch";
import Divider from "@mui/material/Divider";
import List from "@mui/material/List";
import ListSubheader from "@mui/material/ListSubheader";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Box from '@mui/material/Box';
import { useGlobalSettingContext } from "../../context/GlobalSetting";
import { useTranslation } from 'react-i18next';
import { setAdvancedFilter, setChatTime, setDarkTheme } from "../../reducer/setting";

export default function Setting() {
    const { globalSetting, dispatchGlobalSetting } = useGlobalSettingContext();
    const { t } = useTranslation();

    const handleSwitchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.checked;
        const id = event.target.id;

        if (id === 'dark-theme-switch') {
            dispatchGlobalSetting(setDarkTheme(value ? 'on' : 'off'))
        } else if (id === 'chat-time-switch') {
            dispatchGlobalSetting(setChatTime(value ? 'on' : 'off'));
        } else if (id === 'filter-mode-switch'){
            dispatchGlobalSetting(setAdvancedFilter(value ? 'on' : 'off'));
        }
    };

    const theme = (
        <ListItem>
            <ListItemText primary={t('setting.darkmode')} />
            <Switch
                id='dark-theme-switch'
                checked={globalSetting.darkTheme === 'on'}
                onChange={handleSwitchChange}
            />
        </ListItem>
    );

    const chatTime = (
        <ListItem>
            <ListItemText primary={t('setting.chat_time')} />
            <Switch
                id='chat-time-switch'
                checked={globalSetting.chatTime === 'on'}
                onChange={handleSwitchChange}
            />
        </ListItem>
    );

    const mode = (
        <ListItem>
            <ListItemText primary={t('setting.filter_mode.advanced')} />
            <Switch
                id='filter-mode-switch'
                checked={globalSetting.advancedFilter === 'on'}
                onChange={handleSwitchChange}
            />
        </ListItem>
    )

    return (
        <Box>
            <List
                subheader={<ListSubheader disableSticky={true} >{t('common.general')}</ListSubheader>}
            >
                {theme}
            </List>

            <>
                <Divider />

                <List
                    subheader={<ListSubheader disableSticky={true}>{t('common.chat')}</ListSubheader>}
                >
                    {chatTime}
                </List>
                <Divider />
                <List
                    subheader={<ListSubheader disableSticky={true}>{t('common.filter')}</ListSubheader>}
                >
                    {mode}
                </List>
            </>
        </Box>
    )
}