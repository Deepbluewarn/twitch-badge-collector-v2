# 치지직 채팅 소켓 프로토콜 — 실측 레퍼런스 (2026-10-10)

HTML(selector) 대신 채팅 소켓으로 채팅을 수집하는 경로(`src/platform/chzzk-socket.ts`,
`src/content-scripts/chzzk/ws-tap.ts`)의 근거 자료. 여기 적힌 내용은 모두 실측했거나
치지직 번들 코드에서 직접 확인한 것이고, 확인 못 한 것은 **미확인**으로 따로 표시했다.

## 수집 조건

- 2026-10-10 20:10–20:25 KST (피크), 인기 라이브 14채널 동시, 15분, 비로그인 READ 접속
- 채널 규모 3,025–7,866명. 카테고리: 오버워치 ×4, 아크 레이더스 ×2, FC온라인 ×2, 명조, 봄바나나!, 마인크래프트, 이터널 리턴, 발로란트, talk
- 패킷 13,627개 / 채팅 항목 31,709건 → **파싱 실패 0건, id(`uid_time`) 중복 0건**
- 원본: `captures/chzzk-socket/2026-10-10T11-10-36-921Z/` (**gitignore** — 실제 닉네임·userIdHash 포함, 로컬에만 있음)
- 재수집: `npx tsx scripts/capture/chzzk-socket.ts` (`CAPTURE_CHANNELS`, `CAPTURE_SECONDS`)
- 분석: `npx tsx scripts/capture/analyze-chzzk-socket.ts <수집 폴더> [out.json]` → 필드 경로·타입·등장 비율·enum 값 분포

## 접속 순서

1. `GET api.chzzk.naver.com/polling/v2/channels/{channelId}/live-status` → `content.chatChannelId`
2. `GET comm-api.game.naver.com/nng_main/v1/chats/access-token?channelId={chatChannelId}&chatType=STREAMING` → `content.accessToken` (비로그인도 발급)
3. `wss://kr-ss{1..10}.chat.naver.com/chat` 접속 → `{ver:'2', cmd:100, svcid:'game', cid, tid, bdy:{uid:null, devType:2001, accTkn, auth:'READ'}}`
4. `10100` 수신 후 `cmd:5101 {recentMessageCount:50}` → `15101`로 최근 채팅
5. 서버가 보내는 `cmd:0`에는 `cmd:10000`으로 응답

치지직 웹은 `routing.chat.naver.com`으로 세션 서버를 고른다. 어느 서버로 붙어도 같은 채널을 받는다.

**치지직 웹의 소켓 사용 (vendor 번들)**: 메인 스레드에서 `new WebSocket(url)`을 열고 `addEventListener('message')`로 JSON 텍스트를 받아 `JSON.parse`한다. Worker를 쓰지 않으므로 MAIN world에서 생성자를 감싸 탭할 수 있다.

## cmd 분포 (15분, 14채널)

| cmd | 의미 | 개수 | 처리 |
|---|---|---|---|
| 93101 | 채팅 | 12,367 | 수집 |
| 93102 | 후원·구독 등 (msgTypeCode로 구분) | 128 | 수집 |
| 15101 | 최근 채팅 (`bdy.messageList`) | 14 | 수집 (`recent`) |
| 94008 | 블라인드 이벤트 | 405 | 소켓 렌더 모드에서 이미 넣은 채팅을 다시 그림 |
| 93006 | 채널 이벤트 | 83 | 무시 |
| 10100 | 접속 완료 | 14 | 탭 생존 신호 |
| 0 / 10000 | ping / pong | 616 | 무시 |

## 메시지 모양 세 가지

치지직 번들의 `messageConverter`와 같은 기준으로 분기한다.

| 출처 | 작성자 | 시각 | 본문 | 종류 | 상태 |
|---|---|---|---|---|---|
| 93101/93102 `bdy[]` | `uid` | `msgTime` | `msg` | `msgTypeCode` | `msgStatusType` |
| 15101 `bdy.messageList[]` | `userId` | `messageTime` | `content` | `messageTypeCode` | `messageStatusType` |
| VOD REST `videoChats[]` | `userIdHash` | `messageTime` (+`playerMessageTime`) | `content` | `messageTypeCode` | `messageStatusType` |

