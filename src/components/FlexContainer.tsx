import styled from "styled-components";

export const FlexContainer = styled.div`
  display: flex;
`;

export const FlexColumnContainer = styled(FlexContainer)`
  display: flex;
  flex-direction: column;
  border-bottom: 1px solid #00000029;

  &:last-child {
    border-bottom: none;
  }
`;

export const FlexRowContainer = styled(FlexContainer)`
  display: flex;
  flex-direction: row;
  border-bottom: 1px solid #00000029;

  &:last-child {
    border-bottom: none;
  }
`;
