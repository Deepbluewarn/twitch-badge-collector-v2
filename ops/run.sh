#!/bin/sh
# ovm cron 진입점. sh ops/run.sh <작업> — 작업 하나를 돌리고 결과를 기록한다.
# 작업 목록과 주기는 ops/crontab, 설명은 docs/monitoring.md.
#
# 남기는 것 (~/.local/state/badge-collector/)
#  - runs/<작업>.json  시작, 끝, 종료 코드, 마지막 성공 시각. heartbeat 작업이 이걸 보고 멈춘 작업을 알린다
#  - logs/<작업>.log   그 작업의 마지막 실행 출력 (덮어쓴다)
#  - ops.log           실행마다 한 줄 (시각, 작업, 종료 코드, 걸린 초). deploy는 1분마다라 성공은 안 적는다
cd "$(dirname "$0")/.." || exit 1
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:/usr/bin:/bin"
STATE="$HOME/.local/state/badge-collector"
RUNS="$STATE/runs"
LOGS="$STATE/logs"
mkdir -p "$RUNS" "$LOGS"

# 카나리 스크립트는 DISCORD_CANARY_WEBHOOK으로 알린다. ovm은 community-watch 웹훅 하나를 같이 쓴다.
ENV_FILE="$HOME/.config/badge-collector/community-watch.env"
[ -f "$ENV_FILE" ] && . "$ENV_FILE"
export DISCORD_CANARY_WEBHOOK="${DISCORD_COMMUNITY_WEBHOOK:-}"
export CANARY_STATE_DIR="$STATE/canary"

job="$1"
[ -n "$job" ] || { echo "usage: run.sh <job>" >&2; exit 2; }

run() {
    case "$job" in
        # 리포 갱신. 의존성이 바뀌었으면 다시 설치한다
        pull)
            before=$(git rev-parse HEAD)
            git pull --ff-only -q || return 1
            if ! git diff --quiet "$before" HEAD -- package-lock.json; then npm ci --no-audit --no-fund || return 1; fi
            ;;
        deploy) npx tsx ops/watch/deploy.ts ;;
        canary) npx tsx ops/watch/canary.ts selector && npx tsx ops/watch/render.ts ;;
        socket) npx tsx ops/watch/canary.ts socket && npx tsx ops/watch/render.ts ;;
        live) npx tsx ops/watch/live-check.ts && npx tsx ops/watch/render.ts ;;
        info) npx tsx ops/watch/info.ts && npx tsx ops/watch/render.ts ;;
        heartbeat) npx tsx ops/watch/heartbeat.ts && npx tsx ops/watch/render.ts ;;
        stats) npx tsx ops/stats-report.ts ;;
        spike) npx tsx ops/spike-alert.ts ;;
        *) echo "unknown job: $job" >&2; return 2 ;;
    esac
}

# 같은 작업이 겹치면 건너뛴다. 브라우저를 띄우는 작업(canary, live)은 서로 기다린다(odroid 메모리 7GB)
lock="/tmp/badge-collector-$job.lock"
case "$job" in canary|live) lock="/tmp/badge-collector-browser.lock"; wait=-w1800 ;; *) wait=-n ;; esac

start=$(date +%s)
exec 9>"$lock"
if ! flock $wait 9; then echo "$(date '+%F %T') $job 건너뜀 (이미 도는 중)" >> "$STATE/ops.log"; exit 0; fi
# 잠금 파일(9번)은 작업에 물려주지 않는다. deploy가 띄운 작업이 잠금을 쥐고 있으면 다음 deploy가 건너뛰어진다
run 9>&- > "$LOGS/$job.log" 2>&1
code=$?
end=$(date +%s)
if [ "$job" != deploy ] || [ "$code" -ne 0 ] || grep -q '배포 감지' "$LOGS/$job.log"; then
    echo "$(date '+%F %T') $job code=$code $((end - start))s" >> "$STATE/ops.log"
fi

prev_ok=$(sed -n 's/.*"lastOk": *\([0-9]*\).*/\1/p' "$RUNS/$job.json" 2>/dev/null)
ok=${prev_ok:-0}
[ "$code" -eq 0 ] && ok=$end
printf '{"job":"%s","start":%s,"end":%s,"code":%s,"lastOk":%s}\n' "$job" "$start" "$end" "$code" "$ok" > "$RUNS/$job.json"
exit "$code"
