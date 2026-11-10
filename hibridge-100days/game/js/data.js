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
};

const DAY_SUBS = ["모든 게 낯선 첫날", "지원자와 면접관 사이에서", "처음 맡은 교육, 처음 받은 숫자", "사람의 일, 숫자의 일"];
const DAYS = HB_DAYS.map((d, i) => ({ day: i + 1, label: "D+" + d.day, title: d.label, sub: DAY_SUBS[i] || "" }));

const CARDS = [];
HB_DAYS.forEach((d, i) => d.cards.forEach((id) => {
  const c = HB_CARDS[id], best = c.seed.indexOf(Math.max(...c.seed));
  CARDS.push({
    id, day: i + 1, category: c.type, title: c.title, text: c.text, ctx: c.ctx, who: c.who, seed: c.seed,
    choices: c.ch.map((x) => ({ text: x.t, effects: x.d, result: x.r })),
    best,
    feedback: c.sr.map((r) => ({ senior: r.s, pick: r.p, text: r.q, why: r.w })),
    insight: (c.sr[0].w || "").replace(/^판단 근거:\s*/, ""),
  });
}));

const RETRO = {};
HB_DAYS.forEach((d, i) => {
  const c = HB_CARDS[d.retro.card];
  RETRO[i + 1] = { q: `오늘 '${c.title}' 상황, 나라면 어떻게 했을까?`, senior: d.retro.by, story: d.retro.story, tip: d.retro.story[3] };
});

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
