// =============================================================
// 공통 월드 데이터 — 2D/3D가 같은 사무실 배치를 공유 (단위: 타일 = 1m)
// x: 왼→오른쪽(0~30), y: 위→아래(0~18). 3D에서는 y가 z축이 됨
// =============================================================

// 3D 몸 외형 + pid(대화창 · HUD 초상화에 쓰는 사이트 인물 일러스트)
const LOOKS = {
  park: { skin: "#ffdcc6", hair: "#4a2c22", shirt: "#ff8a73", pants: "#3a3f55", style: "long", pid: "p-park" },
  lee: { skin: "#f7d1b4", hair: "#2a2129", shirt: "#2f8f6f", pants: "#2d3446", style: "short", glasses: true, pid: "p-lee" },
  jung: { skin: "#ffdec9", hair: "#231c24", shirt: "#e2a427", pants: "#3a3f55", style: "bun", glasses: true, pid: "p-jung" },
  han: { skin: "#f5cdb0", hair: "#55555f", shirt: "#25324d", pants: "#22262f", style: "short", tie: "#ffb400", pid: "p-han" },
  yoon: { skin: "#ffe2cf", hair: "#6a3f2c", shirt: "#5b8def", pants: "#3d5a80", style: "long", pid: "p-yoon" },
  oh: { skin: "#f1c6a4", hair: "#1d1a22", shirt: "#4b5567", pants: "#2b2d42", style: "short", pid: "p-oh" },
};
// 신입(나)은 사이트에서 꾸민 브리. skin/shirt는 컷씬 속 내 손 색으로 쓰인다.
const DEFAULT_LOOK = { bri: { c: "#004aad" }, skin: "#004aad", shirt: "#004aad", hair: "#1d1a22", pants: "#00307a", style: "short" };
const SENIOR_LOOK = { park: "park", lee: "lee", jung: "jung", kim: "han" };

// x, y = 2D 발 위치 / iy = 2D 말 거는 지점 / p3 = 3D 배치(의자 · 방향)
const NPCS = [
  { id: "park", name: "박서연 선배", role: "사수 · 채용 5년차", x: 14.5, y: 9.95, dir: "up", look: "park",
    p3: { x: 14.5, z: 9.55, rot: Math.PI, seat: "s14", ix: 14.5, iz: 10.3 },
    idle: ["모르는 건 메신저로 편하게 물어봐요!", "\"오늘 중\"은 사람마다 달라요. 물어보는 게 제일 확실해요 😉"] },
  { id: "lee", name: "이도현 선배", role: "HRD 4년차", x: 16.5, y: 7.35, dir: "down", look: "lee", iy: 6.3,
    p3: { x: 16.5, z: 6.45, rot: 0, seat: "n16", ix: 16.5, iz: 5.7 },
    idle: ["나쁜 소식은 빨리! 완벽한 보고서보다 먼저 알리는 게 나아요.", "교육 운영 체크리스트엔 플랜 B 칸이 꼭 있어야 해요."] },
  { id: "jung", name: "정하은 선배", role: "평가·보상 7년차", x: 12.5, y: 7.35, dir: "down", look: "jung", iy: 6.3,
    p3: { x: 12.5, z: 6.45, rot: 0, seat: "n12", ix: 12.5, iz: 5.7 },
    idle: ["인사 정보는 한 번만 새어도 팀 전체 신뢰가 깎여요.", "\"도와 달라\"는 2주 말고 일주일째에 말하세요."] },
  { id: "han", name: "한지훈 팀장님", role: "인사팀장", x: 24.5, y: 3.35, dir: "down", look: "han", iy: 4.6,
    p3: { x: 24.5, z: 2.6, rot: 0, seat: "lead", ix: 24.5, iz: 4.6 },
    idle: ["보고는 결론부터, 나쁜 소식은 먼저.", "일 없이 남아 있으면 오히려 제가 신경 쓰여요. 퇴근 인사 한마디면 충분해요."] },
  { id: "yoon", name: "윤채린", role: "입사 동기 · 마케팅팀", x: 25.5, y: 14.4, dir: "left", look: "yoon",
    p3: { x: 25.3, z: 13.6, rot: -Math.PI / 2, ix: 24.7, iz: 14.3 },
    idle: ["우리 동기방 들어왔지? 소통 공간 확인해 봐!", "오늘 점심 뭐 먹지… 🤔"] },
  { id: "oh", name: "오정민 팀장님", role: "개발2팀 · 현업 팀장", x: 6.5, y: 14.8, dir: "right", look: "oh", days: [4],
    p3: { x: 6.5, z: 14.4, rot: Math.PI / 2, ix: 7.3, iz: 14.5 },
    idle: ["인사팀 담당자 어디 계세요…?"] },
];
const OBJECTS = [
  { id: "mydesk", name: "내 자리", icon: "💻", x: 12.5, y: 10.1, r: 40, p3: { ix: 12.5, iz: 10.3, r: 1.2 },
    idle: "모니터에 포스트잇이 붙어 있다. '모르면 물어보기!'" },
  { id: "meeting", name: "교육장 · 회의실", icon: "🪑", x: 5, y: 6.6, r: 56, p3: { ix: 5.2, iz: 7.0, r: 1.5 }, idle: "비어 있는 회의실이다." },
  { id: "board", name: "선배 경험 게시판", icon: "📌", x: 21.1, y: 12.2, r: 40, p3: { ix: 21.1, iz: 12.2, r: 1.2 }, idle: null },
  { id: "coffee", name: "커피 머신", icon: "☕", x: 27.6, y: 11.6, r: 40, p3: { ix: 27.4, iz: 11.3, r: 1.2 }, idle: null },
  { id: "door", name: "엘리베이터", icon: "🛗", x: 3, y: 16.4, r: 44, p3: { ix: 3, iz: 16.3, r: 1.3 }, idle: null },
];
// 상황 카드 → 말을 걸 대상 (사람 또는 장소)
const CARD_NPC = {
  c1: "mydesk", c2: "park", c3: "mydesk",
  c4: "mydesk", c5: "mydesk", c6: "yoon",
  c7: "han", c8: "meeting", c9: "park",
  c10: "oh", c11: "mydesk", c12: "mydesk",
};
const CARD_SPEAKER = {
  c1: "💬 #인사팀 채널", c3: "🕕 인사팀 사무실 · 오후 6시", c4: "📞 지원자의 전화", c5: "💻 면접관의 메신저",
  c8: "📱 외부 강사의 문자", c11: "📨 익명 고충 접수함", c12: "🌙 오후 9시 · 내 자리",
};

