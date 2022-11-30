import React from "react";
import { styled } from "@mui/material/styles";
import Button from "@mui/material/Button";

const LinkButtonStyle = styled(Button)({
  display: "inline-flex",
  flexDirection: "row",
  justifyContent: "space-between",
  gap: "8px",
  padding: "8px",
  height: "2rem",
  cursor: "pointer",
  alignItems: "center",
  // borderBottom: "1px solid #00000029",
  // "&:last-child": {
  //   borderBottom: "none",
  // },
});
export function Link(props: { title: string; url: string }) {
  return (
    <LinkButtonStyle {...props} href={props.url}>
      <span>{props.title}</span>
      <span className="material-icons-round">chevron_right</span>
    </LinkButtonStyle>
  );
}
export function LinkButton(props: { title: string }) {
  return (
    <LinkButtonStyle {...props}>
      <span>{props.title}</span>
      <span className="material-icons-round">chevron_right</span>
    </LinkButtonStyle>
  );
}
