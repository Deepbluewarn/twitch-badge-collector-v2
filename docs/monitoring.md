# 감시와 현황판 (ovm)

확장이 깨졌는지, 깨질 것 같은지, 치지직이 뭘 바꿨는지를 집 서버 ovm에서 지켜본다.

- **현황판: http://192.168.1.162:3400** (LAN 전용). 판정(정상/위험/깨짐), 치지직 배포, 카나리, 감시 작업 상태, 확장 실제 시험, 번들 변화, 배지, 스토어, GA가 한 화면에 있다.
- **알림: Discord.** 확인 작업은 보고서만 남기고, 상황실(`ops/watch/dispatch.ts`) 하나가 모아서 보낸다. 깨짐, 위험은 긴급 웹훅(없으면 community-watch 웹훅), 나머지는 community-watch 웹훅. 아래 "알림 규칙".
- **코드: 이 리포 `ops/`**. ovm은 `~/tbc` 클론을 10분마다 pull해서 돌린다. ovm에서 파일을 직접 고치지 않는다.
- 터미널에서 빠르게 숫자만 보려면 로컬 셸의 `tbc` (오늘 방문, 설치, 실시간).

## 구성

```
ovm (odroid, 192.168.1.162, ssh ovm)
├─ ~/tbc                       이 리포 클론 (master)
├─ ~/badgecollector-site       사이트 리포 클론. channels 작업이 커밋하고 푸시한다 (deploy key ~/.ssh/badgecollector-site-deploy, ~/.ssh/config의 Host github-site)
│   └─ ops/run.sh <작업>        cron 진입점. 작업을 돌리고 기록을 남긴다
├─ crontab                     ops/crontab 그대로
├─ systemd --user
│   ├─ badge-dashboard          ops/watch/serve.ts, :3400
│   └─ badge-harvester          배지 수집 서버, :8787 (아래 "harvester")
├─ ~/.config/badge-collector/  비밀 값 (리포에 없음)
│   ├─ community-watch.env      DISCORD_COMMUNITY_WEBHOOK (참고 알림, 하루 리포트), DISCORD_URGENT_WEBHOOK (긴급, 선택), DISCORD_MENTION_USER_ID (깨짐 때 멘션, 선택)
│   ├─ cloudflare.env           CF_ACCOUNT_ID, CF_ANALYTICS_TOKEN (Account Analytics 읽기, 확장 익명 통계 조회)
│   └─ ops.env                  OPS_HEALTHCHECK_URL (healthchecks.io, 11-14부터)
├─ ~/.config/analytics-mcp/adc.json   GA 인증 (사용자 refresh token)
└─ ~/.local/state/badge-collector/    결과
    ├─ ops.log                  실행마다 한 줄
    ├─ logs/<작업>.log           그 작업의 마지막 실행 출력
    ├─ runs/<작업>.json          마지막 성공 시각 (heartbeat가 본다). 상황실은 runs/dispatch.json
    ├─ alerts.jsonl             보낸 알림 (한 줄에 하나, 추가만)
    ├─ watch/checks/*.json      확인 작업의 보고서 (상황실이 읽는다)
    ├─ watch/incidents.json     상황실 장부 (지금 열린 사건, 확인 못 함 횟수)
    ├─ watch/*.json             현황판 데이터 (deploy, canary-selector, canary-socket, heartbeat, new-badges, live, main, bundle, info)
    └─ canary/                  카나리 스크립트의 스냅샷과 알림 파일
```

## 작업

