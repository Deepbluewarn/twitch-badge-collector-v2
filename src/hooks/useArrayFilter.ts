import { useEffect, useRef } from "react";
import browser from "webextension-polyfill";
import ChatInfo from "../interfaces/chat";
import {
  ArrayFilterListInterface,
} from "../interfaces/filter";

export default function useArrayFilter() {
  const filterRef = useRef<ArrayFilterListInterface[]>([]);

  useEffect(() => {
    browser.storage.local.get("filter").then((res) => {
      filterRef.current = res.filter;
    });
    browser.storage.onChanged.addListener((changed, areaName) => {
      if (areaName !== "local") return;

      const filter = changed.filter;

      if (!filter) return;

      filterRef.current = filter.newValue;
    });
  }, []);

  const checkFilter = (chat: ChatInfo) => {
    if (filterRef.current.length === 0) return;

    let res = false;

    for (let arrayFilter of filterRef.current) {
      const filterMatched = arrayFilter.filters.every((filter) => {
        let filterMatchedRes = false;

        if (filter.type === "sleep") {
          return filterMatchedRes;
        }
        if (filter.category === "badge") {
          filterMatchedRes = chat.badges.includes(filter.value);
        } else if (filter.category === "name") {
          filterMatchedRes =
            chat.loginName.toLowerCase() === filter.value.toLowerCase() ||
            chat.nickName.toLowerCase() === filter.value.toLowerCase();
        } else if (filter.category === "keyword") {
          filterMatchedRes = chat.textContents.some((text) =>
            text.includes(filter.value)
          );
        }

        if (filter.type === "exclude") {
          filterMatchedRes = !filterMatchedRes;
        }

        return filterMatchedRes;
      });

      if (filterMatched) {
        if (arrayFilter.filterType === "include") {
          res = true;
        } else if (arrayFilter.filterType === "exclude") {
          res = false;
          break;
        } else if (arrayFilter.filterType === "sleep") {
          res = false;
        }
      }
    }

    return res;
  };

  return { filterRef, checkFilter };
}
