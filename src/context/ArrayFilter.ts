import React, { createContext, useContext } from "react";
import { ChatInfo } from "../interfaces/chat";
import { ChatInfoObjects } from "../interfaces/chatInfoObjects";
import { ArrayFilterListInterface } from "../interfaces/filter";

export const ArrayFilterContext = createContext<{
    arrayFilter: ArrayFilterListInterface[],
    setArrayFilter: React.Dispatch<React.SetStateAction<ArrayFilterListInterface[]>>
    addArrayFilter: (filters: ArrayFilterListInterface[]) => boolean,
    upsertArrayFilter: (filter: ArrayFilterListInterface) => boolean,
    removeSubFilter: (filterListId: string, subFilterId: string) => void,
    removeFilterField: (filterListId: string, fieldName: keyof ArrayFilterListInterface) => void,
    checkFilter: (chat: ChatInfo, chatInfoObject: ChatInfoObjects) => boolean
  } | undefined>(undefined);

export function useArrayFilterContext() {
  const context = useContext(ArrayFilterContext);

  if (typeof context === 'undefined') {
    throw new Error("ArrayFilterContext must be within ArrayFilterProvider");
  }

  return context;
}