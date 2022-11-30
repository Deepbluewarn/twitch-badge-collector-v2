import React, { memo, useMemo } from "react";
import { styled } from "@mui/material/styles";
import ChatStyleComp from "./message";
import { CommonUserstate } from "tmi.js";
import { MessageInterface } from "../../interfaces/chat";
import { useReadableColor } from "../../hooks/useReadableColor";
import { useGlobalSettingContext } from "../../context/GlobalSetting";
import { useChannelInfoContext } from "../../context/ChannelInfoContext";
import { grey } from "@mui/material/colors";

interface ChatProps {
  msg: MessageInterface;
}

const Chat = (props: ChatProps) => {
  let loginName = "";

  if (props.msg.type === "message" || "announcement") {
    loginName = props.msg.userstate!.username;
  } else if (props.msg.type === "userNotice") {
    loginName = props.msg.userstate!.login;
  }

  return (
    <ChatStyleComp removed={props.msg.removed}>
      <ChatTimeStamp
        key={props.msg.userstate?.["tmi-sent-ts"]}
        isReplay={props.msg.replay}
        tmiSentTs={props.msg.userstate?.["tmi-sent-ts"]}
      />
      <Badges
        key={props.msg.userstate?.["badges-raw"]}
        badgesRaw={props.msg.userstate?.["badges-raw"]}
      />
      <Author
        key={loginName}
        loginName={loginName}
        displayName={props.msg.userstate!["display-name"] || ""}
        msgType={props.msg.userstate!["message-type"]}
        defaultColor={props.msg.userstate!.color}
      />
      <Message
        message={props.msg.message}
        bits={props.msg.userstate?.bits}
        emotes={props.msg.userstate?.emotes}
        messageType={props.msg.userstate?.["message-type"]}
        messageId={props.msg.userstate?.["msg-id"]}
      />
    </ChatStyleComp>
  );
};

export default Chat;

const TimeStampStyle = styled("span")({
  display: "inline-flex",
  alignItems: "center",
  marginRight: "5px",
  color: "#ababab",
  verticalAlign: "middle",
});

const ChatTimeStamp = memo(
  (props: { isReplay: boolean | undefined; tmiSentTs: string | undefined }) => {
    const { globalSetting } = useGlobalSettingContext();

    let date: Date;
    let hours: string, minutes: string;
    let ts = props.tmiSentTs;

    if (ts) {
      if (props.isReplay) {
        date = new Date(0);
        date.setSeconds(parseInt(ts));
      } else {
        date = new Date(parseInt(ts));
      }
    } else {
      date = new Date();
    }

    hours = (((date.getHours() + 11) % 12) + 1).toString();
    minutes = date.getMinutes().toString();
    minutes = minutes.length === 1 ? "0" + minutes : minutes;
    let res = "";

    if (props.isReplay && typeof ts !== "undefined") {
      if (parseInt(ts) < 3600) {
        res = date.toISOString().substring(14, 19);
      } else {
        res = date.toISOString().substring(11, 19);
      }
    } else {
      res = hours + ":" + minutes;
    }

    if (globalSetting.chatTime === "off") {
      return null;
    }
    return <TimeStampStyle className="chat-sent-ts">{res}</TimeStampStyle>;
  }
);

const BadgeStyle = styled("span")({
  display: "inline-flex",
  verticalAlign: "inherit",

  ".chat-badge": {
    display: "inline-block",
    marginRight: "4px",
    verticalAlign: "baseline",
  },
});

const Badges = memo((props: { badgesRaw: string | undefined }) => {
  const { channelInfoObject } = useChannelInfoContext();

  const globalBadges = channelInfoObject.globalBadges;
  const channelBadges = channelInfoObject.channelBadges;
  const badgesRaw = props.badgesRaw;

  if (!badgesRaw || typeof badgesRaw === "undefined" || badgesRaw === "")
    return null;
  let badgesArr = badgesRaw.split(",");

  if (!channelBadges || !globalBadges) {
    return <span></span>;
  }

  var badges = badgesArr.reduce(function (result: JSX.Element[], badge) {
    const bg = channelBadges.get(badge) || globalBadges.get(badge);

    if (typeof bg !== "undefined") {
      result.push(
        <img
          className="chat-badge"
          src={bg.image_url_1x}
          srcSet={`${bg.image_url_1x} 1x, ${bg.image_url_2x} 2x, ${bg.image_url_4x} 4x`}
          key={bg.image_url_1x}
          alt="Chat Badge"
        />
      );
    }
    return result;
  }, []);

  return <BadgeStyle className="badges">{badges}</BadgeStyle>;
});

