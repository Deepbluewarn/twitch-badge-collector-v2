import React from 'react';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import MenuIcon from '@mui/icons-material/Menu';
import RefreshIcon from '@mui/icons-material/Refresh';
import { nanoid } from 'nanoid';
import { styled } from '@mui/material/styles';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDiscord, faGithub } from '@fortawesome/free-brands-svg-icons';
import { faEnvelope } from '@fortawesome/free-solid-svg-icons';

const drawerWidth = 310;

const MainBox = styled(Box)(({theme}) => ({
    flexGrow: '1',
    padding: '16px',
    width: `calc(100% - ${drawerWidth}px)`, 
    display: 'flex',
    'flexDirection': 'column',
    backgroundColor: theme.palette.background.default
}))

export default function DrawerTemplate(props: { title: string, name: string, drawer: JSX.Element, children: React.ReactNode }) {
    const [mobileOpen, setMobileOpen] = React.useState(false);

    const handleDrawerToggle = () => {
        setMobileOpen(!mobileOpen);
    }

    return (
      <Box sx={{ display: "flex", height: "100%" }}>
        <AppBar
          position="fixed"
          sx={{
            width: { sm: `calc(100% - ${drawerWidth}px)` },
            ml: { sm: `${drawerWidth}px` },
          }}
        >
          <Toolbar>
            <IconButton
              color="inherit"
              aria-label="open drawer"
              edge="start"
              onClick={handleDrawerToggle}
              sx={{ mr: 2, display: { sm: "none" } }}
            >
              <MenuIcon />
            </IconButton>
            <Typography
              variant="h6"
              noWrap
              component="div"
              sx={{ flexGrow: 1 }}
            >
              {props.title}
            </Typography>
          </Toolbar>
        </AppBar>
        <Box
          component="nav"
          sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
          aria-label="mailbox folders"
        >
          <Drawer
            variant="temporary"
            open={mobileOpen}
            onClose={handleDrawerToggle}
            ModalProps={{
              keepMounted: true,
            }}
            sx={{
              display: { xs: "block", sm: "none" },
              "& .MuiDrawer-paper": {
                boxSizing: "border-box",
                width: drawerWidth,
              },
            }}
          >
            {props.drawer}
          </Drawer>
          <Drawer
            variant="permanent"
            sx={{
              display: { xs: "none", sm: "block" },
              "& .MuiDrawer-paper": {
                boxSizing: "border-box",
                width: drawerWidth,
              },
            }}
            open
          >
            {props.drawer}
          </Drawer>
        </Box>
        <MainBox component="main">
          <Toolbar />
          {props.children}

          <Stack
            direction="row"
            justifyContent="center"
            spacing={1}
            sx={{ width: "100%", margin: "32px 0 0 0" }}
          >
            <Button href="https://discord.gg/ZM6Eazpz5V" target="_blank">
              <FontAwesomeIcon icon={faDiscord} size="xl" />
            </Button>
            <Button
              href="https://github.com/Deepbluewarn/twitch-badge-collector-v2"
              target="_blank"
            >
              <FontAwesomeIcon icon={faGithub} size="xl" />
            </Button>
            <Button href="mailto:tbcextension@gmail.com" target="_blank">
              <FontAwesomeIcon icon={faEnvelope} size="xl" />
            </Button>
          </Stack>
        </MainBox>
      </Box>
    );
}