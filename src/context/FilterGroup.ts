import React, { createContext, useContext } from "react";
import { ChatInfo } from "../interfaces/chat";
import { CompositeFilterElement } from "../interfaces/filter";

export const FilterGroupContext = createContext<{
    filterGroup: CompositeFilterElement[],
    setFilterGroup: React.Dispatch<React.SetStateAction<CompositeFilterElement[]>>
    addCompositeFilters: (filters: CompositeFilterElement[]) => boolean,
    upsertCompositeFilter: (filter: CompositeFilterElement) => boolean,
    removeSubFilter: (filterListId: string, subFilterId: string) => void,
    removeFilterField: (filterListId: string, fieldName: keyof CompositeFilterElement) => void,
    checkFilter: (chat: ChatInfo, channelId?: string | null) => boolean
  } | undefined>(undefined);

export function useFilterGroupContext() {
  const context = useContext(FilterGroupContext);

  if (typeof context === 'undefined') {
    throw new Error("FilterGroupContext must be within a FilterGroupContext.Provider");
  }

  return context;
}