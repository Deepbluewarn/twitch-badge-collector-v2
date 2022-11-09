import React from "react";
import { styled } from "@mui/material/styles";
import Stack from "@mui/material/Stack";
import browser from "webextension-polyfill";
import { useGlobalSettingContext } from "../context/GlobalSetting";
import { SettingCategory } from "../interfaces/setting";

const SelectorContainerStyle = styled(Stack)({
  gap: "8px",
  padding: "8px",
});

const Select = styled("select")({
  backgroundColor: "var(--select-bgcolor)",
  height: "1.7rem",
  fontFamily: "inherit",
  paddingLeft: "4px",
  border: "1px solid #cfcfcf",
});

export default function Selector(props: {
  title: string;
  values: string[];
  id: string;
}) {
  const { globalSetting, dispatchGlobalSetting } = useGlobalSettingContext();
  const options = props.values.map((v) => (
    <option value={v}>{browser.i18n.getMessage(v)}</option>
  ));

  const onSelectionChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    event.preventDefault();

    const value = event.target.value;
    dispatchGlobalSetting({ type: props.id as SettingCategory, value: value });
  };
  return (
    <SelectorContainerStyle direction="column">
      <span>{props.title}</span>
      <Select
        name={props.title}
        value={globalSetting[props.id] as string}
        id={`select-${props.id}`}
        onChange={onSelectionChange}
      >
        {options}
      </Select>
    </SelectorContainerStyle>
  );
}
