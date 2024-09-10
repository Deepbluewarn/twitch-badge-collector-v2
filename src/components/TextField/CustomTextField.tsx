import TextField, { TextFieldProps } from "@mui/material/TextField";

export default function CustomTextField(props: TextFieldProps) {
    return <TextField {...props}
        id="outlined-basic"
        variant="outlined"
        size="small"
        sx={{flex: '1'}}
    />
}