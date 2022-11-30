import React from "react";
import { styled } from "@mui/material/styles";
import { MessageInterface } from "../../interfaces/chat";
import Checkbox from "@mui/material/Checkbox";
import Stack from "@mui/material/Stack";

export const CustomCheckBox = styled(Checkbox)({
  marginLeft: "16px",
  padding: "0",
});
const MessageWrapperComp = styled(Stack)({
  width: "100%",
});
export default function MessageWrapper(props: {
  setMessageList?: React.Dispatch<React.SetStateAction<MessageInterface[]>>;
  selectable?: boolean;
  selected?: boolean;
  messageId?: string;
  children: React.ReactNode;
}) {
  const [checked, setChecked] = React.useState(false);

  React.useEffect(() => {
    setChecked(props.selected || false);
  }, [props.selected]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!props.setMessageList) return;

    props.setMessageList((list) => {
      const newList = [...list];

      for (let i = 0; i < newList.length; i++) {
        const msg = newList[i];

        if (msg.id === props.messageId) {
          msg.selected = !checked;
        }
      }

      return newList;
    });
  };

  return (
    <MessageWrapperComp direction="row" className="message-wrapper">
      {props.selectable ? (
        <CustomCheckBox
          checked={checked}
          name="select-chat"
          className="chat-chbox"
          onChange={handleChange}
        />
      ) : null}
      {props.children}
    </MessageWrapperComp>
  );
}
