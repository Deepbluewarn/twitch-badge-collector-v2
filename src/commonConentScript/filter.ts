import { FilterInterface } from "../interfaces/filter";
import { TwitchUiChat } from "../interfaces/twitchChat";

export function checkFilter(filter: FilterInterface[], chat: TwitchUiChat) {
  const userNameRes = checkFilterCategory(
    filter,
    "login_name",
    chat.loginName,
    true
  );
  const dispNameRes = checkFilterCategory(
    filter,
    "login_name",
    chat.nickName,
    true
  );

  if (userNameRes === "FILTER_INCLUDE" || dispNameRes === "FILTER_INCLUDE")
    return "login_name";
  if (userNameRes === "FILTER_EXCLUDE" || dispNameRes === "FILTER_EXCLUDE")
    return "";

  const badges = chat.badges;

  for (let badge of Array.from(badges)) {
    const badgeUUID = new URL(badge.getAttribute("src")!).pathname.split(
      "/"
    )[3];

    const badgeRes = checkFilterCategory(filter, "badge_uuid", badgeUUID, true);

    if (badgeRes === "FILTER_INCLUDE") return "badge_uuid";
    if (badgeRes === "FILTER_EXCLUDE") return "";
  }

  for (let text of Array.from(chat.textContents)) {
    const keyword = text.textContent;
    if (!keyword) return true;

    const keywordRes = checkFilterCategory(filter, "keyword", keyword, false);

    if (keywordRes === "FILTER_INCLUDE") return "keyword";
    if (keywordRes === "FILTER_EXCLUDE") return "";
  }

  return "";
}
export function checkFilterCategory(
  filter: FilterInterface[],
  category: string,
  value: string,
  match: boolean
) {
  if (value === null || typeof value === "undefined" || value === "") {
    return "FILTER_NOT_FOUND";
  }

  const filterArr = filter.filter(
    (f) => f.category === category && f.filterType !== "sleep"
  );

  let include, exclude;

  if (match) {
    include = filterArr.filter(
      (el) =>
        el.value.toLowerCase() === value.toLowerCase() &&
        el.filterType === "include"
    );
    exclude = filterArr.filter(
      (el) =>
        el.value.toLowerCase() === value.toLowerCase() &&
        el.filterType === "exclude"
    );
  } else {
    include = filterArr.filter(
      (el) => value.includes(el.value) && el.filterType === "include"
    );
    exclude = filterArr.filter(
      (el) => value.includes(el.value) && el.filterType === "exclude"
    );
  }

  let i_len = include.length;
  let e_len = exclude.length;

  if (i_len === 0 && e_len === 0) {
    return "FILTER_NOT_FOUND";
  } else if (i_len != 0 && e_len === 0) {
    return "FILTER_INCLUDE";
  } else {
    return "FILTER_EXCLUDE";
  }
}
