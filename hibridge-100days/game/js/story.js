// =============================================================
// 공통 게임 진행 — 대화창 · 선택 · 피드백 · 회고 · 엔딩 · HUD · 효과음
// 렌더러(2D/3D)는 R 어댑터로 연결된다.
//   R.kind, R.portrait(look,size), R.nearest(), R.faceTo(target), R.onGain(delta),
//   R.shake(), R.resetPlayer(), R.onTalk(target, card), R.onTalkEnd(), R.sync()
// =============================================================
const Story = (() => {
  let R = null, mode = "walk", typer = null, dlgDone = null, choiceHandler = null;
  const keys = {};
  const g = () => S.game;
  const look = () => (g() && g().look) || DEFAULT_LOOK;
  const $id = (id) => document.getElementById(id);

  // ---------- 효과음 (WebAudio로 즉석 합성) ----------
  let actx = null, muted = null;
  const isMuted = () => (muted === null ? (muted = LS.get("muted", false)) : muted);
  function tone(freq, start, dur, type, vol) {
    const o = actx.createOscillator(), gn = actx.createGain();
    o.type = type || "sine"; o.frequency.value = freq;
    gn.gain.setValueAtTime(0.0001, actx.currentTime + start);
    gn.gain.exponentialRampToValueAtTime(vol || 0.05, actx.currentTime + start + 0.01);
    gn.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + start + dur);
    o.connect(gn).connect(actx.destination); o.start(actx.currentTime + start); o.stop(actx.currentTime + start + dur + 0.02);
  }
  function sfx(type) {
    if (isMuted()) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === "suspended") actx.resume();
      if (type === "blip") tone(660 + Math.random() * 80, 0, 0.04, "square", 0.012);
      if (type === "open") { tone(520, 0, 0.08, "sine", 0.05); tone(780, 0.06, 0.1, "sine", 0.05); }
      if (type === "select") { tone(600, 0, 0.06, "triangle", 0.06); tone(900, 0.05, 0.08, "triangle", 0.05); }
      if (type === "good") [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.07, 0.18, "triangle", 0.05));
      if (type === "bad") [392, 330, 262].forEach((f, i) => tone(f, i * 0.09, 0.2, "sawtooth", 0.025));
      if (type === "day") [392, 523, 659, 784].forEach((f, i) => tone(f, i * 0.1, 0.3, "sine", 0.05));
      if (type === "night") [659, 523, 392].forEach((f, i) => tone(f, i * 0.16, 0.45, "sine", 0.04));
      if (type === "end") [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, i * 0.09, 0.4, "triangle", 0.05));
      if (type === "ding") { tone(1318, 0, 0.9, "sine", 0.06); tone(1046, 0.28, 1.1, "sine", 0.06); }
      if (type === "ring") for (let i = 0; i < 6; i++) tone(i % 2 ? 1100 : 1400, i * 0.07, 0.06, "square", 0.018);
      if (type === "pop") tone(880, 0, 0.07, "sine", 0.05);
      if (type === "send") { tone(500, 0, 0.12, "triangle", 0.04); tone(1000, 0.08, 0.14, "triangle", 0.04); }
      if (type === "type") for (let i = 0; i < 5; i++) tone(1800 + Math.random() * 400, i * 0.06, 0.02, "square", 0.008);
      if (type === "spot") { tone(300, 0, 0.3, "sine", 0.05); tone(450, 0.05, 0.4, "sine", 0.04); }
      if (type === "door") { tone(220, 0, 0.5, "sine", 0.03); tone(180, 0.2, 0.5, "sine", 0.03); }
    } catch (e) {}
  }

  // ---------- 입력 ----------
  const MAP = { w: "ArrowUp", a: "ArrowLeft", s: "ArrowDown", d: "ArrowRight", W: "ArrowUp", A: "ArrowLeft", S: "ArrowDown", D: "ArrowRight" };
  document.addEventListener("keydown", (e) => {
    if (!$id("gwrap")) return;
    if (e.key === "Escape") {
      if (!$id("modal").classList.contains("hidden")) return closeModal();
      if (mode === "cut") return endCut(true);
      return cancelDlg();
    }
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "textarea" || tag === "input" || tag === "select") return;
    if (!$id("modal").classList.contains("hidden")) return;
    const k = MAP[e.key] || e.key;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(k)) e.preventDefault();
    keys[k.length === 1 ? k.toLowerCase() : k] = true;
    if (k.startsWith("Arrow") || e.repeat) return;
    press(k);
  });
  document.addEventListener("keyup", (e) => {
    const k = MAP[e.key] || e.key; keys[k.length === 1 ? k.toLowerCase() : k] = false;
    // 포커스된 버튼이 Space 로 다시 눌리지 않도록 (버튼 클릭은 keyup 에서 일어남)
    const tag = (e.target.tagName || "").toLowerCase();
    if (e.key === " " && tag !== "textarea" && tag !== "input") e.preventDefault();
  });
  // 마우스로 누른 버튼은 바로 포커스 해제 → Space 가 게임 조작으로만 쓰이게
  document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest("button"); if (b && e.detail > 0) b.blur(); });
  window.addEventListener("blur", () => Object.keys(keys).forEach((k) => (keys[k] = false)));

  // ---------- 드랍 아이템 ----------
  // 조건을 채우면 giveItem → 걷는 중(패널·대화 없음)일 때 선물 상자가 떨어지고 획득 카드가 뜬다
  // 이번 판에서 모은 아이템(gm.items)은 다시 시작하면 초기화, 도감(hb-items)은 한 번 얻으면 계속 남음
  const dropQ = []; let dropBusy = false;
  function giveItem(id) {
    const gm = g(); if (!gm || typeof hbItem !== "function" || !hbItem(id)) return false;
    gm.items = gm.items || []; if (gm.items.includes(id)) return false;
    gm.items.push(id); save();
    const isNew = hbItemGive(id);
    dropQ.push({ id, isNew }); if (typeof toParent === "function") toParent({ type: "item", id, isNew }); return true;
  }
  setInterval(() => {
    if (!dropQ.length || dropBusy || mode !== "walk" || !R) return;
    const p = $id("gpanel"); if (p && !p.classList.contains("hidden")) return;
    const d = dropQ.shift(), it = hbItem(d.id); if (!it) return;
    dropBusy = true; sfx("good");
    (R.spawnGift ? (toast("🎁 선물 상자가 도착했어요! 상자를 눌러서 열어 보세요"), R.spawnGift(it)) : R.dropBox ? R.dropBox(it.tier) : Promise.resolve()).then(() => { showItemCard(it, d.isNew); dropBusy = false; });
  }, 500);
  function itemPic(it, size) {
    const b = { top: "dot", face: "none", neck: "tie", ear: "none", ...(look().bri || {}), [it.slot]: it.v };
    return HBArt.bri({ ...b, head: it.slot === "top", wave: it.slot === "hand" ? false : true, size: size || 90 });
  }
  function showItemCard(it, isNew) {
    const host = $id("gwrap"); if (!host) return;
    const old = host.querySelector(".itemget"); if (old) old.remove();
    const tr = HB_TIER[it.tier] || ["", "#6b7280"], have = hbItemsOwned().length, run = (g().items || []).length;
    const el = document.createElement("div"); el.className = "itemget t-" + it.tier;
    el.innerHTML = `<div class="ig-pic" style="background:${(look().bg) || "#eef3fc"}">${itemPic(it, 86)}</div>
      <div class="ig-tx"><span class="ig-tag" style="background:${tr[1]}">${isNew === false ? "🎁 다시 획득" : "🎁 새 아이템 · 도감 등록"} · ${tr[0]}</span><b>${esc(it.n)}</b><small>${esc(it.desc)}</small><em>이번 판 ${run}개 · 도감 ${have} / ${HB_ITEMS.length} · ${esc(it.how)}</em>
      <div class="ig-acts"><button class="btn" data-eq>착용하기</button><button class="btn ghost" data-x>나중에</button></div></div>`;
    host.appendChild(el);
    const close = () => { el.classList.add("out"); setTimeout(() => el.remove(), 300); };
    el.querySelector("[data-eq]").addEventListener("click", () => {
      const gm = g(); gm.look = { ...gm.look, bri: { ...(gm.look.bri || {}), [it.slot]: it.v } }; save(); R.sync();
      if (typeof toParent === "function") toParent({ type: "equip", slot: it.slot, v: it.v });
      if (R.react) R.react(8); toast(`${it.n}을(를) 착용했어요!`); close();
    });
    el.querySelector("[data-x]").addEventListener("click", close);
    setTimeout(() => { if (el.isConnected) close(); }, 12000);
  }

  function press(k) {
    if (mode === "cut") { if (k === " " || k === "Enter") endCut(false); return; }
    if (mode === "walk" && (k === " " || k === "Enter")) return interact();
    if (mode === "dialog") {
      if (choiceHandler && ["1", "2", "3", "4"].includes(k)) {
        const b = document.querySelector(`#dlg [data-c="${+k - 1}"]`); if (b) b.click(); return;
      }
      if (k === " " || k === "Enter") advance();
    }
  }

  // ---------- 공통 화면 골격 ----------
  function shell(app, kind) {
    app.innerHTML = `
      ${kind === "2d" ? '<div class="ghud" id="ghud"></div>' : ""}
      <div class="gwrap g${kind}" id="gwrap">
        <div class="gstage" id="gstage"></div>
        <div class="glabels" id="glabels"></div>
        ${kind === "3d" ? '<div class="ghud overlay" id="ghud"></div><canvas class="minimap" id="minimap" width="240" height="144"></canvas>' : ""}
        <div class="quest" id="quest"></div>
        <div class="dlg hidden" id="dlg"></div>
        <div class="gpanel hidden" id="gpanel"></div>
        <div class="touch">
          <div class="dpad">
            <button data-k="ArrowUp" class="u">▲</button><button data-k="ArrowLeft" class="l">◀</button>
            <button data-k="ArrowRight" class="r">▶</button><button data-k="ArrowDown" class="d">▼</button>
          </div>
          <button class="abtn" data-k=" ">A</button>
        </div>
      </div>
      <p class="ghelp" id="ghelp">${kind === "3d"
        ? "⌨️ <b>WASD / 방향키</b> 이동 · <b>마우스 드래그 / Q E</b> 시점 회전 · <b>휠</b> 줌 · <b>클릭</b> 그곳으로 이동 · <b>Space</b> 말 걸기 · <b>1 2 3</b> 선택 · <b>Esc</b> 나가기"
        : "⌨️ <b>방향키 / WASD</b> 이동 · <b>Space</b> 말 걸기 · 대화 중 <b>1 2 3</b> 선택 · <b>Esc</b> 나가기"} &nbsp;|&nbsp; <b class="bang">!</b> 표시를 찾아가세요</p>`;
    app.querySelectorAll(".touch [data-k]").forEach((b) => {
      const k = b.dataset.k;
      const on = (e) => { e.preventDefault(); if (k === " ") press(" "); else keys[k] = true; };
      const off = (e) => { e.preventDefault(); keys[k] = false; };
      b.addEventListener("pointerdown", on); b.addEventListener("pointerup", off); b.addEventListener("pointerleave", off);
    });
    return $id("gstage");
  }

  function attach(renderer) {
    R = renderer; mode = "walk"; closeDlgSilently();
    const gm = g();
    if (["card", "result"].includes(gm.phase)) gm.phase = "play";
    if (!gm.look) gm.look = { ...DEFAULT_LOOK };
    updateHUD();
    if (gm.phase === "dayIntro") showDayIntro();
    else if (gm.phase === "retro") showRetro();
    else if (gm.phase === "ending") showEnding();
    R.sync();
  }

  // ---------- HUD ----------
  function updateHUD() {
    const gm = g(), el = $id("ghud"); if (!gm || !el) return;
    const d = DAYS[gm.day - 1];
    el.innerHTML = `
      <div class="who">${R.portrait(look(), 40)}<div><b>${esc(gm.name)}</b><br/><span class="small hud-sub">인사팀 신입 · ${d.label} ${d.title}</span></div></div>
      <div class="mini-gauges">${GAUGES.map((x) => {
        const v = gm.gauges[x.key];
        return `<div class="mg ${v <= 20 ? "low" : ""}" title="${x.desc}"><span>${x.icon} ${x.label}</span><div class="bar"><i style="width:${v}%;background:${GCOLOR[x.key]}"></i></div><b>${v}</b></div>`;
      }).join("")}</div>
      <div class="hud-right">
        <div class="days">${DAYS.map((x) => `<span class="${x.day < gm.day ? "done" : x.day === gm.day ? "now" : ""}">${x.label}</span>`).join("")}</div>
        <div class="hud-btns">
          <button id="hb-help" title="조작 방법">⌨️</button>
          <button id="hb-restart" title="처음부터 다시">↺</button>
          <button id="hb-mute" title="효과음">${isMuted() ? "🔇" : "🔊"}</button>
          ${typeof Game3D !== "undefined" && Game3D.supported ? `<button id="hb-mode" title="2D/3D 전환">${R.kind === "3d" ? "2D" : "3D"}</button>` : ""}
          ${R.kind === "3d" ? '<button id="hb-full" title="전체 화면">⛶</button>' : ""}
        </div>
      </div>`;
    $id("hb-mute").onclick = () => { muted = !isMuted(); LS.set("muted", muted); updateHUD(); };
    $id("hb-help").onclick = () => { const h = document.querySelector(".ghelp"); if (h) h.classList.toggle("show"); };
    $id("hb-restart").onclick = () => { if (!confirm("처음부터 다시 시작할까요? 지금까지의 진행 기록은 사라져요.")) return; S.game = null; save(); render(); toast("D+1부터 다시 시작해요"); };
    if ($id("hb-mode")) $id("hb-mode").onclick = () => { S.mode = R.kind === "3d" ? "2d" : "3d"; LS.set("mode", S.mode); render(); };
    if ($id("hb-full")) $id("hb-full").onclick = () => {
      const w = $id("gwrap");
      if (document.fullscreenElement) document.exitFullscreen(); else if (w.requestFullscreen) w.requestFullscreen();
    };
    const q = $id("quest"), card = World.curCard(), n = World.dayCards().length;
    if (gm.phase !== "play") { q.innerHTML = ""; return; }
    const t = World.targetOf(card), isNpc = NPCS.some((x) => x.id === t);
    q.innerHTML = card
      ? `<div class="q-title">📌 오늘의 할 일 <span>${gm.idx + 1} / ${n}</span></div>${esc(World.nameOf(t))}${isNpc ? "에게 말 걸기" : "(으)로 가기"}`
      : `<div class="q-title">📌 오늘 일 끝!</div>엘리베이터로 가서 퇴근하기 🌙`;
  }

  // ---------- 상호작용 ----------
  function interact() {
    const nb = R.nearest(); if (!nb) return;
    const gm = g(), card = World.curCard();
    if (nb.look) R.faceTo(nb);
    if (gm.phase !== "play") return;
    if (card && World.targetOf(card) === nb.id) return startCard(card, nb);
    if (nb.id === "door") {
      if (card) return say(nb, "아직 오늘 할 일이 남았어요. 📌 할 일을 확인하세요.");
      gm.phase = "retro"; save();
      const d = DAYS[gm.day - 1], go2 = () => { R.sync(); sfx("night"); showRetro(); };
      if (!R.elevator) return go2();
      mode = "busy"; return R.elevator("down").then(() => { mode = "walk"; go2(); });
    }
    if (nb.id === "coffee") {
      if (gm.coffee === gm.day) return say(nb, "오늘은 이미 한 잔 마셨어요. 카페인은 하루 한 잔! ☕");
      gm.coffee = gm.day; gm.gauges.hp = clamp(gm.gauges.hp + 3); save(); updateHUD();
      R.onGain({ hp: 3 }); sfx("good"); giveItem("coffee");
      return say(nb, "따뜻한 커피 한 잔. 잠깐 숨 돌렸다. (체력 +3)");
    }
    if (nb.id === "board") {
      const n = S.customCards.length;
      return say(nb, n ? `선배들이 남긴 경험 카드 ${n}장이 붙어 있다. 해당 시기가 되면 여기서 상황이 시작된다.`
        : "아직 붙은 경험 카드가 없다. 시니어가 '✍️ 시니어' 탭에서 경험을 등록하면 여기에 붙는다.");
    }
    const line = Array.isArray(nb.idle) ? nb.idle[Math.floor(Math.random() * nb.idle.length)] : nb.idle;
    say(nb, line);
  }

  // ---------- 대화창 ----------
  function speakerHTML(who) {
    if (!who) return "";
    const pic = who.look ? R.portrait(LOOKS[who.look], 64) : `<div class="portrait emoji">${who.icon || "💬"}</div>`;
    return `<div class="spk">${pic}<div><b>${esc(who.name)}</b>${who.role ? `<br/><span class="small muted">${esc(who.role)}</span>` : ""}</div></div>`;
  }
  function openDlg(who, text, opts) {
    mode = "dialog"; choiceHandler = null;
    if (opts && opts.talkTo) R.onTalk(opts.talkTo, opts.card);
    sfx("open");
    const el = $id("dlg"); el.classList.remove("hidden");
    const cancelable = !!(opts && opts.cancel);
    el.innerHTML = `${cancelable ? '<button class="dclose" id="dclose" title="나가기 (Esc)">✕ 나가기</button>' : ""}${speakerHTML(who)}<div class="dbody">${opts && opts.head ? opts.head : ""}<p class="dtext" id="dtext"></p><div id="dchoices"></div><div class="dnext hidden" id="dnext">▼ Space</div></div>`;
    el.onclick = (e) => { if (!e.target.closest("button")) advance(); };
    if (cancelable) $id("dclose").onclick = (e) => { e.stopPropagation(); cancelDlg(); };
    const tEl = $id("dtext");
    let i = 0;
    clearInterval(typer);
    typer = setInterval(() => {
      i += 2; tEl.textContent = text.slice(0, i);
      if (i % 6 === 0) sfx("blip");
      if (i >= text.length) finishType();
    }, 24);
    function finishType() {
      clearInterval(typer); typer = null; tEl.textContent = text;
      if (opts && opts.choices) showChoices(opts.choices, opts.onPick, opts.extra);
      else $id("dnext").classList.remove("hidden");
    }
    dlgDone = { finishType, after: opts && opts.after, keepTalk: opts && opts.keepTalk, cancel: cancelable, isCard: !!(opts && opts.card) };
  }
  function advance() {
    if (!dlgDone) return;
    if (typer) return dlgDone.finishType();
    if (choiceHandler) return;
    const after = dlgDone.after, keep = dlgDone.keepTalk; closeDlg(keep); if (after) after();
  }
  function closeDlgSilently() { clearInterval(typer); typer = null; dlgDone = null; choiceHandler = null; }
  function closeDlg(keepTalk) {
    closeDlgSilently();
    const el = $id("dlg"); if (el) el.classList.add("hidden");
    mode = "walk";
    if (!keepTalk) R.onTalkEnd();
  }
  function showChoices(list, onPick, extra) {
    choiceHandler = onPick;
    $id("dchoices").innerHTML = list.map((t, k) => `<button class="dchoice" data-c="${k}"><b>${k + 1}</b> ${esc(t)}</button>`).join("") + (extra || "");
    document.querySelectorAll("#dchoices [data-c]").forEach((b) => b.addEventListener("click", () => {
      const f = choiceHandler; if (!f) return; choiceHandler = null; sfx("select"); f(+b.dataset.c);
    }));
    const ask = $id("dask"); if (ask) ask.addEventListener("click", () => openAsk(World.curCard()));
    bindHint(World.curCard());
  }
  function say(who, text, after) { openDlg(who, text, { after, cancel: true, talkTo: who && (who.look || who.p3) ? who : null }); }
  // 선택 전 대화에서 빠져나가기 (카드는 그대로 남아 다시 말 걸면 이어서 진행)
  function cancelDlg() {
    if (mode !== "dialog" || !dlgDone || !dlgDone.cancel) return;
    const wasCard = dlgDone.isCard;
    closeDlg();
    if (wasCard) toast("나중에 다시 말을 걸면 이어서 할 수 있어요");
  }

  // ---------- 상황 카드 ----------
  function startCard(card, who) {
    const key = g().day + ":" + card.id;
    R.onTalk(who, card);
    if (!seenCuts.has(key) && R.act) {
      seenCuts.add(key); R.act(card); mode = "busy";
      return setTimeout(() => { if (mode === "busy") { mode = "walk"; openCardDlg(card, who); } }, 1500);
    }
    openCardDlg(card, who);
  }
  function openCardDlg(card, who) {
    const order = orderOf(card);
    const speaker = CARD_SPEAKER[card.id] ? { name: CARD_SPEAKER[card.id], icon: "" } : who;
    const head = `<div class="dhead"><span class="tag">${esc(card.category)}</span>${card.custom ? ' <span class="tag amber">선배 등록 카드</span>' : ""} <b>${esc(card.title)}</b></div>`;
    openDlg(speaker, card.text, {
      head, talkTo: who, card, cancel: true,
      choices: order.map((oi) => card.choices[oi].text),
      extra: `${card.hint ? '<button class="dask dhint" id="dhint">💡 선배 찬스</button>' : ""}<button class="dask" id="dask">🙋 선배에게 물어보기</button>`,
      onPick: (k) => pick(card, order[k], who),
    });
  }
  function bindHint(card) {
    const hb = $id("dhint");
    if (hb && card && card.hint) hb.addEventListener("click", () => {
      if ($id("hintbox")) return;
      const h = card.hint, s = SENIORS[h.senior] || { name: "선배", role: "" }, lk = SENIOR_LOOK[h.senior];
      const box = document.createElement("div"); box.className = "hintbox"; box.id = "hintbox";
      box.innerHTML = `${lk ? R.portrait(LOOKS[lk], 40) : ""}<div><b>💡 ${esc(s.name)}의 선배 찬스</b><p>${esc(h.text)}</p><small>정답이 아니라 생각해 볼 질문이에요</small></div>`;
      const ch = $id("dchoices"); if (ch) ch.parentNode.insertBefore(box, ch);
      hb.disabled = true; sfx("select");
      const gm = g(); gm.hints = gm.hints || {}; gm.hints[card.id] = true; save();
    });
  }

  // ---------- 상황 컷씬 ----------
  const seenCuts = new Set();
  let cut = null;
  const cutsOn = () => LS.get("cuts", true) !== false;
  const sceneOf = (card) => { try { return Scenes.forCard(card, { me: look(), day: g().day, name: g().name }); } catch (e) { return null; } };
  // onDone: 끝나거나 건너뛰면 / onCancel: Esc로 취소하면 (없으면 onDone 대신 이전 상태로 복귀)
  function playCut(sc, meta, onDone, onCancel) {
    if (cut) endCut(false, true);
    const wrap = $id("gwrap"); if (!wrap) return onDone && onDone();
    const prev = mode; mode = "cut";
    const el = document.createElement("div");
    el.className = "cut"; el.id = "cut";
    el.innerHTML = `<div class="cut-frame">${Scenes.svgOf(sc)}</div>
      <div class="cut-cap">${meta && meta.tag ? `<span class="tag">${esc(meta.tag)}</span>` : ""}${meta && meta.title ? `<b>${esc(meta.title)}</b>` : ""}<small>${esc(sc.place || "")}</small></div>
      <div class="cut-skip">Space · 클릭 건너뛰기 ▶</div><div class="cut-bar"><i style="animation-duration:${sc.dur}ms"></i></div>`;
    el.addEventListener("click", () => endCut(false));
    wrap.appendChild(el);
    const timers = (sc.sfx || []).map(([t, s]) => setTimeout(() => sfx(s), t * 1000));
    timers.push(setTimeout(() => endCut(false), sc.dur + 500));
    cut = { el, timers, prev, onDone, onCancel };
  }
  function endCut(cancelled, silent) {
    if (!cut) return;
    const c = cut; cut = null;
    c.timers.forEach(clearTimeout);
    c.el.classList.add("out"); setTimeout(() => c.el.remove(), 350);
    mode = c.prev === "cut" ? "walk" : c.prev;
    if (silent) return;
    if (cancelled && c.onCancel) { mode = "walk"; return c.onCancel(); }
    if (c.onDone) { if (mode === "dialog" || mode === "panel") return c.onDone(); mode = "walk"; c.onDone(); }
  }
  function pick(card, i, who) {
    const gm = g(), eff = card.choices[i].effects, delta = {};
    GAUGES.forEach((x, k) => { const b = gm.gauges[x.key]; gm.gauges[x.key] = clamp(b + eff[k]); delta[x.key] = gm.gauges[x.key] - b; });
    gm.history.push({ cardId: card.id, choice: i, best: card.best, day: gm.day, delta });
    gm.last = { cardId: card.id, choice: i, delta };
    gm.idx++;
    const dead = GAUGES.find((x) => gm.gauges[x.key] <= 0); if (dead) gm.failKey = dead.key;
    S.stats.choices[card.id] = S.stats.choices[card.id] || card.choices.map(() => 0);
    S.stats.choices[card.id][i] = (S.stats.choices[card.id][i] || 0) + 1;
    S.stats.plays[card.id] = (S.stats.plays[card.id] || 0) + 1;
    save(); updateHUD();
    const sum = Object.values(delta).reduce((a, b) => a + b, 0);
    sfx(sum >= 0 ? "good" : "bad");
    R.onGain(delta);
    if (R.react) R.react(Object.values(delta).reduce((a, b) => a + b, 0));
    if (Object.values(delta).some((v) => v <= -15)) R.shake();
    closeDlgSilently(); $id("dlg").classList.add("hidden"); mode = "busy";
    setTimeout(() => openDlg({ name: "결과", icon: "📎" }, card.choices[i].result, { keepTalk: true, after: () => showFeedback(card, i) }), 350);
  }

  // ---------- 패널 ----------
  function panel(html, cls) {
    mode = "panel";
    const p = $id("gpanel"); p.className = "gpanel " + (cls || ""); p.innerHTML = `<div class="gbox">${html}</div>`;
    return p;
  }
  function closePanel() {
    const p = $id("gpanel"); if (p) p.classList.add("hidden"); mode = "walk";
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  function showFeedback(card, mine) {
    const order = orderOf(card), letter = (oi) => order.indexOf(oi) + 1;
    const same = card.feedback.filter((f) => f.pick === mine).length;
    R.sync();
    const p = panel(`
      <div class="row" style="justify-content:space-between"><h2 style="margin:0">👥 선배들은 어떻게 했을까?</h2>
        <span class="tag ${same ? "" : "gray"}">나와 같은 선택 ${same}/${card.feedback.length}</span></div>
      <p class="muted small">내 선택: <b>${letter(mine)}번</b> ${esc(card.choices[mine].text)}</p>
      ${card.feedback.map((f) => {
        const s = seniorOf(f), lk = SENIOR_LOOK[f.senior];
        return `<div class="senior-fb">${lk ? R.portrait(LOOKS[lk], 52) : `<div class="portrait emoji">${s.emoji}</div>`}
          <div><span class="who">${esc(s.name)}</span> <span class="muted small">${esc(f.role || s.role)}</span>
          <span class="tag ${f.pick === mine ? "" : "gray"}">${letter(f.pick)}번 선택</span><div>${esc(f.text)}</div>${f.why ? `<div class="why">${esc(f.why)}</div>` : ""}</div></div>`;
      }).join("")}
      ${card.why && card.why.length ? `<div class="insight why-box"><strong>🧭 생각해 볼 기준</strong><ul>${card.why.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>`
        : `<div class="insight"><strong>💡 판단 근거 (우리 회사 암묵지)</strong><br/>${esc(card.insight)}</div>`}
      <div class="row" style="justify-content:space-between;margin-top:14px">
        <button class="btn soft" id="fask">🙋 더 물어보기</button>
        <button class="btn" id="fok">${g().failKey ? "결과 보기 →" : "계속하기 ▶"}</button>
      </div>`);
    p.querySelector("#fask").addEventListener("click", () => openAsk(card));
    p.querySelector("#fok").addEventListener("click", () => {
      closePanel(); R.onTalkEnd();
      if (g().failKey) { g().phase = "ending"; save(); R.sync(); showEnding(); }
      else { updateHUD(); R.sync(); }
    });
  }

  function showDayIntro() {
    const gm = g(), d = DAYS[gm.day - 1];
    R.resetPlayer(); R.sync();
    const p = panel(`
      <div class="day-intro"><div class="muted">Day ${d.day} / ${DAYS.length}</div><div class="big">${d.label}</div>
      <h2>${d.title}</h2><p class="muted">${typeof myArea === "function" && myArea() !== "통합" ? `관심 분야 · ${myArea()}` : "실무 · 보고 · 소통 · 대처"} · 오늘의 상황 ${World.dayCards().length}개</p>
      <button class="btn" id="dgo">출근하기 ☀️</button></div>`, "intro");
    p.querySelector("#dgo").addEventListener("click", () => {
      gm.phase = "play"; save(); closePanel(); updateHUD(); R.sync();
      if (!R.elevator) return sfx("day");
      mode = "busy"; R.elevator("up").then(() => { mode = "walk"; sfx("day"); });
    });
  }

  // 선배 중 누구라도 나와 같은 선택을 했는지 (정답이 아니라 '같은 판단을 한 선배'가 있는지)
  const sameSr = (h) => { const c = findCard(h.cardId); return c ? c.feedback.filter((f) => f.pick === h.choice) : []; };
  function showRetro() {
    const gm = g(), d = DAYS[gm.day - 1], r = RETRO[gm.day] || RETRO[DAYS.length];
    const todays = gm.history.filter((h) => h.day === gm.day && findCard(h.cardId)), match = todays.filter((h) => sameSr(h).length).length;
    const revealed = gm.revealed[gm.day];
    const asks = todays.map((h) => findCard(h.cardId)).filter((c) => c.ask && c.ask.length);
    updateHUD();
    const p = panel(`
      <span class="tag amber">🌙 퇴근 회고 · ${d.label}</span>
      <h2 style="margin-top:10px">오늘 하루 수고했어요</h2>
      <p class="muted small">오늘 ${todays.length}개 상황 중 ${match}개에서 나와 같은 판단을 한 선배가 있었어요.</p>
      <label>✏️ ${esc(r.q)}</label>
      <textarea id="rt" placeholder="나라면…" ${revealed ? "disabled" : ""}>${esc(gm.retro[gm.day] || "")}</textarea>
      ${revealed ? `<div class="ask-box"><strong>📝 사수에게 들고 갈 질문</strong><p class="muted small">게임에서 겪은 상황을 실제 회사에서 확인해 보세요. 사수님께 이렇게 여쭤보면 돼요.</p>
          ${asks.map((c) => `<div class="ask-card"><span class="tag gray">${esc(c.category)}</span> <b>${esc(c.title)}</b><ul>${c.ask.map((q) => `<li>Q. ${esc(q)}</li>`).join("")}</ul></div>`).join("") || '<p class="muted small">오늘은 들고 갈 질문이 없어요.</p>'}
          <button class="btn soft" id="rcopy">📋 질문 복사하기</button></div>
        <div class="row" style="justify-content:flex-end;margin-top:8px"><button class="btn" id="rnext">${gm.day >= DAYS.length ? "🏁 수습 종료 · 엔딩 보기" : "집에 가서 쉬기 →"}</button></div>`
      : `<div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" id="rrev">작성하고 사수에게 들고 갈 질문 보기</button></div>`}`, "night");
    if (!revealed) p.querySelector("#rrev").addEventListener("click", () => {
      const t = p.querySelector("#rt").value.trim();
      if (t.length < 5) return toast("한두 문장이라도 적어보세요 ✍️");
      gm.retro[gm.day] = t; gm.revealed[gm.day] = true; save(); sfx("select"); giveItem("notebook"); showRetro();
    });
    else {
      p.querySelector("#rcopy").addEventListener("click", () => {
        const txt = asks.map((c) => `[${c.title}]\n` + c.ask.map((q) => `Q. ${q}`).join("\n")).join("\n\n");
        try { navigator.clipboard.writeText(txt).then(() => toast("질문을 복사했어요 📋"), () => toast("복사가 안 됐어요. 직접 적어 두세요")); } catch (e) { toast("복사가 안 됐어요. 직접 적어 두세요"); }
      });
      p.querySelector("#rnext").addEventListener("click", () => {
        if (typeof HB_DAY_ITEM !== "undefined" && HB_DAY_ITEM[gm.day - 1]) giveItem(HB_DAY_ITEM[gm.day - 1]);
        if (gm.day >= DAYS.length) { gm.phase = "ending"; save(); R.sync(); return showEnding(); }
        gm.day++; gm.idx = 0; gm.gauges.hp = clamp(gm.gauges.hp + 10); gm.phase = "dayIntro"; save();
        toast("🔋 푹 쉬고 왔어요. 체력 +10"); updateHUD(); showDayIntro();
      });
    }
  }

  function showEnding() {
    const gm = g(), e = endingOf(gm);
    if (!gm.counted) {
      gm.counted = true; S.stats.endings[e.key] = (S.stats.endings[e.key] || 0) + 1;
      if (!e.fail) S.stats.completed++; save();
      sfx(e.fail ? "bad" : "end");
    }
    updateHUD();
    const H = gm.history.filter((h) => findCard(h.cardId));
    const match = H.filter((h) => sameSr(h).length).length;
    const pctM = H.length ? Math.round((match / H.length) * 100) : 0;
    // 상황별 게이지 변화 (예전 기록은 선택지 효과로 계산)
    const dOf = (h) => h.delta || Object.fromEntries(GAUGES.map((x, k) => [x.key, findCard(h.cardId).choices[h.choice].effects[k] || 0]));
    const tot = Object.fromEntries(GAUGES.map((x) => [x.key, H.reduce((a, h) => a + (dOf(h)[x.key] || 0), 0)]));
    const ranked = GAUGES.slice().sort((a, b) => tot[b.key] - tot[a.key]), up = ranked[0], low = ranked[ranked.length - 1];
    const chips = (d) => GAUGES.filter((x) => d[x.key]).map((x) => `<span class="rp-chip ${d[x.key] > 0 ? "up" : "dn"}">${x.icon} ${x.label} ${d[x.key] > 0 ? "+" : ""}${d[x.key]}</span>`).join("") || `<span class="rp-chip">변화 없음</span>`;
    const days = DAYS.map((d) => ({ d, items: H.filter((h) => h.day === d.day) })).filter((x) => x.items.length);
    const missed = H.filter((h) => h.choice !== h.best).map((h) => findCard(h.cardId));
    const lessons = (missed.length ? missed : H.map((h) => findCard(h.cardId))).filter((c) => c.insight).slice(0, 3);
    // 100일 완주 보상 + 아이템 도감
    let capeNew = false;
    if (!e.fail) { gm.items = gm.items || []; if (!gm.items.includes("cape")) { gm.items.push("cape"); save(); capeNew = hbItemGive("cape"); if (typeof toParent === "function") toParent({ type: "item", id: "cape", isNew: capeNew }); } }
    const own = typeof hbItemsOwned === "function" ? hbItemsOwned() : [], runItems = gm.items || [];
    const itemsHTML = typeof HB_ITEMS === "undefined" ? "" : `<h3 class="rp-h3">🎁 이번 100일에 모은 아이템 <span class="muted small">${runItems.length} / ${HB_ITEMS.length} · 도감 전체 ${own.length} / ${HB_ITEMS.length}</span></h3>
      <div class="rp-items">${HB_ITEMS.map((it) => { const got = runItems.includes(it.id), has = own.includes(it.id), tr = HB_TIER[it.tier] || ["", "#888"];
        const st = got ? "" : has ? " past" : " locked";
        return `<div class="rp-item${st}"><div class="rp-item-pic" style="background:${look().bg || "#eef3fc"}">${itemPic(it, 56)}</div>
          <b>${has ? esc(it.n) : "???"}</b><small style="color:${tr[1]}">${tr[0]}${it.id === "cape" && capeNew ? " · NEW" : ""}</small><em>${got ? esc(it.desc) : has ? "이전 판에서 획득 · 이번엔 못 모았어요" : esc(it.tier === "hidden" ? "숨은 아이템 · 사무실을 둘러보세요" : it.how)}</em></div>`; }).join("")}</div>`;
    const confetti = e.fail ? "" : `<div class="confetti">${Array.from({ length: 36 }, (_, i) =>
      `<i style="left:${(i * 97) % 100}%;background:${["#e8a33d", "#3f8a68", "#5b8def", "#f29bb5", "#f7c548"][i % 5]};animation-delay:${(i % 12) * 0.12}s;animation-duration:${2.2 + (i % 5) * 0.35}s"></i>`).join("")}</div>`;
    const p = panel(`
      ${confetti}
      <div class="ending-card ${e.fail ? "fail" : ""}">
        ${R.portrait(look(), 88)}
        <div class="emoji">${e.emoji}</div>
        <div style="opacity:.85">${esc(gm.name)}의 ${e.fail ? DAYS[gm.day - 1].label + "에서 멈춘 기록" : "100일 성장 유형"}</div>
        <h1>${e.title}</h1><p style="opacity:.92;margin:0">${e.desc}</p>
      </div>

      <div class="rp-head"><h2>📋 ${esc(gm.name)}의 100일 정리</h2><span class="muted small">${days.length}일 · 상황 ${H.length}개</span></div>
      <div class="rp-sum">
        <div><span>나와 같은 판단을 한 선배가 있던 상황</span><b>${match} / ${H.length}</b><small>정답률이 아니에요</small></div>
        <div><span>가장 많이 성장한 역량</span><b>${up.icon} ${up.label}</b><small>${tot[up.key] >= 0 ? "+" : ""}${tot[up.key]}</small></div>
        <div><span>더 신경 쓰면 좋을 역량</span><b>${low.icon} ${low.label}</b><small>${tot[low.key] >= 0 ? "+" : ""}${tot[low.key]}</small></div>
      </div>
      <div class="rp-gauges">${GAUGES.map((x) => `<div class="rp-g"><span>${x.icon} ${x.label}</span><div class="rp-bar"><i style="width:${gm.gauges[x.key]}%;background:${GCOLOR[x.key]}"></i></div><b>${gm.gauges[x.key]}</b><small>${START_GAUGES[x.key]}에서 ${gm.gauges[x.key] - START_GAUGES[x.key] >= 0 ? "+" : ""}${gm.gauges[x.key] - START_GAUGES[x.key]}</small></div>`).join("")}</div>

      <h3 class="rp-h3">🗂️ 내가 겪은 상황</h3>
      ${days.map(({ d, items }) => `<section class="rp-day">
        <div class="rp-day-h"><span class="tag">${d.label}</span><b>${esc(d.title)}</b></div>
        <ol class="rp-list">${items.map((h) => {
          const c = findCard(h.cardId), sr = sameSr(h), same = sr.length > 0;
          return `<li class="rp-it ${same ? "ok" : "diff"}">
            <div class="rp-it-h"><span class="tag gray">${esc(c.category)}</span><b>${esc(c.title)}</b><span class="rp-mark">${same ? "✓ " + sr.map((f) => (SENIORS[f.senior] || {}).name || "").join(", ") + "와 같은 판단" : "△ 선배들이 고르지 않은 선택"}</span></div>
            <p class="rp-mine"><em>내 선택</em>${esc(c.choices[h.choice].text)}</p>
            ${same ? "" : `<p class="rp-best"><em>선배들은</em>${esc([...new Set(c.feedback.map((f) => f.pick))].map((k) => c.choices[k].text).join(" / "))}</p>`}
            <div class="rp-chips">${chips(dOf(h))}</div>
          </li>`;
        }).join("")}</ol>
        ${gm.retro[d.day] ? `<p class="rp-retro"><em>📔 퇴근 회고</em>${esc(gm.retro[d.day])}</p>` : ""}
      </section>`).join("")}

      ${(() => { const cs = H.map((h) => findCard(h.cardId)).filter((c) => c.ask && c.ask.length); return cs.length ? `<h3 class="rp-h3">📝 사수에게 들고 갈 질문</h3><div class="rp-asks">${cs.map((c) => `<div><b>${esc(c.title)}</b>${c.goal ? `<small>연습한 판단 · ${esc(c.goal)}</small>` : ""}<ul>${c.ask.map((q) => `<li>Q. ${esc(q)}</li>`).join("")}</ul></div>`).join("")}</div>` : ""; })()}
      ${itemsHTML}
      ${lessons.length ? `<div class="insight rp-lessons"><strong>💡 다음에 기억할 것</strong><ol>${lessons.map((c) => `<li><b>${esc(c.title)}</b> — ${esc(c.insight)}</li>`).join("")}</ol></div>` : ""}
      ${e.fail ? `<div class="insight"><strong>다시 도전할 때 팁</strong><br/>${esc(failTip(gm.failKey))}</div>` : ""}
      <div class="row rp-actions" style="margin-top:14px">
        <button class="btn" id="eprint">📄 정리본 저장 (PDF)</button>
        <button class="btn soft" id="eshare">📣 동기 피드에 공유</button>
        <button class="btn soft" id="esenior">✍️ 다음 신입에게 경험 남기기</button>
        <button class="btn ghost" id="eagain">↺ 처음부터 다시</button>
      </div>`, "night report");
    p.querySelector("#eprint").addEventListener("click", () => window.print());
    p.querySelector("#eshare").addEventListener("click", () => {
      hbShare(`${e.emoji} 100일 생존기 결과: [${e.title}] 나왔어! 선배들과 같은 선택 ${match}/${gm.history.length}개. 너희는?`);
      p.querySelector("#eshare").disabled = true;
    });
    p.querySelector("#esenior").addEventListener("click", () => { go("senior"); });
    p.querySelector("#eagain").addEventListener("click", () => { hbRestart(); });
  }

  return {
    keys, shell, attach, press, updateHUD, sfx, giveItem,
    get mode() { return mode; },
  };
})();
