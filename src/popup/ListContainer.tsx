import React from "react";
import { FlexColumnContainer } from "../components/FlexContainer";

export default function ListContainer(props: { children: React.ReactNode }) {
  return <FlexColumnContainer>{props.children}</FlexColumnContainer>;
}