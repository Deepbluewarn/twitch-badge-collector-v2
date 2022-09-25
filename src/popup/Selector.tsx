import React from "react";
import styled from "styled-components";
import { FlexColumnContainer } from "../components/FlexContainer";
import { useGlobalSettingContext } from "../context/globalSetting";
import { SettingCategory } from "../interfaces/setting";

const SelectorContainerStyle = styled(FlexColumnContainer)`
  gap: 8px;
  padding: 8px;
`;

const Select = styled.select`
  background-color: var(--select-bgcolor);
  height: 1.7rem;
  font-family: inherit;
  padding-left: 4px;
  border: 1px solid #cfcfcf;
`;

export default function Selector(props: {
  title: string;
  values: string[];
  id: string;
}) {
  const { globalSetting, dispatchGlobalSetting } = useGlobalSettingContext();
  const options = props.values.map((v) => <option value={v}>{v}</option>);

  const onSelectionChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    event.preventDefault();
    
    const value = event.target.value;
    dispatchGlobalSetting({ type: props.id as SettingCategory, value: value });
  };
  return (
    <SelectorContainerStyle>
      <span>{props.title}</span>
      <Select
        name={props.title}
        value={globalSetting[props.id]}
        id={`select-${props.id}`}
        onChange={onSelectionChange}
      >
        {options}
      </Select>
    </SelectorContainerStyle>
  );
}