| 작업 | 주기 | 하는 일 | 보고서 (사건 key) |
|---|---|---|---|
| `deploy` | 1분 | 치지직 첫 페이지 HTML이 불러오는 JS, CSS 파일 목록(해시 포함)을 본다. 처음 보는 목록이면 배포로 보고 `canary`, `socket`, `live`, `main`을 바로 띄운다 | `deploy`: 가장 최근 배포 (참고, `deploy:<시각>`) |
| `badges` | 10분 (5분부터) | harvester 데이터와 업적 배지 API를 `data/chzzk-badges.json`과 비교해 목록에 없는 배지를 찾는다. 넣을 그룹과 JSON 한 줄을 같이 남긴다. 흐름은 `docs/chzzk-badges.md` | `badges`: 배지마다 (참고, `badge:<이미지>`) |
| `socket` | 매시 30분 | 인기 라이브 8개 채팅 소켓에 2분 붙어 패킷이 `src/platform/chzzk-socket.ts`의 가정과 맞는지 본다 (`scripts/canary/socket.ts`). 템플릿이 없거나 실제로 본 적 없는 메시지(상점 구매, 파티, 미션 참여와 영상 후원, 보낸 사람이 실린 선물 알림)는 값 없이 모양만 `canary/socket-rare.json`에 모은다. 배지 출처 네 곳(`profile.badge`, 후원 순위, 구독, 시청자 배지)이 실린 횟수를 센다 | `socket`: 오류마다 (깨짐, `socket:<문구>`. 채팅 200건 이상에서 구독이나 시청자 배지 출처가 한 번도 안 나오면 오류), 처음 보는 값 (참고), 드문 메시지 종류마다 (참고, `socket-rare:<종류>`) |
| `canary` | 6시간 (0, 6, 12, 18시) | 라이브 채널 여러 개를 Playwright로 열어 선택자 매칭을 확인한다 (`scripts/canary/chzzk.ts`). 깨지면 자동 수정 후보를 현황판에 띄운다 | `selector`: 방문한 방송 전체로 판정한다 (`scripts/canary/judge.ts`). 모든 방송에서 0개 (`selector:<이름>`. 채팅 컨테이너는 깨짐, 내용 선택자는 OTA로 소켓 경로가 100% 켜져 있는 동안 위험. 페이지는 열리는데 컨테이너가 어디에도 없으면 확인 못 함이 아니라 깨짐), 맞은 방송 70% 미만 (위험, `selector:<이름>:channels`), 갈래가 모든 방송에서 0개 (위험, `selector:<이름>:branch:<갈래>`), 닉네임 옆 배지 그림을 배지 선택자가 못 잡음 (위험, `selector:badge:missed`), anchor 하락 같은 스냅샷 변화 (참고). 채팅이 뜬 방송이 3곳 미만이면 확인 못 함 |
| `main` | 1시간 (매시 50분) | 주 경로 시험. 최신 릴리스 zip을 Chromium에 올려 치지직 인기 라이브 하나를 소켓 모드로 90초 본다. 방송 채팅이 10줄 미만이면 인기 목록 5위, 6위, 7위 순으로 다음 방송. Chrome 웹 스토어 버전(`watch/info.json`)이 최신 릴리스와 다르면 같은 방송에서 스토어 버전도 본다(`ops/watch/live-check.ts --main`, 판정 `main-path.ts`). 방송 채팅은 페이지 웹소켓 메시지를 확장 파서로 읽어 센다(화면 구조에 기대지 않는다). 확장의 소켓 탭이 확장에 채팅을 넘겼는지는 window 메시지로 센다. 창이 차 있으면 내용도 본다: 확장의 비교 도구(`socket-shadow.ts`)를 켜서 소켓 데이터와 원래 채팅 화면을 비교하고, 수집 창 채팅을 소켓 채팅과 키로 짝지어 닉네임, 본문, 배지 그림을 본다. 비교 재료는 `watch/main-content.json`, 스토어 버전은 `main-content-store.json`(덮어쓴다) | `main`: 스토어 버전 쪽 사건은 `main:store:*`로 따로. 수집 창이 안 생김 (깨짐, `main:no-pane`, 채팅 컨테이너 선택자가 맞는지 같이), 창이 비었음 (깨짐, `main:empty-pane`), 탭이 채팅을 하나도 안 넘김 (위험, `main:socket-path`, HTML 대체로 동작 중). 소켓이 배지를 빠뜨림 (위험, `main:compare:missing:<묶음>`), 대체 경로가 배지를 못 읽음 (참고, `main:compare:extra:<묶음>`), 닉네임, 본문, 필터 판정이 다름 (위험, `main:compare:<항목>`), 소켓이 놓친 채팅 (위험, `main:compare:html-only`), 수집 창 렌더 (위험, `main:render:<항목>`). 내용은 비교한 채팅의 10% 이상이고 3건 이상일 때만. 2번 연달아 확인 못 하면 위험 |
| `live` | 6시간 (3, 9, 15, 21시 15분) | 최신 릴리스 zip을 Chromium에 올려 치지직(소켓 끔), 트위치에서 수집 창에 채팅이 들어오는지 본다(소켓 켬은 `main`이 본다). 채팅이 적으면 다음 방송으로 가는 규칙은 `main`과 같다. 확장 zip은 `~/.cache/badge-collector/ext/<버전>`에 최근 5개를 두고, 받기는 두 번 더 해 본다. 릴리스 정보를 못 받으면 캐시의 가장 높은 버전. 치지직 번들을 받아 확장이 기대는 이름이 사라졌는지, 새 신호(메시지 타입, 소켓 cmd, API 경로, CSS 이름)가 생겼는지 비교한다 | `live`: 경로마다 수집 창이 안 생김, 비었음 (깨짐, `live:<경로>:no-pane`, `live:<경로>:empty-pane`). `bundle`: 사라진 이름마다 (위험), 가장 최근 변화 (참고) |
| `info` | 3시간 | 스토어(크롬 공개 페이지, AMO), GitHub 이슈, 배지 목록 비교, GA 14일 | 없음 (현황판) |
| `usage` | 5분 | 확장 익명 사용 통계(Analytics Engine `tbc_usage`): 28일 사용자, 기능별 비율, 지난주 설정과 언어. 4주 평균 5% 미만은 램프 (`ops/usage-report.ts`) | 없음 (현황판) |
| `channels` | 매일 5시 20분 | harvester 데이터로 사이트의 스트리머별 구독 배지 페이지 데이터(`badgecollector-site`의 `src/data/channels.json`)를 다시 만들고, 바뀐 채널이 있으면 사이트 리포에 푸시한다(`ops/watch/site-channels.sh`). 2분쯤 | 없음 (heartbeat가 멈춤을 잡는다) |
| `heartbeat` | 10분 | `runs/*.json`을 보고 정해진 시간보다 오래 성공 못 한 작업, 멈춘 서비스를 찾는다. healthchecks.io에 신호(문제가 있으면 /fail) | `heartbeat`: 작업, 서비스마다 (위험) |
| `pull` | 10분 | `git pull --ff-only`, `package-lock.json`이 바뀌었으면 `npm ci` | 없음 (heartbeat) |
| `spike` | 30분 | GA 실시간 30분 방문 20명 이상 (6시간 동안 같은 사건) | `spike` (참고) |
| `stats` | 매일 10시 | 어제 스토어 페이지 방문, 유입 경로, 사이트 방문, 확장 사용자 수 한 줄 | 보고서 없이 Discord로 바로 (보고) |

