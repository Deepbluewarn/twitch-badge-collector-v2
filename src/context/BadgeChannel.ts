import React, { createContext, useContext } from "react";
import { BadgeChannelType } from '../interfaces/channel';

export const BadgeListChannelContext = createContext<{ badgeListChannel: BadgeChannelType, setBadgeListChannel: React.Dispatch<React.SetStateAction<BadgeChannelType>> } | undefined>(undefined);
export const BadgeChannelNameContext = createContext<{ badgeChannelName: string, setBadgeChannelName: React.Dispatch<React.SetStateAction<string>> } | undefined>(undefined);

export function useBadgeListChannelContext() {
    const context = useContext(BadgeListChannelContext);
    if (typeof context === 'undefined') {
        throw new Error("BadgeListChannelContext must be within BadgeListChannelProvider");
    }

    return context;
}
export function useBadgeChannelNameContext() {
    const context = useContext(BadgeChannelNameContext);
    if (typeof context === 'undefined') {
        throw new Error("BadgeChannelNameContext must be within BadgeChannelNameProvider");
    }

    return context;
}