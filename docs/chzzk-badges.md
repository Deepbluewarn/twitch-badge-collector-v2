# 치지직 배지 목록 — `data/chzzk-badges.json`

확장의 배지 선택 화면과 badgecollector.dev 배지 일람이 같이 보는 목록. 서버 없이 jsDelivr로 배포한다.

- URL: `https://cdn.jsdelivr.net/gh/Deepbluewarn/twitch-badge-collector-v2@master/data/chzzk-badges.json`
- 확장은 빌드에 포함하지 않고 매번 CDN에서 받는다. 받은 목록은 `badgeCache`가 7일 보관하고, 실패하면 보관본을 쓴다.

## 새 배지 추가

수집기(chzzk-badge-harvester)는 목록에 없는 이미지 URL을 보면 디스코드로 알려만 준다. 파일은 사람만 고친다.

1. 알림의 항목을 알맞은 그룹 `badges`에 붙여 넣고 `name`을 채운다. 공통 배지 이름은 치지직 프로필 카드 표기를 따른다.
2. master에 커밋.
3. 바로 반영하려면 `https://purge.jsdelivr.net/gh/Deepbluewarn/twitch-badge-collector-v2@master/data/chzzk-badges.json`. 안 하면 최대 12시간 뒤.

배지 사이트는 push되면 `site-rebuild.yml`이 Cloudflare Pages를 다시 빌드시켜 몇 분 안에 반영된다(deploy hook은 리포 secret `SITE_DEPLOY_HOOK`).

## 주의

- 필터는 이미지 URL로 매칭한다. 같은 배지의 이미지 URL이 바뀌면 `imageUrl`만 고친다. 확장이 설치·업데이트 때 저장된 필터를 이름으로 찾아 URL을 갱신한다(`background.ts`의 `syncChzzkBadgeImages`).
  그래서 이미 쓰이는 배지의 `name`은 함부로 바꾸지 않는다.
- 그룹 `title`에는 `:`를 쓰지 않는다. 필터에 `그룹: 이름`으로 저장되고 첫 `:`로 나눈다.
- 구독 배지(채널별)는 넣지 않는다.