같은 작업은 겹쳐 돌지 않는다. 브라우저를 쓰는 `canary`, `live`, `main`은 서로 끝나기를 기다린다(메모리 7GB).

커뮤니티 언급 감시(`~/badge-collector-community-watch`, 매일 10시)는 이 리포 밖에 있고 crontab에만 같이 들어 있다.

### 알림 규칙 (상황실)

`run.sh`가 작업을 마치면(pull, channels, stats, info, usage 빼고. deploy는 배포를 감지했을 때만) 상황실을 부른다. 상황실은 `watch/checks/`의 보고서를 전부 읽어 장부(`watch/incidents.json`)와 맞춘다. 규칙과 시험은 `ops/watch/incidents.ts`, `incidents.test.ts`.

- 사건은 key 하나다. key는 "어느 확인이, 무엇에서, 어떤 문제"이고 바뀌는 숫자는 넣지 않는다. 같은 key가 다시 오면 장부만 고친다.
- 알리는 때: 새 사건, 등급이 오르거나 내려감, 사라짐(회복, 참고는 조용히), 안 고친 채 이어짐(깨짐 6시간마다, 위험 24시간마다).
- 확인을 못 한 보고(방송에 채팅 없음, 채널 못 찾음, zip 못 받음 등)는 사건을 닫지 않는다. 같은 확인이 연달아 못 하면(선택자 2번, 그 밖 3번) 위험 사건 `blind:<확인>`을 연다.
- 깜빡이는 참고(드문 메시지, 처음 보는 값)는 닫힌 뒤 7일 안에 다시 보여도 알리지 않는다.
- 장부가 없을 때(처음 켤 때, 지웠을 때)는 지금 보이는 것을 알리지 않고 장부에만 적는다.
- 상황실이 실패하면 `run.sh`가 웹훅으로 "상황실 실패" 한 줄을 보낸다(1시간에 한 번까지).

