# 치지직 배지 목록 — `data/chzzk-badges.json`

확장의 배지 선택 화면과 badgecollector.dev 배지 일람이 같이 보는 목록. 서버 없이 jsDelivr로 배포한다.

- URL: `https://cdn.jsdelivr.net/gh/Deepbluewarn/twitch-badge-collector-v2@master/data/chzzk-badges.json`
- 확장은 빌드에 포함하지 않고 CDN에서 받는다. 받은 목록은 `badgeCache`가 1시간 보관하고(트위치는 7일), 실패하면 보관본을 쓴다. 1시간 캐시는 v2.25.3 다음 릴리스부터, 그 전 버전은 7일이다.

## 새 배지가 들어오는 흐름

```
harvester(ovm, 채팅 소켓 상시 연결)가 처음 보는 배지를 저장
업적 배지는 치지직 API(/badges/assets)에 새로 올라옴
  → ovm badges 작업(10분마다)이 목록과 비교해 Discord로 알림          ops/watch/new-badges.ts
     알림에 넣을 그룹과 붙여 넣을 JSON 한 줄이 있다 (업적 배지는 공식 이름까지)
  → 사람이 이름을 확인해 이 파일에 넣고 master에 커밋
  → site-rebuild.yml: 사이트 다시 빌드 + jsDelivr purge                 몇 분
  → 확장: 캐시 1시간이 지나 배지 화면을 열면 새 목록
```

파일은 사람만 고친다. 수집기와 ovm은 알려 주기만 한다.

1. 알림의 JSON을 알림이 말한 그룹의 `badges`에 붙여 넣고 `name`을 채운다(비어 있으면). 공통 배지 이름은 치지직 프로필 카드 표기를 따른다. 그룹이 "새 그룹?"이면 어디에도 안 맞는 종류라 그룹을 새로 만들지 정한다.
2. master에 커밋. 사이트 빌드와 jsDelivr purge는 `site-rebuild.yml`이 한다(deploy hook은 리포 secret `SITE_DEPLOY_HOOK`).

알림 없이 지금 빠진 게 있는지 보려면 현황판(http://192.168.1.162:3400) 배지 칸. ovm 쪽 설명은 `docs/monitoring.md`.

## 주의

- 필터는 이미지 URL로 매칭한다. 같은 배지의 이미지 URL이 바뀌면 `imageUrl`만 고친다. 확장이 설치·업데이트 때 저장된 필터를 이름으로 찾아 URL을 갱신한다(`background.ts`의 `syncChzzkBadgeImages`).
  그래서 이미 쓰이는 배지의 `name`은 함부로 바꾸지 않는다.
- 그룹 `title`에는 `:`를 쓰지 않는다. 필터에 `그룹: 이름`으로 저장되고 첫 `:`로 나눈다.
- 구독 배지(채널별)는 넣지 않는다.
