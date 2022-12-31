import { ReplayPageType } from "./contentScript/utils";
import MessageInterface from "./interfaces/message";

const { fetch: origFetch } = window;
const base_url = process.env.BASE_URL || "";
let bodyBuffer: any[] = [];

const frameState = {
  loaded: false,
  url: "",
};
const setFrameState = (loaded: boolean) => {
  frameState.loaded = loaded;
  frameState.url = location.href;
};

const postBodyMessage = () => {
  for (let b of bodyBuffer) {
    if (location.href === b.url && !b.sent) {
      const frame = <HTMLIFrameElement>document.getElementById("wtbc-replay");

      frame.contentWindow?.postMessage(
        {
          sender: "extension",
          type: "CHAT_LIST",
          value: b,
        } as MessageInterface,
        base_url
      );

      b.sent = true;
    }
  }
};

window.fetch = async (...args) => {
  const response = await origFetch(...args);

  if (!ReplayPageType()) return response;

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

        if (
          frameState.url === location.href &&
          frameState.loaded &&
          isComment
        ) {
          postBodyMessage();
        }

        bodyBuffer = bodyBuffer.filter((e) => !e.sent);

        console.debug('TBC - [extension] overrideFetch bodyBuffer: ', bodyBuffer);

        isComment = false;
      });
  }

  return response;
};
window.onmessage = (e) => {
  if (e.data.sender === "wtbc" && e.data.type === "REQUEST_CHAT_LIST") {
    setFrameState(true);
    postBodyMessage();
  }
};
