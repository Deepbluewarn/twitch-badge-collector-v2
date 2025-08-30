import Stack from "@mui/material/Stack";
import Select, { SelectChangeEvent } from "@mui/material/Select";
import Typography from "@mui/material/Typography";
import FormControl from "@mui/material/FormControl";
import { useGlobalSettingContext } from "../context/GlobalSetting";
import { SettingReducerActionTypes } from "@/interfaces/setting";

export default function Selector(props: {
  title: string;
  value: string;
  action: keyof SettingReducerActionTypes;
  children?: React.ReactNode;
}) {
  const { dispatchGlobalSetting } = useGlobalSettingContext();

  const onSelectionChange = (event: SelectChangeEvent) => {
    event.preventDefault();

    const value = event.target.value;

    dispatchGlobalSetting({ type: props.action, payload: value });
  };

  return (
    <Stack sx={{ margin: '0 0 12px 0', p: '1' }}>
      <Typography variant="subtitle2">{props.title}</Typography>
      <FormControl>
        <Select
          value={props.value}
          sx={{ marginTop: '4px' }}
          size='small'
          onChange={onSelectionChange}
        >
          {props.children}
        </Select>
      </FormControl>
    </Stack>
  );
}
