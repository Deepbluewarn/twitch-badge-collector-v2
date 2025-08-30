import React from "react";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import { useGlobalSettingContext } from "../context/GlobalSetting";
import { SettingInterface, SettingReducerActionTypes } from "@/interfaces/setting";

export default function CustomTextField(props: {
  title: string;
  id: keyof SettingInterface;
  action: keyof SettingReducerActionTypes;
}) {
  const { globalSetting, dispatchGlobalSetting } = useGlobalSettingContext();

  const onTextFieldChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    dispatchGlobalSetting({ type: props.action, payload: event.target.value });
  };

  return (
    <Stack sx={{ margin: '0 0 12px 0' }}>
      <Typography variant="subtitle2">{props.title}</Typography>
      <TextField
        sx={{ marginTop: '4px' }}
        value={globalSetting[props.id] as number || 0}
        onChange={onTextFieldChange}
        type="number"
        size="small"
      />
    </Stack>
  );
}
