#!/bin/sh
# ovm cron 진입점. sh ops/run.sh <작업> — 작업 하나를 돌리고 결과를 기록한다.
# 작업 목록과 주기는 ops/crontab, 설명은 docs/monitoring.md.
#
# 남기는 것 (~/.local/state/badge-collector/)
#  - runs/<작업>.json  시작, 끝, 종료 코드, 마지막 성공 시각. heartbeat 작업이 이걸 보고 멈춘 작업을 알린다
#  - logs/<작업>.log   그 작업의 마지막 실행 출력 (덮어쓴다)
#  - ops.log           실행마다 한 줄 (시각, 작업, 종료 코드, 걸린 초). deploy는 1분마다라 성공은 안 적는다
#
# 확인 작업이 끝나면 상황실(ops/watch/dispatch.ts)을 불러 보고서(watch/checks/)를 모아 알리고, 현황판을 다시 그린다.
# 상황실이 실패하면 알림이 하나도 안 나가므로 그때만 여기서 웹훅으로 한 줄 보낸다(1시간에 한 번까지).
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
        canary) npx tsx ops/watch/canary.ts selector ;;
        socket) npx tsx ops/watch/canary.ts socket ;;
        live) npx tsx ops/watch/live-check.ts ;;
        info) npx tsx ops/watch/info.ts ;;
        badges) npx tsx ops/watch/new-badges.ts ;;
        channels) sh ops/watch/site-channels.sh ;;
        heartbeat) npx tsx ops/watch/heartbeat.ts ;;
        stats) npx tsx ops/stats-report.ts ;;
        usage) npx tsx ops/watch/usage.ts ;;
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

# runs/<이름>.json: heartbeat가 보는 마지막 성공 시각
record() {
    prev_ok=$(sed -n 's/.*"lastOk": *\([0-9]*\).*/\1/p' "$RUNS/$1.json" 2>/dev/null)
    ok=${prev_ok:-0}
    [ "$4" -eq 0 ] && ok=$3
    printf '{"job":"%s","start":%s,"end":%s,"code":%s,"lastOk":%s}\n' "$1" "$2" "$3" "$4" "$ok" > "$RUNS/$1.json"
}
record "$job" "$start" "$end" "$code"

# 상황실. 보고서를 쓰는 작업 뒤에만 (deploy는 배포를 감지했을 때만. 다시 알림은 10분마다 도는 heartbeat 뒤에 확인된다)
case "$job" in
    pull|channels|stats|info|usage) ;;
    *)
        if [ "$job" != deploy ] || grep -q '배포 감지' "$LOGS/$job.log"; then
            dstart=$(date +%s)
            flock -w 300 /tmp/badge-collector-dispatch.lock npx tsx ops/watch/dispatch.ts 9>&- > "$LOGS/dispatch.log" 2>&1
            dcode=$?
            record dispatch "$dstart" "$(date +%s)" "$dcode"
            if [ "$dcode" -ne 0 ]; then
                echo "$(date '+%F %T') dispatch code=$dcode (after $job)" >> "$STATE/ops.log"
                last=$(cat "$STATE/dispatch-fail-at" 2>/dev/null || echo 0)
                hook="${DISCORD_URGENT_WEBHOOK:-$DISCORD_COMMUNITY_WEBHOOK}"
                if [ -n "$hook" ] && [ $((end - last)) -ge 3600 ]; then
                    curl -fsS -m 20 -H 'Content-Type: application/json' \
                        -d '{"content":"**상황실(dispatch) 실패**: 감시 알림이 나가지 않는다. ssh ovm, ~/.local/state/badge-collector/logs/dispatch.log"}' \
                        "$hook" > /dev/null && echo "$end" > "$STATE/dispatch-fail-at"
                fi
            fi
        fi
        ;;
esac

# 현황판. 1분마다 도는 deploy, 30분마다 도는 spike 뒤에는 그리지 않는다
case "$job" in
    canary|socket|live|info|heartbeat|usage|badges)
        npx tsx ops/watch/render.ts 9>&- > "$LOGS/render.log" 2>&1 || echo "$(date '+%F %T') render 실패 (after $job)" >> "$STATE/ops.log"
        ;;
esac
exit "$code"
