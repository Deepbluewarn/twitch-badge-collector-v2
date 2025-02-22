import { nanoid } from "nanoid";
import { ArrayFilterInterface } from "../interfaces/filter"
import { Logger } from "./logger";

export const generateRandomString = (length: number): string => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

export const getQueryParams = (queryName: string) => {
  const urlSearchParams = new URLSearchParams(window.location.search);
  const params = Object.fromEntries(urlSearchParams.entries());
  return params[`${queryName}`];
};
export function trim_hash(str: string) {
  let c1: string = "";

  if (str && str !== "") {
    c1 = str[0] === "#" ? str.substring(1) : str;
  }
  return c1;
}
export function getDefaultArrayFilter() {
  return {
    category: 'name',
    id: nanoid(),
    type: 'include',
    value: ''
  } as ArrayFilterInterface;
}
export function badgeUuidFromURL(url: string) {
  let badge_uuid: string = "";

  try {
    badge_uuid = new URL(url).pathname.split("/")[3];
  } catch (e) {
    return badge_uuid;
  }
  return badge_uuid;
}
export function getRandomString() {
  return Math.random().toString(36).substring(2, 12);
}
export function checkChannelValid(channel: string) {
  return /^[a-zA-Z0-9]*$/i.test(channel);
}
/**
 * Returns a random number between min (inclusive) and max (exclusive)
 */
export function getRandomArbitrary(min: number, max: number) {
  return Math.round(Math.random() * (max - min) + min);
}
export function getLocalStorageObject(key: string) {
  const obj = localStorage.getItem(key);
  return obj ? JSON.parse(obj) : null;
}
export function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function arrayFilterEqual(
  a: ArrayFilterInterface,
  b: ArrayFilterInterface
) {
  return (
    Object.keys(a).length === Object.keys(b).length &&
    Object.keys(a).every((p) => {
      if (p === "id") {
        return true;
      } else {
        return a[p] === b[p];
      }
    })
  );
}

export function arrayFiltersEqual(
  a: ArrayFilterInterface[],
  b: ArrayFilterInterface[]
) {
  return (
    a.length === b.length && a.every((o, idx) => arrayFilterEqual(o, b[idx]))
  );
}

export const objectsEqual = (o1: never, o2: never) =>
  Object.keys(o1).length === Object.keys(o2).length &&
  Object.keys(o1).every((p) => o1[p] === o2[p]);

export const arraysEqual = (a1: never[], a2: never[]) =>
  a1.length === a2.length &&
  a1.every((o: never, idx: number) => objectsEqual(o, a2[idx]));

export function inIframe() {
  try {
    return window.self !== window.top;
  } catch (e) {
    return true;
  }
}
export const getRandomBooleanWithProbability = (probability: number) => {
  return Math.random() < probability;
}

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
export function getVideoIdParam(replayType: "replay" | "clip" | boolean) {
  const paths = window.location.pathname.split("/");

  if (replayType === "clip") {
    return paths[3];
  } else if (replayType === "replay") {
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

export function findElement(selector: string, cb: (elem: Element | null) => void) {
  let tryCount = 0;
  const loop = setInterval(() => {
    const targetNode = selectElement(selector);

    if (tryCount > 400) {
      Logger('observe', `Cannot found elements for selector: ${selector}, exit.`)
      clearInterval(loop);
      return;
    }

    if (!targetNode) {
      tryCount++;
      return;
    }
    Logger('observe', `Elements found! selector: ${selector}`)

    cb(targetNode)

    clearInterval(loop);
  }, 100);
}

export function selectElement(selector: string): Element | null {
  if (!selector || selector === '') {
    return null;
  }
  // 공백이 포함된 선택자
  if (selector.includes(' ')) {
    return document.querySelector(selector);
  }
  // 클래스 선택자
  else if (selector.startsWith('.')) {
    return document.getElementsByClassName(selector.slice(1))[0] || null;
  }
  // ID 선택자
  else if (selector.startsWith('#')) {
    return document.getElementById(selector.slice(1));
  }
  // 태그 이름 선택자
  else {
    return document.querySelector(selector);
  }
}

export function msToTime(duration: number) {
  const seconds = Math.floor((duration / 1000) % 60);
  const minutes = Math.floor((duration / (1000 * 60)) % 60);
  const hours = Math.floor((duration / (1000 * 60 * 60)) % 24);
  const res = [];

  if (hours > 0) {
    res.push(hours);
  }

  if (minutes > 0) {
    res.push(minutes < 10 ? "0" + minutes : minutes);
  }

  if (seconds > 0) {
    res.push(seconds < 10 ? "0" + seconds : seconds);
  }

  return res.join(':')
}