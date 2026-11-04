#!/bin/sh
# 사이트(badgecollector.dev) 스트리머별 구독 배지 페이지(/subscription/<채널ID>/)의 데이터를 갱신한다. sh ops/run.sh channels
#
# ~/badgecollector-site 클론에서 scripts/sync-channels.mjs를 돌려 src/data/channels.json을 다시 만들고,
# 채널 줄이 하나라도 바뀌었으면 커밋해서 푸시한다. 푸시하면 Cloudflare Pages가 다시 빌드한다(1분 안).
# 푸시는 사이트 리포 전용 deploy key(~/.ssh/badgecollector-site-deploy, ~/.ssh/config의 Host github-site)로 한다.
set -e
SITE="$HOME/badgecollector-site"
FILE=src/data/channels.json
cd "$SITE"
git pull --ff-only -q

HARVESTER_FILE="$HOME/harvester/data/badges.json" node scripts/sync-channels.mjs

# 첫 줄의 updatedAt은 매번 바뀌니 채널 줄만 본다
if [ "$(git diff -U0 -- "$FILE" | grep -c '^[-+]{"channel"')" = 0 ]; then
    git checkout -- "$FILE"
    echo "바뀐 채널 없음"
    exit 0
fi

changed=$(git diff -U0 -- "$FILE" | grep -c '^+{"channel"' || true)
git add "$FILE"
git -c user.name="ovm" -c user.email="ovm@badgecollector.dev" commit -q -m "구독 배지 채널 목록 갱신 (ovm, ${changed}줄)"
git push -q origin HEAD:master
echo "푸시함: 채널 ${changed}줄"
