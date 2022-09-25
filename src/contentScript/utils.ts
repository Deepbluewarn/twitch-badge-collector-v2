export function getChannelFromPath() {
  const paths = window.location.pathname.split("/");
  let channel = paths[1];

  if (paths.length > 2) {
    if (channel === "popout") {
      channel = paths[2];
    } else if (channel === "moderator") {
      channel = paths[2];
    } else if (channel === "embed") {
      channel = paths[2];
    }
  }
  return channel;
}
export function getVideoIdParam(replayType: 'replay' | 'clip' | boolean) {
  const paths = window.location.pathname.split("/");

  if (replayType === 'clip') {
    return paths[3];
  } else if (replayType === 'replay') {
    return paths[2];
  }
}

export function ReplayPageType() {
  const replay_regex = /\/videos\/[0-9]*/g;
  const url = new URL(location.href);

  if (replay_regex.test(url.pathname)) {
    return "replay";
  } else if (url.pathname.split("/")[2] === "clip") {
    return "clip";
  }
  return false;
}

export function observer(
  obj: Element,
  config: Object,
  callback: MutationCallback
) {
  if (!obj || obj.nodeType !== 1) return;

  if (window.MutationObserver) {
    const mutationObserver = new MutationObserver(callback);
    mutationObserver.observe(obj, config);
    return mutationObserver;
  }
}
