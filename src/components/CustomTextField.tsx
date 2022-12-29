import React from "react";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import {
  Context as TBCContext,
  SettingInterface,
} from 'twitch-badge-collector-cc';
import TextField from "@mui/material/TextField";

export default function CustomTextField(props: {
  title: string;
  id: string;
}) {
  const { globalSetting, dispatchGlobalSetting } = TBCContext.useGlobalSettingContext();

  const onTextFieldChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    dispatchGlobalSetting({ type: props.id as SettingInterface.SettingCategory, value: event.target.value });
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
