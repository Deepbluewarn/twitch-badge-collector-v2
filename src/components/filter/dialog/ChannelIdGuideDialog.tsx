import { Box, Dialog, DialogContent, DialogTitle, IconButton, Paper, Stack, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { Trans, useTranslation } from "react-i18next";
import { getAdapter } from "@/platform";

export default function ChannelIdGuideDialog({ open, onClose }: { open: boolean, onClose: () => void }) {
    const { t } = useTranslation();
    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="sm"
            fullWidth
            PaperProps={{
                sx: {
                    bgcolor: 'background.paper',
                    backgroundImage: 'none',
                    border: 1,
                    borderColor: 'divider',
                },
            }}
            slotProps={{
                backdrop: {
                    sx: {
                        backdropFilter: 'blur(6px)',
                        backgroundColor: 'rgba(0, 0, 0, 0.4)',
                    },
                },
            }}
        >
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1, py: 1.5 }}>
                <span>{t('channel_guide.title')}</span>
                <IconButton onClick={onClose} size="small" aria-label="close">
                    <CloseIcon fontSize="small" />
                </IconButton>
            </DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2}>
                    <PlatformGuide
                        name={t('platform.twitch')}
                        accent={getAdapter('twitch').brandColor}
                        description={t('channel_guide.twitch')}
                        example="https://www.twitch.tv/abcd1234"
                        result="abcd1234"
                    />
                    <PlatformGuide
                        name={t('platform.chzzk')}
                        accent={getAdapter('chzzk').brandColor}
                        description={
                            <Trans i18nKey='channel_guide.chzzk' components={{ b: <b /> }} />
                        }
                        example="https://chzzk.naver.com/live/abcd1234"
                        result="abcd1234"
                    />
                </Stack>
            </DialogContent>
        </Dialog>
    );
}

function PlatformGuide({ name, accent, description, example, result }: {
    name: string;
    accent: string;
    description: React.ReactNode;
    example: string;
    result: string;
}) {
    const { t } = useTranslation();
    return (
        <Paper
            variant="outlined"
            sx={{
                p: 2,
                bgcolor: 'background.default',
                borderLeft: `4px solid ${accent}`,
            }}
        >
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
                {name}
            </Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
                {description}
            </Typography>
            <Box sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                flexWrap: 'wrap',
                color: 'text.secondary',
                fontSize: '0.875rem',
            }}>
                <span>{t('channel_guide.example')}</span>
                <Box component="code" sx={{
                    px: 0.75, py: 0.25,
                    bgcolor: 'action.hover',
                    borderRadius: 0.5,
                    fontFamily: 'monospace',
                    fontSize: '0.8rem',
                }}>{example}</Box>
                <span>→</span>
                <Box component="b" sx={{ color: 'text.primary' }}>{result}</Box>
            </Box>
        </Paper>
    );
}
