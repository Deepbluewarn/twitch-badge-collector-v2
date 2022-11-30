import React from "react";
import { BroadcastChannel } from "broadcast-channel";
import { useTranslation } from "react-i18next";
import BadgeList from "./BadgeList";
import {
  ArrayFilterInterface,
  ArrayFilterMessageInterface,
} from "../../interfaces/filter";
import useChatInfoObjects from "../../hooks/useChannelInfo";
import { ChannelInfoContext } from "../../context/ChannelInfoContext";
import { useArrayFilterContext } from "../../context/ArrayFilter";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Card from "@mui/material/Card";
import FilterInputFormList from "./FilterInputFormList";
// import SocialFooter from './SocialFooter';
import { ArrayFilterList } from "./ArrayFilterList";
import Alert from "@mui/material/Alert";

export default function Filter() {
  const { arrayFilter, setArrayFilter } = useArrayFilterContext();
  const { channelInfoObject, dispatchChannelInfo, channel, setChannel } =
    useChatInfoObjects();
  const [filterInputList, setFilterInputList] = React.useState<
    ArrayFilterInterface[]
  >([]);
  const filterInputListRef = React.useRef<ArrayFilterInterface[]>([]);
  const filterBroadcastChannel = React.useRef<
    BroadcastChannel<ArrayFilterMessageInterface>
  >(new BroadcastChannel("ArrayFilter"));
  const messageIdBroadcastChannel = React.useRef<BroadcastChannel<string>>(
    new BroadcastChannel("MessageId")
  );
  const messageId = React.useRef(""); // id 는 extension 에서 생성.
  const { t } = useTranslation();

  React.useEffect(() => {
    document.title = `${t("setting.filter_setting")}- TBC`;
  }, []);

  React.useEffect(() => {
    filterInputListRef.current = filterInputList;
  }, [filterInputList]);

  return (
    <ChannelInfoContext.Provider
      value={{ channelInfoObject, dispatchChannelInfo, channel, setChannel }}
    >
      <Card
        sx={{
          padding: "16px",
          flex: "1",
          display: "flex",
          flexDirection: "column",
          overflow: "auto",
        }}
        className="card"
        variant="outlined"
      >
        <Stack
          spacing={2}
          sx={{
            flex: "1 1 auto",
          }}
        >
          <Alert severity="warning">
            <span>{t("alert.notice_1")}</span>
            <br />
            <a href="https://bit.ly/3fIpe73" target="_blank">
              https://bit.ly/3fIpe73
            </a>
          </Alert>
          <Typography variant="h6">
            {t("setting.filter.filter_list")}
          </Typography>

          <ArrayFilterList />

          <Typography variant="h6">{t("setting.filter.filter_add")}</Typography>

          <Typography variant="subtitle2">
            {t("setting.filter.filter_add_subtitle")}
          </Typography>

          <FilterInputFormList
            afInputRow={filterInputList}
            setAfInputRow={setFilterInputList}
            filterInputListRef={filterInputListRef}
          />
          <Typography variant="h6">
            {t("setting.filter.select_badges")}
          </Typography>

          <BadgeList setAfInputRow={setFilterInputList} />
        </Stack>
      </Card>

      {/* <SocialFooter /> */}
    </ChannelInfoContext.Provider>
  );
}