손으로 볼 때: `npx tsx ops/watch/dispatch.ts --dry-run` (보낼 알림만 출력, 장부와 기록은 그대로).

### 판정 (현황판 맨 위)

장부의 열린 사건으로 정한다. 깨짐 사건이 있으면 **깨짐**, 위험 사건이 있으면 **위험**, 아니면 정상.

- **깨짐**: 확장 실제 시험에서 방송엔 채팅이 있는데 수집 창이 비었다, 카나리가 필수 선택자 깨짐이나 소켓 형식 변화를 찾았다
- **위험**: 번들에서 확장이 기대던 이름이 사라졌다, 감시 작업이 멈췄다, 확인을 연달아 못 했다

## 확인하는 법

```sh
ssh ovm
tail -30 ~/.local/state/badge-collector/ops.log          # 최근 실행
cat ~/.local/state/badge-collector/logs/canary.log        # 작업 하나의 마지막 출력
cd ~/tbc && sh ops/run.sh socket                         # 작업 하나를 손으로
systemctl --user status badge-dashboard
crontab -l
```

치지직이 배포했는데 뭐가 바뀌었는지 보고 싶으면 현황판 "번들 변화" 칸의 "프롬프트 복사"를 눌러 Claude에 붙여 넣는다.

## 고치는 법

1. 이 리포 `ops/`를 고쳐 master에 푸시한다. ovm은 10분 안에 pull한다.
2. `ops/crontab`이나 `ops/systemd/`를 고쳤으면 ovm에서 직접 설치한다 (pull만으로는 안 바뀐다).
   ```sh
   crontab ~/tbc/ops/crontab
   cp ~/tbc/ops/systemd/badge-dashboard.service ~/.config/systemd/user/ && systemctl --user daemon-reload && systemctl --user restart badge-dashboard
   ```
3. 타입 검사: `npx tsc -p ops` (루트 `npm run compile`은 `ops/`를 뺀다).
4. 작업을 더하면 `ops/run.sh`의 case, `ops/crontab`, `ops/watch/heartbeat.ts`의 `JOBS`, 이 문서의 표를 같이 고친다. 알릴 것이 있는 작업은 Discord로 보내지 말고 `writeCheck`로 보고서를 남긴다(`ops/watch/state.ts`).

## 처음부터 설치

```sh
git clone https://github.com/Deepbluewarn/twitch-badge-collector-v2.git ~/tbc
cd ~/tbc && npm ci
npx playwright install chromium
crontab ~/tbc/ops/crontab
cp ~/tbc/ops/systemd/badge-dashboard.service ~/.config/systemd/user/
systemctl --user daemon-reload && systemctl --user enable --now badge-dashboard
loginctl enable-linger $USER          # 로그아웃해도 사용자 서비스가 돈다
```

비밀 값(`~/.config/badge-collector/*.env`, `~/.config/analytics-mcp/adc.json`)은 따로 옮긴다. node는 nvm `v24.22.0` 경로를 `run.sh`가 직접 쓴다.

## 남은 일

- [ ] 개선 계획(`docs/reports/2026-11-13-ops-alert-plan.html`)의 2단계 이후: 실제 시험 비교 판정, OTA 반영 확인, 사용자 수집 비율 판정.

## harvester

치지직 채팅 소켓에 상시 붙어 배지를 모으는 Rust 서버(`~/development/chzzk-badge-harvester`, ovm `~/harvester`). 2026-10-25 00:57에 정상 종료되고 서비스 등록이 지워진 채로 8일 동안 아무도 몰랐다(이유 기록 없음). 2026-11-02에 다시 켰다. 이제 heartbeat가 서비스 상태를 보고 멈추면 알린다. 서비스 파일 원본은 `ops/systemd/badge-harvester.service`, 설정은 ovm `~/harvester/harvester.env`(토큰이 있어 권한 600), 데이터는 `~/harvester/data/badges.json`. 마지막 기록이 메모리 432MB, 스왑 246MB라 ovm 메모리를 가끔 본다.