const AuthorStyle = styled("span")(({ theme }) => ({
  color: theme.palette.text.primary,
  verticalAlign: "inherit",

  ".chat-author-disp": {
    fontWeight: "700",
    marginRight: "4px",
  },
}));

const Author = memo(
  (props: {
    loginName: string;
    displayName: string;
    msgType: string | undefined;
    defaultColor: string | undefined;
  }) => {
    const loginName = props.loginName;
    const displayName = props.displayName;
    const msgType = props.msgType;
    const defaultColor = props.defaultColor;
    const [color, setColor] = React.useState(defaultColor);
    const { getColor } = useReadableColor(loginName, defaultColor);
    const { globalSetting } = useGlobalSettingContext();

    let loginNameSpan = null;
    let separator = null;

    if (loginName && loginName !== displayName.toLowerCase()) {
      loginNameSpan = <span>{`(${loginName})`}</span>;
    }

    separator = msgType !== "action" ? ": " : " ";

    React.useEffect(() => {
      setColor(getColor());
    }, [globalSetting.darkTheme]);

    return (
      <AuthorStyle className="author" sx={{ color }}>
        <span className="chat-author-disp">{displayName}</span>
        <span className="chat-author-login">{loginNameSpan}</span>
        <span className="chat-message-separator">{separator}</span>
      </AuthorStyle>
    );
  }
);

const MessageContainerStyle = styled("span")(({ theme }) => ({
  verticalAlign: "inherit",
  color: theme.palette.text.primary,
  ".emoticon-container": {
    overflowWrap: "anywhere",
    boxSizing: "border-box",
    border: "0",
    font: "inherit",
    padding: "0",
    margin: "-.5rem 0",
    verticalAlign: "middle",
    alignItems: "center",
    cursor: "pointer",
    display: "inline-flex",
    fontStyle: "normal",
    height: "1.75rem",
    justifyContent: "center",
    outline: "none",
    pointerEvents: "all",
    width: "1.75rem",
  },
  ".action": {
    fontStyle: "italic",
  },
  ".highlighted-message": {
    color: grey[900],
    fontWeight: "bold",
    padding: "2px",
    backgroundColor: theme.palette.warning.main,
  },
}));

const Message = memo(
  (props: {
    message: string;
    bits: string;
    emotes: CommonUserstate["emotes"];
    messageType: string;
    messageId: string;
  }) => {
    const { channelInfoObject } = useChannelInfoContext();
    const links = resolveLink(props.message);
    const motes = resolveMotes(
      props.message,
      props.bits,
      props.emotes,
      channelInfoObject.cheermotes,
      channelInfoObject.emotesets
    );

    const objectInfo = [...links, ...motes];

    objectInfo.sort((a, b) => a.idx[0] - b.idx[0]);

    const res = [];
    let key = 0;

    const highlight = "highlighted-message";

    const classes = [
      props.messageType === "action" ? "action" : "",
      props.messageId === highlight ? highlight : "",
    ].join(" ");

    if (objectInfo.length === 0) {
      res.push(<span key={key++}>{props.message}</span>);
    }

    for (let i = 0; i < objectInfo.length; i++) {
      const info = objectInfo[i];

      if (i === 0 && info.idx[0] !== 0) {
        res.push(
          <span key={key++}>{props.message.substring(0, info.idx[0])}</span>
        );
      }

      if (info.type === "emote") {
        const emoteId = info.value;
        const emote_link = `https://static-cdn.jtvnw.net/emoticons/v2/${emoteId}/default/dark`;

        res.push(
          <div key={key++} className="emoticon-container">
            <img
              className="emoticon"
              src={`${emote_link}/1.0`}
              alt=""
              srcSet={`${emote_link}/1.0 1x, ${emote_link}/2.0 2x, ${emote_link}/3.0 4x`}
            />
          </div>
        );
      } else if (info.type === "cheermote") {
        const prefix = info.value[0];
        const bits = info.value[1];

        const min_bits = getMinBits(bits);
        const tier = getTierByMinBits(
          prefix,
          min_bits,
          channelInfoObject.cheermotes
        );
        const links = tier.images.dark.animated;
        const tier_color = tier.color;

        const style = {
          color: tier_color,
        };
        res.push(
          <span key={key++} className="bits-amount" style={style}>
            <div className="emoticon-container">
              <img
                className="emoticon"
                src={links[1]}
                alt=""
                srcSet={`${links[0]} 1x, ${links[1]} 2x, ${links[2]} 4x`}
              />
            </div>
            {bits.toString()}
          </span>
        );
      } else if (info.type === "link") {
        const msg = props.message.substring(info.idx[0], info.idx[1] + 1);

        res.push(
          <span key={key++}>
            <a href={msg} target="_blank" rel="noreferrer">
              {msg}
            </a>
          </span>
        );
      }
      if (objectInfo.length - 1 === i) {
        if (info.idx[1] < props.message.length - 1) {
          res.push(
            <span key={key++}>
              {props.message.substring(info.idx[1] + 1, props.message.length)}
            </span>
          );
        }
      } else {
        const info_next = objectInfo[i + 1];
        res.push(
          <span key={key++}>
            {props.message.substring(info.idx[1] + 1, info_next.idx[0])}
          </span>
        );
      }
    }

    return (
      <MessageContainerStyle className="chat-message">
        <span className={classes}>{res}</span>
      </MessageContainerStyle>
    );
  }
);

