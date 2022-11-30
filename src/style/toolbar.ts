import Stack from "@mui/material/Stack";
import { styled } from "@mui/material/styles";

export const CustomToolbarItemStyle = styled(Stack)({
  alignItems: "center",
  gap: "4px",
  cursor: "pointer",
  userSelect: "none",
  padding: "4px",
  borderRadius: "4px",

  "&:hover": {
    backgroundColor: "#00000022",
  },
});
