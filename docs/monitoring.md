# 감시와 현황판 (ovm)

확장이 깨졌는지, 깨질 것 같은지, 치지직이 뭘 바꿨는지를 집 서버 ovm에서 지켜본다.

- **현황판: http://192.168.1.162:3400** (LAN 전용). 판정(정상/위험/깨짐), 치지직 배포, 카나리, 감시 작업 상태, 확장 실제 시험, 번들 변화, 배지, 스토어, GA가 한 화면에 있다.
- **알림: Discord** (community-watch 웹훅 채널 하나로 모은다).
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
│   ├─ community-watch.env      DISCORD_COMMUNITY_WEBHOOK (모든 알림이 이 웹훅을 쓴다)
│   ├─ cloudflare.env           CF_ACCOUNT_ID, CF_ANALYTICS_TOKEN (Account Analytics 읽기, 확장 익명 통계 조회)
│   └─ ops.env                  OPS_HEALTHCHECK_URL (선택, 아직 없음)
├─ ~/.config/analytics-mcp/adc.json   GA 인증 (사용자 refresh token)
└─ ~/.local/state/badge-collector/    결과
    ├─ ops.log                  실행마다 한 줄
    ├─ logs/<작업>.log           그 작업의 마지막 실행 출력
    ├─ runs/<작업>.json          마지막 성공 시각 (heartbeat가 본다)
    ├─ watch/*.json             현황판 데이터 (deploy, canary-selector, canary-socket, heartbeat, new-badges, live, bundle, info, verdict)
    └─ canary/                  카나리 스크립트의 스냅샷과 알림 파일
```

## 작업

| 작업 | 주기 | 하는 일 | 알림 |
|---|---|---|---|
| `deploy` | 1분 | 치지직 첫 페이지 HTML이 불러오는 JS, CSS 파일 목록(해시 포함)을 본다. 처음 보는 목록이면 배포로 보고 `canary`, `socket`, `live`를 바로 띄운다 | 배포 감지 때 |
| `badges` | 10분 (5분부터) | harvester 데이터와 업적 배지 API를 `data/chzzk-badges.json`과 비교해 목록에 없는 배지를 알린다. 넣을 그룹과 JSON 한 줄을 같이 보낸다. 흐름은 `docs/chzzk-badges.md` | 처음 보는 배지 |
| `socket` | 매시 30분 | 인기 라이브 8개 채팅 소켓에 2분 붙어 패킷이 `src/platform/chzzk-socket.ts`의 가정과 맞는지 본다 (`scripts/canary/socket.ts`) | 처음 보는 문제, 깨진 채 6시간, 회복 |
| `canary` | 6시간 (0, 6, 12, 18시) | 라이브 채널 여러 개를 Playwright로 열어 선택자 매칭을 확인한다 (`scripts/canary/chzzk.ts`). 깨지면 자동 수정 후보를 현황판에 띄운다 | 스냅샷과 달라졌을 때, 깨진 채 6시간, 회복 |
| `live` | 6시간 (3, 9, 15, 21시 15분) | 최신 릴리스 zip을 Chromium에 올려 치지직(소켓 끔, 켬), 트위치에서 모아보기 창에 채팅이 들어오는지 본다. 치지직 번들을 받아 확장이 기대는 이름이 사라졌는지, 새 신호(메시지 타입, 소켓 cmd, API 경로, CSS 이름)가 생겼는지 비교한다 | 판정이 바뀔 때, 번들 변화 |
| `info` | 3시간 | 스토어(크롬 공개 페이지, AMO), GitHub 실행과 이슈, 배지 목록 비교, GA 14일 | 판정이 바뀔 때 |
| `usage` | 5분 | 확장 익명 사용 통계(Analytics Engine `tbc_usage`): 28일 사용자, 기능별 비율, 지난주 설정과 언어. 4주 평균 5% 미만은 램프 (`ops/usage-report.ts`) | 없음 (현황판) |
| `channels` | 매일 5시 20분 | harvester 데이터로 사이트의 스트리머별 구독 배지 페이지 데이터(`badgecollector-site`의 `src/data/channels.json`)를 다시 만들고, 바뀐 채널이 있으면 사이트 리포에 푸시한다(`ops/watch/site-channels.sh`). 2분쯤 | heartbeat가 대신 |
| `heartbeat` | 10분 | `runs/*.json`을 보고 정해진 시간보다 오래 성공 못 한 작업, 멈춘 서비스를 찾는다 | 문제가 생기거나 바뀔 때, 12시간마다 다시 |
| `pull` | 10분 | `git pull --ff-only`, `package-lock.json`이 바뀌었으면 `npm ci` | heartbeat가 대신 |
| `spike` | 30분 | GA 실시간 30분 방문 20명 이상이면 알림 (6시간 쿨다운) | 급증 때 |
| `stats` | 매일 10시 | 어제 스토어 페이지 방문, 유입 경로, 사이트 방문, 확장 사용자 수 한 줄 | 매일 |

같은 작업은 겹쳐 돌지 않는다. 브라우저를 쓰는 `canary`와 `live`는 서로 끝나기를 기다린다(메모리 7GB).

커뮤니티 언급 감시(`~/badge-collector-community-watch`, 매일 10시)는 이 리포 밖에 있고 crontab에만 같이 들어 있다.

### 판정 (현황판 맨 위)

- **깨짐**: 확장 실제 시험에서 방송엔 채팅이 있는데 모아보기 창이 비었다, 카나리가 깨짐을 찾았다
- **위험**: 번들에서 확장이 기대던 이름이 사라졌다, 시험 결과가 오래됐다, 카나리 실행 실패, 감시 작업이 멈췄다

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
4. 작업을 더하면 `ops/run.sh`의 case, `ops/crontab`, `ops/watch/heartbeat.ts`의 `JOBS`, 이 문서의 표를 같이 고친다.

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

- [ ] **확장 실제 시험(`live`)이 한 번도 성공한 적 없다.** Chromium이 쓸 시스템 라이브러리가 없다. ovm에서:
  `sudo apt-get install -y libcups2t64 libcairo2 libpango-1.0-0 libatk-bridge2.0-0`
- [ ] **ovm이 통째로 꺼지면 아무 알림도 없다.** healthchecks.io 같은 곳에 체크(10분 주기)를 만들고 `~/.config/badge-collector/ops.env`에 `OPS_HEALTHCHECK_URL=https://hc-ping.com/...`를 넣으면 heartbeat가 신호를 보낸다.
- [ ] **2026-11-09쯤 GitHub 카나리 정리.** ovm이 일주일 잘 돌면 `.github/workflows/canary.yml`, `canary-socket.yml`, `canary-badges.yml`, `build.yml`(옛 태그 형식, 늘 실패)을 지우고, `ops/watch/info.ts`의 GitHub 실행 목록과 현황판 "GitHub canary" 칸도 뺀다. `snapshots/`와 `scripts/canary/open-*.mjs`도 그때 정리. 워크플로 파일은 gh 토큰에 workflow 권한이 없어 SSH로 푸시한다.

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
- 대신 ovm이 멈추면 조용해진다. 그래서 heartbeat와 외부 신호(위 "남은 일")를 둔다.

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