```sh
systemctl --user status badge-harvester
journalctl --user -u badge-harvester -f     # 연결 수, 분당 채팅, 배지 종류 수
```

배지 목록 API는 업적 배지(`/service/v1/badges/assets?badgeType=CHANNEL_ACHIEVEMENT`)와 채널별 구독 배지뿐이다. 후원, 구독 선물, 치트키, 팝업스토어 같은 배지는 그 배지를 단 사람이 채팅해야 보이므로 새 배지를 자동으로 찾으려면 harvester가 필요하다. 치지직 JS 번들에는 배지 목록이 없다(인증 마크 3개뿐, 2026-11-02 확인).

## 왜 GitHub Actions가 아니라 ovm인가

- GitHub 예약 실행은 붐비면 늦거나 건너뛴다. 6시간 설정이 실제로는 4~9시간 간격, 저녁 6번 설정이 하루 1번이었다.
- ovm은 한국 가정집 IP라 사용자와 같은 조건으로 치지직을 본다. GitHub 러너는 미국 데이터센터다.
- 카나리 스냅샷을 master에 커밋하지 않아도 된다(전엔 하루 몇 번 봇 커밋이 생겼다).
- 대신 ovm이 멈추면 조용해진다. 그래서 heartbeat와 외부 신호(healthchecks.io)를 둔다.

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-10-25 | ovm `~/badge-collector-stats`에 일일 통계, 급증 알림 (리포 밖) |
| 2026-11-01 | 현황판(:3400), 확장 실제 시험, 번들 의존과 신호 비교 (리포 밖) |
| 2026-11-02 | 현황판 다시 디자인 (unslop 스킬로 점검). 판정 띠, 핵심 숫자 4개, 설치 차트 하나를 크게, 상태는 탈리 램프(정상은 꺼진 불)로 통일, 시각은 MM-DD HH:mm 하나로 |
| 2026-11-02 | 새 배지 알림(`badges`, 10분). 배지 목록 커밋 시 jsDelivr purge(`site-rebuild.yml`), 확장의 치지직 배지 캐시 7일에서 1시간으로 |
| 2026-11-02 | harvester 다시 켬 (10-25부터 꺼져 있었음) |
| 2026-11-02 | 코드를 리포 `ops/`로 옮김(커밋 fdcff86). 배포 감지(1분), ovm 카나리(선택자 6시간, 소켓 1시간), heartbeat 추가. 옛 폴더는 ovm `~/badge-collector-stats.old-2026-11-02`, 옛 crontab과 서비스 파일은 `~/.local/state/badge-collector/backup/` |
| 2026-11-04 | `channels` 작업(매일 5시 20분): 사이트 스트리머별 구독 배지 페이지 데이터 갱신, 사이트 리포 deploy key로 푸시. GitHub가 잠깐 거부할 때를 대비해 pull, push는 1분 간격 5번까지 |
| 2026-11-05 | `stats`에 확장 익명 사용 통계(`ops/usage-report.ts`). Cloudflare Analytics Engine `tbc_usage`를 SQL API로 읽고 GitHub 릴리스 버전 기록만 센다. 4주 평균 5% 미만 기능, 설정을 따로 적는다 (ADR 0001) |
| 2026-11-05 | 확장 사용 통계를 현황판으로(`usage` 작업, 3시간). Discord 하루 리포트엔 사용자 수 한 줄만 남김. 사용자가 Discord에서 이력 보기가 불편하다고 함 |
| 2026-11-06 | 현황판을 탭으로 다시 짬: 위 고정 띠(판정, Chrome 스토어 사용자, 오늘, 어제, 7일 평균 설치), 탭 확장 상태 / 확장 사용 / 스토어와 유입 / badgecollector.dev / 운영. 칸마다 무엇을 보는지 한 줄, 익명 통계 기능과 설정은 줄마다 설명. 이번 주, 이번 달 사용자는 바로 오는 주간 기록으로도 센다 |
| 2026-11-06 | `usage` 작업 3시간에서 5분으로(배포 직후 퍼지는 걸 보려고). Cloudflare 조회 하루 약 600번(한도 1만), 사이트 API 한도와는 무관. GitHub 릴리스 목록은 1시간 캐시 |
| 2026-11-07 | 소켓 카나리가 드문 메시지 모양을 `canary/socket-rare.json`에 모음(종류마다 건수, 모양 10개까지, 글자 값은 길이만). 처음 잡힌 종류는 Discord로 |
| 2026-11-08 | 익명 통계 하루 항목에 `guideOpen`(기능 안내 링크) 추가. 20칸을 넘어 `day2` 행에 들어가므로 `usage` 집계가 `day2` 행도 읽고, 이 항목의 비율은 `day2` 행 수로 나눈다 |
| 2026-11-09 | `usage` 집계의 `guideOpen` 비율에서 v2.28.0보다 옛 버전 기록을 뺌. 그 버전에서 만든 하루 기록은 링크를 누른 사람만 `day2` 행이 생겨 비율이 부풀었다 |
| 2026-11-12 | 익명 통계 주간 항목에 `copyIdOff`(치지직 ID 복사 버튼 끔) 추가. 나중에 덧붙인 주간 항목은 `SETTING_SINCE`에 적은 버전 이후 기록만 분모로 센다(옛 기록은 그 칸이 0으로 읽혀 비율이 눌린다) |
| 2026-11-13 | GitHub 카나리 정리. `canary.yml`, `canary-socket.yml`, `canary-badges.yml`, `build.yml`과 `snapshots/`, `scripts/canary/open-*.mjs`, `badges.ts`(배지 인벤토리, ovm `badges` 작업이 대신함)를 지움. 현황판 GitHub 칸은 열린 이슈만 |
| 2026-11-14 | 상황실(`ops/watch/dispatch.ts`, `incidents.ts`). 확인 작업은 `watch/checks/`에 보고서만 남기고 Discord는 상황실만 보낸다. 사건 key 단위 장부(`watch/incidents.json`), 보낸 알림 기록(`alerts.jsonl`), 긴급 웹훅과 깨짐 멘션, 위험 24시간 재알림, 확인 못 함은 연달아 못 할 때만 위험. 현황판 판정도 장부로. 카나리 스크립트의 직접 알림 끔. healthchecks.io 연결 |
| 2026-11-14 | 선택자 카나리 판정을 방송 전체로(`scripts/canary/judge.ts`). 지난 스냅샷과의 비교 대신 지금 상태를 매번 보고한다. 죽은 갈래는 위험과 hash 치환 후보, 맞은 방송 비율, 배지 놓침(묶음별) 추가. 소켓 경로가 주 경로인 동안 내용 선택자 깨짐은 위험, 채팅 컨테이너는 깨짐. 11-12에 갈래 사망 알림이 로그로만 남아 놓친 일 |
| 2026-11-14 | 주 경로 시험 `main`(1시간). 수집 창이 생기는지, 소켓 탭이 채팅을 넘기는지 본다. 방송 채팅은 웹소켓으로 센다. `live`에서 소켓 켬을 빼고 창 없음과 빔을 나눈다. 탭 주소 규칙을 `src/platform/chzzk-socket-url.ts`로 옮겨 감시와 확장이 같이 쓴다. crontab 다시 설치 |
| 2026-11-14 | 주 경로 시험에 내용 비교(소켓 데이터와 원래 채팅 화면, 수집 창 렌더). 시험 필터를 "닉네임이 `\u0000`이 아님"으로. 소켓 카나리가 배지 출처 네 곳을 세고 구독, 시청자 배지가 사라지면 깨짐 |
| 2026-11-14 | 확장 실제 시험의 확인 못 함 줄이기: 릴리스, zip 다시 받기와 캐시 대체, 채팅이 적으면 다음 순위 방송. `main`은 스토어 버전이 다르면 스토어 버전도 시험(`main:store:*`). 수집 창 배지 그림 세기에 직접 그린 채팅(`img.tbc-chat-badge`) 추가 |
