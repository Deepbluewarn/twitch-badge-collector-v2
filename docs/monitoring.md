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
│   └─ ops/run.sh <작업>        cron 진입점. 작업을 돌리고 기록을 남긴다
├─ crontab                     ops/crontab 그대로
├─ systemd --user
│   ├─ badge-dashboard          ops/watch/serve.ts, :3400
│   └─ badge-harvester          꺼져 있음 (아래 "harvester")
├─ ~/.config/badge-collector/  비밀 값 (리포에 없음)
│   ├─ community-watch.env      DISCORD_COMMUNITY_WEBHOOK (모든 알림이 이 웹훅을 쓴다)
│   └─ ops.env                  OPS_HEALTHCHECK_URL (선택, 아직 없음)
├─ ~/.config/analytics-mcp/adc.json   GA 인증 (사용자 refresh token)
└─ ~/.local/state/badge-collector/    결과
    ├─ ops.log                  실행마다 한 줄
    ├─ logs/<작업>.log           그 작업의 마지막 실행 출력
    ├─ runs/<작업>.json          마지막 성공 시각 (heartbeat가 본다)
    ├─ watch/*.json             현황판 데이터 (deploy, canary-selector, canary-socket, heartbeat, live, bundle, info, verdict)
    └─ canary/                  카나리 스크립트의 스냅샷과 알림 파일
```

## 작업

| 작업 | 주기 | 하는 일 | 알림 |
|---|---|---|---|
| `deploy` | 1분 | 치지직 첫 페이지 HTML이 불러오는 JS, CSS 파일 목록(해시 포함)을 본다. 처음 보는 목록이면 배포로 보고 `canary`, `socket`, `live`를 바로 띄운다 | 배포 감지 때 |
| `socket` | 매시 30분 | 인기 라이브 8개 채팅 소켓에 2분 붙어 패킷이 `src/platform/chzzk-socket.ts`의 가정과 맞는지 본다 (`scripts/canary/socket.ts`) | 처음 보는 문제, 깨진 채 6시간, 회복 |
| `canary` | 6시간 (0, 6, 12, 18시) | 라이브 채널 여러 개를 Playwright로 열어 선택자 매칭을 확인한다 (`scripts/canary/chzzk.ts`). 깨지면 자동 수정 후보를 현황판에 띄운다 | 스냅샷과 달라졌을 때, 깨진 채 6시간, 회복 |
| `live` | 6시간 (3, 9, 15, 21시 15분) | 최신 릴리스 zip을 Chromium에 올려 치지직(소켓 끔, 켬), 트위치에서 모아보기 창에 채팅이 들어오는지 본다. 치지직 번들을 받아 확장이 기대는 이름이 사라졌는지, 새 신호(메시지 타입, 소켓 cmd, API 경로, CSS 이름)가 생겼는지 비교한다 | 판정이 바뀔 때, 번들 변화 |
| `info` | 3시간 | 스토어(크롬 공개 페이지, AMO), GitHub 실행과 이슈, 배지 목록 비교, GA 14일 | 판정이 바뀔 때 |
| `heartbeat` | 10분 | `runs/*.json`을 보고 정해진 시간보다 오래 성공 못 한 작업, 멈춘 서비스를 찾는다 | 문제가 생기거나 바뀔 때, 12시간마다 다시 |
| `pull` | 10분 | `git pull --ff-only`, `package-lock.json`이 바뀌었으면 `npm ci` | heartbeat가 대신 |
| `spike` | 30분 | GA 실시간 30분 방문 20명 이상이면 알림 (6시간 쿨다운) | 급증 때 |
| `stats` | 매일 10시 | 어제 스토어 페이지 방문, 유입 경로, 사이트 방문 | 매일 |

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
- [ ] harvester를 다시 켤지 결정 (아래).

## harvester

치지직 채팅 소켓에 상시 붙어 배지를 모으는 Rust 서버(`~/development/chzzk-badge-harvester`, ovm `~/harvester`). 2026-10-25 00:57에 정상 종료되고 서비스 등록이 지워진 채로 있다. 이유는 기록이 없다. 서비스 파일 원본은 `ops/systemd/badge-harvester.service`.

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
| 2026-11-02 | 코드를 리포 `ops/`로 옮김(커밋 fdcff86). 배포 감지(1분), ovm 카나리(선택자 6시간, 소켓 1시간), heartbeat 추가. 옛 폴더는 ovm `~/badge-collector-stats.old-2026-11-02`, 옛 crontab과 서비스 파일은 `~/.local/state/badge-collector/backup/` |
