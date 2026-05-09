import axios from "axios";
import { Badges } from "@/interfaces/api/chzzkAPI";

export interface ChzzkAPI {
    fetchBadges: () => Promise<Badges>;
}

export function createChzzkAPI(): ChzzkAPI {
    const instance = axios.create({ baseURL: 'https://chzzk.badgecollector.dev' });

    return {
        fetchBadges: async () => {
            const { data } = await instance.post('/badges');
            return data as Badges;
        },
    };
}
