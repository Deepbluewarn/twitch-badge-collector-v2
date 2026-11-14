/**
 * 치지직 채팅 소켓 주소. 확장의 탭(ws-tap.ts)은 이 주소의 소켓에만 붙는다.
 * ovm 주 경로 시험(ops/watch/main-path.ts)도 같은 규칙을 쓰려고 import 없는 파일로 둔다.
 */
export const CHAT_SOCKET_URL = /^wss:\/\/[^/]*\.chat\.naver\.com\/chat\b/;
