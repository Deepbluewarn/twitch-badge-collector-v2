import React from "react";
import styled from "styled-components";

const LinkStyle = styled.a`
  display: inline-flex;
  flex-direction: row;
  justify-content: space-between;
  gap: 8px;
  padding: 8px;
  height: 2rem;
  cursor: pointer;
  align-items: center;

  border-bottom: 1px solid #00000029;

  &:last-child {
    border-bottom: none;
  }
`;
export default function Link(props: { title: string, url: string }) {
  return (
    <LinkStyle href={props.url} target='_blank'>
      <span>{props.title}</span>
      <span className="material-icons-round">chevron_right</span>
    </LinkStyle >
  );
}
