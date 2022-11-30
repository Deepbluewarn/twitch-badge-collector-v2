import React from "react";
import { styled } from "@mui/material/styles";
import Chat from "./message/chat";
import MessageWrapper from "./message/messageWrapper";
import AnnouncementContainer from "./message/announcement";
import UserNoticeContainer from "./message/userNotice";
import SystemMessageContainer from "./message/system";
import { MessageInterface } from "../interfaces/chat";
import { useGlobalSettingContext } from "../context/GlobalSetting";
import Checkbox from "@mui/material/Checkbox";
import Stack from "@mui/material/Stack";

type chatContainerType = "origin" | "clone";

interface ChatContainerProps {
  messageList?: MessageInterface[];
  setMessageList?: React.Dispatch<React.SetStateAction<MessageInterface[]>>;
  selectable?: boolean;
  onlySelected?: boolean;
  type: chatContainerType;
  playerTime?: number;
}

const ChatSelectorContainer = styled(Stack)({
  paddingTop: "8px",
  fontSize: ".9rem",
  justifyContent: "space-between",
});

const ChatContainerStyle = styled(Stack)({
  flex: "1",
  overflow: "auto",
  height: "100%",
});

export function ChatContainer(props: ChatContainerProps) {
  const { globalSetting } = useGlobalSettingContext();
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const chatContainerRef = React.useRef<HTMLDivElement>(null);
  const isBottom = React.useRef(true);

  const scrollToBottom = () => {
    if (isBottom.current) {
      if (messagesEndRef.current && chatContainerRef.current) {
        chatContainerRef.current.scrollTop =
          chatContainerRef.current.scrollHeight;
      }
    }
  };

  const handleScroll = React.useCallback(
    (e: React.UIEvent<HTMLElement>): void => {
      e.stopPropagation();
      isBottom.current =
        e.currentTarget.scrollTop + e.currentTarget.clientHeight >=
        e.currentTarget.scrollHeight - 100;
    },
    []
  );

  React.useEffect(() => {
    scrollToBottom();
  }, [props.messageList]);

  React.useEffect(() => {
    scrollToBottom();
  }, [props.playerTime]);

  const onCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;

    if (!props.setMessageList) return;

    props.setMessageList((list) => {
      const newList = [...list];

      for (let i = 0; i < newList.length; i++) {
        const msg = newList[i];

        msg.selected = checked;
      }

      return newList;
    });
  };

  const messageList = props.messageList
    ? props.messageList.map((msg) => {
        if (msg.replay && props.playerTime) {
          const chatTime = parseInt(msg.userstate?.["tmi-sent-ts"]!);

          if (chatTime >= props.playerTime) {
            return;
          }
        }

        if (typeof props.onlySelected !== "undefined" && props.onlySelected) {
          if (!msg.selected) {
            return;
          }
        }

        const userstate = msg.userstate;
        const chat = <Chat key={msg.id} msg={msg} />;
        let res = null;

        if (msg.type === "announcement") {
          res = (
            <AnnouncementContainer
              key={msg.id}
              borderColor={userstate ? userstate["msg-param-color"] : "PRIMARY"}
            >
              {chat}
            </AnnouncementContainer>
          );
        } else if (msg.type === "userNotice") {
          const message = userstate ? userstate["system-msg"] : msg.message;
          res = (
            <UserNoticeContainer key={msg.id} sysMsg={message}>
              {chat}
            </UserNoticeContainer>
          );
        } else if (msg.type === "system") {
          res = <SystemMessageContainer key={msg.id} msg={msg.message} />;
        } else {
          res = chat;
        }

        return (
          <MessageWrapper
            key={msg.id}
            selectable={props.selectable}
            selected={msg.selected || false}
            messageId={msg.id}
            setMessageList={props.setMessageList}
          >
            <>{res}</>
          </MessageWrapper>
        );
      })
    : null;

  return (
    <>
      {props.messageList && props.messageList.length > 0 && props.selectable ? (
        <ChatSelectorContainer direction="row">
          <Checkbox
            name="select-all-message"
            className="chat-chbox"
            id="select-all"
            onChange={onCheckboxChange}
            sx={{ marginLeft: "16px", padding: "0" }}
          />
        </ChatSelectorContainer>
      ) : null}

      <ChatContainerStyle
        direction="column"
        ref={chatContainerRef}
        className={`scroller chat-list ${props.type} font-size-default`}
        onScroll={handleScroll}
      >
        <>
          {messageList}
          <div id="chatListBottom" ref={messagesEndRef}></div>
        </>
      </ChatContainerStyle>
    </>
  );
}
