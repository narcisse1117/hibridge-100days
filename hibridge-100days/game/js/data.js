// =============================================================
// 게임 엔진용 데이터 — hb-content.js(사이트 콘텐츠)를 엔진 형식으로 변환
// effects 순서: [팀장 신뢰, 동료 관계, 업무 성과, 체력]
// =============================================================

const COMPANY = {
  name: "㈜하이브릿지",
  desc: "IT 서비스 기업 · 임직원 약 500명",
  team: "경영지원본부 인사팀",
  culture: "수평적 호칭 · 하이브리드 근무 · 메신저 중심 소통",
};

const GAUGES = [
  { key: "trust", label: "팀장 신뢰", icon: "🤝", desc: "보고 정확도 · 지시 이행" },
  { key: "peer", label: "동료 관계", icon: "💬", desc: "협업 배려 · 갈등 조율" },
  { key: "perf", label: "업무 성과", icon: "📈", desc: "완성도 · 일정 준수" },
  { key: "hp", label: "체력", icon: "🔋", desc: "과열 방지 · 번아웃 예방" },
];
const START_GAUGES = { trust: 50, peer: 50, perf: 50, hp: 50 };

const SENIORS = {
  park: { name: "박서연 선배", role: "채용 5년차 · 사수", emoji: "👩‍💼" },
  lee: { name: "이도현 선배", role: "HRD 4년차", emoji: "🧑‍🏫" },
  jung: { name: "정하은 선배", role: "평가·보상 7년차", emoji: "👩‍💻" },
  kim: { name: "한지훈 팀장님", role: "인사팀장 · 노무·조직문화 12년차", emoji: "👨‍💼" },
  choi: { name: "최민석 선배", role: "노무 6년차", emoji: "🧑‍💼" },
  seo: { name: "서지아 선배", role: "조직문화 3년차", emoji: "👩" },
  yujin: { name: "최유진", role: "먼저 들어온 신입 · HRD", emoji: "🙂" },
  minho: { name: "강민호", role: "먼저 들어온 신입 · 채용", emoji: "🙂" },
};

// 5일 과정: 하루에 실무·보고·소통·대처 카드가 한 장씩 (관심 분야를 고르면 그 분야 한 장, 통합이면 네 장)
const DAYS = HB_DAYS.map((d, i) => ({ day: i + 1, label: d.label, title: d.title, sub: `${d.label} · 하루 상황 ${d.cards.length}개` }));
const PLAYER_NAME = (() => { try { return new URLSearchParams(location.search).get("name") || "신입"; } catch (e) { return "신입"; } })();
const nm = (t) => String(t || "").replace(/OO/g, PLAYER_NAME);

const CARDS = [];
HB_DAYS.forEach((d, i) => d.cards.forEach((id) => {
  const c = HB_CARDS[id], votes = [0, 0, 0]; c.sr.forEach((r) => votes[r.p]++);
  CARDS.push({
    id, day: i + 1, category: c.hr ? `${c.field} · ${c.hr}` : c.field, area: c.field, time: c.time,
    title: c.title, text: nm(c.text), ctx: c.ctx, who: c.who, seed: c.seed, goal: c.goal, dilemma: c.dilemma,
    hint: c.hint && { senior: c.hint.s, text: nm(c.hint.q) },
    choices: c.ch.map((x) => ({ text: nm(x.t), effects: x.d, result: nm(x.r) })),
    best: votes.indexOf(Math.max(...votes)),
    feedback: c.sr.map((r) => ({ senior: r.s, role: r.r, pick: r.p, text: nm(r.q), why: r.w })),
    why: (c.why || []).map(nm), ask: c.ask || [],
    insight: (c.why && c.why[0]) || "",
  });
}));

// 퇴근 회고: 오늘 겪은 상황을 돌아보고, '사수에게 들고 갈 질문'을 챙긴다
const RETRO = {};
HB_DAYS.forEach((d, i) => { RETRO[i + 1] = { q: "오늘 겪은 상황 중 가장 고민된 순간은 언제였나요? 다음에 비슷한 일이 오면 어떻게 해 볼까요?" }; });

const ENDINGS = {
  success: {
    all: { emoji: "🌟", title: HB_ENDINGS.b.t, desc: `${HB_ENDINGS.b.d} ${HB_ENDINGS.b.n}` },
    trust: { emoji: "🤝", title: HB_ENDINGS[0].t, desc: `${HB_ENDINGS[0].d} ${HB_ENDINGS[0].n}` },
    peer: { emoji: "🧩", title: HB_ENDINGS[1].t, desc: `${HB_ENDINGS[1].d} ${HB_ENDINGS[1].n}` },
    perf: { emoji: "🚀", title: HB_ENDINGS[2].t, desc: `${HB_ENDINGS[2].d} ${HB_ENDINGS[2].n}` },
    hp: { emoji: "🔋", title: HB_ENDINGS[3].t, desc: `${HB_ENDINGS[3].d} ${HB_ENDINGS[3].n}` },
  },
  fail: {
    trust: { emoji: "🥶", title: HB_FAILS[0].t, desc: HB_FAILS[0].d },
    peer: { emoji: "🏝️", title: HB_FAILS[1].t, desc: HB_FAILS[1].d },
    perf: { emoji: "📉", title: HB_FAILS[2].t, desc: HB_FAILS[2].d },
    hp: { emoji: "🪫", title: HB_FAILS[3].t, desc: HB_FAILS[3].d },
  },
};

// 소통 공간은 사이트 본문이 담당 (게임 안에서는 쓰지 않음)
const CHANNELS = [];
const SEED_POSTS = [];
