import { useTranslation } from "react-i18next";
import { styled } from "@mui/material/styles";
import Stack from "@mui/material/Stack";
import { BorderColors } from "../../interfaces/chat";
import React from "react";

const AnnouncementStyle = styled('div')(({theme}) => ({
    backgroundColor: theme.colors.bgColor_2,
    margin: '4px 0 4px 0',
    width: '100%',

    '.chat': {
        marginLeft: '-8px',
    }
}));

const AnnouncementTitle = styled(Stack)(({theme}) => ({
    justifyContent: 'center',
    backgroundColor: theme.colors.bgColor_3,
    color: theme.palette.text.primary,
    height: '1rem',
    fontWeight: 'bold',
    padding: '8px 8px 8px 10px',
}))



export default function AnnouncementContainer(props: { borderColor: string, children: React.ReactNode }) {
    const colors = {
        PRIMARY: '#9146FF',
        BLUE: '#00D6D6',
        GREEN: '#00DB84',
        ORANGE: '#FFB31A',
        PURPLE: '#9146FF'
    } as BorderColors;

    const { t } = useTranslation();

    return (
        <AnnouncementStyle 
            sx={{
                borderLeft: `${colors[props.borderColor]} solid 8px`,
                borderRight: `${colors[props.borderColor]} solid 8px`,
            }} 
        >
            <AnnouncementTitle direction='column' className="announcement-title">
                <span>{t('common.announcement')}</span>
            </AnnouncementTitle>
            {props.children}
        </AnnouncementStyle>
    )
}