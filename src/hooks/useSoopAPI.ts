import axios from "axios";
import React from "react";
import { Badges } from "../interfaces/api/soopAPI";

export default function useSoopAPI() {
    const instance = axios.create({
        baseURL: `https://api.badgecollector.dev`,
    });

    const fetchBadges = React.useCallback(async () => {
        const { data } = await instance.get(`/soop/badges`)
        return data as Badges;
    }, []);

    return {
        fetchBadges
    };
}

export interface SoopAPIHooks {
    fetchBadges: () => Promise<Badges>,
}