// 충돌 영역 [x, y, w, h]
const SOLIDS = [
  [0, 0, 30, 2], [0, 0, 1, 18], [29, 0, 1, 18], [0, 17, 30, 1],
  [9, 2, 0.25, 6.25], [1, 8, 4, 0.25], [6, 8, 3.25, 0.25],
  [3, 4, 4, 2], [11, 7, 8, 2], [23, 3, 3, 1], [19, 2, 2, 0.9], [20.1, 7.2, 0.8, 0.7],
  [28, 10, 1, 3.5], [23, 13, 1.4, 1], [21, 16, 3, 1], [20.6, 11.2, 1, 0.5],
  [9.6, 2.2, 0.8, 0.6], [27.6, 6.3, 0.8, 0.6], [1.2, 15.6, 0.8, 0.6], [19.2, 15.6, 0.8, 0.6],
];

const World = {
  g: () => S.game,
  dayCards: () => cardsForDay(S.game.day),
  curCard: () => cardsForDay(S.game.day)[S.game.idx],
  targetOf(card) { return card ? CARD_NPC[card.id] || (card.custom ? "board" : "park") : "door"; },
  target() {
    const g = S.game; if (!g || g.phase !== "play") return null;
    return this.targetOf(this.curCard());
  },
  visibleNpcs() {
    const g = S.game, t = this.target();
    return NPCS.filter((n) => !n.days || n.days.includes(g.day) || t === n.id);
  },
  find(id) { return NPCS.find((n) => n.id === id) || OBJECTS.find((o) => o.id === id); },
  nameOf(id) { const f = this.find(id); return f ? f.name : id; },
  hit(box, solids) {
    return solids.some((s) => box[0] < s[0] + s[2] && box[0] + box[2] > s[0] && box[1] < s[1] + s[3] && box[1] + box[3] > s[1]);
  },
};

// 상황이 시작될 때 3D 사무실 안에서 브리가 하는 모션 (팝업 컷씬 대신)
const CARD_ACT = {
  c1: { m: "type", e: "💬" }, c2: { m: "surprised", then: "think", e: "❗" }, c3: { m: "nervous", e: "💦" },
  c4: { m: "phone", e: "📞" }, c5: { m: "type", e: "❗" }, c6: { m: "think", e: "❓" },
  c7: { m: "present", e: "📉" }, c8: { m: "phone", e: "⏰" }, c9: { m: "read", e: "✏️" },
  c10: { m: "bow", e: "🙇" }, c11: { m: "surprised", then: "think", e: "📨" }, c12: { m: "tired", e: "💤" },
};
