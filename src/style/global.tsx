import React from 'react';
import GlobalStyles from '@mui/material/GlobalStyles';

const globalStyles = (
  <GlobalStyles styles={(theme) => ({
    body: {
      fontFamily: `
          'Pretendard Variable', 
          -apple-system, 
          BlinkMacSystemFont, 
          system-ui, 
          Roboto, 
          'Helvetica Neue', 
          'Segoe UI', 
          'Apple SD Gothic Neo', 
          'Noto Sans KR', 
          'Malgun Gothic', 
          sans-serif
        `,
      padding: '0',
      margin: '0',
      lineHeight: '1.5',
      overflow: 'hidden',
      overscrollBehavior: 'contain',
      height: `calc(var(--vh, 1vh) * 100)`,
    },
    '#root': {
      width: '100%',
      height: '100%',
      overflow: 'auto',
    },
    '#main': {
      height: 'inherit'
    },
    '*::-webkit-scrollbar': {
      width: '6px'
    },
    '*::-webkit-scrollbar-thumb': {
      backgroundColor: theme.palette.divider,
      borderRadius: '4px'
    },
    a: {
      outline: 'none',
      textDecoration: 'none',
      color: theme.palette.text.primary,
    },
    'a:focus, a:hover, a:active': {
      color: theme.palette.text.primary,
    },
    '.font-size-small': {
      fontSize: '0.74rem',
    },
    '.font-size-default': {
      fontSize: '0.86rem',
    },
    '.font-size-big': {
      fontSize: '0.96rem',
    },
    '.font-size-bigger': {
      fontSize: '1.2rem',
    },
    '.chat-with-player': {
      width: '100% !important',
    },
    '.hidden': {
      display: 'none !important',
    }
  })} />
)

export default globalStyles;