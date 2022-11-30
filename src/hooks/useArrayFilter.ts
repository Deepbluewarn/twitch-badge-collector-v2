import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import browser from "webextension-polyfill";
import { useAlertContext } from "../context/Alert";
import ChatInfo from "../interfaces/chat";
import { ChatInfoObjects } from "../interfaces/chatInfoObjects";
import { ArrayFilterListInterface } from "../interfaces/filter";
import { arrayFiltersEqual, inIframe } from "../utils";

export default function useArrayFilter() {
  const [arrayFilter, setArrayFilter] = useState<ArrayFilterListInterface[]>(
    []
  );
  const arrayFilterRef = useRef<ArrayFilterListInterface[]>([]);
  const isFilterInitialized = useRef(false);
  const { t } = useTranslation();

  useEffect(() => {
    if (isFilterInitialized.current) {
      browser.storage.local.set({ filter: arrayFilter });
    }

    arrayFilterRef.current = arrayFilter;
  }, [arrayFilter]);

  useEffect(() => {
    browser.storage.local.get("filter").then((res) => {
      setArrayFilter(res.filter);
      isFilterInitialized.current = true;
    });
  }, []);

  const addArrayFilter = (newFilters: ArrayFilterListInterface[]) => {
    for (let newFilter of newFilters) {
      const empty = newFilter.filters.some((row) => row.value === "");

      if (empty) {
        alert(t("alert.no_value_filter"));
        return false;
      }

      setArrayFilter((afLists) => {
        for (let af of afLists) {
          if (arrayFiltersEqual(af.filters, newFilter.filters)) {
            alert(t("alert.filter_already_exist"));
            return afLists;
          }
        }

        return [...afLists, newFilter];
      });
    }
    return true;
  };

  const checkFilter = (chat: ChatInfo, chatInfoObject?: ChatInfoObjects) => {
    if (
      typeof arrayFilterRef.current === "undefined" ||
      arrayFilterRef.current.length === 0
    )
      return false;

    let res = false; // true 이면 해당 chat 을 포함, false 이면 제외.

    for (let arrayFilter of arrayFilterRef.current) {
      const filterMatched = arrayFilter.filters.every((filter) => {
        let filterMatchedRes = false;

        if (filter.type === "sleep") {
          return filterMatchedRes;
        }

        if (filter.category === "badge") {
          if (!chatInfoObject) {
            filterMatchedRes = chat.badges.includes(filter.value);
          } else {
            filterMatchedRes = chat.badges.some((badge_str) => {
              if (!chatInfoObject) return;

              const badge =
                chatInfoObject.channelBadges.get(badge_str) ||
                chatInfoObject.globalBadges.get(badge_str);
              if (!badge) return false;

              const badge_uuid = new URL(badge.image_url_1x).pathname.split(
                "/"
              )[3];

              return badge_uuid === filter.value;
            });
          }
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
          // arrayFilter 가 include 이면 exclude 로 설정된
          // 다른 ArrayFilter 가 있는지 찾아야 하므로 계속 진행.
          res = true;
        } else if (arrayFilter.filterType === "exclude") {
          // arrayFilter 가 exclude 이면 다른 ArrayFilter 를 확인하지 않고 종료.
          res = false;
          break;
        } else if (arrayFilter.filterType === "sleep") {
          // arrayFilter 가 sleep 이면 다른 ArrayFilter 를 확인하기 위해 계속 진행.
          // sleep 으로 설정된 필터일때는 res 의 값을 바꾸지 않음.
        }
      }
    }

    return res;
  };

  return {
    arrayFilter,
    arrayFilterRef,
    setArrayFilter,
    addArrayFilter,
    checkFilter,
  };
}
