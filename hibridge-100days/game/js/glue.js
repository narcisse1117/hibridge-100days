// =============================================================
// 게임 단독 페이지 연결부 — 사이트(index.html)의 iframe 안에서 실행된다.
// 사이트 → 게임: URL 파라미터 (name, part, run, bri, bg)
// 게임 → 사이트: postMessage {src:'hb-game', type:'nav'|'ask'|'share'|'restart'|'progress'}
// =============================================================
const Q = new URLSearchParams(location.search);
const LS = {
  get(k, d) { try { const v = localStorage.getItem("hbg_" + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("hbg_" + k, JSON.stringify(v)); } catch (e) {} },
};
const S = {
  view: "game", channel: "peers", seniorPrefill: "",
  game: LS.get("game", null),
  stats: LS.get("stats", null) || { learners: 0, completed: 0, endings: {}, choices: {}, asks: {}, plays: {} },
  customCards: [], disabled: [], posts: [],
  mode: LS.get("mode", "3d"),
};
function save() { LS.set("game", S.game); LS.set("stats", S.stats); report(); }

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clamp = (v) => Math.max(0, Math.min(100, v));
const LETTERS = ["A", "B", "C", "D"];
const GCOLOR = { trust: "var(--g-trust)", peer: "var(--g-peer)", perf: "var(--g-perf)", hp: "var(--g-hp)" };

function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.remove("hidden");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add("hidden"), 2600);
}
function openModal(html) { $("#modal-box").innerHTML = html; $("#modal").classList.remove("hidden"); }
function closeModal() { $("#modal").classList.add("hidden"); }
$("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const allCards = () => CARDS.concat(S.customCards);
const activeCards = () => allCards().filter((c) => !S.disabled.includes(c.id));
const cardsForDay = (d) => activeCards().filter((c) => c.day === d);
const findCard = (id) => allCards().find((c) => c.id === id);
const seniorOf = (fb) => SENIORS[fb.senior] || { name: "익명의 선배", role: "인사팀 선배", emoji: "🧑‍🏫" };
function orderOf(card) {
  const g = S.game;
  if (!g.order[card.id] || g.order[card.id].length !== card.choices.length) g.order[card.id] = card.choices.map((_, i) => i);
  return g.order[card.id];
}
function endingOf(g) {
  if (g.failKey) return { key: "f-" + g.failKey, fail: true, ...ENDINGS.fail[g.failKey] };
  const v = g.gauges, vals = GAUGES.map((x) => v[x.key]);
  if (Math.max(...vals) - Math.min(...vals) <= 15) return { key: "s-all", ...ENDINGS.success.all };
  const top = GAUGES.slice().sort((a, b) => v[b.key] - v[a.key])[0].key;
  return { key: "s-" + top, ...ENDINGS.success[top] };
}
function failTip(k) {
  return {
    trust: "보고는 '빨리, 결론 먼저, 나쁜 소식일수록 먼저'. 중간 공유만 잘해도 신뢰는 쌓여요.",
    peer: "혼자 끙끙대지 말고, 짧게라도 공유하고 물어보세요. 관계는 작은 메시지에서 시작돼요.",
    perf: "확인 없이 약속하거나 여러 일을 동시에 벌이면 결과물이 흔들려요. 우선순위를 먼저 정하세요.",
    hp: "우선순위 조정을 요청하는 것도 업무 관리예요. 체력도 자원이에요.",
  }[k];
}

// ---------- 사이트와 연결 ----------
const toParent = (m) => { try { if (parent !== window) parent.postMessage(Object.assign({ src: "hb-game" }, m), "*"); } catch (e) {} };
function go(view) { toParent({ type: "nav", view: { community: "community", senior: "register" }[view] || view }); }
window.hbRestart = () => toParent({ type: "restart" });
window.hbShare = (text) => { toParent({ type: "share", text }); toast("동기방에 공유했어요"); };
function report() {
  const g = S.game; if (!g) return;
  toParent({ type: "progress", day: DAYS[g.day - 1] && DAYS[g.day - 1].label, phase: g.phase, gauges: GAUGES.map((x) => g.gauges[x.key]) });
}
function openAsk(card) {
  openModal(`
    <h3>🙋 선배에게 물어보기</h3>
    <p class="muted small"><span class="card-ref">🃏 ${esc(card.title)}</span> 상황에서 궁금한 점을 남기면 소통 공간에서 선배들이 답해줘요.</p>
    <label>어디에 물어볼까요?</label>
    <select id="ach"><option value="ask">🙋 선배에게 물어보기 (이름 공개)</option><option value="anon">🎭 익명 질문방</option></select>
    <label>질문</label>
    <textarea id="aq" placeholder="예: 이런 상황에서 팀장님께 먼저 말씀드려야 할까요, 사수에게 먼저 물어봐야 할까요?"></textarea>
    <div class="row" style="justify-content:flex-end;margin-top:14px">
      <button class="btn ghost" id="ac">취소</button><button class="btn" id="as">질문 올리기</button>
    </div>`);
  $("#ac").addEventListener("click", closeModal);
  $("#as").addEventListener("click", () => {
    const text = $("#aq").value.trim(), ch = $("#ach").value;
    if (!text) return toast("질문을 입력해 주세요");
    S.stats.asks[card.id] = (S.stats.asks[card.id] || 0) + 1; save();
    toParent({ type: "ask", ch, text, card: { id: card.id, title: card.title, day: DAYS[card.day - 1].label } });
    closeModal(); toast("소통 공간에 질문을 올렸어요. 게임을 마치고 확인해 보세요!");
  });
}

// ---------- 초상화: 나 = 꾸민 브리, 선배 = 사이트 인물 일러스트 ----------
function hbPortrait(lk, size) {
  const s = size || 48;
  if (lk && lk.bri) return `<span class="portrait hbp" style="width:${s}px;height:${s}px;background:${lk.bg || "#eef3fc"}">${HBArt.bri({ ...lk.bri, head: true, wave: false })}</span>`;
  if (lk && lk.pid && HBArt.PORTRAITS[lk.pid]) return `<span class="portrait hbp" style="width:${s}px;height:${s}px">${HBArt.face(lk.pid, true)}</span>`;
  return null;
}

// ---------- 내 캐릭터 · 게임 시작 ----------
function shadeHex(hex, amt) {
  const n = parseInt(hex.slice(1), 16); const f = (c) => Math.max(0, Math.min(255, Math.round(c * (1 + amt))));
  return "#" + ((1 << 24) | (f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).slice(1);
}
function myLook() {
  let b = null; try { b = JSON.parse(Q.get("bri") || "null"); } catch (e) {}
  b = b || { c: "#004aad" }; const c = b.c || "#004aad";
  return { bri: b, bg: Q.get("bg") || "#eef3fc", skin: c, shirt: c, hair: "#1d1a22", pants: shadeHex(c, -0.35), style: "short" };
}
function newGame() {
  S.game = { name: Q.get("name") || "김하이", run: Q.get("run") || "", look: myLook(), day: 1, idx: 0, gauges: { ...START_GAUGES },
    phase: "dayIntro", order: {}, history: [], retro: {}, revealed: {}, last: null, failKey: null, counted: false };
  S.stats.learners++; save();
}
const use3D = () => S.mode !== "2d" && typeof Game3D !== "undefined" && Game3D.supported;
function render() {
  const app = $("#app");
  if (!S.game || S.game.run !== (Q.get("run") || "")) newGame();
  else { S.game.look = myLook(); S.game.name = Q.get("name") || S.game.name; }
  use3D() ? Game3D.mount(app) : Game2D.mount(app);
}
render();
// 조작 안내: 처음 한 번만 잠깐 보여 주고, 이후엔 HUD의 ⌨️ 버튼으로
setTimeout(() => { const h = document.getElementById("ghelp"); if (!h || LS.get("helpSeen", false)) return; h.classList.add("show"); LS.set("helpSeen", true); setTimeout(() => h.classList.remove("show"), 7000); }, 600);
