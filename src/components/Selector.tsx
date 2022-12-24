import React from "react";
import browser from "webextension-polyfill";
import Stack from "@mui/material/Stack";
import Select, { SelectChangeEvent } from "@mui/material/Select";
import Typography from "@mui/material/Typography";
import FormControl from "@mui/material/FormControl";
import MenuItem from "@mui/material/MenuItem";
import {
  Context as TBCContext,
  SettingInterface,
} from 'twitch-badge-collector-cc';

export default function Selector(props: {
  title: string;
  values: string[];
  id: string;
}) {
  const { globalSetting, dispatchGlobalSetting } = TBCContext.useGlobalSettingContext();

  const onSelectionChange = (event: SelectChangeEvent) => {
    event.preventDefault();

    const value = event.target.value;

    dispatchGlobalSetting({ type: props.id as SettingInterface.SettingCategory, value: value });
  };
  return (
    <Stack sx={{ margin: '0 0 12px 0' }}>
      <Typography variant="subtitle2">{props.title}</Typography>
      <FormControl>
        <Select
          value={globalSetting[props.id] as string || props.values[0]}
          sx={{ marginTop: '4px' }}
          size='small'
          id={`select-${props.id}`}
          onChange={onSelectionChange}
        >
          {
            props.values.map((v) => (
              <MenuItem value={v} key={v}>{browser.i18n.getMessage(v)}</MenuItem>
            ))
          }
        </Select>
      </FormControl>
    </Stack>
  );
}
