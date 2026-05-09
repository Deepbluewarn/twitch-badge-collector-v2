import React, { createContext, useContext } from "react";
import { ChatInfo } from "../interfaces/chat";
import { CompositeFilterElement } from "../interfaces/filter";

export const ArrayFilterContext = createContext<{
    arrayFilter: CompositeFilterElement[],
    setArrayFilter: React.Dispatch<React.SetStateAction<CompositeFilterElement[]>>
    addArrayFilter: (filters: CompositeFilterElement[]) => boolean,
    upsertArrayFilter: (filter: CompositeFilterElement) => boolean,
    removeSubFilter: (filterListId: string, subFilterId: string) => void,
    removeFilterField: (filterListId: string, fieldName: keyof CompositeFilterElement) => void,
    checkFilter: (chat: ChatInfo, channelId?: string | null) => boolean
  } | undefined>(undefined);

export function useArrayFilterContext() {
  const context = useContext(ArrayFilterContext);

  if (typeof context === 'undefined') {
    throw new Error("ArrayFilterContext must be within ArrayFilterProvider");
  }

  return context;
}