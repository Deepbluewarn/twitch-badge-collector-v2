import React from "react";
import { styled } from "@mui/material/styles";
import Stack from "@mui/material/Stack";

const UserNoticeStyle = styled("div")(({ theme }) => ({
  backgroundColor: theme.colors.bgColor_2,
  borderLeft: `${theme.palette.info.main} solid 4px`,
  margin: "4px 0 4px 0",
  width: "100%",

  ".usernotice-message": {
    justifyContent: "center",
    backgroundColor: theme.colors.bgColor_3,
    color: theme.colors.textColor_1,
    padding: "8px",
  },
  ".chat": {
    marginLeft: "-4px",
  },
}));

export default function UserNoticeContainer(props: {
  sysMsg: string;
  children: React.ReactNode;
}) {
  return (
    <UserNoticeStyle>
      <Stack
        direction="column"
        className="usernotice-message"
        sx={{
          justifyContent: "center",
          padding: "8px",
        }}
      >
        <span>{props.sysMsg}</span>
      </Stack>
      {props.children}
    </UserNoticeStyle>
  );
}
