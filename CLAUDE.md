# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Agent skills

### Issue tracker

Issues live in GitHub Issues at `Deepbluewarn/twitch-badge-collector-v2`, accessed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Operations

### OTA — host selector hotfix

호스트 DOM이 바뀌어 selector가 깨졌을 때 코드 재배포 없이 JSON push로 hotfix. 절차/주의사항: `docs/ota-selectors.md`.

### 감시와 현황판 (ovm)

치지직 배포 감지(1분), 선택자/소켓 카나리, 확장 실제 시험, GA 통계는 집 서버 ovm에서 돈다. 현황판 http://192.168.1.162:3400. 코드는 `ops/`(ovm이 10분마다 pull), 작업 목록, 확인법, 남은 일, 변경 이력은 `docs/monitoring.md`. ops를 고치면 그 문서의 변경 이력에 한 줄 남긴다.

### 릴리스 전 실제 업데이트 시험

릴리스(Publish)하기 전에 **지금 스토어에 나가 있는 버전에서 새 빌드로 실제 Chrome 업데이터를 거쳐 올라가는지** 확인한다. CDP `Extensions.loadUnpacked`로 다시 불러오는 시험만으로는 안 된다 — 옛 버전이 내려가고 새 버전이 뜨는 빈틈이 너무 짧아 그 사이에 터지는 문제가 숨는다(v2.24.0에서 빈틈에 채팅이 들어오면 모아보기 창이 비던 문제를 놓쳤다).

```sh
gh release download v<스토어 버전> -p '*-chrome.zip' -D /tmp/prev   # 이전 릴리스 zip
npm run build
node scripts/real-update-test.mjs /tmp/prev/*-chrome.zip .output/chrome-mv3 --socket off
node scripts/real-update-test.mjs /tmp/prev/*-chrome.zip .output/chrome-mv3 --socket on
node scripts/real-update-test.mjs /tmp/prev/*-chrome.zip .output/chrome-mv3 --socket off --persist off
node scripts/real-update-test.mjs /tmp/prev/*-chrome.zip .output/chrome-mv3 --socket on --persist off
```

`--persist off`는 채팅 유지 저장을 끈 사용자다. 새로고침하면 창이 비는 게 정상이고, 업데이트와 빈틈 결과는 위와 같아야 한다. 조용한 방송이면 `--url`로 채팅이 많은 방송을 고른다.

각각 채팅이 쌓인 뒤 `http://localhost:8765/update`(실제 업데이트), 새로고침 후 `/gap`(빈틈 7초)을 불러 확인한다.
- 업데이트: 모아보기 창이 하나이고, 업데이트 전 채팅이 그대로 있고, 안내 띠가 없고, 수집이 이어진다.
- 빈틈: 끊긴 뒤 6초 동안 창의 채팅 수가 줄지 않고, 그 뒤 안내 띠가 뜬다.

결과를 사용자에게 보고한 뒤에 릴리스한다. 콘텐츠 스크립트·백그라운드를 건드리지 않은 릴리스도 한다(업데이트는 확장 전체를 갈아 끼운다).

### 치지직 배지 목록

배지 선택 화면의 치지직 배지는 `data/chzzk-badges.json`을 jsDelivr로 받는다. 새 배지 추가 절차: `docs/chzzk-badges.md`.
