# 익명 사용 통계는 동의 창 없이 기본으로 켠다

Status: accepted (2026-11-05)

기능을 실제로 쓰는지, 실사용자가 몇 명인지 알려고 Chrome과 Edge에서 하루 한 번 익명 핑을 보낸다. 모든 사용자에게 기본으로 켜고(기존 사용자 포함), 설정 페이지에서 끈다. 동의 창은 띄우지 않는다.

Chrome 웹 스토어 정책 원문("If your Product handles any user data, then prior to installation, it must ... Obtain the user's affirmative and informed consent")과 FAQ(확장 UI 안에서 사용자가 직접 동의하는 행동을 해야 한다)를 문자 그대로 읽으면 위반이다. 알고 정했다. 이유는 다음과 같다.

- 동의 창을 둘 자리가 없다. 수집 영역은 좁고, 예전에 스토어 평가와 후원 요청을 띄웠다가 사용자에게 욕설 메일을 받았다. 팝업과 설정 페이지는 거의 열리지 않아서, 거기서 동의를 받으면 통계가 나오지 않는다.
- 2026-11-05 조사에서 익명 통계 때문에 Purple Nickel(고지와 동의)로 걸린 사례는 확인되지 않았다. 공개된 Purple Nickel은 거의 처리방침 링크 문제였다. BetterTTV, FrankerFaceZ, Tampermonkey, Wappalyzer는 Chrome에서 동의 창 없이 기본으로 보낸다. 스토어 문제 해결 페이지도 Purple Nickel 해결법으로 스토어 목록 고지와 옵션 페이지의 끄기를 든다.

대신 고지는 화면 밖에서 확실히 한다: 스토어 설명 한 줄, 스토어 개인정보 탭 신고, badgecollector.dev/privacy 처리방침(항목과 예시 JSON), 수집을 넣는 릴리스의 노트 한 줄, 설정 스위치 옆 [보기](보낼 JSON 그대로). 신고와 처리방침이 실제 전송과 어긋나면 걸리기 쉬우니, 항목을 바꿀 때는 셋을 같이 고친다.

Purple Nickel 경고가 오면 팝업에 동의를 넣어 다시 올린다. 수집 코드는 "동의해야 보낸다"로 바꾸기 쉬운 구조로 둔다.

## 범위

- 보내는 것: 확장 버전, 브라우저(chrome, edge), 그날 한 일 참/거짓(twitch, chzzk, collected, filterEdit, advancedFilter, floating, template, archiveOpen, capture, settingOpen), 직접 만든 필터의 종류별 유무(filterBadge, filterName, filterKeyword, 설치 때 들어가는 기본 필터는 빼고 센다), 주간과 월간 첫 기록 표시.
- 개수와 비율은 보내지 않는다. 필터 개수 같은 숫자는 사람마다 거의 달라서 설치 ID 없이도 날짜별 기록을 한 사람으로 이을 수 있다.
- 보내지 않는 것: 설치 ID, IP, URL, 채널명, 닉네임, 필터 내용, 오류 신호.
- Firefox는 빌드에서 수집 코드를 뺀다. AMO는 설치 때 선택지를 보여 줘야 하고, 사용자가 적어 얻을 게 없다.
- 판단 기준: 기능별 사용자가 4주 평균으로 실사용자의 5% 미만이면 접을지 검토할 목록에 올린다. 기준에 쓰이지 않는 항목은 늘리지 않는다.

## 결과

- 같은 사람이 PC 두 대에서 쓰면 두 명으로 세진다.
- 쓴 날만 기록하고 다음에 보낼 기회(브라우저 시작, 날짜 바뀜)에 몰아 보내므로 어제 숫자는 며칠 동안 늘어날 수 있다. 7일 넘게 못 보낸 기록은 버린다.
- 엔드포인트(badgecollector.dev `/api/ping`)는 공개라 가짜 핑을 막을 수 없다. Origin, 버전, 날짜, 건수 검사와 Cloudflare 속도 제한 규칙으로 줄이기만 한다.