`profile`과 `extras`는 세 경우 모두 **JSON 문자열**이다. 익명 후원은 `profile`이 `null`이다.

VOD REST: `GET api.chzzk.naver.com/service/v1/videos/{videoNo}/chats?playerMessageTime={ms}&previousVideoChatSize=50`
→ `{nextPlayerMessageTime, previousVideoChats[], videoChats[]}`. 한 번에 약 45초 분량을 미리 준다.
치지직 웹은 axios(XHR)로 호출한다.

## msgTypeCode (번들 enum `Bg`)

`TEXT 1, DONATION 10, SUBSCRIPTION 11, SUBSCRIPTION_GIFT 12, PARTY 13, STREAMER_SHOP_PURCHASE 15, SYSTEM 30`
(10000 이상은 클라이언트 전용).

| 코드 | 실측 건수 | 비고 |
|---|---|---|
| 1 | 31,579 | |
| 10 | 109 | 93건(85%)이 익명 — `uid:'anonymous'`, `profile:null`, `extras.isAnonymous:true` |
| 11 | 11 | |
| 30 | 10 | 임시 제한 알림. `extras.visibleRoles`에 해당하는 역할(매니저 등)에게만 표시 → **수집 제외** |
| 12, 13, 15 | 0 | **미확인** (이번 수집에 없음) |

## msgStatusType (번들 enum `Oy`: NORMAL / BLIND / CBOTBLIND)

실측 결과 `NORMAL` 31,457건, `CBOTBLIND` 252건(전부 type 1). 클린봇이 숨긴 채팅은 **처음부터 이 상태로 도착**한다. `msg`에는 원문이 그대로 들어 있다.

## profile (type 1 기준 등장 비율)

| 필드 | 비율 | 값 |
|---|---|---|
| `nickname`, `userIdHash`, `userRoleCode`, `verifiedMark` | 100% | role: `common_user` 31,537 / `streamer` 29 / `streaming_chat_manager` 9 / `streaming_channel_manager` 4 |
| `badge.imageUrl` (역할 배지) | 0.1% | `glive/icon/streamer.png`, `glive/icon/manager.png` |
| `title.{name,color}` | 0.1% | 칭호. `color`가 있으면 host는 닉네임 색보다 우선 적용 |
| `streamingProperty.subscription.{tier,tierName,accumulativeMonth,badge.imageUrl}` | 42% | tier 1: 9,814 / tier 2: 3,465 |
| `streamingProperty.realTimeDonationRanking.badge.imageUrl` | 0.1% | `glive/icon/gold.png`, `bronze.png` … |
| `streamingProperty.nicknameColor.colorCode` | 100% | 코드만 온다(`CC000` 등). 실제 RGB는 host의 colorMap에 있다 |
| `viewerBadges[]` `{type:'STANDARD', badge:{badgeId, scope, imageUrl}}` | 필드 100%, 항목 수 기준 0.75 | scope: CHANNEL 20,810 / GLOBAL 2,807 |
| `activityBadges[]` `{imageUrl, activated}` | 필드 100% | `viewerBadges`가 항상 있어서 실제로 쓰이지 않는다 |
| `verifiedMark: true` | 26건 | |

**배지 계산 (번들 `tv(profile)`)**: 역할 → 실시간 후원 랭킹 → 구독 → `viewerBadges`(배열이 있으면 비어 있어도 이것만 사용) / 없으면 `activityBadges(activated)`.
`viewerBadges`는 첫 항목에 `activatedV2`가 있으면 그걸로 거르고, CHANNEL scope를 먼저, 같은 scope 안에서는 `order` 순으로 정렬한다.
**실측에서는 `activatedV2`와 `order`가 한 번도 오지 않았다.** host 코드에서는 `undefined - undefined = NaN`이 0으로 취급되므로 결과는 "scope 정렬 + 원래 순서 유지"가 되고, 우리 구현(`?? 0`)도 같은 결과를 낸다.
배지 이미지 URL은 모두 `ssl.pstatic.net/static/nng/glive/...`로, 기존 배지 필터가 저장하는 값과 같은 형식이다.

