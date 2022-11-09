import Stack from "@mui/material/Stack";
import React from "react";

export default function ListContainer(props: { children: React.ReactNode }) {
  return <Stack direction="column">{props.children}</Stack>;
}
