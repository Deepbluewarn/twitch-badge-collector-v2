import React from "react";
import { styled } from "@mui/material/styles";
import ChatStyleComp from "./message";

const SystemMessageStyle = styled('div')(({theme}) => ({
    width: '100%',
    
    '.system-msg__message': {
        color: theme.palette.text.secondary
    }
}))

export default function SystemMessageContainer(props: { msg: string }) {
    return (
        <ChatStyleComp>
            <SystemMessageStyle className='system-msg'>
                <span className='system-msg__message'>{props.msg}</span>
            </SystemMessageStyle>
        </ChatStyleComp>
    )
}