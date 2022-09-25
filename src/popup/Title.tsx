import React from "react";
import styled from "styled-components";
import { FlexRowContainer } from "../components/FlexContainer";

const TitleStyle = styled(FlexRowContainer)`
  background-color: #9ac4e7;
  color: #003e6c;
  align-items: center;
  height: 2.4rem;
  padding: 8px 8px 8px 10px;
  font-weight: bold;
`;

export default function Title(props: { title: string }) {
  return (
    <TitleStyle>
      <span>{props.title}</span>
    </TitleStyle>
  );
}