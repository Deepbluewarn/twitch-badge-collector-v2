import { useTranslation } from 'react-i18next';
import { useNavigate } from "react-router-dom";
import Toolbar from '@mui/material/Toolbar';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from '@mui/material/ListItemIcon';
import List from "@mui/material/List";
import ListItemText from "@mui/material/ListItemText";
import Alert from '@mui/material/Alert';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import ImageIcon from '@mui/icons-material/Image';
import Setting from "../setting/Setting";


export default function SettingPageDrawer() {
    const { t } = useTranslation();
    const navigate = useNavigate();

    const filterListItem = (
        <>
            <ListItemIcon>
                <FilterAltIcon />
            </ListItemIcon>
            <ListItemText
                primary={t('setting.filter_setting')}
            />
        </>
    );

    const chatSaverListItem = (
        <>
            <ListItemIcon>
                <ImageIcon />
            </ListItemIcon>
            <ListItemText
                primary={t('setting.save_chat')}
            />
        </>
    );

    return (
        <>
            <Toolbar />
            <Divider />
            <Stack justifyContent='space-between'>
                <List dense={false}>
                    <ListItemButton onClick={() => navigate(`/filter`)}>
                        {filterListItem}
                    </ListItemButton>

                    <ListItemButton onClick={() => navigate(`/chatsaver`)}>
                        {chatSaverListItem}
                    </ListItemButton>
                </List>
                <Divider />
                <Setting />
                <Divider />
            </Stack>
        </>
    )
}