import React from 'react';
import { Button, useTheme } from '@mui/material';
import { useCustomTheme } from "@/hooks/useCustomTheme";
import AddIcon from '@mui/icons-material/Add';
import { useGlobalSettingContext } from '@/context/GlobalSetting';

interface RoundAddButtonProps {
    onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
    size?: number; // 버튼 크기 (기본값: 32)
    sx?: object; // 추가 스타일
}

const RoundAddButton: React.FC<RoundAddButtonProps> = ({ onClick, size = 32, sx }) => {
    const { globalSetting } = useGlobalSettingContext();
    const theme = useCustomTheme(globalSetting.darkTheme === 'on');
    const colors = theme.colors;
    return (
        <Button
            size='small'
            sx={{
                minWidth: size,
                minHeight: size,
                width: size,
                height: size,
                border: `1px solid ${colors.borderColor}`,
                borderRadius: '50%',
                backgroundColor: colors.bgColor_2,
                color: colors.textColor_2,
                fontWeight: 'bold',
                boxShadow: 'none',
                p: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background-color 0.2s, color 0.2s',
                '&:hover': {
                    backgroundColor: colors.bgColor_3,
                    color: colors.textColor_1,
                },
                ...sx,
            }}
            onClick={onClick}
        >
            <AddIcon sx={{ color: colors.textColor_2 }} />
        </Button>
    );
};

export default RoundAddButton;
