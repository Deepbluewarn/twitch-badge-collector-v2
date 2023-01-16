import { ReplayPageType } from "./contentScript/utils";
import MessageInterface from "./interfaces/message";

const { fetch: origFetch } = window;
const base_url = process.env.BASE_URL || "";
const postTryCount = 10;
let bodyBuffer: any[] = [];
let currentChannel = { channel: '', sent: false };
let postCount = 0;
let postInterval = 0;

const replayFrameState = {
  loaded: false,
  url: "",
};
const liveFrameState = {
  loaded: false,
  url: '',
}
const setReplayFrameState = (loaded: boolean) => {
  replayFrameState.loaded = loaded;
  replayFrameState.url = location.href;
};
const setLiveFrameState = (loaded: boolean) => {
  liveFrameState.loaded = loaded;
  liveFrameState.url = location.href;
};

function postFrameMessage(type: string, value: any) {
  const frame = <HTMLIFrameElement>document.getElementById("wtbc-mini");

  if(!frame) return false;

  frame.contentWindow?.postMessage(
    {
      sender: "extension", type, value
    } as MessageInterface,
    base_url
  );

  return true;
}

const postBodyMessage = () => {
  const replayType = ReplayPageType();

  if(!replayType) return;
  if(replayFrameState.url !== location.href || !replayFrameState.loaded) return;

  for (let b of bodyBuffer) {
    if (location.href === b.url && !b.sent) {
      const post = postFrameMessage("CHAT_LIST", b);

      if(!post) return;

      b.sent = true;
    }
  }
};

const postChannelData = () => {
  const replayType = ReplayPageType();

  if(replayType) return;

  postCount++;

  if (postCount >= postTryCount) {
    clearPostInterval();

    postFrameMessage("CHANNEL_NOT_RESOLVED", currentChannel);

    return;
  }

  if(!liveFrameState.loaded || currentChannel.channel === '') return;

  if (!currentChannel.sent && currentChannel.channel !== '') {
    const frame = <HTMLIFrameElement>document.getElementById("wtbc-mini");

    if(!frame) return;

    frame.contentWindow?.postMessage(
      {
        sender: "extension",
        type: "CHANNEL_DATA",
        value: currentChannel,
      } as MessageInterface,
      base_url
    );

    currentChannel.sent = true;
  }
}

const updateChannelData = (channel: string) => {
  const oldChannel = currentChannel.channel;

  currentChannel.channel = channel;

  if(oldChannel !== '' && oldChannel !== channel) {
    currentChannel.sent = false;
  }
}

window.fetch = async (...args) => {
  const response = await origFetch(...args);

  if (response.url === "https://gql.twitch.tv/gql") {
    response
      .clone()
      .json()
      .then((body) => {
        let isComment = false;

        if (Array.isArray(body)) {
          for (let b of body) {
            if (
              b.extensions.operationName === "VideoCommentsByOffsetOrCursor"
            ) {
              bodyBuffer.push({
                url: location.href,
                body: b,
              });

              isComment = true;
            }
            if (b.extensions.operationName === 'Chat_ChannelData') {
              updateChannelData(b.data.channel.login);
            }else if(b.extensions.operationName === 'UseLive') {
              updateChannelData(b.data.user.login);
            }
          }
        } else {
          if (
            body.extensions.operationName === "VideoCommentsByOffsetOrCursor"
          ) {
            bodyBuffer.push({
              url: location.href,
              body: body,
            });

            isComment = true;
          }
        }

        if (isComment) postBodyMessage();

        bodyBuffer = bodyBuffer.filter((e) => !e.sent);

        console.debug('TBC - [extension] overrideFetch bodyBuffer: ', bodyBuffer);

        isComment = false;
      });
  }

  return response;
};

function clearPostInterval() {
  window.clearInterval(postInterval);
  postInterval = 0;
  postCount = 0;
}

window.onmessage = (e) => {
  if (e.data.sender === "wtbc" && e.data.type === "REQUEST_CHAT_LIST") {
    setReplayFrameState(true);
    postBodyMessage();
  }
  if (e.data.sender === 'wtbc' && e.data.type === 'REQUEST_CHANNEL_ID') {
    setLiveFrameState(true);
    postChannelData();

    if(postInterval === 0){
      postInterval = window.setInterval(() => {
        postChannelData();
      }, 1000);
    }
  }
  if (e.data.sender === 'wtbc' && e.data.type === 'CHANNEL_DATA_RECEIVED') {
    currentChannel.sent = true;
    clearPostInterval();
  }
};
