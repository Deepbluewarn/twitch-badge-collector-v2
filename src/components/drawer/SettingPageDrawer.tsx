import { useTranslation } from 'react-i18next';
import { useNavigate } from "react-router-dom";
import Toolbar from '@mui/material/Toolbar';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from '@mui/material/ListItemIcon';
import List from "@mui/material/List";
import ListItemText from "@mui/material/ListItemText";
import FilterAltIcon from '@mui/icons-material/FilterAlt';
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

    return (
        <>
            <Toolbar />
            <Divider />
            <Stack justifyContent='space-between'>
                <List dense={false}>
                    <ListItemButton onClick={() => navigate(`/filter`)}>
                        {filterListItem}
                    </ListItemButton>
                </List>
                <Divider />
                <Setting />
                <Divider />
            </Stack>
        </>
    )
}