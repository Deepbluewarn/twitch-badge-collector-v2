import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import browser from "webextension-polyfill";

export function ExtensionTitle() {
    return (
        <Stack
            direction='row'
            alignItems='center'
            gap={2}
            sx={{ marginBottom: '16px' }}
        >
            <Box
                component='img'
                sx={{
                    width: '3rem',
                    height: '3rem'
                }}
                alt={browser.runtime.getManifest().name}
                src={browser.runtime.getURL(`src/assets/icon.png`)}
            >
            </Box>
            <Typography variant="h6" sx={{ fontWeight: '500' }}>
                {browser.runtime.getManifest().name}
            </Typography>
        </Stack>
    )
}