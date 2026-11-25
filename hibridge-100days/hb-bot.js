/* =============================================================
   브리 도우미 — 선배 경험 기반 챗봇
   - 사이트의 선배 경험(상황 카드 피드백 · 퇴근 회고 · 익명방/선배 답변 · 공유 Q&A · 경험 등록)을
     지식으로 모아, 질문과 관련 있는 경험을 찾아 답한다.
   - HB_BOT_API 가 설정되면 AWS Lambda → Claude 로 답하고(출처 인용),
     비어 있으면 브라우저 안에서 동작하는 '시연 모드'로 답한다.
   - index.html 의 전역(S, CARDS, DAYS, SENIORS, SEED_POSTS, MENTORS, AUTHORS, avatar, bri, esc, save …)을 사용한다.
   ============================================================= */
(function () {
  // Lambda 함수 URL (배포 후 채움). 테스트용으로 localStorage 'hb-bot-api' 로 덮어쓸 수 있음.
  let HB_BOT_API = "https://26h3b4sikg6jraqyr5x2v4ovkq0irbtr.lambda-url.ap-southeast-2.on.aws/";
  try { HB_BOT_API = localStorage.getItem("hb-bot-api") || HB_BOT_API; } catch (e) {}

  /* ---------- 지식 모으기 ---------- */
  const mentorOf = (name) => (typeof MENTORS !== "undefined" ? MENTORS.find((m) => m.n === name) : null);
  function buildKB() {
    const kb = [];
    // ① 상황 카드: 선배들의 실제 선택과 이유
    Object.entries(CARDS).forEach(([id, c]) => (c.sr || []).forEach((r, k) => {
      const s = SENIORS[r.s]; if (!s) return;
      const oo = (t) => String(t || "").replace(/OO/g, "신입");
      kb.push({ id: `card-${id}-${k}`, who: s.n, role: r.r || s.m, src: "상황 카드 피드백", title: `${c.title} (${c.type})`,
        text: `상황: ${oo(c.text)}\n${s.n}의 선택: ${c.ch[r.p] ? oo(c.ch[r.p].t) : ""}\n경험: ${oo(r.q)}\n판단 근거: ${r.w || ""}${c.why ? "\n생각해 볼 기준: " + c.why.map(oo).join(" ") : ""}` });
    }));
    // ② 퇴근 회고: 선배의 실제 실수담 (4문항)
    DAYS.forEach((d) => {
      const r = d.retro, s = r && SENIORS[r.by]; if (!s) return;
      const c = CARDS[r.card];
      kb.push({ id: `retro-${d.day}`, who: s.n, role: s.m, src: "선배 경험담", title: c ? c.title : d.label,
        text: `가장 당황했던 순간: ${r.story[0]}\n실제로 한 행동: ${r.story[1]}\n판단 근거: ${r.story[2]}\n후배에게 한마디: ${r.story[3]}` });
    });
    // ③ 소통 공간: 질문 + 선배 답변
    const reps = (p) => [...(p.rep || []), ...((S.replies || {})[p.id] || [])];
    [...(S.posts || []), ...SEED_POSTS, ...((window.HBLive && HBLive.kbPosts()) || [])].forEach((p) => {
      if (p.ch === "peer") return;
      reps(p).filter((r) => /^(선배|HRD)/.test(r.tag || "")).forEach((r, k) => {
        kb.push({ id: `post-${p.id}-${k}`, who: r.by, role: (r.tag || "").replace(/^선배 · /, ""), src: p.ch === "anon" ? "익명 질문방 답변" : "선배 답변",
          title: p.t.slice(0, 40), text: `신입 질문: ${p.t}\n${r.by} 선배 답변: ${r.t}` });
      });
    });
    // ④ 선배 1:1 대화 중 신입이 '이름 없이 공유'한 Q&A
    (S.mtShared || []).forEach((q, k) => kb.push({ id: `mt-${k}`, who: q.by, role: (q.tag || "").replace(/^선배 · /, ""), src: "선배 1:1 공유", title: q.q.slice(0, 40), text: `신입 질문: ${q.q}\n${q.by} 선배 답변: ${q.a}` }));
    // ⑤ 경험 등록: HRD 대시보드에서 '게시'한 것만 (검토 대기·보류는 쓰지 않음)
    (S.db || []).filter((d) => d.full && d.full.q1 && d.status === "게시").forEach((d) => {
      const f = d.full;
      kb.push({ id: `reg-${d.id}`, who: f.who || "익명 선배", role: `${f.part || ""} ${f.year || ""}`.trim(), src: "경험 등록", title: d.title,
        text: `상황: ${f.rel || ""} ${f.when || ""} ${f.before || ""}\n가장 당황했던 순간: ${f.q1}\n실제로 한 행동: ${f.q2}\n판단 근거: ${f.q3}\n후배에게 한마디: ${f.q4 || ""}` });
    });
    return kb;
  }

  /* ---------- 간단 검색 (한글 2글자 단위 겹침) ---------- */
  const STOP = new Set(["어떻게", "해요", "하나요", "되나요", "있나요", "인가요", "할까요", "뭐예요", "무엇", "그냥", "정말", "너무", "선배", "신입"]);
  const grams = (t) => { const s = String(t).toLowerCase().replace(/[^0-9a-z가-힣\s]/g, " "); const out = new Set();
    s.split(/\s+/).filter((w) => w && !STOP.has(w)).forEach((w) => { if (w.length === 1) return; for (let i = 0; i < w.length - 1; i++) out.add(w.slice(i, i + 2)); }); return out; };
  function search(q, kb, k) {
    const qg = grams(q); if (!qg.size) return [];
    return kb.map((d) => { const dg = grams(d.title + " " + d.text); let hit = 0; qg.forEach((g) => { if (dg.has(g)) hit++; });
      return { d, score: hit / Math.sqrt(qg.size) + (grams(d.title).size && [...qg].some((g) => grams(d.title).has(g)) ? 0.3 : 0) }; })
      .filter((x) => x.score >= 0.75).sort((a, b) => b.score - a.score).slice(0, k).map((x) => x.d);
  }

  /* ---------- 사이트 안내 (형식지) ---------- */
  const NAV = [
    { k: /경험\s*등록|경험을?\s*남기|등록하는\s*법/, a: "경험 등록은 위쪽 메뉴 **경험 등록**에서 4문항(당황했던 순간 · 실제 행동 · 판단 근거 · 조언)으로 5분이면 남길 수 있어요. HRD 검토 후 다음 신입의 상황 카드와 제 답변 자료가 돼요.", go: ["#register", "경험 등록 열기"] },
    { k: /게임|100일|상황\s*카드/, a: "**100일 게임**에서 하이브릿지 인사팀 신입이 되어 D+3부터 D+90까지 5일 동안 실무·보고·소통·대처 상황을 겪어 볼 수 있어요. 고를 때마다 선배들은 실제로 어떻게 했는지 보여 줘요.", go: ["#game", "100일 게임 하러 가기"] },
    { k: /대시보드|통계|HRD/, a: "**운영 대시보드**는 HRD 담당자용이에요. 신입들이 어떤 상황에서 많이 막히는지, 등록된 경험을 검토하는 화면이 있어요.", go: ["#hrd", "대시보드 보기"] },
    { k: /익명/, a: "**익명 질문방**에서는 이름 없이 질문할 수 있고, 검색으로 비슷한 질문과 선배 답변을 먼저 찾아볼 수 있어요.", go: ["anon", "익명 질문방 열기"] },
  ];

  /* ---------- 상태 ---------- */
  const st = { open: false, busy: false, msgs: [] };
  try { st.msgs = JSON.parse(sessionStorage.getItem("hb-bot") || "[]"); } catch (e) {}
  const keep = () => { try { sessionStorage.setItem("hb-bot", JSON.stringify(st.msgs.slice(-30))); } catch (e) {} };
  // 범주별 예시 질문 (실무 · 보고 · 소통 · 대처). 기본은 범주마다 맨 앞 질문 (발표·시연 때 고정)
  const SUGGEST_POOL = {
    실무: ["품의 올릴 때 전결권자는 어디서 봐요?", "인수인계 없이 맡은 채용, 뭐부터 봐요?", "교육 대리 참석 요청, 받아 줘도 돼요?", "강사님께 강의료, 첫 메일에 물어도 돼요?"],
    보고: ["팀장님은 메신저 보고 몇 줄을 좋아하세요?", "사수님보다 팀장님께 먼저 보고해도 돼요?", "\"좀 더 다듬어 봐\"는 어디를 고치라는 걸까요?", "메일마다 팀장님을 참조로 넣어야 해요?"],
    소통: ["아직 맡은 일이 없을 때 뭘 하면 좋아요?", "다른 본부에 안건, 어디까지 말해도 돼요?", "동기가 평가 등급을 물어보면요?", "첫 회식, 1차만 있다 가도 될까요?", "입사 2주 차인데 연차 써도 될까요?"],
    대처: ["\"오늘 중으로\"는 정확히 언제까지예요?", "지원자에게 면접 시간을 잘못 보냈어요", "교육 당일 강사님이 늦는대요", "면접관 일정이 갑자기 바뀌었어요"],
  };
  const SUGGEST = Object.values(SUGGEST_POOL).map((a) => a[0]);
  // 열 때마다 바꾸려면: Object.values(SUGGEST_POOL).map((a) => a[Math.floor(Math.random() * a.length)])

  // ② 브리 답 끝의 [[선배:이름]] [[이동:…]] 태그를 떼어 버튼 정보로 바꾼다
  const GO = { 게임: ["#game", "100일 게임 하러 가기"], 익명: ["anon", "익명 질문방 열기"], 경험등록: ["#register", "경험 등록 열기"], 소통: ["#community", "소통 공간 열기"] };
  function pullTags(text) {
    const out = { text: "", mentors: [], go: null };
    out.text = String(text || "").replace(/\[\[(선배|이동)\s*:\s*([^\]]+?)\s*\]\]/g, (_, k, v) => {
      if (k === "선배" && mentorOf(v) && out.mentors.length < 2 && !out.mentors.includes(v)) out.mentors.push(v);
      if (k === "이동" && !out.go && GO[v]) out.go = GO[v];
      return "";
    }).trim();
    return out;
  }

  /* ---------- 답변 만들기 ---------- */
  function demoAnswer(q, docs) {
    const nav = NAV.find((n) => n.k.test(q));
    if (!docs.length) {
      if (nav) return { text: nav.a, sources: [], go: nav.go };
      return { text: "아직 이 질문과 맞는 **선배 경험이 등록되지 않았어요.** 😢 이런 건 선배에게 직접 물어보는 게 가장 정확해요. 익명 질문방에 남기면 선배들이 답해 주고, 그 답이 다음 신입을 위한 자료가 돼요.", sources: [], ask: true };
    }
    const top = docs[0], line = (d) => { const m = d.text.match(/(후배에게 한마디|경험|답변): ([^\n]+)/g); return m ? m[m.length - 1].replace(/^[^:]+: /, "") : d.text.split("\n").pop(); };
    const people = [...new Set(docs.map((d) => d.who))];
    return {
      text: `선배 ${people.length}명의 경험을 찾았어요. **${top.who} 선배**는 이렇게 말해요.\n\n"${line(top)}"` + (docs[1] && docs[1].who !== top.who ? `\n\n${docs[1].who} 선배의 경험도 참고해 보세요: "${line(docs[1])}"` : ""),
      sources: docs.slice(0, 3).map((d) => ({ who: d.who, role: d.role, src: d.src, title: d.title, quote: line(d) })),
      go: nav ? nav.go : null,
    };
  }
  // ③ 이름 · 고른 범주 · 게임 진행 · 보고 있는 화면 (맞춤 답변용)
  function userCtx() {
    const G = S.game || {};
    return { name: G.name || "", part: (typeof PARTS !== "undefined" && PARTS[G.part]) || "", day: (G.progress && G.progress.day) || "", page: location.hash || "#home" };
  }
  async function apiAnswer(q, docs) {
    const history = st.msgs.filter((m) => !m.err).slice(-6, -1).map((m) => ({ role: m.me ? "user" : "assistant", text: m.text }));
    const res = await fetch(HB_BOT_API, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: q, history, docs: docs.map((d) => ({ title: `${d.who} · ${d.role} · ${d.src} · ${d.title}`, text: d.text })), ctx: userCtx() }) });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const j = await res.json();   // { text, cites:[{doc, quote}] }
    const used = [...new Set((j.cites || []).map((c) => c.doc))].filter((i) => docs[i]);
    const t = pullTags(j.text);
    return { text: t.text, sources: used.map((i) => ({ who: docs[i].who, role: docs[i].role, src: docs[i].src, title: docs[i].title, quote: (j.cites.find((c) => c.doc === i) || {}).quote || "" })), ask: !used.length, ai: true, go: t.go, connect: t.mentors };
  }
  async function ask(q) {
    q = q.trim(); if (!q || st.busy) return;
    st.msgs.push({ me: true, text: q }); st.busy = true; draw();
    const docs = search(q, buildKB(), HB_BOT_API ? 6 : 3);
    let a;
    try { a = HB_BOT_API ? await apiAnswer(q, docs) : (await new Promise((r) => setTimeout(r, 700)), demoAnswer(q, docs)); }
    catch (e) { a = { ...demoAnswer(q, docs), note: "AI 연결이 잠시 안 돼서 시연 모드로 답했어요." }; }
    st.msgs.push({ me: false, q, ...a }); st.busy = false; keep(); draw();
  }

  /* ---------- 화면 ---------- */
  const md = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>");
  const briHead = () => `<span class="hbb-av">${bri({ head: true, wave: false })}</span>`;
  function msgHTML(m, i) {
    if (m.me) return `<div class="hbb-m me"><p>${esc(m.text)}</p></div>`;
    const srcs = (m.sources || []).map((s) => { const mt = mentorOf(s.who);
      return `<div class="hbb-src">${AUTHORS[s.who] ? avatar(AUTHORS[s.who], "av") : `<span class="hbb-src-ic">📎</span>`}
        <div><b>${esc(s.who)}</b> <small>${esc(s.role)} · ${esc(s.src)}</small>${s.quote ? `<q>${esc(s.quote)}</q>` : ""}
        ${mt ? `<button type="button" data-bmt="${esc(s.who)}" data-bq="${esc(m.q || "")}">${esc(s.who)} 선배에게 1:1로 물어보기 →</button>` : ""}</div></div>`; }).join("");
    return `<div class="hbb-m">${briHead()}<div class="hbb-bub">
      <p>${md(m.text)}</p>${m.note ? `<small class="hbb-note">${esc(m.note)}</small>` : ""}
      ${srcs ? `<div class="hbb-srcs"><span class="hbb-srch">참고한 선배 경험</span>${srcs}</div>` : ""}
      <div class="hbb-acts">${(m.connect || []).filter((n) => !(m.sources || []).some((s) => s.who === n)).map((n) => {
        const t = (mentorOf(n) || {}).rank === "팀장" ? "팀장님께" : "선배에게";
        return `<button type="button" data-bmt="${esc(n)}" data-bq="${esc(m.q || "")}">${esc(n)} ${t} 1:1로 물어보기 →</button>`;
      }).join("")}${m.go ? `<button type="button" data-bgo="${esc(m.go[0])}">${esc(m.go[1])}</button>` : ""}${m.ask || (m.sources && m.sources.length) ? `<button type="button" data-banon="${esc(m.q || "")}">익명 질문방에 물어보기</button>` : ""}</div>
    </div></div>`;
  }
  function draw() {
    let root = document.getElementById("hbBot");
    if (!root) { root = document.createElement("div"); root.id = "hbBot"; document.body.appendChild(root); bindRoot(root); }
    root.innerHTML = `
      <button type="button" class="hbb-fab${st.open ? " on" : ""}" aria-expanded="${st.open}" aria-controls="hbbPanel" title="브리에게 물어보기">
        <span class="hbb-fab-av">${bri({ head: true, wave: false })}</span><span class="hbb-fab-tx">브리에게 물어보기</span></button>
      <section class="hbb-panel" id="hbbPanel" role="dialog" aria-label="브리 도우미" ${st.open ? "" : "hidden"}>
        <header class="hbb-head">${briHead()}<div><b>브리 도우미</b><small>선배들의 실제 경험으로 답해요</small></div>
          <span class="hbb-mode ${HB_BOT_API ? "ai" : ""}">${HB_BOT_API ? "Claude AI" : "시연 모드"}</span>
          ${st.msgs.length ? `<button type="button" class="hbb-x" data-breset title="대화 지우기">↺</button>` : ""}<button type="button" class="hbb-x" data-bclose aria-label="닫기">✕</button></header>
        <div class="hbb-log" id="hbbLog" aria-live="polite">
          <div class="hbb-m">${briHead()}<div class="hbb-bub"><p>안녕하세요! 저는 <b>브리</b>예요 👋<br>궁금한 걸 물어보면 <b>선배들이 남긴 실제 경험</b>을 찾아서 알려 드릴게요. 딱 맞는 경험이 없으면 물어볼 선배를 연결해 드려요.</p></div></div>
          ${st.msgs.length ? "" : `<div class="hbb-sug">${SUGGEST.map((s) => `<button type="button" data-bsug="${esc(s)}">${esc(s)}</button>`).join("")}</div>`}
          ${st.msgs.map(msgHTML).join("")}
          ${st.busy ? `<div class="hbb-m">${briHead()}<div class="hbb-bub typing"><i></i><i></i><i></i><small>선배 경험을 찾는 중…</small></div></div>` : ""}
        </div>
        <form class="hbb-in" id="hbbForm"><input id="hbbText" type="text" maxlength="300" autocomplete="off" placeholder="예: 회식에 빠져도 될까요?" aria-label="브리에게 질문"><button class="btn sm" type="submit" ${st.busy ? "disabled" : ""}>보내기</button></form>
        <p class="hbb-foot">선배 경험 기반 답변이에요 · 회사 공식 규정은 담당 부서에 확인하세요</p>
      </section>`;
    const log = document.getElementById("hbbLog"); if (log) log.scrollTop = log.scrollHeight;
    if (st.open && !st.busy) { const i = document.getElementById("hbbText"); if (i && document.activeElement !== i && !draw._noFocus) i.focus({ preventScroll: true }); }
  }
  function goCommunity(ch, draft, mt) {
    S.channel = ch; if (mt !== undefined) S.mt = mt; S.draft = draft ? { ref: "브리 도우미에서 이어서", t: draft } : null;
    if (ch === "anon") { S.anonOpen = null; S.anonWrite = !!draft; } save();
    if (location.hash === "#community") route(); else location.hash = "#community";
    st.open = window.innerWidth > 720; draw();
  }
  function bindRoot(root) {
    root.addEventListener("click", (e) => {
      const t = e.target.closest("button"); if (!t) return;
      if (t.classList.contains("hbb-fab")) { st.open = !st.open; return draw(); }
      if (t.hasAttribute("data-bclose")) { st.open = false; return draw(); }
      if (t.hasAttribute("data-breset")) { st.msgs = []; keep(); return draw(); }
      if (t.dataset.bsug) return ask(t.dataset.bsug);
      if (t.dataset.bmt) return goCommunity("ask", t.dataset.bq, t.dataset.bmt);
      if (t.dataset.banon !== undefined) return goCommunity("anon", t.dataset.banon);
      if (t.dataset.bgo) { if (t.dataset.bgo === "anon") return goCommunity("anon", ""); location.hash = t.dataset.bgo; st.open = window.innerWidth > 720; return draw(); }
    });
    root.addEventListener("submit", (e) => { e.preventDefault(); const i = document.getElementById("hbbText"); const v = i.value; i.value = ""; ask(v); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && st.open) { st.open = false; draw(); } });
  }

  /* ---------- 스타일 ---------- */
  const css = `
  #hbBot{position:fixed;right:20px;bottom:calc(20px + env(safe-area-inset-bottom,0px));z-index:40;display:flex;flex-direction:column;align-items:flex-end;gap:12px;font-family:inherit}
  .hbb-fab{display:flex;align-items:center;gap:8px;border:0;background:var(--blue,#004aad);color:#fff;border-radius:999px;padding:6px 16px 6px 6px;font-weight:700;font-size:14px;cursor:pointer;box-shadow:0 12px 28px -10px rgba(0,48,122,.7);transition:transform .15s}
  .hbb-fab:hover{transform:translateY(-2px)}
  .hbb-fab-av{width:40px;height:40px;border-radius:50%;background:#fff;display:grid;place-items:center;overflow:hidden}.hbb-fab-av svg{width:34px;height:auto}
  .hbb-fab.on .hbb-fab-tx{display:none}.hbb-fab.on{padding:6px}
  .hbb-panel{order:-1;width:min(390px,calc(100vw - 24px));height:min(600px,calc(100vh - 120px));background:#fff;border:1px solid var(--line,#e3e8f0);border-radius:20px;box-shadow:0 24px 60px -20px rgba(0,30,80,.45);display:flex;flex-direction:column;overflow:hidden;animation:hbbIn .18s ease both}
  .hbb-panel[hidden]{display:none}
  @keyframes hbbIn{from{opacity:0;transform:translateY(8px) scale(.98)}}
  .hbb-head{display:flex;align-items:center;gap:10px;padding:12px 12px 12px 14px;border-bottom:1px solid var(--line,#e3e8f0);background:var(--blue-soft,#eef3fc)}
  .hbb-head>div{flex:1;min-width:0;display:grid}.hbb-head b{font-size:15px}.hbb-head small{font-size:12px;color:var(--ink-3,#6b7280)}
  .hbb-mode{font-size:11px;font-weight:700;border-radius:6px;padding:2px 7px;background:#fff3d6;color:#8a5a00;white-space:nowrap}.hbb-mode.ai{background:#e3f6ec;color:#1b7a4c}
  .hbb-x{border:0;background:none;width:28px;height:28px;border-radius:50%;color:var(--ink-3,#6b7280);cursor:pointer;font-size:14px}.hbb-x:hover{background:#fff}
  .hbb-av{flex:none;width:34px;height:34px;border-radius:50%;background:#fff;border:1px solid var(--line,#e3e8f0);display:grid;place-items:center;overflow:hidden}.hbb-av svg{width:28px;height:auto}
  .hbb-log{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;background:linear-gradient(#f7f9fd,#eef3fc);overscroll-behavior:contain}
  .hbb-m{display:flex;gap:8px;align-items:flex-start;max-width:100%}
  .hbb-m.me{justify-content:flex-end}.hbb-m.me p{background:var(--blue,#004aad);color:#fff;border-radius:16px 4px 16px 16px;padding:9px 13px;margin:0;max-width:82%;font-size:14px;line-height:1.55;overflow-wrap:anywhere}
  .hbb-bub{background:#fff;border-radius:4px 16px 16px 16px;padding:10px 13px;box-shadow:0 1px 2px rgba(0,30,80,.08);min-width:0;max-width:calc(100% - 42px);display:grid;gap:8px}
  .hbb-bub p{margin:0;font-size:14px;line-height:1.6;overflow-wrap:anywhere}
  .hbb-bub.typing{display:flex;align-items:center;gap:4px}.hbb-bub.typing i{width:7px;height:7px;border-radius:50%;background:#9aa3b5;animation:tdot 1s infinite ease-in-out}.hbb-bub.typing i:nth-child(2){animation-delay:.15s}.hbb-bub.typing i:nth-child(3){animation-delay:.3s}.hbb-bub.typing small{margin-left:6px;color:var(--ink-3,#6b7280);font-size:12px}
  .hbb-note{font-size:11.5px;color:#8a5a00}
  .hbb-srcs{display:grid;gap:6px;border-top:1px dashed var(--line,#e3e8f0);padding-top:8px}
  .hbb-srch{font-size:11.5px;font-weight:700;color:var(--ink-3,#6b7280)}
  .hbb-src{display:flex;gap:8px;align-items:flex-start;background:var(--bg-soft,#f5f7fb);border-radius:10px;padding:8px}
  .hbb-src .av{width:28px;height:28px;flex:none}.hbb-src-ic{flex:none;width:28px;text-align:center}
  .hbb-src>div{min-width:0;display:grid;gap:3px;font-size:12.5px}.hbb-src small{color:var(--ink-3,#6b7280);font-size:11.5px}
  .hbb-src q{color:var(--ink-2,#3b4252);line-height:1.5;quotes:"“" "”"}
  .hbb-src button{justify-self:start;border:0;background:none;padding:0;color:var(--blue,#004aad);font-weight:700;font-size:12px;cursor:pointer}
  .hbb-acts{display:flex;flex-wrap:wrap;gap:6px}.hbb-acts:empty{display:none}
  .hbb-acts button{border:1.5px solid var(--blue-line,#c9d8f2);background:#fff;color:var(--blue,#004aad);border-radius:999px;padding:4px 11px;font-size:12px;font-weight:700;cursor:pointer}
  .hbb-acts button:hover{background:var(--blue-soft,#eef3fc)}
  .hbb-sug{display:flex;flex-wrap:wrap;gap:6px;padding-left:42px}
  .hbb-sug button{border:1px solid var(--line,#e3e8f0);background:#fff;border-radius:999px;padding:6px 11px;font-size:12.5px;color:var(--ink-2,#3b4252);cursor:pointer;text-align:left}
  .hbb-sug button:hover{border-color:var(--blue,#004aad);color:var(--blue,#004aad)}
  .hbb-in{display:flex;gap:8px;padding:10px;border-top:1px solid var(--line,#e3e8f0)}
  .hbb-in input{flex:1;min-width:0;border-radius:999px;background:var(--bg-soft,#f5f7fb);border:1.5px solid transparent;padding:9px 14px;font-size:14px}
  .hbb-in input:focus{background:#fff;border-color:var(--blue,#004aad);outline:none}
  .hbb-foot{margin:0;padding:0 12px 10px;font-size:11px;color:var(--ink-3,#6b7280);text-align:center}
  @media (max-width:560px){#hbBot{right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px))}.hbb-fab-tx{display:none}.hbb-fab{padding:6px}.hbb-panel{height:calc(100vh - 100px)}}
  @media print{#hbBot{display:none}}`;
  const style = document.createElement("style"); style.textContent = css; document.head.appendChild(style);
  draw._noFocus = true; draw(); draw._noFocus = false;
})();
