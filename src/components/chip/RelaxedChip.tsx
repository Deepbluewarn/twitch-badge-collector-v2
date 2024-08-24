import React from "react";
import Chip, { ChipProps } from "@mui/material/Chip";

const RelaxedChip = React.forwardRef<HTMLDivElement, ChipProps>((props, ref) => {
    return <Chip {...props} ref={ref} sx={{ margin: '5px' }} />;
});

export default RelaxedChip;