**한글 파일명 배지 (shadow 비교에서 발견)**: 소켓은 `.../icon/디지털뱃지_유니.png`처럼 한글을 그대로 보낸다. HTML 경로는 같은 배지를 React props(한글 그대로)와 `<img src>`(브라우저가 `%EB%94%94…`로 인코딩) 두 형태로 갖는다.
소켓 경로는 `withEncodedVariants()`로 두 형태를 모두 내보내서, 저장된 필터가 어느 형태든 기존과 같게 매칭되도록 한다.
배지 목록 API(`chzzk.badgecollector.dev`)가 어느 형태를 주는지는 **미확인**이다.

## extras

**type 1**: `osType`(PC 22,338 / AOS 6,707 / IOS 2,534), `chatType`, `streamingChannelId`, `emojis`(92%, `{이름: URL}`), `extraToken`.
본문의 이모지는 `{:이름:}` 토큰으로 온다.

**type 10 후원**: `payAmount`, `payType`(CURRENCY), `donationType`(CHAT 108 / MISSION 1), `isAnonymous`, `continuousDonationDays`, `weeklyRankList[]`, `donationUserWeeklyRank`, `emojis`. 미션 후원이면 추가로 `missionText`, `missionDonationType`, `durationTime`, `totalPayAmount`, `success`, `status`가 붙는다.

**type 11 구독**: `month`, `tierNo`, `tierName`(채널별 이름), `nickname`.

**type 30 시스템**: `styleType`(3), `visibleRoles[]`, `description`, `params.{registerNickname,targetNickname,…}`.

## 94008 블라인드 이벤트

`bdy: {serviceId, channelId, messageTime, userId, blindType, blindUserId:null, message:null}`
blindType: `CBOTBLIND` 245 / `HIDDEN` 149 / `BLIND` 11.
`${userId}_${messageTime}`가 우리 채팅 id와 같다. 이번 수집에서 405건 중 319건이 수집된 채팅과 매칭됐고, 나머지는 접속 전에 올라온 채팅이다.
host(`notiBlindListener`) 처리: `CANCEL`이면 이벤트에 같이 온 `message.{content, extras}`로 원문을 복원하고, 그 밖의 값(`BLIND`/`HIDDEN`/`CBOTBLIND`/`RECLAIM`/`FILTERED`)이면 상태만 바꾼다.
구현: `parseChzzkBlindEvent()`·`applyBlindEvent()` → ws-tap이 `blind` 메시지로 보낸다 → useChatStream이 통과시킨 채팅이면 다시 그려 `updateChat`으로 교체한다. 필터 판정은 다시 하지 않는다(원문 기준).

## 93006 채널 이벤트 (`bdy.type`)

`LOG_POWER_PREDICTION_TOTAL_POWER_CHANGE` 45, `DONATION_MISSION_PARTICIPATION` 20, `TEMPORARY_RESTRICT` 10, `LIVE_MID_ROLL_AD` 4, `DONATION_MISSION_IN_PROGRESS` 3, `LOG_POWER_PREDICTION_EXPIRED` 1. 채팅 수집과는 관계없다.

## 클린봇·블라인드 표시 (번들 채팅 컴포넌트)

가리기는 **프론트에서 한다.** 서버는 원문을 `msg`에 그대로 담고 상태만 표시한다.

| status | host 표시 |
|---|---|
| `NORMAL` | 본문 |
| `CBOTBLIND` | 사용자 클린봇 설정(`isCleanBotWorking`)이 켜져 있으면 "클린봇이 감지" 문구, 꺼져 있으면 **원문** |
| 그 밖 (`BLIND` 등) | 설정과 관계없이 "블라인드 처리된 메시지" |

이미 보인 채팅도 94008 이벤트가 오면 상태가 바뀐다.

## 닉네임 색

소켓에는 `streamingProperty.nicknameColor.colorCode` **코드만** 온다. host(`makeMessage`)의 결정 순서:

1. 스트리머/매니저(`STREAMER`, `MANAGER`, `STREAMING_CHANNEL_MANAGER`, `STREAMING_CHAT_MANAGER`)가 아니면 코드를 표에서 찾는다.
   - 번들 내장 `CD001`–`CD040`
   - `GET api.chzzk.naver.com/service/v1/nickname/color/codes` → `CC001`–`CC020` (비로그인 가능)
2. 못 찾으면 `title.color`, 없으면 **해시 팔레트**: `userIdHash` + `chatChannelId`의 글자 코드 합 % 40 (라이트/다크 각 40색). 익명 후원은 `userIdHash` 대신 `''`.

