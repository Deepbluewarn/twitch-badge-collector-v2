# 스토어 이미지

Chrome 웹 스토어, Firefox 부가 기능, Edge 추가 기능에 올리는 이미지. 한국어(`out/ko/`)와 영어(`out/en/`) 두 벌이다.

| 파일 | 크기 | 쓰는 곳 |
|---|---|---|
| `screenshot-1.png` | 1280x800 | 스크린샷 1. 채팅창과 모아보기 (지어낸 채팅으로 그림) |
| `screenshot-2.png` | 1280x800 | 스크린샷 2. 필터 목록 (실제 설정 화면) |
| `promo-small.png` | 440x280 | 작은 프로모션 타일 |
| `promo-marquee.png` | 1400x560 | 마키 프로모션 타일 (Edge에서는 큰 프로모션 타일) |

Firefox는 스크린샷만 받는다. 1280x800 그대로 올린다.

## 다시 만들기

```sh
npm run build
node docs/store-images/capture.mjs   # 필터 목록 화면을 찍는다 (shots/)
node docs/store-images/render.mjs    # compose.html의 틀을 PNG로 (out/)
```

- 문구, 채팅 내용, 배치는 `compose.html`에 있다. 화면 문구 규칙(요체, 엠대시, 가운뎃점 금지)을 따른다.
- 필터 목록 화면이 바뀌었을 때만 `capture.mjs`를 다시 돌린다. 한국어는 치지직 필터, 영어는 트위치 필터를 넣고 찍는다.
- 닉네임, 채널 이름은 모두 지어낸 것만 쓴다. 실제 방송 화면을 찍으면 시청자 닉네임이 들어간다.
- 로고 원본(`public/icon/icon.png`)이 128px이라 이보다 크게 쓰면 흐려진다.
