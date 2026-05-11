import React from 'react';
import IconButton from '@mui/material/IconButton';
import AddIcon from '@mui/icons-material/Add';

interface RoundAddButtonProps {
    onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
    size?: number;
    sx?: object;
}

/**
 * 빈 셀에 항목 추가용. 흰 원이 셀에 박혀 "귀신 눈깔" 같던 기존 디자인 → 투명 배경 +
 * dashed border + 저대비 아이콘. hover 시에만 살짝 부각.
 */
const RoundAddButton: React.FC<RoundAddButtonProps> = ({ onClick, size = 24, sx }) => {
    return (
        <IconButton
            size='small'
            onClick={onClick}
            aria-label="추가"
            sx={{
                width: size,
                height: size,
                // text.secondary 정도로 명도를 올려서 라이트 모드에서도 또렷하게 보임.
                color: 'text.secondary',
                border: '1px dashed',
                borderColor: 'text.disabled',
                bgcolor: 'transparent',
                transition: 'all 0.15s',
                '&:hover': {
                    color: 'primary.main',
                    borderColor: 'primary.main',
                    borderStyle: 'solid',
                    bgcolor: 'action.hover',
                },
                ...sx,
            }}
        >
            <AddIcon sx={{ fontSize: 14 }} />
        </IconButton>
    );
};

export default RoundAddButton;
