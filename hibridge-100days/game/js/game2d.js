// =============================================================
// 신입 100일 생존기 — 2D 탑뷰 렌더러 (WebGL이 없는 PC용 · 미니맵 배경)
// 진행 로직은 story.js, 배치 데이터는 world.js
// =============================================================
const T = 32, COLS = 30, ROWS = 18, GW = COLS * T, GH = ROWS * T;

// =============================================================
// 픽셀 캐릭터 그리기
// =============================================================
function drawPerson(c, x, y, look, dir, frame, bob) {
  const P = 2, ox = Math.round(x - 6 * P), oy = Math.round(y - 18 * P + (bob || 0));
  const r = (px, py, w, h, col) => { c.fillStyle = col; c.fillRect(ox + px * P, oy + py * P, w * P, h * P); };
  c.fillStyle = "rgba(0,0,0,.18)"; c.beginPath(); c.ellipse(x, y - 1, 9, 3.5, 0, 0, Math.PI * 2); c.fill();
  // 다리
  const lUp = frame === 1 ? 1 : 0, rUp = frame === 2 ? 1 : 0;
  r(3, 14, 2, 4 - lUp, look.pants); r(7, 14, 2, 4 - rUp, look.pants);
  r(3, 17 - lUp, 2, 1, "#23232b"); r(7, 17 - rUp, 2, 1, "#23232b");
  // 몸통 & 팔
  r(2, 8, 8, 6, look.shirt);
  if (dir === "left" || dir === "right") {
    const swing = frame === 1 ? -1 : frame === 2 ? 1 : 0;
    r(5 + swing, 9, 2, 4, shade(look.shirt)); r(5 + swing, 13, 2, 1, look.skin);
  } else {
    r(1, 9, 1, 4, look.shirt); r(10, 9, 1, 4, look.shirt); r(1, 13, 1, 1, look.skin); r(10, 13, 1, 1, look.skin);
    if (look.tie && dir === "down") r(5, 8, 2, 4, look.tie);
  }
  // 머리
  r(2, 1, 8, 7, look.skin);
  const h = look.hair;
  if (look.style === "long") {
    if (dir === "up") r(1, 0, 10, 10, h);
    else { r(1, 0, 10, 3, h); r(1, 3, 1, 7, h); r(10, 3, 1, 7, h); if (dir === "left") r(6, 3, 5, 5, h); if (dir === "right") r(1, 3, 5, 5, h); }
  } else {
    if (dir === "up") r(2, 0, 8, 7, h);
    else { r(2, 0, 8, 3, h); if (dir === "down") { r(2, 3, 1, 2, h); r(9, 3, 1, 2, h); } if (dir === "left") r(7, 3, 3, 3, h); if (dir === "right") r(2, 3, 3, 3, h); }
    if (look.style === "bun") r(4, -2, 4, 2, h);
  }
  // 눈 · 안경
  const eye = "#1d1d24";
  if (dir === "down") { r(4, 4, 1, 2, eye); r(7, 4, 1, 2, eye); r(5, 6, 2, 1, "#e0a08a"); }
  if (dir === "left") r(3, 4, 1, 2, eye);
  if (dir === "right") r(8, 4, 1, 2, eye);
  if (look.glasses && dir !== "up") {
    c.strokeStyle = "#2b2b33"; c.lineWidth = 1;
    if (dir === "down") { c.strokeRect(ox + 3 * P + 0.5, oy + 3 * P + 0.5, 3 * P - 1, 3 * P - 1); c.strokeRect(ox + 6 * P + 0.5, oy + 3 * P + 0.5, 3 * P - 1, 3 * P - 1); }
    else { const gx = dir === "left" ? 2 : 7; c.strokeRect(ox + gx * P + 0.5, oy + 3 * P + 0.5, 3 * P - 1, 3 * P - 1); }
  }
}
function shade(hex) {
  const n = parseInt(hex.slice(1), 16), f = 0.82;
  return "rgb(" + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * f)).join(",") + ")";
}
function portrait(look, size) {
  const c = document.createElement("canvas"); c.width = c.height = 40;
  const x = c.getContext("2d"); x.imageSmoothingEnabled = false;
  x.fillStyle = "#e9efe9"; x.fillRect(0, 0, 40, 40);
  x.save(); x.translate(20, 46); x.scale(1.5, 1.5); drawPerson(x, 0, 0, look, "down", 0); x.restore();
  return `<img class="portrait" src="${c.toDataURL()}" width="${size || 48}" height="${size || 48}" alt="" />`;
}

