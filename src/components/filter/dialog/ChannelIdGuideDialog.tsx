import { Box, Dialog, DialogContent, DialogTitle, IconButton, Paper, Stack, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { getAdapter } from "@/platform";

export default function ChannelIdGuideDialog({ open, onClose }: { open: boolean, onClose: () => void }) {
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
                <span>채널 ID 입력 안내</span>
                <IconButton onClick={onClose} size="small" aria-label="close">
                    <CloseIcon fontSize="small" />
                </IconButton>
            </DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2}>
                    <PlatformGuide
                        name="트위치"
                        accent={getAdapter('twitch').brandColor}
                        description="트위치 채널 ID는 채널 주소의 마지막 부분입니다."
                        example="https://www.twitch.tv/abcd1234"
                        result="abcd1234"
                    />
                    <PlatformGuide
                        name="치지직"
                        accent={getAdapter('chzzk').brandColor}
                        description={
                            <>치지직 채널 ID는 라이브 방송 주소에서 <b>/live/</b> 다음에 나오는 영문/숫자 ID입니다.</>
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
                <span>예시:</span>
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