function resolveMotes(
  message: string,
  bits: string,
  emotes: CommonUserstate["emotes"],
  cheerMotes: Map<string, any>,
  emoteSets?: Map<string, any>
) {
  if (!message) return [];

  const res = [];
  const words = message.split(" ");
  let lastWordEndIdx = 0;
  const emote = emotes || {};
  const emoteEmpty =
    Object.keys(emote).length === 0 &&
    Object.getPrototypeOf(emote) === Object.prototype;

  if (!emoteEmpty) {
    Object.keys(emote).forEach((e) => {
      for (let idx of emote[e]) {
        res.push({
          type: "emote",
          value: e,
          idx: idx.split("-").map((e) => parseInt(e)),
        });
      }
    });
  }

  for (let w = 0; w < words.length; w++) {
    const word = words[w];
    const idx = [lastWordEndIdx, lastWordEndIdx + word.length - 1];
    const cheer = checkCheermote(word, cheerMotes);

    if (bits && cheer.length !== 0) {
      res.push({ type: "cheermote", value: cheer, idx: idx });
    } else if (emoteEmpty && emoteSets && emoteSets.has(word)) {
      const emote_id = emoteSets.get(word).id;
      res.push({ type: "emote", value: emote_id, idx: idx });
    }
    lastWordEndIdx = lastWordEndIdx + word.length + 1;
  }

  return res;
}

function checkCheermote(cheerText: string, cheerMotes: Map<string, any>) {
  const bits_regex = /([1-9]+[0-9]*)$/;
  const cheer = cheerText.split(bits_regex);

  return cheerMotes.has(cheer[0]) ? [cheer[0], cheer[1]] : [];
}

const linkRegex =
  /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/gi;

function resolveLink(link_text: string) {
  const arr = [];
  let match;

  while ((match = linkRegex.exec(link_text)) !== null) {
    arr.push({
      type: "link",
      idx: [match.index, match.index + linkRegex.lastIndex],
      value: "",
    });
  }

  return arr;
}

function getMinBits(bits: number) {
  let min_bits = 0;
  if (bits >= 1 && bits <= 99) {
    min_bits = 1;
  } else if (bits >= 100 && bits <= 999) {
    min_bits = 100;
  } else if (bits >= 1000 && bits <= 4999) {
    min_bits = 1000;
  } else if (bits >= 5000 && bits <= 9999) {
    min_bits = 5000;
  } else if (bits >= 10000) {
    min_bits = 10000;
  }
  return min_bits;
}
function getTierByMinBits(
  prefix: string,
  min_bits: number,
  cheerMotes: Map<string, any>
) {
  const tiers = cheerMotes.get(prefix);

  for (let t of tiers) {
    if (min_bits === t.min_bits) {
      return t;
    }
  }
}