실측 코드 분포 (type 1, 31,579건): `CC000` 27,655 (87%, 표에 없음 → 해시 팔레트) / `SG001–005`, `SH004–005` 등 약 10%.
`SG`(그라데이션)·`SH`(하이라이트)는 2단계 구독자용 닉네임 꾸미기인데 공개 API 목록에 없다. 출처는 **미확인**이다.

host의 작은 버그: API는 라이트 색을 `whiteRgbValue`로 주는데 host는 `lightRgbValue`를 읽는다. 그래서 라이트 테마에서 CC 색이 비어 기본 글자색이 된다.

구현: `resolveNicknameColor()` (`src/platform/chzzk-socket.ts`), 표는 `src/platform/chzzk-nickname-colors.json` (번들 `b_`/`x_` + API 추출본).
API의 `whiteRgbValue`를 라이트 색으로 쓴다(host와 다른 점).

## host DOM과의 연결

host의 `chatMessage.key`는 `${uid}_${msgTime}_${랜덤}`이다(번들 `makeMessage`). 소켓 채팅 id(`uid_time`)를 **접두어로** 쓰면 대응하는 DOM 요소를 찾을 수 있다. `native` 표시 스타일과 원본 채팅 하이라이트가 이 방식에 기댄다.

## 결정 사항 (2026-10-10)

- **클린봇(`CBOTBLIND`)**: 기본으로 가린다. 클릭하면 원문을 **이탤릭체로** 보여준다. 사용자의 치지직 클린봇 설정은 따르지 않는다.
- **운영자 블라인드(`BLIND`/`HIDDEN`, 94008 포함)**: 항상 가린다. 원문을 볼 수 없다(host와 동일).
- **필터 판정은 원문 기준**: 가려진 채팅도 키워드 필터에 걸린다. 가리는 건 표시 단계에서만 한다.
- **닉네임 색**: 공개 표(CD/CC) + 해시 팔레트로 충분하다. `SG`/`SH` 꾸미기는 해시 색으로 대체해도 받아들인다.
- **SYSTEM(30)**: 수집 대상에서 제외한다.

## 미확인 / 다음에 확인할 것

- type 12(구독 선물), 13(파티), 15(스트리머샵 구매) 실제 모양
- 소켓 탭이 실제 브라우저에서 치지직보다 먼저 설치되는지 (MAIN `document_start`)
- `SG`/`SH` 닉네임 꾸미기 값의 출처
- 배지 목록 API가 한글 배지 URL을 어느 형태(원문/인코딩)로 주는지
- 로그인 사용자로 접속했을 때 패킷 차이 (탭은 host 소켓을 그대로 보므로 로그인 상태 패킷을 받게 된다)

## 나중에 설계: 운영 관찰 메트릭

소켓 경로를 운영에 낸 뒤에도 잘 동작하는지 볼 수 있어야 한다 (2026-10-10 결정).
shadow 비교는 dev/수동 플래그용이라 운영 관찰을 대신하지 못한다.

**결정 (2026-10-10): 사용자 브라우저에서 데이터를 보내지 않는다. CI canary만 쓴다.**
canary가 확장을 로드한 채 라이브를 열어 탭 연결 신호, 파서 실패율, 배지 계산이 화면과 맞는지를
확인한다 (shadow 비교 자동화). 사용자 데이터가 없으므로 수집 동의가 필요 없다.
상시 사용자 지표(동의 + 수신 서버)는 canary로 부족하다는 근거가 생길 때 다시 검토한다.
작업 순서는 소켓 모드 작업의 맨 마지막.

참고할 기존 장치:
- `src/platform/diagnose.ts` + `report.ts`: 사용자가 popup에서 진단 리포트를 Discord로 제보 (동의 필요). 소켓 탭 상태(연결 신호 수신 여부, 수신 채팅 수, HTML 경로로 대체한 횟수)를 여기에 실을 수 있다.
- `scripts/canary/`: CI에서 치지직을 주기적으로 방문해 selector를 검증. 소켓 프로토콜 검증(`scripts/capture/`를 짧게 돌리고 파서 실패율 확인)을 같은 방식으로 추가할 수 있다.
- `selector-health.ts`의 원칙: 런타임 동작에 영향 주지 않기, "판단 근거 없음(unknown)"을 정상과 구별하기.
