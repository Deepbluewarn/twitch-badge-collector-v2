import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DonationAlert from "./DonationAlert";
import { DialogContent, IconButton } from "@mui/material";
import CloseIcon from '@mui/icons-material/Close';

export interface SimpleDialogProps {
    open: boolean;
    onClose: () => void;
}
export function EncorageDonationDialog(props: SimpleDialogProps) {
    const { open, onClose } = props;

    return (
        <Dialog open={open} onClose={onClose}>
            <DialogTitle>Badge Collector</DialogTitle>

            <IconButton
                aria-label="close"
                onClick={onClose}
                sx={(theme) => ({
                    position: 'absolute',
                    right: 8,
                    top: 8,
                    color: theme.palette.grey[500],
                })}
            >
                <CloseIcon />
            </IconButton>

            <DialogContent>
                <DonationAlert noAlert />
            </DialogContent>
        </Dialog>
    );
}
