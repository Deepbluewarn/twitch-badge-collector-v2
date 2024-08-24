import axios from "axios";
import React from "react";
import { Badges } from "../interfaces/api/chzzkAPI";

export default function useChzzkAPI() {

    const instance = axios.create({
        baseURL: `https://chzzk.badgecollector.dev`,
    });

    const fetchBadges = React.useCallback(async () => {
        const { data } = await instance.post(`/badges`)
        return data as Badges;
    }, []);

    return {
        fetchBadges
    };
}

export interface ChzzkAPIHooks {
    fetchBadges: () => Promise<Badges>,
}