import { describe, it, expect } from 'vitest';
import { DEFAULT_MAX_CHATS, LEGACY_MAX_CHATS, maxChatsOf, missingMaxChats } from './setting';

describe('missingMaxChats', () => {
    it('아무 설정도 없으면 새 설치라 100', () => {
        expect(missingMaxChats({})).toBe(DEFAULT_MAX_CHATS);
        expect(missingMaxChats({ maximumNumberChats: undefined })).toBe(DEFAULT_MAX_CHATS);
    });
    it('다른 설정이 있는데 최대 개수만 비었으면 예전 스토어 빌드 사용자라 1000', () => {
        expect(missingMaxChats({ position: 'up', darkTheme: 'system' })).toBe(LEGACY_MAX_CHATS);
        expect(missingMaxChats({ containerRatio: 0 })).toBe(LEGACY_MAX_CHATS);
    });
    it('비어 있는 다른 키는 설정이 있는 것으로 치지 않는다', () => {
        expect(missingMaxChats({ position: undefined, darkTheme: null })).toBe(DEFAULT_MAX_CHATS);
    });
});

describe('maxChatsOf', () => {
    it('저장된 값을 그대로 쓴다', () => {
        expect(maxChatsOf(300)).toBe(300);
        expect(maxChatsOf('100')).toBe(100);
    });
    it('비어 있으면 예전 스토어 빌드 사용자 몫', () => {
        expect(maxChatsOf(undefined)).toBe(LEGACY_MAX_CHATS);
        expect(maxChatsOf(null)).toBe(LEGACY_MAX_CHATS);
    });
    it('숫자가 아니거나 1보다 작으면 기본값', () => {
        expect(maxChatsOf(0)).toBe(DEFAULT_MAX_CHATS);
        expect(maxChatsOf(-5)).toBe(DEFAULT_MAX_CHATS);
        expect(maxChatsOf('abc')).toBe(DEFAULT_MAX_CHATS);
        expect(maxChatsOf(NaN)).toBe(DEFAULT_MAX_CHATS);
    });
});