// =============================================================
// 배경 (한 번만 그려서 캐시)
// =============================================================
let BG = null;
function buildBG() {
  const cv = document.createElement("canvas"); cv.width = GW; cv.height = GH;
  const c = cv.getContext("2d");
  const rect = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x * T, y * T, w * T, h * T); };
  const px = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };

  // 바닥
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    let a = "#e4dfd3", b = "#ddd7ca";
    if (x >= 1 && x <= 8 && y >= 2 && y <= 7) { a = "#d6e4ea"; b = "#cddce3"; }
    else if (x >= 20 && x <= 28 && y >= 10 && y <= 16) { a = "#d4ad80"; b = "#cba274"; }
    else if (x >= 21 && x <= 28 && y >= 2 && y <= 5) { a = "#dcd6e6"; b = "#d5cee0"; }
    rect(x, y, 1, 1, (x + y) % 2 ? a : b);
    if (x >= 20 && x <= 28 && y >= 10 && y <= 16) px(x * T, y * T + 15, T, 2, "rgba(120,80,40,.18)");
  }
  // 러그
  c.fillStyle = "#b7cfc0"; c.fillRect(21.6 * T, 12.4 * T, 3.8 * T, 3 * T);
  c.strokeStyle = "#9cbaa8"; c.lineWidth = 3; c.strokeRect(21.75 * T, 12.55 * T, 3.5 * T, 2.7 * T);

  // 벽
  rect(0, 0, 30, 1, "#3d4250"); rect(0, 1, 30, 1, "#efe9dc"); px(0, 2 * T - 5, GW, 5, "#bfb7a6");
  rect(0, 0, 1, 18, "#3d4250"); rect(29, 0, 1, 18, "#3d4250"); rect(0, 17, 30, 1, "#3d4250");
  // 창문
  [11, 15, 26].forEach((wx) => {
    px(wx * T, T + 4, T * 2, T - 12, "#8a7f6b"); px(wx * T + 3, T + 7, T * 2 - 6, T - 18, "#bfe0f2");
    px(wx * T + T - 1, T + 7, 2, T - 18, "#8a7f6b");
  });
  // 표지판
  const sign = (x, text) => {
    px(x * T - 30, T + 6, 60, 18, "#2f6b4f"); c.fillStyle = "#fff"; c.font = "bold 11px Galmuri11, Pretendard, sans-serif";
    c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(text, x * T, T + 15.5);
  };
  sign(4.5, "회의실"); sign(14, "인사팀"); sign(23, "팀장석");
  // 출입문
  px(2 * T, 17 * T, 2 * T, T, "#8a6440"); px(2 * T + 4, 17 * T + 4, T - 6, T - 8, "#b98b5e"); px(3 * T + 2, 17 * T + 4, T - 6, T - 8, "#b98b5e");
  px(2 * T + 10, 17 * T + 8, 10, 10, "#cfe8f5"); px(3 * T + 8, 17 * T + 8, 10, 10, "#cfe8f5");
  c.fillStyle = "#3d4250"; c.font = "bold 11px Galmuri11, Pretendard, sans-serif"; c.textAlign = "center"; c.fillText("▼ 출입문", 3 * T, 17 * T - 6);

  // 회의실 테이블 & 의자
  for (let i = 0; i < 4; i++) {
    roundRect(c, (3.15 + i) * T, 3.35 * T, 0.7 * T, 0.55 * T, 6, "#3f4656");
    roundRect(c, (3.15 + i) * T, 6.1 * T, 0.7 * T, 0.55 * T, 6, "#3f4656");
  }
  roundRect(c, 3 * T, 4 * T, 4 * T, 2 * T, 8, "#f3f1ea"); roundRect(c, 3 * T + 4, 4 * T + 4, 4 * T - 8, 2 * T - 8, 6, "#fbfaf6");
  px(4.6 * T, 4.7 * T, 26, 18, "#3d4250"); px(4.6 * T + 3, 4.7 * T + 3, 20, 12, "#7fb3d5");
  // 회의실 유리벽
  c.fillStyle = "rgba(150,200,230,.55)"; c.fillRect(9 * T, 2 * T, 8, 6.25 * T); c.fillRect(1 * T, 8 * T, 4 * T, 8); c.fillRect(6 * T, 8 * T, 3.25 * T, 8);
  c.fillStyle = "rgba(255,255,255,.7)"; c.fillRect(9 * T + 2, 2 * T, 2, 6.25 * T); c.fillRect(1 * T, 8 * T + 2, 4 * T, 2); c.fillRect(6 * T, 8 * T + 2, 3.25 * T, 2);

  // 인사팀 의자 (북쪽/남쪽)
  [11.5, 12.5, 13.5, 14.5, 15.5, 16.5, 17.5, 18.5].forEach((cx) => {
    roundRect(c, cx * T - 10, 6.25 * T, 20, 18, 6, "#4b5263");
    roundRect(c, cx * T - 10, 9.15 * T, 20, 18, 6, "#4b5263");
  });
  // 팀장 의자
  roundRect(c, 24.5 * T - 12, 2.55 * T, 24, 20, 6, "#2d3446");

  // 복합기 & 정수기
  px(19 * T, 2 * T, 2 * T, 0.9 * T, "#c9ccd1"); px(19 * T + 4, 2 * T + 4, 2 * T - 8, 8, "#8d939c"); px(19 * T + 8, 2 * T + 18, 20, 4, "#3fb37f");
  px(20.1 * T, 7.2 * T, 0.8 * T, 0.7 * T, "#dfe7ee"); px(20.1 * T + 6, 7.2 * T - 10, 0.8 * T - 12, 12, "#9fd3f0");
  // 라운지 카운터 & 커피머신
  px(28 * T, 10 * T, T, 3.5 * T, "#8a6440"); px(28 * T + 3, 10 * T, T - 3, 3.5 * T - 4, "#b98b5e");
  px(28 * T + 4, 11.1 * T, 22, 26, "#3d4250"); px(28 * T + 8, 11.1 * T + 6, 14, 6, "#e86a5c"); px(28 * T + 10, 11.1 * T + 18, 10, 6, "#fff");
  // 라운지 테이블 & 소파
  c.fillStyle = "#f3f1ea"; c.beginPath(); c.ellipse(23.7 * T, 13.5 * T, 0.8 * T, 0.6 * T, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#e86a5c"; c.fillRect(23.5 * T, 13.3 * T, 10, 10);
  roundRect(c, 21 * T, 16 * T, 3 * T, T, 8, "#4f7cac"); roundRect(c, 21 * T + 4, 16 * T + 4, 3 * T - 8, T - 12, 6, "#6b97c6");
  // 게시판
  px(20.6 * T, 10.4 * T, T, 0.9 * T, "#8a6440"); px(20.6 * T + 3, 10.4 * T + 3, T - 6, 0.9 * T - 6, "#e9d6b0");
  ["#f7c548", "#f29bb5", "#7bc8a4"].forEach((col, i) => px(20.6 * T + 5 + i * 8, 10.4 * T + 6 + (i % 2) * 6, 7, 7, col));
  px(20.6 * T + 4, 11.3 * T, 3, 8, "#6b4a2e"); px(21.6 * T - 7, 11.3 * T, 3, 8, "#6b4a2e");
  // 화분
  [[10, 2.5], [28, 6.6], [1.6, 15.9], [19.6, 15.9]].forEach(([x, y]) => plant(c, x * T, y * T));
  // 바닥 라벨
  c.fillStyle = "rgba(90,60,30,.25)"; c.font = "bold 14px Galmuri11, Pretendard, sans-serif"; c.textAlign = "center";
  c.fillText("라 운 지", 24.5 * T, 10.75 * T);
  BG = cv;
}
function roundRect(c, x, y, w, h, r, col) {
  c.fillStyle = col; c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); c.fill();
}
function plant(c, x, y) {
  c.fillStyle = "#b5653f"; c.fillRect(x - 9, y, 18, 14);
  c.fillStyle = "#3f8a52"; [[-8, -6], [0, -12], [8, -6], [-4, -2], [4, -2]].forEach(([dx, dy]) => { c.beginPath(); c.arc(x + dx, y + dy, 7, 0, Math.PI * 2); c.fill(); });
  c.fillStyle = "#5fae6e"; c.beginPath(); c.arc(x - 2, y - 10, 4, 0, Math.PI * 2); c.fill();
}
// y-정렬로 그리는 가구 (캐릭터 앞/뒤 표현)
const PROPS = [
  { sortY: 9 * T, draw(c) { // 인사팀 책상
    roundRect(c, 11 * T, 7 * T, 8 * T, 2 * T, 6, "#8a6440"); roundRect(c, 11 * T + 2, 7 * T + 2, 8 * T - 4, 2 * T - 8, 5, "#c99a6a");
    c.fillStyle = "rgba(0,0,0,.15)"; c.fillRect(11 * T + 4, 8 * T - 1, 8 * T - 8, 2);
    for (let i = 0; i < 8; i++) {
      const mx = (11.5 + i) * T;
      c.fillStyle = "#30343f"; c.fillRect(mx - 9, 7 * T + 8, 18, 12); c.fillStyle = "#6fa3c7"; c.fillRect(mx - 7, 7 * T + 10, 14, 7);
      c.fillStyle = "#30343f"; c.fillRect(mx - 9, 8 * T + 12, 18, 12); c.fillStyle = "#6fa3c7"; c.fillRect(mx - 7, 8 * T + 14, 14, 7);
    }
    c.fillStyle = "#f7c548"; c.fillRect(12.5 * T + 6, 8 * T + 10, 7, 7); // 내 자리 포스트잇
  } },
  { sortY: 4 * T, draw(c) { // 팀장 책상
    roundRect(c, 23 * T, 3 * T, 3 * T, T, 6, "#5a4030"); roundRect(c, 23 * T + 2, 3 * T + 2, 3 * T - 4, T - 8, 5, "#8a6440");
    c.fillStyle = "#30343f"; c.fillRect(24.5 * T - 12, 3 * T + 4, 24, 14); c.fillStyle = "#6fa3c7"; c.fillRect(24.5 * T - 10, 3 * T + 6, 20, 9);
    c.fillStyle = "#f3f1ea"; c.fillRect(23.3 * T, 3 * T + 8, 14, 10);
  } },
];


