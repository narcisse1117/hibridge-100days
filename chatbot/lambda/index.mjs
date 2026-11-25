// =============================================================
// 브리 도우미 — AWS Lambda (함수 URL) → Claude API
// 사이트가 보낸 "질문 + 관련 선배 경험 문서"를 Claude에게 넘겨,
// 선배 경험만 근거로 답하게 하고 어떤 경험을 인용했는지 함께 돌려준다.
//   요청:  POST { question, history:[{role,text}], docs:[{title,text}], ctx?:{name,part,day,page} }
//   응답:  { text, cites:[{doc, quote}] }
// API 키는 Lambda 환경 변수 ANTHROPIC_API_KEY 에만 둔다 (사이트에는 절대 넣지 않음).
// =============================================================
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM } from "./prompt.mjs";

const client = new Anthropic(); // ANTHROPIC_API_KEY 환경 변수 사용

// 시스템 프롬프트 v2 (prompt.mjs가 원본)


// 아주 단순한 남용 방지 (컨테이너별 · IP별)
const hits = new Map();
const LIMIT = 20, WINDOW = 10 * 60 * 1000;
function limited(ip) {
  const now = Date.now(), arr = (hits.get(ip) || []).filter((t) => now - t < WINDOW);
  arr.push(now); hits.set(ip, arr);
  return arr.length > LIMIT;
}

const json = (status, body) => ({ statusCode: status, headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify(body) });
const clip = (s, n) => String(s ?? "").slice(0, n);

export const handler = async (event) => {
  if (event.requestContext?.http?.method === "OPTIONS") return { statusCode: 204 };
  if (event.requestContext?.http?.method !== "POST") return json(405, { error: "POST only" });
  const ip = event.requestContext?.http?.sourceIp || "?";
  if (limited(ip)) return json(429, { error: "잠시 후 다시 물어봐 주세요." });

  let body;
  try { body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString() : event.body || "{}"); }
  catch { return json(400, { error: "bad json" }); }

  const question = clip(body.question, 500).trim();
  if (!question) return json(400, { error: "question required" });
  const docs = (Array.isArray(body.docs) ? body.docs : []).slice(0, 8).map((d) => ({ title: clip(d.title, 160), text: clip(d.text, 1500) }));
  const history = (Array.isArray(body.history) ? body.history : []).slice(-6)
    .filter((m) => (m.role === "user" || m.role === "assistant") && m.text)
    .map((m) => ({ role: m.role, content: clip(m.text, 1200) }));
  // 대화는 user 로 시작해야 함
  while (history.length && history[0].role !== "user") history.shift();

  // 사용자 정보 (선택): 이름 · 고른 범주 · 게임 진행 · 보고 있는 화면
  const c = body.ctx && typeof body.ctx === "object" ? body.ctx : null;
  const ctxText = c ? `<사용자_정보>
이름: ${clip(c.name, 20) || "없음"}
고른 범주: ${clip(c.part, 10) || "없음"}
게임 진행: ${clip(c.day, 30) || "없음"}
보고 있는 화면: ${clip(c.page, 30) || "없음"}
</사용자_정보>
` : "";

  // 이번 질문: 선배 경험 문서(인용 가능) + 질문
  const content = [
    ...docs.map((d) => ({ type: "document", source: { type: "text", media_type: "text/plain", data: d.text }, title: d.title, citations: { enabled: true } })),
    { type: "text", text: ctxText + (docs.length ? `신입의 질문: ${question}` : `신입의 질문: ${question}\n(이번 질문과 관련된 선배 경험 문서는 찾지 못했습니다.)`) },
  ];

  try {
    const res = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 2000,
      output_config: { effort: "low" },          // 짧은 대화형 답변
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",                      // 안전 분류기가 거절하면 서버에서 대체 모델로 이어서 답함
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [...history, { role: "user", content }],
    });

    if (res.stop_reason === "refusal") return json(200, { text: "이 질문에는 답하기 어려워요. 회사 생활이나 온보딩에 관해 물어봐 주세요 🙂", cites: [] });

    let text = ""; const cites = [];
    for (const b of res.content) {
      if (b.type !== "text") continue;
      text += b.text;
      for (const c of b.citations || []) {
        if (typeof c.document_index === "number" && !cites.some((x) => x.doc === c.document_index)) cites.push({ doc: c.document_index, quote: clip(c.cited_text, 200).trim() });
      }
    }
    console.log(JSON.stringify({ usage: res.usage, docs: docs.length, cites: cites.length }));
    return json(200, { text: text.trim(), cites });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return json(429, { error: "지금 질문이 많아요. 잠시 후 다시 물어봐 주세요." });
    if (err instanceof Anthropic.AuthenticationError) { console.error("API key problem"); return json(500, { error: "server config" }); }
    if (err instanceof Anthropic.APIError) { console.error("Claude API error", err.status, err.message); return json(502, { error: "upstream" }); }
    console.error(err); return json(500, { error: "server" });
  }
};
