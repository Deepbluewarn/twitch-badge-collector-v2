import { nanoid } from 'nanoid';
import { SettingInterface } from "@interfaces/setting";
import { BadgeInterface } from '@interfaces/chat';
import { badgeUuidFromURL } from '@utils/utils-common';
import { ArrayFilterInterface } from '@interfaces/filter';

/**
 * 배지 객체를 필터 객체로 변환
 */
export function badgeToFilter(badge: BadgeInterface, platform: SettingInterface['platform']): ArrayFilterInterface {
    const badgeUUID = platform === 'twitch'
        ? badgeUuidFromURL(badge.badgeImage.badge_img_url_1x)
        : badge.badgeImage.badge_img_url_1x;

    return {
        category: 'badge',
        id: nanoid(),
        type: 'include', // 기본 타입
        value: badgeUUID,
        badgeName: `${badge.channel}: ${badge.badgeName}`,
        badgeSetId: badge.badgeSetId,
        channelLogin: badge.channelLogin,
        channelId: badge.channelId,
    };
}

/**
 * 간편 모드: 단일 필터 객체의 배지 정보 설정
 * @param badge 선택한 배지
 * @param platform 현재 플랫폼
 * @param setFilter 필터 객체 상태 설정 함수
 */
export function setBadgeInSimpleFilter(
    badge: BadgeInterface,
    platform: SettingInterface['platform'],
    setFilter: React.Dispatch<React.SetStateAction<ArrayFilterInterface | undefined>>
): void {
    const badgeUUID = platform === 'twitch'
        ? badgeUuidFromURL(badge.badgeImage.badge_img_url_1x)
        : badge.badgeImage.badge_img_url_1x;

    setFilter(current => {
        if (!current) return current;

        return {
            ...current,
            category: 'badge',
            value: badgeUUID,
            badgeName: `${badge.channel}: ${badge.badgeName}`,
            badgeSetId: badge.badgeSetId,
            channelLogin: badge.channelLogin,
            channelId: badge.channelId,
        }
    });
}

/**
 * 고급 모드: 배지를 새 필터로 필터 배열에 추가
 * @param badge 선택한 배지
 * @param platform 현재 플랫폼
 * @param setFilters 필터 배열 상태 설정 함수
 */
export function setBadgeInFilterArray(
    badge: BadgeInterface,
    platform: SettingInterface['platform'],
    setFilters: React.Dispatch<React.SetStateAction<ArrayFilterInterface[]>>
): void {
    setFilters(current => [
        ...current,
        badgeToFilter(badge, platform)
    ]);
}

/**
 * 고급 모드: 여러 배지를 새 필터로 필터 배열에 추가
 * @param badges 선택한 배지 배열
 * @param platform 현재 플랫폼
 * @param setFilters 필터 배열 상태 설정 함수
 */
export function setMultipleBadgesInFilterArray(
    badges: BadgeInterface[],
    platform: SettingInterface['platform'],
    setFilters: React.Dispatch<React.SetStateAction<ArrayFilterInterface[]>>
): void {
    setFilters(current => [
        ...current,
        ...badges.map(badge => badgeToFilter(badge, platform))
    ]);
}