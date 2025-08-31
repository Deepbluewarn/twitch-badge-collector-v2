import React from 'react';
import { Button } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';

interface RoundAddButtonProps {
    onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
    size?: number; // 버튼 크기 (기본값: 32)
    sx?: object; // 추가 스타일
}

const RoundAddButton: React.FC<RoundAddButtonProps> = ({ onClick, size = 32, sx }) => {
    return (
        <Button
            size='small'
            sx={{
                minWidth: size,
                minHeight: size,
                width: size,
                height: size,
                border: '1px solid #eeeeee',
                borderRadius: '50%',
                backgroundColor: '#fafafa',
                color: '#888888',
                fontWeight: 'bold',
                boxShadow: 'none',
                p: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background-color 0.2s, color 0.2s',
                '&:hover': {
                    backgroundColor: '#f0f0f0',
                    color: '#757575',
                },
                ...sx,
            }}
            onClick={onClick}
        >
            <AddIcon />
        </Button>
    );
};

export default RoundAddButton;
