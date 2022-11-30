import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGlobalSettingContext } from "../context/GlobalSetting";
import List from "@mui/material/List";
import ListSubheader from "@mui/material/ListSubheader";
import IconButton from "@mui/material/IconButton";
import Box from "@mui/material/Box";

export default function Donation() {
  const { t, i18n } = useTranslation();
  const { globalSetting } = useGlobalSettingContext();

  const getDonationImageName = () => {
    return globalSetting.darkTheme === "on"
      ? i18n.language.includes("ko")
        ? "toonation_b18"
        : "toonation_b19"
      : i18n.language.includes("ko")
      ? "toonation_b13"
      : "toonation_b14";
  };

  const [imgName, setImgName] = useState(getDonationImageName());

  useEffect(() => {
    setImgName(getDonationImageName());
  }, [globalSetting.darkTheme]);

  return (
    <List
      subheader={
        <ListSubheader disableSticky={true}>
          {t("common.donation")}
        </ListSubheader>
      }
    >
      <IconButton disableRipple>
        <Box
          component="img"
          src={`assets/donation/${imgName}.gif`}
          sx={{ width: "100%" }}
        />
      </IconButton>
    </List>
  );
}
