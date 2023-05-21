import { FilterInterface } from "twitch-badge-collector-cc";
import browser from "webextension-polyfill";

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
  a: FilterInterface.ArrayFilterInterface,
  b: FilterInterface.ArrayFilterInterface
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
  a: FilterInterface.ArrayFilterInterface[],
  b: FilterInterface.ArrayFilterInterface[]
) {
  return (
    a.length === b.length && a.every((o, idx) => arrayFilterEqual(o, b[idx]))
  );
}

export const objectsEqual = (o1: any, o2: any) =>
  Object.keys(o1).length === Object.keys(o2).length &&
  Object.keys(o1).every((p) => o1[p] === o2[p]);

export const arraysEqual = (a1: any, a2: any) =>
  a1.length === a2.length &&
  a1.every((o: any, idx: any) => objectsEqual(o, a2[idx]));

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

export const isFirefoxAddon = async () => {
  if (typeof browser !== 'undefined' && typeof browser.runtime.getBrowserInfo !== 'undefined') {
    const info = await browser.runtime.getBrowserInfo();
    return info.name === 'Firefox';
  }
  return false;
}
