# 소통 공간 서버 (로그인 + 공유 저장소)

```
사이트(hb-live.js) ──이메일 가입·로그인──▶ Amazon Cognito
        └──POST + 로그인 토큰──▶ Lambda 함수 URL (community/lambda) ──▶ DynamoDB 표 hibridge-community
```

- 로그인은 **소통 공간에서만** 필요하다. 100일 게임·경험 등록·운영 대시보드는 로그인 없이 쓴다.
- 가입할 때 이름·부서·직무·직급·연차·구분(신입/선배)을 받는다.
- 동기방(단체·1:1), 선배에게 물어보기(반익명 1:1), 익명 질문방이 모든 사람에게 공유된다.
- 익명 글과 1:1 질문의 작성자 정보는 서버에만 남고 화면으로는 나가지 않는다. 선배에게는 신입이 실명을 공개하기 전까지 별명(예: `인사팀 신입 · 브리 #27`)만 보인다.
- `hb-live.js`의 `HB_LIVE` 설정이 비어 있으면 예전처럼 브라우저에만 저장되는 시연 모드로 동작한다.

## 설치 (AWS CloudShell · 2775 계정 · 시드니)
```bash
curl -fsSL https://raw.githubusercontent.com/narcisse1117/hibridge-100days/develop/community/setup.sh | bash
```
끝에 나오는 `POOL`, `CLIENT`, `URL` 값을 `hibridge-100days/hb-live.js`의 `HB_LIVE`에 넣고 배포한다.
같은 명령을 다시 실행하면 Lambda 코드만 최신으로 바뀐다.

## 비용
- Cognito: 월 활성 사용자 1만 명까지 무료 (Lite/Essentials 무료 구간)
- DynamoDB: 요청한 만큼 (시연 규모면 월 몇십 원 수준)
- Cognito 기본 메일 발송은 하루 50통까지. 사용자가 많아지면 Amazon SES 연결이 필요하다.
