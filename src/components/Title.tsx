import React from "react";
import { styled } from "@mui/material/styles";
import Stack from "@mui/material/Stack";

const TitleStyle = styled(Stack)({
  backgroundColor: "#9ac4e7",
  color: "#003e6c",
  alignItems: "center",
  height: "2.4rem",
  padding: "8px 8px 8px 10px",
  fontWeight: "bold",
});

export default function Title(props: { title: string }) {
  return (
    <TitleStyle direction="row">
      <span>{props.title}</span>
    </TitleStyle>
  );
}