// =============================================================
// 2D 런타임
// =============================================================
const Game2D = (() => {
  let cv, ctx, wrap, raf = null, tick = 0, floats = [];
  const player = { x: 3 * T, y: 15.8 * T, dir: "up", moving: false };
  const look = () => (S.game && S.game.look) || DEFAULT_LOOK;

  const R = {
    kind: "2d",
    portrait(lk, size) { return hbPortrait(lk, size) || portrait(lk, size); },
    nearest,
    faceTo(n) {
      const dx = n.x * T - player.x, dy = n.y * T - player.y;
      player.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : dy < 0 ? "up" : "down";
    },
    onGain(delta) {
      GAUGES.forEach((x, k) => {
        if (delta[x.key]) floats.push({ x: player.x, y: player.y - 50 - k * 16,
          text: `${x.icon} ${x.label} ${delta[x.key] > 0 ? "+" : ""}${delta[x.key]}`, color: delta[x.key] > 0 ? "#2f9e6b" : "#c2453d", t: -k * 6 });
      });
    },
    shake() { wrap.classList.remove("shake"); void wrap.offsetWidth; wrap.classList.add("shake"); },
    resetPlayer() { player.x = 3 * T; player.y = 15.8 * T; player.dir = "up"; },
    onTalk() {}, onTalkEnd() {}, sync() {},
  };

  function mount(app) {
    if (!BG) buildBG();
    const stage = Story.shell(app, "2d");
    cv = document.createElement("canvas"); cv.width = GW; cv.height = GH; stage.appendChild(cv);
    ctx = cv.getContext("2d"); ctx.imageSmoothingEnabled = false;
    wrap = document.getElementById("gwrap");
    floats = [];
    Story.attach(R);
    if (!raf) raf = requestAnimationFrame(loop);
  }

  function loop() {
    if (!cv || !document.body.contains(cv)) { raf = null; return; }
    tick++;
    if (Story.mode === "walk") move();
    draw();
    raf = requestAnimationFrame(loop);
  }

  function blocked(x, y) {
    const box = [x / T - 0.25, y / T - 0.25, 0.5, 0.25];
    if (World.hit(box, SOLIDS)) return true;
    return World.hit(box, World.visibleNpcs().map((n) => [n.x - 0.3125, n.y - 0.3125, 0.625, 0.3125]));
  }
  function move() {
    const k = Story.keys;
    let dx = 0, dy = 0;
    if (k.ArrowLeft) dx -= 1; if (k.ArrowRight) dx += 1; if (k.ArrowUp) dy -= 1; if (k.ArrowDown) dy += 1;
    player.moving = !!(dx || dy);
    if (!player.moving) return;
    if (dx && dy) { dx *= 0.707; dy *= 0.707; }
    const sp = 2.6;
    if (dx) player.dir = dx < 0 ? "left" : "right"; else player.dir = dy < 0 ? "up" : "down";
    if (!blocked(player.x + dx * sp, player.y)) player.x += dx * sp;
    if (!blocked(player.x, player.y + dy * sp)) player.y += dy * sp;
  }

  function nearest() {
    let best = null, bd = 1e9;
    const consider = (o, ix, iy, range) => {
      const d = Math.hypot(player.x - ix * T, player.y - iy * T);
      if (d < range && d < bd) { bd = d; best = o; }
    };
    World.visibleNpcs().forEach((n) => consider(n, n.ix || n.x, n.iy || n.y, 46));
    OBJECTS.forEach((o) => consider(o, o.x, o.y, o.r));
    return best;
  }

  function draw() {
    const gm = S.game;
    ctx.drawImage(BG, 0, 0);
    const target = World.target();
    const ents = [];
    PROPS.forEach((p) => ents.push({ y: p.sortY, draw: () => p.draw(ctx) }));
    World.visibleNpcs().forEach((n) => {
      const bob = Math.round(Math.sin((tick + n.x * 40) / 30));
      ents.push({ y: n.y * T, draw: () => drawPerson(ctx, n.x * T, n.y * T, LOOKS[n.look], n.dir, 0, bob > 0 ? 1 : 0) });
    });
    const frame = player.moving ? [0, 1, 0, 2][Math.floor(tick / 7) % 4] : 0;
    ents.push({ y: player.y, draw: () => drawPerson(ctx, player.x, player.y, look(), player.dir, frame) });
    ents.sort((a, b) => a.y - b.y).forEach((e) => e.draw());

    ctx.font = "bold 10px Galmuri11, Pretendard, sans-serif"; ctx.textAlign = "center";
    World.visibleNpcs().forEach((n) => label(n.name, n.x * T, n.y * T - 44, n.id === target ? "#2f6b4f" : "rgba(40,44,56,.75)"));
    label(gm.name, player.x, player.y - 44, "#e8a33d");

    if (target) {
      const f = World.find(target), isNpc = !!f.look;
      bang(f.x * T, (isNpc ? f.y * T - 58 : f.y * T - 40) + Math.sin(tick / 8) * 3);
    }

    if (Story.mode === "walk") {
      const nb = nearest();
      if (nb) {
        const ix = (nb.ix || nb.x) * T, iy = nb.y * T - (nb.look ? 70 : 30);
        const txt = "Space  " + (nb.look ? "말 걸기" : nb.name);
        ctx.font = "bold 11px Galmuri11, Pretendard, sans-serif";
        const w = ctx.measureText(txt).width + 14;
        roundRect(ctx, ix - w / 2, iy - 12, w, 20, 6, "rgba(31,36,48,.88)");
        ctx.fillStyle = "#fff"; ctx.textBaseline = "middle"; ctx.fillText(txt, ix, iy - 2); ctx.textBaseline = "alphabetic";
      }
    }

    floats = floats.filter((f) => f.t < 70);
    floats.forEach((f) => {
      f.t++; if (f.t < 0) return;
      ctx.globalAlpha = Math.max(0, 1 - f.t / 70);
      ctx.font = "bold 13px Galmuri11, Pretendard, sans-serif"; ctx.textAlign = "center";
      ctx.lineWidth = 3; ctx.strokeStyle = "#fff"; ctx.strokeText(f.text, f.x, f.y - f.t * 0.6);
      ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y - f.t * 0.6); ctx.globalAlpha = 1;
    });

    const n = World.dayCards().length || 1, prog = Math.min(1, gm.idx / n);
    if (gm.phase === "retro" || gm.phase === "ending") { ctx.fillStyle = "rgba(20,24,60,.45)"; ctx.fillRect(0, 0, GW, GH); }
    else if (prog > 0) { ctx.fillStyle = `rgba(255,140,60,${prog * 0.16})`; ctx.fillRect(0, 0, GW, GH); }
  }
  function label(text, x, y, bg) {
    const w = ctx.measureText(text).width + 10;
    roundRect(ctx, x - w / 2, y - 9, w, 15, 5, bg);
    ctx.fillStyle = "#fff"; ctx.textBaseline = "middle"; ctx.fillText(text, x, y - 1.5); ctx.textBaseline = "alphabetic";
  }
  function bang(x, y) {
    roundRect(ctx, x - 10, y - 14, 20, 22, 6, "#e8a33d");
    ctx.beginPath(); ctx.moveTo(x - 4, y + 8); ctx.lineTo(x + 4, y + 8); ctx.lineTo(x, y + 14); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "bold 15px Galmuri11, Pretendard, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("!", x, y - 2); ctx.textBaseline = "alphabetic";
  }

  return { mount, drawPerson, getBG() { if (!BG) buildBG(); return BG; }, _player: player, _R: R };
})();
