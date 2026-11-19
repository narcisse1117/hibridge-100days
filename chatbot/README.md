# 브리 도우미 (선배 경험 기반 챗봇)

```
사이트(hb-bot.js) ──POST──▶ AWS Lambda 함수 URL (chatbot/lambda) ──▶ Claude API (claude-opus-5-5)
   └ 질문과 관련된 선배 경험을 찾아 함께 보냄          └ API 키는 Lambda 환경 변수에만 보관
```

- 사이트는 선배 경험(상황 카드 피드백 · 퇴근 회고 · 익명방/선배 답변 · 1:1 공유 Q&A · 경험 등록)에서
  질문과 관련된 것을 최대 6개 골라 Lambda로 보낸다.
- Lambda는 그 경험만 근거로 Claude가 답하게 하고(인용 기능), 인용한 경험 번호를 돌려준다.
- `HB_BOT_API`(hb-bot.js)가 비어 있으면 서버 없이 브라우저 안에서 동작하는 **시연 모드**로 답한다.

## 배포 (AWS, 2775 계정 · 시드니)
1. `cd chatbot/lambda && npm ci && zip -r ../bri-bot.zip .`
2. Lambda 함수 생성: Node.js 22.x, 핸들러 `index.handler`, 메모리 256MB, 제한 시간 30초
3. 환경 변수 `ANTHROPIC_API_KEY` 설정 (Anthropic Console에서 발급)

> 현재 배포: 함수 `hibridge-bri-bot` (ap-southeast-2, 2775 계정) · URL은 `hb-bot.js`의 `HB_BOT_API`
4. 함수 URL 생성: 인증 NONE, CORS 허용 출처 = Amplify 주소, GitHub Pages 주소 / 메서드 POST / 헤더 content-type
5. 함수 URL을 `hibridge-100days/hb-bot.js`의 `HB_BOT_API`에 넣고 배포

## 나중에 할 일
- 게시판·경험 등록이 공유 DB(DynamoDB)로 옮겨지면, 문서를 사이트가 보내는 대신 Lambda가 DB에서 **HRD 승인된 경험만** 가져오도록 바꾼다.
- 경험이 수백 개를 넘으면 검색(임베딩 등)으로 관련 경험만 고른다.
