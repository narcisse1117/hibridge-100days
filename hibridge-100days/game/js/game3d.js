// =============================================================
// 신입 100일 생존기 — 3D 렌더러 (Three.js r149, 외부 모델 파일 없이 코드로 생성)
// 좌표: 1 유닛 = 1 타일(약 1m). world.js의 x → X, y → Z
// =============================================================
const Game3D = (() => {
  const supported = (() => {
    try {
      if (!window.THREE) return false;
      const c = document.createElement("canvas");
      return !!(c.getContext("webgl2") || c.getContext("webgl"));
    } catch (e) { return false; }
  })();
  if (!supported) return { supported: false };
  if (THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;

  // ---------------------------------------------------------------
  // 공통 헬퍼
  // ---------------------------------------------------------------
  const MATS = {}, GEOS = {};
  const mat = (color, o) => {
    const k = color + JSON.stringify(o || {});
    return MATS[k] || (MATS[k] = new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...(o || {}) }));
  };
  const geo = (k, make) => GEOS[k] || (GEOS[k] = make());
  const UNIT_SPHERE = () => geo("sphere", () => new THREE.SphereGeometry(1, 20, 14));
  const UNIT_BOX = () => geo("box", () => new THREE.BoxGeometry(1, 1, 1));
  const UNIT_CYL = () => geo("cyl", () => new THREE.CylinderGeometry(1, 1, 1, 24));

  function addMesh(parent, g, m, x, y, z, sx, sy, sz, o) {
    const me = new THREE.Mesh(g, m);
    me.position.set(x || 0, y || 0, z || 0);
    if (sx !== undefined) me.scale.set(sx, sy, sz);
    me.castShadow = !!(o && o.cast); me.receiveShadow = !(o && o.noReceive);
    parent.add(me); return me;
  }
  // y는 바닥 기준
  const box = (p, w, h, d, color, x, y, z, o) => addMesh(p, UNIT_BOX(), typeof color === "string" ? mat(color, o && o.m) : color, x, y + h / 2, z, w, h, d, o);
  const cyl = (p, r, h, color, x, y, z, o) => addMesh(p, UNIT_CYL(), typeof color === "string" ? mat(color, o && o.m) : color, x, y + h / 2, z, r, h, r, o);
  const sph = (p, rx, ry, rz, color, x, y, z, o) => addMesh(p, UNIT_SPHERE(), typeof color === "string" ? mat(color, o && o.m) : color, x, y, z, rx, ry, rz, o);
  function rboxGeo(w, h, d, r) {
    const k = ["rb", w, h, d, r].join(",");
    return geo(k, () => {
      const s = new THREE.Shape(), x = -w / 2, y = -d / 2;
      s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
      s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
      s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r);
      s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
      const bt = Math.min(0.015, h / 4);
      const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, h - bt * 2), bevelEnabled: true, bevelThickness: bt, bevelSize: Math.min(0.015, r / 2), bevelSegments: 2, curveSegments: 6 });
      g.rotateX(-Math.PI / 2); g.translate(0, bt, 0);
      return g;
    });
  }
  const rbox = (p, w, h, d, r, color, x, y, z, o) => addMesh(p, rboxGeo(w, h, d, r), typeof color === "string" ? mat(color, o && o.m) : color, x, y, z, undefined, undefined, undefined, o);

  function canvasTex(w, h, draw) {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    draw(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
    t.userData = { canvas: c, draw };
    return t;
  }
  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  const FONT = (px, w) => `${w || 700} ${px}px Pretendard, "Malgun Gothic", sans-serif`;
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function plate(text, opt) {
    const o = { w: 512, h: 160, bg: "#004aad", fg: "#ffffff", size: 72, sub: "", ...opt };
    return canvasTex(o.w, o.h, (c, w, h) => {
      c.fillStyle = o.bg; rr(c, 0, 0, w, h, 26); c.fill();
      c.fillStyle = o.fg; c.textAlign = "center"; c.textBaseline = "middle"; c.font = FONT(o.size, 800);
      c.fillText(text, w / 2, o.sub ? h * 0.42 : h / 2);
      if (o.sub) { c.globalAlpha = 0.8; c.font = FONT(o.size * 0.42, 600); c.fillText(o.sub, w / 2, h * 0.78); }
    });
  }
  const angLerp = (a, b, t) => { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; };

  // ---------------------------------------------------------------
  // 캐릭터 (관절형 휴머노이드)
  // ---------------------------------------------------------------

  // ---- 꾸민 브리 (신입 = 나). 사람 캐릭터와 같은 userData 구조로 맞춰 animate()를 그대로 쓴다 ----
  function makeBri(L) {
    const root = new THREE.Group(), body = new THREE.Group(), C = { cast: true };
    const K = 0.62; root.add(body);
    const sizer = new THREE.Group(); sizer.scale.set(K, K, K); body.add(sizer);
    const inner = new THREE.Group(); inner.position.y = 0.08; sizer.add(inner);
    const col = L.c || "#004aad", bm = mat(col, { roughness: 0.42 });
    const dk = (() => { const n = parseInt(col.slice(1), 16), f = (v) => Math.round(v * 0.72); return "#" + ((1 << 24) | (f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).slice(1); })();
    // 펭귄처럼 둥근 몸통: 옆에서 보면 달걀형 (회전체 + 앞뒤로 살짝 납작)
    const PROF = [[0.16, 0], [0.165, 0.2], [0.18, 0.36], [0.22, 0.48], [0.3, 0.57], [0.42, 0.63], [0.6, 0.655], [0.78, 0.65]];
    for (let i = 1; i <= 14; i++) { const t = (i / 14) * Math.PI / 2; PROF.push([0.92 + 0.645 * Math.sin(t), 0.645 * Math.cos(t)]); }
    PROF.splice(8, 0, [0.9, 0.646]);
    const ZS = 0.84;
    const rAt = (y) => { if (y <= PROF[0][0]) return PROF[0][1]; for (let i = 1; i < PROF.length; i++) { const [y1, r1] = PROF[i], [y0, r0] = PROF[i - 1]; if (y <= y1) return r0 + (r1 - r0) * (y - y0) / (y1 - y0); } return 0; };
    const zAt = (x, y) => ZS * Math.sqrt(Math.max(0, rAt(y) ** 2 - x * x));
    const bodyGeo = geo("bribody-peng", () => new THREE.LatheGeometry(PROF.map(([y, r]) => new THREE.Vector2(r, y)), 48));
    addMesh(inner, bodyGeo, bm, 0, 0, 0, 1, 1, ZS, C);
    // 다리(아래 아치 사이) + 펭귄 발
    [-1, 1].forEach((sd) => {
      sph(inner, 0.17, 0.17, 0.15, bm, 0.27 * sd, 0.15, 0.0, C);
      sph(inner, 0.12, 0.045, 0.19, mat(dk, { roughness: 0.5 }), 0.27 * sd, 0.03, 0.1, C);
    });
    const white = mat("#ffffff", { roughness: 0.3 }), dark = mat("#0b1a3a", { roughness: 0.3 });
    const onFace = (m, x, y) => { m.rotation.y = Math.atan2(x, Math.max(0.05, zAt(x, y))) ; return m; };
    const flat = (m, x, y, d, sx, sy, sz, p) => onFace(addMesh(p || inner, UNIT_SPHERE(), m, x, y, zAt(x, y) + d, sx, sy, sz), x, y);
    const arc = (r, t, m, x, y, d, p, rz) => { const a = addMesh(p || inner, geo("arc" + r + t, () => new THREE.TorusGeometry(r, t, 8, 28, Math.PI)), m, x, y, zAt(x, y) + d); onFace(a, x, y); if (rz) a.rotation.z = rz; return a; };
    const eo = new THREE.Group(), es = new THREE.Group(); inner.add(eo); inner.add(es); es.visible = false;
    const k = L.eyes === "sparkle" ? 1.15 : L.eyes === "calm" ? 0.85 : 1;
    [-1, 1].forEach((sd) => {
      const ex = 0.2 * sd, wink = L.eyes === "wink" && sd === 1;
      if (L.eyes === "smile" || wink) arc(0.1, 0.028, white, ex, 0.88, 0.0, eo);
      else { flat(white, ex, 0.92, -0.005, 0.12 * k, 0.14 * k, 0.03, eo); flat(dark, ex + 0.02, 0.89, 0.015, 0.07 * k, 0.07 * k, 0.02, eo); flat(white, ex + 0.05, 0.93, 0.03, 0.026, 0.026, 0.01, eo); }
      arc(0.1, 0.028, white, ex, 0.88, 0.0, es);
    });
    if (L.cheek !== "none") [-1, 1].forEach((sd) => flat(mat(L.cheek || "#ff8fab", { roughness: 0.6, transparent: true, opacity: 0.85 }), 0.36 * sd, 0.7, -0.008, 0.09, 0.055, 0.02));
    if (L.mouth === "open") addMesh(inner, geo("brimouth", () => new THREE.CircleGeometry(0.1, 24, Math.PI, Math.PI)), mat("#0b1a3a", { side: THREE.DoubleSide }), 0, 0.72, zAt(0, 0.72) + 0.006);
    else if (L.mouth === "cat") { arc(0.045, 0.016, white, -0.045, 0.71, 0.0, inner, Math.PI); arc(0.045, 0.016, white, 0.045, 0.71, 0.0, inner, Math.PI); }
    else if (L.mouth === "o") flat(dark, 0, 0.67, -0.005, 0.05, 0.06, 0.02);
    else arc(0.09, 0.02, white, 0, 0.71, 0.0, inner, Math.PI);
    // 날개 같은 팔 (납작한 지느러미)
    const arm = (sd) => {
      const p = new THREE.Group(); p.position.set((rAt(0.7) - 0.02) * sd, 0.7, 0); inner.add(p);
      sph(p, 0.075, 0.22, 0.13, bm, 0.02 * sd, -0.17, 0, C);
      const hand = new THREE.Group(); hand.position.y = -0.36; p.add(hand); return { p, hand };
    };
    const aL = arm(-1), aR = arm(1);
    const acc = (c, o) => mat(c, { roughness: 0.5, ...(o || {}) }); let dot = null;
    if (L.top === "dot" || L.top === "ribbon" || !L.top) dot = sph(inner, 0.11, 0.11, 0.11, acc("#ffb400", { emissive: "#7a4a00", emissiveIntensity: 0.3 }), 0, 1.82, 0);
    if (L.top === "ribbon") { [-1, 1].forEach((sd) => { const c = addMesh(inner, geo("bricone", () => new THREE.ConeGeometry(0.09, 0.2, 16)), acc("#ff8fab"), 0.38 + sd * 0.1, 1.36, 0); c.rotation.z = sd * Math.PI / 2; }); sph(inner, 0.05, 0.05, 0.05, "#ff6f91", 0.38, 1.36, 0); }
    if (L.top === "sprout") { cyl(inner, 0.015, 0.16, "#2b8a6e", 0, 1.56, 0); [-1, 1].forEach((sd) => { flat(acc("#3fb37f"), 0.09 * sd, 1.76, 0, 0.1, 0.04, 0.06).rotation.z = -0.5 * sd; }); }
    if (L.top === "cap") { addMesh(inner, geo("bricap", () => new THREE.SphereGeometry(0.68, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2)), acc("#0b1a3a"), 0, 0.95, 0, 1, 0.93, 0.86, C); box(inner, 0.72, 0.04, 0.42, "#0b1a3a", 0, 0.96, 0.62).rotation.x = 0.12; sph(inner, 0.05, 0.05, 0.05, "#ffb400", 0, 1.59, 0); }
    if (L.top === "crown") { addMesh(inner, geo("bricrown", () => new THREE.CylinderGeometry(0.26, 0.3, 0.2, 10, 1, true)), acc("#ffc83d", { side: THREE.DoubleSide, metalness: 0.4 }), 0, 1.6, 0); for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; addMesh(inner, geo("bricone2", () => new THREE.ConeGeometry(0.05, 0.14, 10)), acc("#ffc83d", { metalness: 0.4 }), Math.sin(a) * 0.26, 1.77, Math.cos(a) * 0.26); } }
    if (L.face === "glasses") { [-1, 1].forEach((sd) => onFace(addMesh(inner, geo("briglass", () => new THREE.TorusGeometry(0.15, 0.02, 8, 32)), dark, 0.2 * sd, 0.92, zAt(0.2, 0.92) + 0.03), 0.2 * sd, 0.92)); }
    if (L.face === "sunglasses") { [-1, 1].forEach((sd) => flat(dark, 0.2 * sd, 0.92, 0.03, 0.15, 0.12, 0.03)); }
    if (L.face === "star") flat(acc("#ffd54d"), 0.4, 0.58, 0.0, 0.06, 0.06, 0.02);
    if (L.neck === "tie" || L.neck === undefined) { const t = new THREE.Shape(); t.moveTo(-0.06, 0); t.lineTo(0.06, 0); t.lineTo(0.08, -0.06); t.lineTo(0, -0.3); t.lineTo(-0.08, -0.06); t.lineTo(-0.06, 0); const tie = addMesh(inner, geo("britie", () => new THREE.ExtrudeGeometry(t, { depth: 0.03, bevelEnabled: false })), acc("#ffb400"), 0, 0.56, zAt(0, 0.56) - 0.012); tie.rotation.x = 0.22; }
    if (L.neck === "badge") { box(inner, 0.22, 0.28, 0.025, "#ffffff", 0, 0.24, zAt(0, 0.38) + 0.01); box(inner, 0.14, 0.04, 0.01, "#004aad", 0, 0.44, zAt(0, 0.45) + 0.025); }
    if (L.neck === "bowtie") { [-1, 1].forEach((sd) => { const c = addMesh(inner, geo("bricone3", () => new THREE.ConeGeometry(0.08, 0.16, 16)), acc("#ff6f91"), 0.08 * sd, 0.52, zAt(0, 0.52) + 0.03); c.rotation.z = -sd * Math.PI / 2; }); }
    if (L.neck === "scarf") { const sc = addMesh(inner, geo("briscarf", () => new THREE.TorusGeometry(0.62, 0.08, 12, 48)), acc("#ff6f61"), 0, 0.58, 0); sc.rotation.x = Math.PI / 2; sc.scale.set(1.08, 0.92, 1); }
    if (L.ear === "headset") { addMesh(inner, geo("brihs", () => new THREE.TorusGeometry(0.66, 0.04, 8, 40, Math.PI)), dark, 0, 0.94, 0); [-1, 1].forEach((sd) => { const c = cyl(inner, 0.12, 0.1, "#0b1a3a", 0.66 * sd, 0.89, 0); c.rotation.z = Math.PI / 2; }); }
    if (L.ear === "earmuff") { addMesh(inner, geo("briem", () => new THREE.TorusGeometry(0.66, 0.035, 8, 40, Math.PI)), acc("#ff8fab"), 0, 0.94, 0); [-1, 1].forEach((sd) => sph(inner, 0.15, 0.15, 0.15, "#ffffff", 0.67 * sd, 0.94, 0)); }
    const phone = box(aR.hand, 0.07, 0.15, 0.03, "#1c2333", 0, -0.1, 0.09); phone.visible = false;
    const paper = box(inner, 0.36, 0.46, 0.012, "#ffffff", 0, 0.28, 0.7); paper.visible = false; box(paper, 0.6, 0.04, 0.5, "#e05555", 0, 0.1, 0.6);
    const D = () => new THREE.Group();
    const hips = D(), head = D(), elL = D(), elR = D(), legL = D(), legR = D(), knL = D(), knR = D();
    hips.position.y = 0.82; root.add(hips, head, elL, elR, legL, legR, knL, knR);
    root.userData = { hips, torso: body, head, armL: aL.p, armR: aR.p, elL, elR, handR: aR.hand, legL, legR, knL, knR, phase: 0, bri: body, eo, es, dot, phone, paper, armLp: aL.p, armRp: aR.p };
    return root;
  }
  function makeChar(look, extra) {
    if (look && look.bri) return makeBri(look.bri);
    const skin = mat(look.skin, { roughness: 0.55 }), hairM = mat(look.hair, { roughness: 0.85 });
    const shirtM = mat(look.shirt, { roughness: 0.85 }), pantsM = mat(look.pants, { roughness: 0.85 });
    const shoeM = mat("#24242b", { roughness: 0.45 }), eyeM = mat("#1b1b22", { roughness: 0.25 });
    const S1 = UNIT_SPHERE(), C = { cast: true };
    const root = new THREE.Group();
    const hips = new THREE.Group(); hips.position.y = 0.82; root.add(hips);

    sph(hips, 0.2, 0.15, 0.15, pantsM, 0, 0.0, 0, C);
    const torso = new THREE.Group(); hips.add(torso);
    addMesh(torso, geo("torso", () => new THREE.CapsuleGeometry(0.18, 0.26, 8, 18)), shirtM, 0, 0.33, 0, 1.15, 1, 0.78, C);
    cyl(torso, 0.065, 0.12, skin, 0, 0.6, 0, C);
    if (look.tie) {
      box(torso, 0.06, 0.26, 0.02, mat(look.tie), 0, 0.27, 0.135);
      box(torso, 0.07, 0.05, 0.03, mat(look.tie), 0, 0.5, 0.13);
      box(torso, 0.2, 0.04, 0.05, mat("#ffffff"), 0, 0.53, 0.1);
    }
    // 머리
    const head = new THREE.Group(); head.position.y = 0.86; torso.add(head);
    addMesh(head, S1, skin, 0, 0, 0, 0.18, 0.198, 0.184, C);
    sph(head, 0.035, 0.05, 0.025, skin, 0.178, 0, 0); sph(head, 0.035, 0.05, 0.025, skin, -0.178, 0, 0);
    [-1, 1].forEach((s) => {
      sph(head, 0.024, 0.032, 0.014, eyeM, s * 0.066, 0.015, 0.168);
      sph(head, 0.008, 0.008, 0.006, mat("#ffffff"), s * 0.06 + 0.006, 0.028, 0.18);
      box(head, 0.06, 0.012, 0.012, hairM, s * 0.066, 0.075, 0.165).rotation.z = s * -0.12;
      sph(head, 0.03, 0.017, 0.006, mat("#f08f8f", { transparent: true, opacity: 0.45 }), s * 0.105, -0.045, 0.152);
    });
    sph(head, 0.02, 0.026, 0.02, mat(look.skin, { roughness: 0.5 }), 0, -0.02, 0.183);
    const mouth = addMesh(head, geo("mouth", () => new THREE.TorusGeometry(0.03, 0.0065, 6, 14, Math.PI)), mat("#a65652"), 0, -0.07, 0.165);
    mouth.rotation.z = Math.PI;
    // 머리카락
    const cap = addMesh(head, geo("hcap", () => new THREE.SphereGeometry(0.196, 26, 16, 0, Math.PI * 2, 0, Math.PI * 0.56)), hairM, 0, 0.012, -0.008, 1.05, 1.12, 1.07, C);
    cap.rotation.x = -0.22;
    sph(head, 0.17, 0.065, 0.085, hairM, 0, 0.13, 0.11).rotation.x = 0.35;
    sph(head, 0.19, 0.15, 0.16, hairM, 0, -0.01, -0.065, C);
    if (look.style === "long") {
      addMesh(head, geo("hlong", () => new THREE.CapsuleGeometry(0.16, 0.26, 6, 14)), hairM, 0, -0.2, -0.07, 1.12, 1, 0.58, C);
      [-1, 1].forEach((s) => addMesh(head, geo("hlock", () => new THREE.CapsuleGeometry(0.045, 0.22, 4, 10)), hairM, s * 0.165, -0.12, 0.04, 1, 1, 1, C));
    }
    if (look.style === "bun") sph(head, 0.085, 0.085, 0.085, hairM, 0, 0.17, -0.14, C);
    if (look.glasses) {
      const gm = mat("#2b2b33", { roughness: 0.3, metalness: 0.4 });
      [-1, 1].forEach((s) => {
        addMesh(head, geo("glass", () => new THREE.TorusGeometry(0.043, 0.007, 6, 18)), gm, s * 0.066, 0.016, 0.182);
        box(head, 0.006, 0.006, 0.17, gm, s * 0.11, 0.013, 0.1);
      });
      box(head, 0.04, 0.006, 0.006, gm, 0, 0.022, 0.186);
    }
    // 팔
    const arm = (s) => {
      const sh = new THREE.Group(); sh.position.set(s * 0.235, 0.55, 0); torso.add(sh);
      sph(sh, 0.078, 0.078, 0.078, shirtM, 0, -0.01, 0, C);
      addMesh(sh, geo("uarm", () => new THREE.CapsuleGeometry(0.066, 0.22, 4, 12)), shirtM, 0, -0.16, 0, 1, 1, 1, C);
      const el = new THREE.Group(); el.position.y = -0.32; sh.add(el);
      addMesh(el, geo("farm", () => new THREE.CapsuleGeometry(0.056, 0.18, 4, 12)), shirtM, 0, -0.12, 0, 1, 1, 1, C);
      const hand = new THREE.Group(); hand.position.y = -0.27; el.add(hand);
      sph(hand, 0.058, 0.066, 0.05, skin, 0, 0, 0, C); sph(hand, 0.022, 0.035, 0.022, skin, s * -0.045, 0.01, 0.02);
      sh.rotation.z = s * 0.08;
      return { sh, el, hand };
    };
    const L = arm(1), Rr = arm(-1);
    // 다리
    const leg = (s) => {
      const hp = new THREE.Group(); hp.position.set(s * 0.095, -0.02, 0); hips.add(hp);
      addMesh(hp, geo("thigh", () => new THREE.CapsuleGeometry(0.09, 0.24, 4, 12)), pantsM, 0, -0.2, 0, 1, 1, 1, C);
      const kn = new THREE.Group(); kn.position.y = -0.4; hp.add(kn);
      addMesh(kn, geo("shin", () => new THREE.CapsuleGeometry(0.074, 0.24, 4, 12)), pantsM, 0, -0.18, 0, 1, 1, 1, C);
      sph(kn, 0.068, 0.045, 0.125, shoeM, 0, -0.355, 0.04, C);
      return { hp, kn };
    };
    const LL = leg(1), RL = leg(-1);
    root.userData = { hips, torso, head, armL: L.sh, armR: Rr.sh, elL: L.el, elR: Rr.el, handR: Rr.hand, legL: LL.hp, legR: RL.hp, knL: LL.kn, knR: RL.kn, phase: 0 };
    if (extra === "cup") {
      const cupG = new THREE.Group(); cupG.position.set(0, -0.04, 0.05); Rr.hand.add(cupG);
      cyl(cupG, 0.045, 0.1, "#ffffff", 0, -0.02, 0);
      cyl(cupG, 0.047, 0.035, "#c98a4b", 0, 0.02, 0);
    }
    return root;
  }

  const L = (o, p, v, k, dt) => { o[p] += (v - o[p]) * Math.min(1, dt * (k || 10)); };
  function animate(ch, st, dt, t) {
    const u = ch.userData;
    let hipsY = 0.82, hipsZ = 0, legLx = 0, legRx = 0, knL = 0, knR = 0, aLx = 0.04, aRx = 0.04, eL = -0.12, eR = -0.12, tY = 0, tX = 0;
    if (st.seated) {
      hipsY = 0.52; hipsZ = -0.04; legLx = legRx = -1.5; knL = knR = 1.45; tX = 0.08;
      if (st.typing) {
        aLx = -0.75 + Math.sin(t * 13) * 0.05; aRx = -0.75 + Math.sin(t * 13 + 1.7) * 0.05; eL = eR = -0.85;
      } else { aLx = aRx = -0.45; eL = eR = -0.9; }
    } else if (st.moving) {
      u.phase += dt * (st.speed || 3) * 2.3;
      const s = Math.sin(u.phase);
      legLx = s * 0.55; legRx = -s * 0.55;
      knL = Math.max(0, Math.sin(u.phase - 1.2)) * 0.95 + 0.05; knR = Math.max(0, Math.sin(u.phase - 1.2 + Math.PI)) * 0.95 + 0.05;
      aLx = -s * 0.5; aRx = s * 0.5; eL = eR = -0.3;
      hipsY = 0.8 + Math.abs(Math.cos(u.phase)) * 0.04; tY = s * 0.07; tX = 0.05;
    } else {
      const b = Math.sin(t * 2 + (st.seed || 0));
      u.torso.scale.y = 1 + b * 0.01;
      aLx = 0.04 + b * 0.02; aRx = 0.04 - b * 0.02;
    }
    if (st.cup && !st.moving) { aRx = -0.55; eR = -1.25; }
    if (st.talking) { aRx = -0.55 + Math.sin(t * 3.2) * 0.18; eR = -0.95 + Math.sin(t * 2.1) * 0.15; }
    if (st.wave) { aRx = -2.9; eR = -0.3 + Math.sin(t * 9) * 0.35; }
    L(u.hips.position, "y", hipsY, 12, dt); L(u.hips.position, "z", hipsZ, 12, dt);
    L(u.legL.rotation, "x", legLx, 14, dt); L(u.legR.rotation, "x", legRx, 14, dt);
    L(u.knL.rotation, "x", knL, 14, dt); L(u.knR.rotation, "x", knR, 14, dt);
    L(u.armL.rotation, "x", aLx, 12, dt); L(u.armR.rotation, "x", aRx, 12, dt);
    L(u.elL.rotation, "x", eL, 12, dt); L(u.elR.rotation, "x", eR, 12, dt);
    L(u.torso.rotation, "y", tY, 10, dt); L(u.torso.rotation, "x", tX, 10, dt);
    L(u.head.rotation, "y", Math.max(-1, Math.min(1, st.lookYaw || 0)), 6, dt);
    L(u.head.rotation, "x", st.talking ? Math.sin(t * 6) * 0.05 : st.seated && st.typing ? 0.12 : 0, 8, dt);
    if (u.bri) { u.bri.position.y = (u.hips.position.y - 0.82) * 0.9; if (u.dot) u.dot.position.y = 1.82 + Math.sin(t * 3) * 0.03; }
  }

  // ---------------------------------------------------------------
  // 렌더러 · 장면
  // ---------------------------------------------------------------
  let renderer, scene, camera, built = false, raf = null, stageEl = null, labelsEl = null, mini = null, mctx = null;
  const clock = new THREE.Clock();
  const W = { sides: { n: [], s: [], w: [], e: [] }, sideOpacity: { n: 1, s: 1, w: 1, e: 1 }, screens: [], chairs: {}, solids3: [], hit: [] };
  const npcs = {};
  const player = { x: 3, z: 15.6, rot: Math.PI, targetRot: Math.PI, moving: false, speed: 0, seated: false, ch: null, lookKey: "", path: null, pending: null, stuck: 0 };
  const cam = { yaw: 0, pitch: 0.55, dist: 7.8, pos: new THREE.Vector3(15, 16, 26), look: new THREE.Vector3(15, 0, 9), shake: 0 };
  let talkTarget = null, env = null, ringT = 0, overviewT = 0;

  function initRenderer() {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.className = "g3d-canvas";
    scene = new THREE.Scene(); scene.background = new THREE.Color("#cfe6f2");
    camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 120);
    buildWorld();
    built = true;
  }

  // ---------- 텍스처 ----------
  function skyTex(kind) {
    return canvasTex(512, 256, (c, w, h) => {
      const cols = { day: ["#7fbde8", "#dcf0fb", "#a9bfd0", "#c4d5e2"], sunset: ["#7a5fa8", "#ffc38a", "#6d5568", "#86687a"], night: ["#0a1028", "#26315a", "#141a33", "#1d2440"] }[kind];
      const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, cols[0]); gr.addColorStop(1, cols[1]);
      c.fillStyle = gr; c.fillRect(0, 0, w, h);
      const r = rng(7);
      if (kind === "day") { c.fillStyle = "rgba(255,255,255,.75)"; [[80, 50], [300, 35], [440, 70]].forEach(([x, y]) => { c.beginPath(); c.ellipse(x, y, 46, 14, 0, 0, 7); c.ellipse(x + 26, y - 8, 30, 13, 0, 0, 7); c.fill(); }); }
      if (kind === "sunset") { c.fillStyle = "#ffe2a8"; c.beginPath(); c.arc(380, 150, 34, 0, 7); c.fill(); }
      if (kind === "night") { c.fillStyle = "#fff"; for (let i = 0; i < 60; i++) c.fillRect(r() * w, r() * h * 0.5, 1.5, 1.5); c.fillStyle = "#f4f1d0"; c.beginPath(); c.arc(420, 50, 16, 0, 7); c.fill(); }
      let x = 0; const r2 = rng(42);
      while (x < w) {
        const bw = 30 + r2() * 50, bh = 60 + r2() * 120;
        c.fillStyle = r2() > 0.5 ? cols[2] : cols[3]; c.fillRect(x, h - bh, bw, bh);
        for (let wy = h - bh + 8; wy < h - 6; wy += 12) for (let wx = x + 5; wx < x + bw - 6; wx += 9) {
          const lit = r2();
          c.fillStyle = kind === "night" ? (lit > 0.55 ? "#ffd97a" : "rgba(0,0,0,.25)") : kind === "sunset" ? (lit > 0.8 ? "#ffd38a" : "rgba(255,255,255,.12)") : "rgba(255,255,255,.35)";
          c.fillRect(wx, wy, 4, 6);
        }
        x += bw + 2;
      }
    });
  }
  function screenTex(kind) {
    return canvasTex(256, 150, (c, w, h) => {
      c.fillStyle = "#f6f8fb"; c.fillRect(0, 0, w, h);
      c.fillStyle = "#004aad"; c.fillRect(0, 0, w, 16);
      c.fillStyle = "#fff"; c.font = FONT(10); c.fillText(kind === "chat" ? "메신저" : kind === "mail" || kind === "notify" ? "메일" : "채용현황.xlsx", 6, 12);
      if (kind === "sheet") {
        c.strokeStyle = "#d5dbe3"; for (let y = 22; y < h; y += 12) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
        for (let x = 40; x < w; x += 44) { c.beginPath(); c.moveTo(x, 16); c.lineTo(x, h); c.stroke(); }
        const r = rng(3); c.fillStyle = "#5b8def"; for (let i = 0; i < 6; i++) c.fillRect(150 + i * 15, 120 - r() * 60, 10, 140);
      } else if (kind === "chat") {
        const r = rng(9);
        for (let i = 0; i < 6; i++) { const me = i % 2; c.fillStyle = me ? "#ffe680" : "#e3e8ef"; rr(c, me ? 110 : 10, 24 + i * 20, 90 + r() * 40, 14, 6); c.fill(); }
      } else {
        for (let i = 0; i < 7; i++) { c.fillStyle = i === 0 && kind === "notify" ? "#fff1d6" : "#fff"; c.fillRect(4, 22 + i * 18, w - 8, 16); c.fillStyle = "#9aa3ad"; c.fillRect(10, 28 + i * 18, 60, 4); c.fillRect(80, 28 + i * 18, 120, 4); }
        if (kind === "notify") { c.fillStyle = "#e5484d"; c.beginPath(); c.arc(w - 22, 30, 14, 0, 7); c.fill(); c.fillStyle = "#fff"; c.font = FONT(14, 800); c.textAlign = "center"; c.fillText("1", w - 22, 35); }
      }
    });
  }

  // ---------- 바닥 ----------
  function floorTex() {
    const P = 48;
    return canvasTex(30 * P, 18 * P, (c) => {
      const r = rng(11);
      for (let y = 0; y < 18; y++) for (let x = 0; x < 30; x++) {
        let a = "#ddd6c8", b = "#d6cfc0";
        if (x >= 21 && x <= 28 && y >= 2 && y <= 5) { a = "#d6d0e0"; b = "#cfc8db"; }
        c.fillStyle = (x + y) % 2 ? a : b; c.fillRect(x * P, y * P, P, P);
      }
      for (let i = 0; i < 9000; i++) { c.fillStyle = `rgba(0,0,0,${r() * 0.035})`; c.fillRect(r() * 30 * P, r() * 18 * P, 2, 2); }
      // 회의실 타일
      for (let y = 2; y < 8; y++) for (let x = 1; x < 9; x++) {
        c.fillStyle = (x + y) % 2 ? "#dfe9ee" : "#d8e3e9"; c.fillRect(x * P, y * P, P, P);
        c.strokeStyle = "rgba(120,140,150,.35)"; c.lineWidth = 2; c.strokeRect(x * P + 1, y * P + 1, P - 2, P - 2);
      }
      // 라운지 원목
      for (let y = 10; y < 17; y++) for (let k = 0; k < 4; k++) {
        let x = 20 * P - ((y * 4 + k) % 3) * P * 0.6;
        while (x < 29 * P) {
          const len = P * (1.6 + r() * 1.4), tone = 150 + r() * 30;
          c.fillStyle = `rgb(${tone + 50},${tone + 15},${tone - 30})`;
          const x0 = Math.max(x, 20 * P), x1 = Math.min(x + len, 29 * P);
          if (x1 > x0) { c.fillRect(x0, y * P + k * P / 4, x1 - x0, P / 4); c.fillStyle = "rgba(90,55,25,.3)"; c.fillRect(x1 - 1, y * P + k * P / 4, 2, P / 4); }
          x += len;
        }
        c.fillStyle = "rgba(90,55,25,.22)"; c.fillRect(20 * P, y * P + k * P / 4, 9 * P, 1.5);
      }
      // 러그
      c.fillStyle = "#9fbfac"; rr(c, 21.6 * P, 12.4 * P, 3.8 * P, 3 * P, 18); c.fill();
      c.strokeStyle = "#f2efe6"; c.lineWidth = 6; rr(c, 21.8 * P, 12.6 * P, 3.4 * P, 2.6 * P, 14); c.stroke();
      // 현관 매트
      c.fillStyle = "#4a4f5c"; rr(c, 2.05 * P, 15.9 * P, 1.9 * P, 1.05 * P, 10); c.fill();
      c.fillStyle = "#cfd3da"; c.font = FONT(15, 800); c.textAlign = "center"; c.fillText("WELCOME", 3 * P, 16.5 * P);
      // 동선 안내 점선
      c.setLineDash([10, 12]); c.strokeStyle = "rgba(63,138,104,.18)"; c.lineWidth = 5;
      c.beginPath(); c.moveTo(3 * P, 15.5 * P); c.lineTo(3 * P, 12 * P); c.lineTo(19.5 * P, 12 * P); c.stroke(); c.setLineDash([]);
    });
  }

  // ---------- 가구 ----------
  function chair(parent, key, x, z, rot, color, big) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; parent.add(g);
    const dark = mat("#3a3f4b", { roughness: 0.5, metalness: 0.3 });
    addMesh(g, geo("cbase", () => new THREE.CylinderGeometry(0.28, 0.28, 0.035, 5)), dark, 0, 0.06, 0);
    cyl(g, 0.025, 0.36, dark, 0, 0.07, 0);
    rbox(g, 0.5, 0.08, 0.48, 0.08, mat(color, { roughness: 0.9 }), 0, 0.42, 0, { cast: true });
    const bh = big ? 0.75 : 0.5;
    rbox(g, big ? 0.52 : 0.46, bh, 0.07, 0.06, mat(color, { roughness: 0.9 }), 0, 0.56, -0.22, { cast: true });
    if (big) rbox(g, 0.46, 0.12, 0.05, 0.04, mat(color, { roughness: 0.9 }), 0, 1.28, -0.2);
    W.chairs[key] = g;
    W.solids3.push([x - 0.27, z - 0.27, 0.54, 0.54]);
    return g;
  }
  function monitor(parent, x, z, facing, tex) {
    const g = new THREE.Group(); g.position.set(x, 0.77, z); g.rotation.y = facing; parent.add(g);
    const dark = mat("#2b2f38", { roughness: 0.4, metalness: 0.2 });
    box(g, 0.22, 0.015, 0.16, dark, 0, 0, 0);
    box(g, 0.04, 0.22, 0.04, dark, 0, 0.01, -0.03);
    rbox(g, 0.64, 0.4, 0.035, 0.02, dark, 0, 0.17, 0.0, { cast: true });
    const sm = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.3, emissive: "#ffffff", emissiveMap: tex, map: tex, emissiveIntensity: 0.45 });
    const screen = addMesh(g, geo("scr", () => new THREE.PlaneGeometry(0.6, 0.355)), sm, 0, 0.37, 0.04);
    W.screens.push(sm);
    box(g, 0.44, 0.02, 0.15, mat("#e8eaee"), 0, 0, 0.3);
    sph(g, 0.03, 0.015, 0.045, mat("#e8eaee"), 0.32, 0.012, 0.3);
    return { g, sm, screen };
  }
  function plant3(parent, x, z, scale, seed) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(scale || 1); parent.add(g);
    addMesh(g, geo("pot", () => new THREE.CylinderGeometry(0.22, 0.16, 0.42, 20)), mat("#c96f46", { roughness: 0.9 }), 0, 0.21, 0, 1, 1, 1, { cast: true });
    cyl(g, 0.2, 0.02, "#4a3526", 0, 0.41, 0);
    const r = rng(seed || 5), leaf = mat("#3f8a52", { roughness: 0.7 }), leaf2 = mat("#5fae6e", { roughness: 0.7 });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + r(), h = 0.6 + r() * 0.55, d = 0.12 + r() * 0.2;
      const lf = sph(g, 0.16, 0.035, 0.1, i % 2 ? leaf : leaf2, Math.cos(a) * d, 0.4 + h, Math.sin(a) * d, { cast: true });
      lf.rotation.set(r() * 0.6 - 0.3, -a, 0.5 + r() * 0.4);
      cyl(g, 0.008, h, "#3a6b3f", Math.cos(a) * d * 0.4, 0.42, Math.sin(a) * d * 0.4);
    }
    return g;
  }
  function deskClutter(parent, x, z, side, r) {
    const k = Math.floor(r() * 5), dx = (r() - 0.5) * 0.3;
    const zz = z + side * 0.05;
    if (k === 0) { cyl(parent, 0.04, 0.1, ["#ffffff", "#e8a33d", "#5b8def"][Math.floor(r() * 3)], x + 0.33, 0.77, zz); }
    if (k === 1) for (let i = 0; i < 3; i++) box(parent, 0.21, 0.012, 0.29, "#fbfbf7", x - 0.32 + dx * 0.2, 0.77 + i * 0.012, zz, { m: {} }).rotation.y = r() * 0.3;
    if (k === 2) { cyl(parent, 0.05, 0.08, "#c96f46", x - 0.34, 0.77, zz); sph(parent, 0.05, 0.07, 0.05, "#5fae6e", x - 0.34, 0.9, zz); }
    if (k === 3) for (let i = 0; i < 3; i++) box(parent, 0.16, 0.035, 0.23, ["#c2453d", "#2f4b6e", "#e8a33d"][i], x + 0.3, 0.77 + i * 0.035, zz).rotation.y = r() * 0.2;
    if (k === 4) { box(parent, 0.12, 0.09, 0.015, "#ffffff", x - 0.33, 0.77, zz).rotation.x = -0.2; }
  }

  function buildWorld() {
    const stat = new THREE.Group(); scene.add(stat);
    const dyn = new THREE.Group(); scene.add(dyn);
    W.dyn = dyn;

    // 바닥
    const floor = addMesh(stat, new THREE.PlaneGeometry(30, 18), new THREE.MeshStandardMaterial({ map: floorTex(), roughness: 0.92 }), 15, 0, 9);
    floor.rotation.x = -Math.PI / 2; W.floor = floor;
    // 바깥 바닥 (벽 밖)
    const outer = addMesh(stat, new THREE.PlaneGeometry(80, 60), mat("#3d4250", { roughness: 1 }), 15, -0.01, 9);
    outer.rotation.x = -Math.PI / 2;

    // 벽 (면별 그룹 → 카메라가 벽 뒤로 가면 투명 처리)
    const side = (k) => { const g = new THREE.Group(); g.userData.side = k; stat.add(g); return g; };
    const gN = side("n"), gS = side("s"), gW = side("w"), gE = side("e");
    const wallC = "#efe9dc";
    box(gN, 30, 3, 0.25, wallC, 15, 0, 1.875, { cast: true });
    box(gW, 0.25, 3, 18, wallC, 0.875, 0, 9, { cast: true });
    box(gE, 0.25, 3, 18, wallC, 29.125, 0, 9, { cast: true });
    box(gS, 2, 3, 0.25, wallC, 1, 0, 17.125); box(gS, 26, 3, 0.25, wallC, 17, 0, 17.125); box(gS, 2, 0.75, 0.25, wallC, 3, 2.25, 17.125);
    // 걸레받이
    box(gN, 30, 0.1, 0.03, "#b7ae9c", 15, 0, 2.01); box(gS, 30, 0.1, 0.03, "#b7ae9c", 15, 0, 16.99);
    box(gW, 0.03, 0.1, 18, "#b7ae9c", 1.01, 0, 9); box(gE, 0.03, 0.1, 18, "#b7ae9c", 28.99, 0, 9);
    // 창문
    W.sky = { day: skyTex("day"), sunset: skyTex("sunset"), night: skyTex("night") };
    W.skyMat = new THREE.MeshBasicMaterial({ map: W.sky.day, toneMapped: false }); W.skyMats = [];
    [[12, 2], [16, 2], [27, 2.6]].forEach(([cx, w]) => {
      const win = addMesh(gN, new THREE.PlaneGeometry(w, 1.4), W.skyMat, cx, 1.75, 2.02);
      const fr = mat("#8a8f99", { roughness: 0.4, metalness: 0.5 });
      box(gN, w + 0.12, 0.08, 0.08, fr, cx, 1.0, 2.03); box(gN, w + 0.12, 0.08, 0.08, fr, cx, 2.42, 2.03);
      box(gN, 0.08, 1.5, 0.08, fr, cx - w / 2, 1.0, 2.03); box(gN, 0.08, 1.5, 0.08, fr, cx + w / 2, 1.0, 2.03); box(gN, 0.05, 1.42, 0.06, fr, cx, 1.04, 2.03);
      box(gN, w + 0.3, 0.05, 0.18, "#ffffff", cx, 0.95, 2.09);
    });
    // 표지판
    const sign = (g, text, x, y, z, ry, opt) => {
      const m = new THREE.MeshStandardMaterial({ map: plate(text, opt), roughness: 0.6 });
      const p = addMesh(g, geo("sign", () => new THREE.PlaneGeometry(1.1, 0.34)), m, x, y, z); p.rotation.y = ry || 0; return p;
    };
    sign(gN, "회의실", 4.5, 2.45, 2.02); sign(gN, "인사팀", 14, 2.45, 2.02, 0, { sub: "HR TEAM" }); sign(gN, "팀장석", 23.8, 2.45, 2.02);
    sign(gE, "라운지 ☕", 28.98, 2.0, 15.4, -Math.PI / 2, { bg: "#8a6440" });
    // 포스터
    const poster = (g, x, y, z, ry, title, lines, color) => {
      const t = canvasTex(360, 480, (c, w, h) => {
        c.fillStyle = color; c.fillRect(0, 0, w, h); c.fillStyle = "rgba(255,255,255,.12)"; c.beginPath(); c.arc(w * 0.8, h * 0.2, 120, 0, 7); c.fill();
        c.fillStyle = "#fff"; c.font = FONT(40, 900); c.textAlign = "left"; title.split("\n").forEach((l, i) => c.fillText(l, 28, 90 + i * 50));
        c.font = FONT(24, 600); c.globalAlpha = 0.9; lines.forEach((l, i) => c.fillText(l, 28, 280 + i * 40));
      });
      const p = addMesh(g, new THREE.PlaneGeometry(0.75, 1.0), new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }), x, y, z); p.rotation.y = ry;
      box(g, 0.8, 1.05, 0.02, "#2b2f38", x - Math.sin(ry) * 0.012, y - 0.525, z - Math.cos(ry) * 0.012).rotation.y = ry;
    };
    poster(gN, 18.3, 1.6, 2.03, 0, "함께 성장하는\n하이브릿지", ["HiBridge Inc.", "선배와 신입을 잇다"], "#004aad");
    poster(gW, 1.03, 1.6, 12.5, Math.PI / 2, "인사팀\n핵심가치", ["① 신뢰", "② 배려", "③ 성장"], "#e8a33d");
    // 벽시계
    W.clockFace = new THREE.Group(); W.clockFace.position.set(20.3, 2.35, 2.03); gN.add(W.clockFace);
    addMesh(W.clockFace, new THREE.CircleGeometry(0.24, 32), mat("#ffffff"), 0, 0, 0.01);
    addMesh(W.clockFace, new THREE.RingGeometry(0.24, 0.27, 32), mat("#2b2f38"), 0, 0, 0.011);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; box(W.clockFace, 0.015, 0.04, 0.005, "#2b2f38", Math.sin(a) * 0.2, Math.cos(a) * 0.2 - 0.02, 0.012); }
    W.hourHand = new THREE.Group(); W.hourHand.position.z = 0.02; W.clockFace.add(W.hourHand); box(W.hourHand, 0.02, 0.13, 0.005, "#2b2f38", 0, 0, 0);
    W.minHand = new THREE.Group(); W.minHand.position.z = 0.025; W.clockFace.add(W.minHand); box(W.minHand, 0.012, 0.19, 0.005, "#c2453d", 0, 0, 0);

    // 엘리베이터 (출입구) — 출근 · 퇴근 연출이 여기서 벌어진다
    const steel = mat("#c3ccda", { metalness: 0.55, roughness: 0.32 });
    W.evFrameMat = new THREE.MeshStandardMaterial({ color: "#8e9bb3", metalness: 0.55, roughness: 0.35, emissive: "#ffb400", emissiveIntensity: 0 });
    W.evDoorL = box(gS, 0.98, 2.2, 0.06, steel, 2.5, 0, 17.05);
    W.evDoorR = box(gS, 0.98, 2.2, 0.06, steel, 3.5, 0, 17.05);
    box(gS, 0.1, 2.3, 0.14, W.evFrameMat, 1.97, 0, 16.98); box(gS, 0.1, 2.3, 0.14, W.evFrameMat, 4.03, 0, 16.98); box(gS, 2.16, 0.12, 0.14, W.evFrameMat, 3, 2.2, 16.98);
    box(gS, 2, 0.04, 1.8, "#d9c6a5", 3, 0, 18.1); box(gS, 2, 2.4, 0.06, "#f2e3c8", 3, 0, 19.0);
    box(gS, 0.06, 2.4, 1.8, "#efdfc2", 2.0, 0, 18.1); box(gS, 0.06, 2.4, 1.8, "#efdfc2", 4.0, 0, 18.1);
    box(gS, 2, 0.05, 1.8, "#fffbe8", 3, 2.35, 18.1, { m: { emissive: "#fff6e0", emissiveIntensity: 0.9 } });
    box(gS, 1.9, 0.05, 0.05, "#b9a27c", 3, 0.95, 18.95, { m: { metalness: 0.6, roughness: 0.3 } });
    { const cv = document.createElement("canvas"); cv.width = 192; cv.height = 72; W.evDispCv = cv; W.evDispTex = new THREE.CanvasTexture(cv); if (THREE.sRGBEncoding) W.evDispTex.encoding = THREE.sRGBEncoding;
      const dm = addMesh(gS, new THREE.PlaneGeometry(0.62, 0.24), new THREE.MeshBasicMaterial({ map: W.evDispTex }), 3, 2.45, 16.96); dm.rotation.y = Math.PI; }
    box(gS, 0.14, 0.3, 0.04, W.evFrameMat, 4.35, 1.0, 16.98); sph(gS, 0.035, 0.035, 0.02, mat("#ffb400", { emissive: "#ffb400", emissiveIntensity: 0.7 }), 4.35, 1.2, 16.95);
    sign(gS, "엘리베이터 ▲▼", 3, 2.85, 16.98, Math.PI, { bg: "#004aad", size: 56 });
    W.evOpen = 0; evDisplay(7, "");

    // ---------- 회의실 ----------
    const glass = new THREE.MeshStandardMaterial({ color: "#bfe3f5", transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1, depthWrite: false });
    const alu = mat("#9aa1ab", { roughness: 0.35, metalness: 0.6 });
    const glassWall = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, ry = Math.atan2(z1 - z0, x1 - x0);
      const p = box(stat, len, 2.6, 0.03, glass, cx, 0, cz); p.rotation.y = -ry; p.renderOrder = 2;
      box(stat, len, 0.06, 0.07, alu, cx, 2.6, cz).rotation.y = -ry; box(stat, len, 0.06, 0.07, alu, cx, 0, cz).rotation.y = -ry;
      const n = Math.max(1, Math.round(len / 1.5));
      for (let i = 0; i <= n; i++) { const t = i / n; box(stat, 0.06, 2.66, 0.07, alu, x0 + (x1 - x0) * t, 0, z0 + (z1 - z0) * t); }
    };
    glassWall(9.12, 2, 9.12, 8.12); glassWall(1, 8.12, 5, 8.12); glassWall(6, 8.12, 9.12, 8.12);
    box(stat, 1.06, 0.1, 0.1, alu, 5.5, 2.55, 8.12);
    rbox(stat, 4, 0.06, 2, 0.25, mat("#f6f4ee", { roughness: 0.35 }), 5, 0.72, 5, { cast: true });
    [3.7, 6.3].forEach((x) => { cyl(stat, 0.06, 0.72, alu, x, 0, 5); rbox(stat, 0.5, 0.03, 0.9, 0.1, alu, x, 0, 5); });
    [3.5, 4.5, 5.5, 6.5].forEach((x, i) => { chair(W.dyn, "mn" + i, x, 3.5, 0, "#4b5263"); chair(W.dyn, "ms" + i, x, 6.5, Math.PI, "#4b5263"); });
    chair(W.dyn, "mhead", 7.55, 5, -Math.PI / 2, "#2f4b6e");
    box(stat, 0.5, 0.01, 0.35, "#ffffff", 4.2, 0.78, 4.6).rotation.y = 0.2;
    // TV
    const tvTex = canvasTex(640, 360, (c, w, h) => {
      const gr = c.createLinearGradient(0, 0, w, h); gr.addColorStop(0, "#00245c"); gr.addColorStop(1, "#004aad"); c.fillStyle = gr; c.fillRect(0, 0, w, h);
      c.fillStyle = "#fff"; c.font = FONT(44, 900); c.fillText("주간회의", 40, 80); c.font = FONT(24, 600); c.globalAlpha = 0.85; c.fillText("인사팀 · 매주 월요일 10:00", 40, 120);
      c.globalAlpha = 1; c.font = FONT(26, 700); ["① 채용 현황 공유", "② 교육 일정 점검", "③ 신입 온보딩 개선 의견"].forEach((l, i) => c.fillText(l, 50, 190 + i * 48));
    });
    W.tvMat = new THREE.MeshStandardMaterial({ map: tvTex, emissive: "#ffffff", emissiveMap: tvTex, emissiveIntensity: 0.35, roughness: 0.3 });
    box(gN, 1.7, 0.98, 0.05, "#16181d", 5, 1.06, 2.03);
    addMesh(gN, new THREE.PlaneGeometry(1.6, 0.9), W.tvMat, 5, 1.55, 2.06);
    // 화이트보드
    const wbTex = canvasTex(512, 320, (c, w, h) => {
      c.fillStyle = "#fdfdfb"; c.fillRect(0, 0, w, h);
      c.strokeStyle = "#2f4b6e"; c.lineWidth = 3; c.font = FONT(30, 800); c.fillStyle = "#2f4b6e"; c.fillText("온보딩 개선 아이디어", 30, 52);
      c.strokeStyle = "#c2453d"; c.beginPath(); c.moveTo(30, 64); c.lineTo(330, 64); c.stroke();
      c.fillStyle = "#333"; c.font = FONT(22, 600); ["- 권한 신청 체크리스트", "- 첫 주 '질문 무료' 캠페인", "- 선배 경험 카드 ✔"].forEach((l, i) => c.fillText(l, 40, 110 + i * 40));
      [["#f7c548", 360, 110], ["#f29bb5", 420, 170], ["#7bc8a4", 370, 230]].forEach(([col, x, y]) => { c.fillStyle = col; c.fillRect(x, y, 70, 60); });
    });
    const wb = addMesh(gW, new THREE.PlaneGeometry(2.2, 1.2), new THREE.MeshStandardMaterial({ map: wbTex, roughness: 0.25 }), 1.04, 1.55, 5); wb.rotation.y = Math.PI / 2;
    box(gW, 0.04, 1.28, 2.28, "#b9bec7", 1.02, 0.91, 5);

    // ---------- 인사팀 책상 ----------
    const wood = mat("#c99a6a", { roughness: 0.55 }), panelM = mat("#5d6472", { roughness: 0.6 });
    rbox(stat, 8, 0.05, 2, 0.06, wood, 15, 0.72, 8, { cast: true });
    [11.06, 18.94].forEach((x) => box(stat, 0.06, 0.72, 1.9, panelM, x, 0, 8, { cast: true }));
    box(stat, 7.8, 0.5, 0.04, panelM, 15, 0.12, 8);
    box(stat, 7.9, 0.32, 0.03, mat("#dfe9e4", { roughness: 0.4, transparent: true, opacity: 0.9 }), 15, 0.77, 8);
    const kinds = ["sheet", "mail", "chat"], texs = { sheet: screenTex("sheet"), mail: screenTex("mail"), chat: screenTex("chat"), notify: screenTex("notify") };
    W.texs = texs;
    const r = rng(21);
    for (let i = 0; i < 8; i++) {
      const x = 11.5 + i;
      monitor(stat, x, 7.55, Math.PI, texs[kinds[(i + 1) % 3]]);
      chair(W.dyn, "n" + Math.floor(x), x, 6.45, 0, "#4b5263");
      const isMine = x === 12.5;
      const m = monitor(stat, x, 8.45, 0, isMine ? texs.mail : texs[kinds[i % 3]]);
      if (isMine) W.myScreen = m.sm;
      chair(W.dyn, "s" + Math.floor(x), x, 9.55, Math.PI, isMine ? "#ffb400" : "#4b5263");
      deskClutter(stat, x, 7.3, -1, r);
      if (!isMine) deskClutter(stat, x, 8.7, 1, r);
    }
    // 내 자리 소품: 포스트잇, 명패, 전화기
    [["#f7c548", -0.36], ["#f29bb5", 0.36]].forEach(([c, dx]) => { const p = box(stat, 0.08, 0.08, 0.005, c, 12.5 + dx, 1.22, 8.47); p.rotation.z = dx * 0.4; });
    const myPlate = addMesh(stat, new THREE.PlaneGeometry(0.3, 0.09), new THREE.MeshStandardMaterial({ map: plate("내 자리", { size: 80, bg: "#004aad" }) }), 12.5, 0.82, 8.98);
    myPlate.rotation.x = -0.3;
    W.phone = new THREE.Group(); W.phone.position.set(12.12, 0.77, 8.75); stat.add(W.phone);
    rbox(W.phone, 0.18, 0.05, 0.16, 0.03, mat("#2b2f38"), 0, 0, 0);
    W.handset = new THREE.Group(); W.handset.position.set(-0.05, 0.06, 0); W.phone.add(W.handset);
    rbox(W.handset, 0.05, 0.035, 0.17, 0.02, mat("#2b2f38"), 0, 0, 0);
    W.phoneLight = new THREE.MeshStandardMaterial({ color: "#550000", emissive: "#ff3b30", emissiveIntensity: 0 });
    sph(W.phone, 0.012, 0.012, 0.012, W.phoneLight, 0.05, 0.055, 0.04);
    // 정수기
    box(stat, 0.38, 0.95, 0.38, "#eef2f5", 20.5, 0, 7.55, { cast: true });
    cyl(stat, 0.15, 0.42, mat("#9fd3f0", { transparent: true, opacity: 0.6, roughness: 0.1 }), 20.5, 0.95, 7.55);
    box(stat, 0.08, 0.06, 0.04, "#3f8ad8", 20.42, 0.65, 7.75); box(stat, 0.08, 0.06, 0.04, "#d84a3f", 20.58, 0.65, 7.75);
    // 복합기
    rbox(stat, 1.15, 1.0, 0.75, 0.05, mat("#e3e6ea", { roughness: 0.5 }), 19.95, 0, 2.48, { cast: true });
    box(stat, 1.0, 0.04, 0.5, "#c9ccd1", 19.95, 1.0, 2.45); box(stat, 0.3, 0.06, 0.18, "#3d4250", 20.35, 1.0, 2.75);
    sph(stat, 0.015, 0.015, 0.015, mat("#063", { emissive: "#3fd18a", emissiveIntensity: 1 }), 20.45, 1.07, 2.8);
    box(stat, 0.6, 0.02, 0.4, "#ffffff", 19.85, 0.55, 2.86);

    // ---------- 팀장석 ----------
    const dw = mat("#7a5638", { roughness: 0.5 });
    rbox(stat, 3, 0.07, 1, 0.08, dw, 24.5, 0.72, 3.5, { cast: true });
    box(stat, 2.9, 0.62, 0.05, dw, 24.5, 0.1, 3.95, { cast: true });
    [23.05, 25.95].forEach((x) => box(stat, 0.06, 0.72, 0.95, dw, x, 0, 3.5));
    monitor(stat, 24.5, 3.4, Math.PI, texs.sheet);
    const np = addMesh(stat, new THREE.PlaneGeometry(0.5, 0.12), new THREE.MeshStandardMaterial({ map: plate("팀장 이도윤", { size: 64, bg: "#2b2f38" }) }), 24.5, 0.84, 3.99);
    np.rotation.x = -0.25;
    chair(W.dyn, "lead", 24.5, 2.6, 0, "#2d3446", true);
    box(stat, 0.3, 0.03, 0.22, "#ffffff", 23.6, 0.79, 3.6).rotation.y = 0.3;
    cyl(stat, 0.05, 0.1, "#ffffff", 25.5, 0.79, 3.3);
    // 책장
    const shelf = (x0) => {
      box(stat, 1.4, 1.9, 0.36, "#8a6440", x0 + 0.7, 0, 2.2, { cast: true });
      const rb = rng(x0 * 10);
      for (let row = 0; row < 4; row++) {
        box(stat, 1.32, 0.03, 0.32, "#6b4a2e", x0 + 0.7, 0.1 + row * 0.45, 2.24);
        let bx = x0 + 0.08;
        while (bx < x0 + 1.3) {
          const bw = 0.05 + rb() * 0.06, bh = 0.25 + rb() * 0.13;
          box(stat, bw, bh, 0.24, ["#c2453d", "#2f4b6e", "#e8a33d", "#3f8a68", "#f4f1e8", "#7a5cc2"][Math.floor(rb() * 6)], bx + bw / 2, 0.13 + row * 0.45, 2.27);
          bx += bw + 0.01;
        }
      }
      W.solids3.push([x0, 2, 1.4, 0.4]);
    };
    shelf(21.1);

    // ---------- 라운지 ----------
    box(stat, 0.95, 0.9, 3.5, "#8a6440", 28.5, 0, 11.75, { cast: true });
    rbox(stat, 1.02, 0.05, 3.56, 0.03, mat("#f3f1ea", { roughness: 0.3 }), 28.5, 0.9, 11.75);
    for (let i = 0; i < 4; i++) box(stat, 0.02, 0.8, 0.82, "#b98b5e", 28.02, 0.05, 10.2 + i * 0.86);
    box(stat, 0.55, 0.6, 3.5, "#b98b5e", 28.7, 1.65, 11.75);
    // 커피머신
    rbox(stat, 0.38, 0.48, 0.36, 0.04, mat("#2b2f38", { roughness: 0.35, metalness: 0.3 }), 28.55, 0.95, 11.2, { cast: true });
    box(stat, 0.2, 0.12, 0.02, "#111", 28.36, 1.2, 11.2).rotation.y = Math.PI / 2;
    sph(stat, 0.02, 0.02, 0.02, mat("#600", { emissive: "#ff5a3c", emissiveIntensity: 1.2 }), 28.36, 1.32, 11.1);
    cyl(stat, 0.045, 0.1, "#ffffff", 28.4, 0.95, 11.45); cyl(stat, 0.045, 0.1, "#e8a33d", 28.45, 0.95, 10.6);
    // 전자레인지 & 냉장고
    rbox(stat, 0.45, 0.3, 0.38, 0.03, mat("#dfe3e8"), 28.55, 0.95, 12.6);
    box(stat, 0.02, 0.2, 0.25, "#222", 28.33, 1.0, 12.58);
    rbox(stat, 0.8, 1.8, 0.75, 0.05, mat("#e8ecef", { roughness: 0.35 }), 28.55, 0, 14.1, { cast: true });
    box(stat, 0.03, 0.5, 0.04, "#b9bec7", 28.13, 1.0, 13.9);
    W.solids3.push([28.1, 13.6, 0.9, 0.95]);
    // 테이블 & 스툴
    cyl(stat, 0.62, 0.05, mat("#f6f4ee", { roughness: 0.35 }), 23.7, 0.72, 13.5, { cast: true });
    cyl(stat, 0.05, 0.72, "#3a3f4b", 23.7, 0, 13.5); cyl(stat, 0.3, 0.03, "#3a3f4b", 23.7, 0, 13.5);
    cyl(stat, 0.035, 0.12, "#ffffff", 23.5, 0.77, 13.4); box(stat, 0.25, 0.01, 0.18, "#fbfbf7", 23.9, 0.77, 13.65).rotation.y = 0.4;
    [[22.8, 13.2], [23.3, 14.4]].forEach(([x, z]) => { cyl(stat, 0.2, 0.05, "#e8a33d", x, 0.48, z, { cast: true }); cyl(stat, 0.03, 0.48, "#3a3f4b", x, 0, z); cyl(stat, 0.16, 0.02, "#3a3f4b", x, 0, z); W.solids3.push([x - 0.2, z - 0.2, 0.4, 0.4]); });
    // 펜던트 조명
    W.lamps = [];
    [[23.2, 13.5], [24.2, 13.5]].forEach(([x, z]) => {
      cyl(stat, 0.006, 0.7, "#222", x, 2.3, z);
      addMesh(stat, geo("shade", () => new THREE.ConeGeometry(0.2, 0.22, 24, 1, true)), mat("#2b2f38", { side: THREE.DoubleSide, roughness: 0.4 }), x, 2.2, z);
      const bm = new THREE.MeshStandardMaterial({ color: "#fff3c4", emissive: "#ffd27a", emissiveIntensity: 0.4 });
      sph(stat, 0.06, 0.06, 0.06, bm, x, 2.1, z);
      const pl = new THREE.PointLight("#ffcf8a", 0, 6, 1.6); pl.position.set(x, 2.0, z); scene.add(pl);
      W.lamps.push({ pl, bm });
    });
    // 천장 조명 느낌의 사무실 보조광
    W.office = [new THREE.PointLight("#fff5e6", 0, 12, 1.4), new THREE.PointLight("#fff5e6", 0, 12, 1.4)];
    W.office[0].position.set(15, 2.8, 8); W.office[1].position.set(6, 2.8, 12);
    W.office.forEach((l) => scene.add(l));
    // 소파
    const sofaM = mat("#4f7cac", { roughness: 0.95 });
    rbox(stat, 3, 0.42, 0.9, 0.12, sofaM, 22.5, 0.05, 16.5, { cast: true });
    rbox(stat, 3, 0.55, 0.25, 0.1, sofaM, 22.5, 0.4, 16.85, { cast: true });
    [21.1, 23.9].forEach((x) => rbox(stat, 0.22, 0.62, 0.9, 0.08, sofaM, x, 0.05, 16.5, { cast: true }));
    [21.95, 23.05].forEach((x) => rbox(stat, 1.0, 0.12, 0.7, 0.1, mat("#6b97c6", { roughness: 0.95 }), x, 0.47, 16.45));
    sph(stat, 0.16, 0.14, 0.07, "#f7c548", 21.5, 0.75, 16.65).rotation.x = -0.3;
    // 게시판
    W.boardTex = canvasTex(400, 300, drawBoard);
    W.boardMat = new THREE.MeshStandardMaterial({ map: W.boardTex, roughness: 0.9, emissive: "#ffb347", emissiveIntensity: 0 });
    box(stat, 1.1, 0.85, 0.06, "#8a6440", 21.1, 0.85, 11.42, { cast: true });
    addMesh(stat, new THREE.PlaneGeometry(1.0, 0.75), W.boardMat, 21.1, 1.275, 11.46);
    [-0.45, 0.45].forEach((dx) => box(stat, 0.05, 0.9, 0.05, "#6b4a2e", 21.1 + dx, 0, 11.42));
    // 화분
    [[10, 2.5, 1.1, 2], [28, 6.6, 1.2, 8], [1.6, 15.9, 1.15, 13], [19.6, 15.9, 1.0, 17], [8.5, 2.6, 0.8, 4]].forEach(([x, z, s, sd]) => plant3(stat, x, z, s, sd));
    W.solids3.push([8.3, 2.4, 0.4, 0.4]);

    // ---------- 조명 ----------
    W.hemi = new THREE.HemisphereLight("#e8f2ff", "#b8a98f", 0.75); scene.add(W.hemi);
    W.sun = new THREE.DirectionalLight("#fff4e0", 1.0);
    W.sun.castShadow = true; W.sun.shadow.mapSize.set(2048, 2048);
    const sc = W.sun.shadow.camera; sc.left = -18; sc.right = 18; sc.top = 13; sc.bottom = -13; sc.near = 1; sc.far = 80;
    W.sun.shadow.bias = -0.0004; W.sun.shadow.normalBias = 0.03;
    W.sun.target.position.set(15, 0, 9); scene.add(W.sun); scene.add(W.sun.target);

    // ---------- 마커 ----------
    const bangTex = canvasTex(128, 160, (c) => {
      c.fillStyle = "#e8a33d"; rr(c, 14, 6, 100, 112, 28); c.fill();
      c.beginPath(); c.moveTo(50, 116); c.lineTo(78, 116); c.lineTo(64, 150); c.fill();
      c.fillStyle = "#fff"; c.font = FONT(86, 900); c.textAlign = "center"; c.fillText("!", 64, 96);
    });
    W.bang = new THREE.Sprite(new THREE.SpriteMaterial({ map: bangTex, depthTest: false, toneMapped: false }));
    W.bang.scale.set(0.42, 0.52, 1); W.bang.renderOrder = 10; scene.add(W.bang);
    W.ring = addMesh(scene, new THREE.RingGeometry(0.42, 0.55, 48), new THREE.MeshBasicMaterial({ color: "#e8a33d", transparent: true, opacity: 0.7, depthWrite: false }), 0, 0.02, 0);
    W.ring.rotation.x = -Math.PI / 2;
    W.goalRing = addMesh(scene, new THREE.RingGeometry(0.16, 0.22, 32), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, depthWrite: false }), 0, 0.02, 0);
    W.goalRing.rotation.x = -Math.PI / 2;

    // ---------- 캐릭터 ----------
    NPCS.forEach((n) => {
      const ch = makeChar(LOOKS[n.look], n.id === "yoon" ? "cup" : null);
      W.dyn.add(ch);
      npcs[n.id] = { def: n, ch, x: n.p3.x, z: n.p3.z, rot: n.p3.rot, base: n.p3, seed: n.p3.x * 3 };
      ch.position.set(n.p3.x, 0, n.p3.z); ch.rotation.y = n.p3.rot;
    });

    // 클릭 판정용 오브젝트 영역
    const hitBox = (id, x, y, z, w, h, d) => { const m = box(scene, w, h, d, new THREE.MeshBasicMaterial({ visible: false }), x, y, z); m.userData.target = id; W.hit.push(m); };
    hitBox("mydesk", 12.5, 0.7, 8.6, 0.9, 0.8, 0.9); hitBox("meeting", 5, 0, 5, 4, 1.0, 2);
    hitBox("board", 21.1, 0.8, 11.42, 1.1, 0.9, 0.3); hitBox("coffee", 28.55, 0.9, 11.2, 0.5, 0.6, 0.5);
    hitBox("door", 3, 0, 17, 2, 2.3, 0.3);

    // 벽 면별 재질 분리(투명 처리용)
    [gN, gS, gW, gE].forEach((g) => g.traverse((o) => {
      if (!o.isMesh) return;
      const orig = o.material;
      o.material = orig.clone(); o.material.transparent = true; o.material.userData.baseOpacity = orig.opacity;
      if (orig === W.skyMat) W.skyMats.push(o.material);
      if (orig === W.tvMat) W.tvMat = o.material;
      W.sides[g.userData.side].push(o.material);
    }));
    W.doorMats = [W.evFrameMat];

    stat.updateMatrixWorld(true);
    stat.traverse((o) => { o.matrixAutoUpdate = false; });
    W.evDoorL.matrixAutoUpdate = W.evDoorR.matrixAutoUpdate = true; // 엘리베이터 문은 움직인다

    env = { sun: new THREE.Color("#fff4e0"), sunI: 1, hemiSky: new THREE.Color("#e8f2ff"), hemiG: new THREE.Color("#b8a98f"), hemiI: 0.75,
      bg: new THREE.Color("#cfe6f2"), lamp: 0, office: 0.35, screen: 0.45, sunDir: new THREE.Vector3(-0.35, 1, -0.6).normalize(), sky: "day" };
  }

  function drawBoard(c, w, h) {
    c.fillStyle = "#c9a26b"; c.fillRect(0, 0, w, h);
    const r = rng(99); for (let i = 0; i < 600; i++) { c.fillStyle = `rgba(80,50,20,${r() * 0.2})`; c.fillRect(r() * w, r() * h, 3, 3); }
    c.fillStyle = "#3d2a17"; c.font = FONT(30, 900); c.textAlign = "center"; c.fillText("📌 선배 경험 게시판", w / 2, 42);
    const n = (window.S && S.customCards ? S.customCards.length : 0);
    const cols = ["#f7c548", "#f29bb5", "#7bc8a4", "#9fd3f0", "#ffd38a"];
    const count = Math.max(3, Math.min(9, n + 3));
    for (let i = 0; i < count; i++) {
      const x = 30 + (i % 3) * 120 + r() * 20, y = 70 + Math.floor(i / 3) * 70 + r() * 10;
      c.save(); c.translate(x + 45, y + 28); c.rotate((r() - 0.5) * 0.2);
      c.fillStyle = cols[i % 5]; c.fillRect(-45, -28, 90, 56);
      c.fillStyle = "rgba(0,0,0,.45)"; c.fillRect(-32, -12, 64, 4); c.fillRect(-32, 0, 50, 4);
      c.fillStyle = "#c2453d"; c.beginPath(); c.arc(0, -26, 5, 0, 7); c.fill(); c.restore();
    }
    c.fillStyle = "#3d2a17"; c.font = FONT(20, 700); c.fillText(n ? `등록된 경험 ${n}장` : "시니어 경험을 기다려요", w / 2, h - 16);
  }

  // ---------------------------------------------------------------
  // 상태에 따른 배치
  // ---------------------------------------------------------------
  function placementOf(n) {
    const t = World.target(), card = S.game && S.game.phase === "play" ? World.curCard() : null;
    if (t === "meeting" && n.id === "doyoon") return { x: 7.55, z: 5, rot: -Math.PI / 2, seat: "mhead" };
    if (t === "meeting" && card && card.id === "c09") {
      if (n.id === "seoyeon") return { x: 3.5, z: 3.5, rot: 0, seat: "mn0" };
      if (n.id === "jihoon") return { x: 4.5, z: 3.5, rot: 0, seat: "mn1" };
      if (n.id === "jungmin") return { x: 6.5, z: 3.5, rot: 0, seat: "mn3" };
    }
    return n.p3;
  }
  function isNight() { const p = S.game && S.game.phase; return p === "retro" || p === "ending"; }
  function sync() {
    if (!built || !S.game) return;
    const vis = World.visibleNpcs().map((n) => n.id), night = isNight();
    NPCS.forEach((n) => {
      const o = npcs[n.id], pl = placementOf(n);
      o.visible = vis.includes(n.id) && !night;
      o.ch.visible = o.visible;
      if (o.place !== pl) {
        if (o.place && o.place.seat && W.chairs[o.place.seat]) W.chairs[o.place.seat].rotation.y = o.place.rot;
        o.place = pl; o.x = pl.x; o.z = pl.z; o.rot = pl.rot; o.ch.position.set(pl.x, 0, pl.z); o.ch.rotation.y = pl.rot;
      }
    });
    // 게시판 갱신
    const c = W.boardTex.userData.canvas; drawBoard(c.getContext("2d"), c.width, c.height); W.boardTex.needsUpdate = true;
    // 플레이어 외형
    const lk = (S.game && S.game.look) || DEFAULT_LOOK, key = JSON.stringify(lk);
    if (player.lookKey !== key) {
      if (player.ch) W.dyn.remove(player.ch);
      player.ch = makeChar(lk); W.dyn.add(player.ch); player.lookKey = key;
    }
    gridCache = null;
  }

  // ---------------------------------------------------------------
  // 충돌 · 길찾기
  // ---------------------------------------------------------------
  function solidsNow() {
    const extra = [];
    NPCS.forEach((n) => { const o = npcs[n.id]; if (o.visible && !(o.place && o.place.seat)) extra.push([o.x - 0.3, o.z - 0.3, 0.6, 0.6]); });
    return SOLIDS.concat(W.solids3, extra);
  }
  function blockedAt(x, z, sol) { return World.hit([x - 0.22, z - 0.22, 0.44, 0.44], sol); }
  let gridCache = null;
  const GR = 0.25, GXN = 120, GZN = 72;
  function grid() {
    if (gridCache) return gridCache;
    const sol = solidsNow(), g = new Uint8Array(GXN * GZN);
    for (let j = 0; j < GZN; j++) for (let i = 0; i < GXN; i++) g[j * GXN + i] = blockedAt((i + 0.5) * GR, (j + 0.5) * GR, sol) ? 1 : 0;
    return (gridCache = g);
  }
  function findPath(x0, z0, x1, z1) {
    const g = grid(), idx = (i, j) => j * GXN + i;
    const ci = (v, n) => Math.max(0, Math.min(n - 1, Math.floor(v / GR)));
    let si = ci(x0, GXN), sj = ci(z0, GZN), gi = ci(x1, GXN), gj = ci(z1, GZN);
    if (g[idx(gi, gj)]) {
      let best = null, bd = 1e9;
      for (let dj = -6; dj <= 6; dj++) for (let di = -6; di <= 6; di++) {
        const i = gi + di, j = gj + dj; if (i < 0 || j < 0 || i >= GXN || j >= GZN || g[idx(i, j)]) continue;
        const d = di * di + dj * dj; if (d < bd) { bd = d; best = [i, j]; }
      }
      if (!best) return null; [gi, gj] = best;
    }
    const N = GXN * GZN, cost = new Float32Array(N).fill(1e9), prev = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const open = [[0, si, sj]]; cost[idx(si, sj)] = 0;
    const h = (i, j) => { const dx = Math.abs(i - gi), dz = Math.abs(j - gj); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
    let found = false, guard = 0;
    while (open.length && guard++ < 20000) {
      let bi = 0; for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k;
      const [, i, j] = open.splice(bi, 1)[0], id = idx(i, j);
      if (closed[id]) continue; closed[id] = 1;
      if (i === gi && j === gj) { found = true; break; }
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= GXN || nj >= GZN) continue;
        const nid = idx(ni, nj); if (g[nid] || closed[nid]) continue;
        if (di && dj && (g[idx(i + di, j)] || g[idx(i, j + dj)])) continue;
        const nc = cost[id] + (di && dj ? 1.414 : 1);
        if (nc < cost[nid]) { cost[nid] = nc; prev[nid] = id; open.push([nc + h(ni, nj), ni, nj]); }
      }
    }
    if (!found) return null;
    const pts = []; let cur = idx(gi, gj);
    while (cur !== -1) { pts.push([(cur % GXN + 0.5) * GR, (Math.floor(cur / GXN) + 0.5) * GR]); cur = prev[cur]; }
    pts.reverse();
    // 시야가 트이면 중간 지점 생략
    const sol = solidsNow(), clear = (a, b) => {
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(d / 0.1);
      for (let k = 1; k < n; k++) if (blockedAt(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n, sol)) return false;
      return true;
    };
    const out = []; let a = [x0, z0], k = 0;
    while (k < pts.length - 1) {
      let far = k + 1;
      for (let m = pts.length - 1; m > k + 1; m--) if (clear(a, pts[m])) { far = m; break; }
      out.push(pts[far]); a = pts[far]; k = far;
    }
    if (!out.length) out.push(pts[pts.length - 1]);
    return out;
  }

  // ---------------------------------------------------------------
  // 상호작용 대상
  // ---------------------------------------------------------------
  function ipoint(o) {
    if (o.look) { const n = npcs[o.id]; const pl = n.place || o.p3; return { x: pl === o.p3 ? o.p3.ix : pl.x + Math.sin(pl.rot) * 0.9, z: pl === o.p3 ? o.p3.iz : pl.z + Math.cos(pl.rot) * 0.9, r: 1.25 }; }
    return { x: o.p3.ix, z: o.p3.iz, r: o.p3.r };
  }
  function nearest() {
    let best = null, bd = 1e9;
    World.visibleNpcs().forEach((n) => {
      if (!npcs[n.id].visible) return;
      const p = ipoint(n), d = Math.hypot(player.x - p.x, player.z - p.z);
      if (d < p.r && d < bd) { bd = d; best = n; }
    });
    OBJECTS.forEach((o) => { const p = ipoint(o), d = Math.hypot(player.x - p.x, player.z - p.z); if (d < p.r && d < bd) { bd = d; best = o; } });
    return best;
  }
  function headPos(id) {
    const n = npcs[id];
    if (n) { const seated = n.place && n.place.seat; return new THREE.Vector3(n.x, seated ? 1.38 : 1.7, n.z); }
    const o = OBJECTS.find((x) => x.id === id);
    const pos = { mydesk: [12.5, 1.25, 8.45], meeting: [5, 1.1, 5], board: [21.1, 1.6, 11.42], coffee: [28.5, 1.4, 11.2], door: [3, 2.3, 17] }[id];
    return pos ? new THREE.Vector3(...pos) : new THREE.Vector3(o.p3.ix, 1, o.p3.iz);
  }

  // ---------------------------------------------------------------
  // 렌더러 어댑터
  // ---------------------------------------------------------------
  const portraitCache = {};
  let pr = null;
  function portraitURL(lk) {
    const key = JSON.stringify(lk);
    if (portraitCache[key]) return portraitCache[key];
    if (!pr) {
      const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      r.setSize(160, 160); r.outputEncoding = THREE.sRGBEncoding; r.toneMapping = THREE.ACESFilmicToneMapping;
      const sc = new THREE.Scene();
      sc.add(new THREE.HemisphereLight("#ffffff", "#c9b9a0", 0.9));
      const d = new THREE.DirectionalLight("#ffffff", 0.8); d.position.set(1, 2, 3); sc.add(d);
      const cm = new THREE.PerspectiveCamera(26, 1, 0.1, 10); cm.position.set(0, 1.66, 1.25); cm.lookAt(0, 1.6, 0);
      pr = { r, sc, cm };
    }
    const ch = makeChar(lk); ch.rotation.y = 0.25; ch.userData.head.rotation.y = -0.15; pr.sc.add(ch);
    pr.r.setClearColor(0xe3ece6, 1); pr.r.render(pr.sc, pr.cm);
    const url = pr.r.domElement.toDataURL("image/png");
    pr.sc.remove(ch);
    return (portraitCache[key] = url);
  }

  const R = {
    kind: "3d",
    portrait(lk, size) { return hbPortrait(lk, size) || `<img class="portrait p3" src="${portraitURL(lk)}" width="${size || 48}" height="${size || 48}" alt="" />`; },
    nearest,
    faceTo(t) { const h = headPos(t.id); player.targetRot = Math.atan2(h.x - player.x, h.z - player.z); },
    onGain(delta) {
      const sp = toScreen(new THREE.Vector3(player.x, 2.0, player.z)); if (!sp || !labelsEl) return;
      GAUGES.forEach((x, k) => {
        const v = delta[x.key]; if (!v) return;
        const el = document.createElement("div");
        el.className = "gain " + (v > 0 ? "up" : "down");
        el.textContent = `${x.icon} ${x.label} ${v > 0 ? "+" : ""}${v}`;
        el.style.left = sp.x + "px"; el.style.top = sp.y - k * 26 + "px"; el.style.animationDelay = k * 0.12 + "s";
        labelsEl.appendChild(el); setTimeout(() => el.remove(), 2400);
      });
    },
    shake() { cam.shake = 0.45; },
    elevator,
    act(card) { const a = CARD_ACT[card.id]; pill(`${(DAYS[card.day - 1] || {}).label || ""} · ${card.category} — ${card.title}`); if (!a) return; setAct(a.m, a.e); if (a.then) setTimeout(() => { if (player.act === a.m) setAct(a.then); }, 1100); },
    react(sum) { const a = sum >= 6 ? ["happy", "✨"] : sum <= -6 ? ["sad", "💧"] : ["nod", "👍"]; setAct(a[0], a[1]); clearTimeout(this._rt); this._rt = setTimeout(() => setAct(null, ""), 2600); },
    resetPlayer() {
      player.x = 3; player.z = 15.6; player.rot = player.targetRot = Math.PI; player.path = null; player.pending = null; player.seated = false;
      cam.yaw = 0; overviewT = 0;
    },
    onTalk(t) {
      talkTarget = t; player.path = null;
      const isBri = player.ch && player.ch.userData.bri;
      if (isBri && (t.id === "mydesk" || t.id === "meeting")) {
        const p = t.id === "mydesk" ? { x: 13.35, z: 10.15 } : { x: 5.9, z: 7.2 };
        player.x = p.x; player.z = p.z; player.rot = player.targetRot = 0; player.stand = t.id;
      }
      else if (t.id === "mydesk") { player.seated = { x: 12.5, z: 9.55, rot: Math.PI, chair: "s12" }; }
      else if (t.id === "meeting") { player.seated = { x: 5.5, z: 6.5, rot: Math.PI, chair: "ms2" }; }
      else if (t.look) R.faceTo(t);
      if (player.seated) { player.x = player.seated.x; player.z = player.seated.z; player.rot = player.targetRot = player.seated.rot; }
    },
    onTalkEnd() {
      setAct(null, "");
      if (player.seated) {
        const p = talkTarget ? ipoint(talkTarget) : { x: player.x, z: player.z + 0.8 };
        player.x = p.x; player.z = p.z; player.seated = false;
      }
      talkTarget = null; player.stand = null;
    },
    sync,
  };

  // ---------------------------------------------------------------
  // 마운트 · 입력
  // ---------------------------------------------------------------
  let labelEls = {}, promptEl = null, ro = null;
  function mount(app) {
    if (!built) initRenderer();
    stageEl = Story.shell(app, "3d");
    stageEl.appendChild(renderer.domElement);
    labelsEl = document.getElementById("glabels");
    mini = document.getElementById("minimap"); mctx = mini.getContext("2d");
    labelEls = {};
    NPCS.forEach((n) => { const d = document.createElement("div"); d.className = "lbl"; d.textContent = n.name; labelsEl.appendChild(d); labelEls[n.id] = d; });
    promptEl = document.createElement("button"); promptEl.className = "prompt3"; promptEl.innerHTML = "<b>Space</b> 말 걸기";
    promptEl.addEventListener("click", () => Story.press(" "));
    labelsEl.appendChild(promptEl);
    emoteEl = document.createElement("div"); emoteEl.className = "emote3"; emoteEl.textContent = player.emote || ""; labelsEl.appendChild(emoteEl);
    pillEl = document.createElement("div"); pillEl.className = "sitpill"; labelsEl.appendChild(pillEl);
    if (ro) ro.disconnect();
    ro = new ResizeObserver(resize); ro.observe(stageEl); resize();
    bindPointer();
    mini.addEventListener("click", (e) => {
      const r = mini.getBoundingClientRect();
      goTo((e.clientX - r.left) / r.width * 30, (e.clientY - r.top) / r.height * 18, null);
    });
    Story.attach(R);
    sync();
    if (!raf) { clock.getDelta(); raf = requestAnimationFrame(loop); }
  }
  function resize() {
    if (!stageEl) return;
    const w = stageEl.clientWidth, h = stageEl.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  function bindPointer() {
    const el = renderer.domElement;
    let down = null, moved = 0;
    el.onpointerdown = (e) => { down = { x: e.clientX, y: e.clientY }; moved = 0; el.setPointerCapture(e.pointerId); };
    el.onpointermove = (e) => {
      if (!down) return;
      const dx = e.clientX - down.x, dy = e.clientY - down.y; moved += Math.abs(dx) + Math.abs(dy);
      if (Story.mode === "walk") { cam.yaw -= dx * 0.0065; cam.pitch = Math.max(0.22, Math.min(1.25, cam.pitch + dy * 0.004)); }
      down = { x: e.clientX, y: e.clientY };
    };
    el.onpointerup = (e) => { if (down && moved < 6) click(e); down = null; };
    el.onwheel = (e) => { e.preventDefault(); cam.dist = Math.max(3.5, Math.min(13, cam.dist + e.deltaY * 0.006)); };
  }
  const ray = new THREE.Raycaster();
  function click(e) {
    if (Story.mode !== "walk" || !S.game || S.game.phase !== "play") return;
    const r = renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    ray.setFromCamera(v, camera);
    const chars = NPCS.filter((n) => npcs[n.id].visible).map((n) => npcs[n.id].ch);
    const hits = ray.intersectObjects(chars.concat(W.hit), true);
    if (hits.length) {
      let o = hits[0].object; while (o && !o.userData.target && !chars.includes(o)) o = o.parent;
      const id = o && (o.userData.target || NPCS.find((n) => npcs[n.id].ch === o).id);
      if (id) { const t = World.find(id), p = ipoint(t); return goTo(p.x, p.z, id); }
    }
    const fh = ray.intersectObject(W.floor);
    if (fh.length) goTo(fh[0].point.x, fh[0].point.z, null);
  }
  function goTo(x, z, id) {
    if (Story.mode !== "walk") return;
    const path = findPath(player.x, player.z, x, z);
    if (!path) return;
    player.path = path; player.pending = id; player.stuck = 0;
    const end = path[path.length - 1]; W.goalRing.position.set(end[0], 0.02, end[1]); W.goalRing.material.opacity = 0.9;
  }

  // ---------------------------------------------------------------
  // 루프
  // ---------------------------------------------------------------
  const perf = { n: 0, sum: 0, level: 0 };
  function adaptQuality(raw) {
    if (perf.level >= 2) return;
    perf.n++; perf.sum += raw;
    if (perf.n < 90) return;
    const avg = perf.sum / perf.n; perf.n = 0; perf.sum = 0;
    if (avg > 1 / 28) {
      perf.level++;
      if (perf.level === 1) { renderer.setPixelRatio(1); resize(); }
      if (perf.level === 2) { W.sun.shadow.autoUpdate = false; W.sun.shadow.needsUpdate = true; perf.staticShadow = true; }
    }
  }
  function loop() {
    if (!stageEl || !document.body.contains(renderer.domElement)) { raf = null; return; }
    const raw = clock.getDelta(), dt = Math.min(0.1, raw), t = clock.elapsedTime;
    if (document.visibilityState === "visible" && raw < 1) adaptQuality(raw);
    if (S.game) {
      if (cine.on) { stepCine(dt); player.moving = cine.walk; player.speed = 2.6; }
      else { if (ctw.length) stepCine(dt); if (Story.mode === "walk" && S.game.phase === "play") movePlayer(dt); else player.moving = false; }
      if (W.evDoorL) { W.evDoorL.position.x = 2.5 - W.evOpen * 0.98; W.evDoorR.position.x = 3.5 + W.evOpen * 0.98; }
      updateChars(dt, t);
      updateEnv(dt);
      updateMarkers(dt, t);
      updateCamera(dt, t);
      updateWalls(dt);
      if (perf.staticShadow && (perf.sh = (perf.sh || 0) + 1) % 6 === 0) W.sun.shadow.needsUpdate = true;
      renderer.render(scene, camera);
      updateLabels();
      if (emoteEl) { const sp = player.emote ? toScreen(new THREE.Vector3(player.x, 1.5, player.z)) : null; emoteEl.style.display = sp ? "" : "none"; if (sp) { emoteEl.style.left = sp.x + "px"; emoteEl.style.top = sp.y + "px"; } }
      drawMinimap(t);
    }
    raf = requestAnimationFrame(loop);
  }

  function movePlayer(dt) {
    const k = Story.keys;
    let ix = 0, iz = 0;
    if (k.ArrowUp) iz -= 1; if (k.ArrowDown) iz += 1; if (k.ArrowLeft) ix -= 1; if (k.ArrowRight) ix += 1;
    if (k.q) cam.yaw += dt * 1.8; if (k.e) cam.yaw -= dt * 1.8;
    let dx = 0, dz = 0;
    if (ix || iz) {
      player.path = null; player.pending = null;
      const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
      dx = -iz * fx + ix * rx; dz = -iz * fz + ix * rz;
    } else if (player.path && player.path.length) {
      const [tx, tz] = player.path[0], d = Math.hypot(tx - player.x, tz - player.z);
      if (d < (player.path.length === 1 ? 0.15 : 0.1)) { player.path.shift(); if (!player.path.length) arrive(); }
      else { dx = (tx - player.x) / d; dz = (tz - player.z) / d; }
    }
    const len = Math.hypot(dx, dz);
    player.moving = len > 0.01;
    if (!player.moving) { player.speed = 0; return; }
    dx /= len; dz /= len;
    const sp = (k.Shift ? 5.2 : 3.3) * dt; player.speed = k.Shift ? 5.2 : 3.3;
    const sol = solidsNow();
    const ox = player.x, oz = player.z;
    if (!blockedAt(player.x + dx * sp, player.z, sol)) player.x += dx * sp;
    if (!blockedAt(player.x, player.z + dz * sp, sol)) player.z += dz * sp;
    player.targetRot = Math.atan2(dx, dz);
    if (player.path) {
      if (Math.hypot(player.x - ox, player.z - oz) < sp * 0.3) { if ((player.stuck += dt) > 0.6) arrive(); }
      else player.stuck = 0;
    }
  }
  function arrive() {
    W.goalRing.material.opacity = 0;
    const id = player.pending; player.pending = null; player.path = null;
    if (id) {
      const t = World.find(id), nb = nearest();
      if (nb && nb.id === id) { R.faceTo(t); setTimeout(() => { if (Story.mode === "walk") Story.press(" "); }, 120); }
    }
  }


  // ---------------------------------------------------------------
  // 사무실 안 연출 (팝업 컷씬 대신): 엘리베이터 · 상황 모션 · 반응
  // ---------------------------------------------------------------
  const cine = { on: false, walk: false, cam: null }, ctw = [];
  let emoteEl = null, pillEl = null;
  const cEase = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
  function cTween(o, to, dur) { return new Promise((res) => { const from = {}; for (const p in to) from[p] = o[p]; ctw.push({ o, from, to, dur: Math.max(dur, 0.001), t: 0, res }); }); }
  const cWait = (s) => cTween({ v: 0 }, { v: 1 }, s);
  function stepCine(dt) {
    for (let i = ctw.length - 1; i >= 0; i--) {
      const w2 = ctw[i]; w2.t += dt; const k = Math.min(1, w2.t / w2.dur), e = cEase(k);
      for (const p in w2.to) w2.o[p] = w2.from[p] + (w2.to[p] - w2.from[p]) * e;
      if (k >= 1) { ctw.splice(i, 1); w2.res(); }
    }
  }
  function evDisplay(n, arrow) {
    const cv = W.evDispCv; if (!cv) return; const c = cv.getContext("2d");
    c.fillStyle = "#0b1a3a"; c.fillRect(0, 0, cv.width, cv.height); c.fillStyle = "#ffb400"; c.font = "bold 44px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText((arrow ? arrow + " " : "") + n + "F", cv.width / 2, cv.height / 2 + 2); W.evDispTex.needsUpdate = true;
  }
  function setEmote(e) { player.emote = e || ""; if (emoteEl) emoteEl.textContent = player.emote; }
  function setAct(a, e) { player.act = a || null; player.actT = 0; if (e !== undefined) setEmote(e); }
  function pill(text) {
    if (!pillEl) return; pillEl.textContent = text; pillEl.classList.add("on");
    clearTimeout(pill._t); pill._t = setTimeout(() => pillEl.classList.remove("on"), 2600);
  }
  async function cWalk(x, z) {
    const dx = x - player.x, dz = z - player.z, d = Math.hypot(dx, dz); if (d < 0.01) return;
    player.targetRot = Math.atan2(dx, dz); cine.walk = true; await cTween(player, { x, z }, d / 2.6); cine.walk = false;
  }
  async function elevator(dir) {
    cine.on = true; ctw.length = 0; player.path = null; player.pending = null; player.seated = false; talkTarget = null; setAct(null, "");
    cine.cam = { pos: new THREE.Vector3(3, 2.05, 12.4), look: new THREE.Vector3(3, 1.1, 17.2) };
    const d = DAYS[S.game.day - 1] || DAYS[0];
    if (dir === "up") {
      W.evOpen = 0; player.x = 3; player.z = 18.1; player.rot = player.targetRot = Math.PI;
      pill(`${d.label} · ${d.title} — 출근`);
      for (let f = 1; f <= 7; f++) { evDisplay(f, "▲"); await cWait(0.26); }
      evDisplay(7, ""); Story.sfx("ding"); await cTween(W, { evOpen: 1 }, 0.8);
      await cWalk(3, 15.6); player.targetRot = Math.PI;
      setAct("wave", "☀️"); await cWait(1.1); setAct(null, "");
      await cTween(W, { evOpen: 0 }, 0.6);
    } else {
      pill(`${d.label} — 오늘도 수고했어요`);
      evDisplay(7, "▼");
      await cWalk(3, 16.2); player.targetRot = Math.PI; await cWait(0.2);
      setAct("press"); await cWait(0.5); setAct(null);
      Story.sfx("door"); await cTween(W, { evOpen: 1 }, 0.8);
      await cWalk(3, 18.1); player.targetRot = 0; await cWait(0.35);
      setAct("wave", "👋"); await cWait(1.2); setAct(null, "");
      await cTween(W, { evOpen: 0 }, 0.7);
      for (let f = 6; f >= 1; f--) { evDisplay(f, "▼"); await cWait(0.24); }
      Story.sfx("ding");
    }
    cine.on = false; cine.cam = null;
  }
  // 브리 모션 (사람 캐릭터라면 무시)
  function applyAct(u, a, t) {
    const b = u.bri; if (!b) return;
    if (u.phone) u.phone.visible = a === "phone"; if (u.paper) u.paper.visible = a === "read";
    u.es.visible = a === "happy"; u.eo.visible = !u.es.visible;
    if (!a) { u.armL.rotation.z = -0.12; u.armR.rotation.z = 0.12; b.rotation.z = 0; return; }
    const k = player.actT;
    let y = 0, rx = null, ry = null, rz = 0, lx = null, lz = -0.12, rxA = null, rzR = 0.12;
    switch (a) {
      case "wave": rzR = 2.5 + Math.sin(t * 10) * 0.35; break;
      case "press": rzR = 0.6; rxA = -1.3; break;
      case "type": lx = -1.25 + Math.sin(t * 22) * 0.14; rxA = -1.25 + Math.sin(t * 22 + 1.6) * 0.14; lz = -0.05; rzR = 0.05; break;
      case "phone": rzR = 2.6; rxA = -0.35; rz = 0.06; y = k < 1.4 ? Math.sin(t * 40) * 0.008 : 0; break;
      case "think": rz = 0.12; rzR = 2.25; rxA = -0.7; break;
      case "surprised": y = k < 0.4 ? Math.sin(k / 0.4 * Math.PI) * 0.22 : 0; lz = -2.4; rzR = 2.4; break;
      case "happy": y = Math.abs(Math.sin(t * 6)) * 0.18; lz = -2.3 + Math.sin(t * 12) * 0.2; rzR = 2.3 - Math.sin(t * 12) * 0.2; break;
      case "sad": rx = 0.18; lz = -0.04; rzR = 0.04; b.scale.y = 0.93; break;
      case "nervous": ry = Math.sin(t * 2.6) * 0.55; lz = -0.08; rzR = 0.08; break;
      case "bow": rx = Math.max(0, Math.sin(k * 2.2)) * 0.5; lz = -0.05; rzR = 0.05; break;
      case "tired": rz = Math.sin(t * 1.3) * 0.09; rx = 0.08; lz = -0.05; rzR = 0.05; break;
      case "present": lz = -1.5; ry = -0.35; rzR = 0.3; break;
      case "read": lx = -1.05; rxA = -1.05; lz = 0.12; rzR = -0.12; rx = 0.08; break;
      case "nod": rx = k < 1.6 ? Math.max(0, Math.sin(k * 7)) * 0.15 : 0; break;
    }
    b.position.y += y; if (rx !== null) b.rotation.x = rx; if (ry !== null) b.rotation.y = ry; b.rotation.z = rz;
    u.armL.rotation.z = lz; u.armR.rotation.z = rzR; if (lx !== null) u.armL.rotation.x = lx; if (rxA !== null) u.armR.rotation.x = rxA;
  }

  function updateChars(dt, t) {
    // 플레이어
    if (player.ch) {
      player.rot = angLerp(player.rot, player.targetRot, Math.min(1, dt * 12));
      player.ch.position.set(player.x, 0, player.z); player.ch.rotation.y = player.rot;
      const seated = !!player.seated;
      if (seated && W.chairs[player.seated.chair]) W.chairs[player.seated.chair].rotation.y = player.rot;
      animate(player.ch, { moving: player.moving, speed: player.speed, seated, typing: seated && talkTarget && talkTarget.id === "mydesk", wave: S.game.phase === "ending" && !S.game.failKey, seed: 1 }, dt, t);
      player.actT = (player.actT || 0) + dt; applyAct(player.ch.userData, player.act, t);
    }
    // NPC
    const nb = Story.mode === "walk" ? nearest() : null;
    NPCS.forEach((n) => {
      const o = npcs[n.id]; if (!o.visible) return;
      const pl = o.place || n.p3, seated = !!pl.seat;
      const d = Math.hypot(player.x - o.x, player.z - o.z);
      const talking = talkTarget && talkTarget.id === n.id;
      const attentive = talking || (nb && nb.id === n.id);
      let want = pl.rot;
      if (attentive) want = Math.atan2(player.x - o.x, player.z - o.z);
      o.rot = angLerp(o.rot, want, Math.min(1, dt * (talking ? 5 : 3)));
      o.ch.rotation.y = o.rot;
      if (seated && W.chairs[pl.seat]) W.chairs[pl.seat].rotation.y = o.rot;
      let lookYaw = 0;
      if (d < 4 && !attentive) { lookYaw = angLerp(0, Math.atan2(player.x - o.x, player.z - o.z) - o.rot, 1); if (Math.abs(lookYaw) > 1.4) lookYaw = 0; }
      const facingDesk = Math.abs(angLerp(o.rot, pl.rot, 1) - pl.rot) < 0.3;
      animate(o.ch, { seated, typing: seated && facingDesk && !talking && n.id !== "oh", talking: talking && Story.mode === "dialog", cup: n.id === "yoon", lookYaw, seed: o.seed }, dt, t);
    });
  }

  function updateEnv(dt) {
    const gm = S.game, night = isNight();
    const n = World.dayCards().length || 1, p = gm.phase === "play" ? Math.min(1, gm.idx / n) : 0;
    const tgt = night
      ? { sun: "#6f7fd8", sunI: 0.18, sky: "#38457a", gr: "#2a2d40", hemiI: 0.42, bg: "#141a30", lamp: 1.3, office: 0.55, screen: 1.0, dir: [0.3, 1, -0.4], tex: "night" }
      : p < 0.5
        ? { sun: "#fff4e0", sunI: 1.0, sky: "#e8f2ff", gr: "#b8a98f", hemiI: 0.75, bg: "#cfe6f2", lamp: 0, office: 0.25, screen: 0.45, dir: [-0.35, 1, -0.6], tex: "day" }
        : { sun: "#ffb27a", sunI: 0.95, sky: "#ffe0c4", gr: "#b89a80", hemiI: 0.62, bg: "#f2c49b", lamp: 0.5, office: 0.35, screen: 0.6, dir: [-0.9, 0.55, -0.5], tex: "sunset" };
    const k = Math.min(1, dt * 1.5);
    env.sun.lerp(new THREE.Color(tgt.sun), k); env.hemiSky.lerp(new THREE.Color(tgt.sky), k); env.hemiG.lerp(new THREE.Color(tgt.gr), k); env.bg.lerp(new THREE.Color(tgt.bg), k);
    env.sunI += (tgt.sunI - env.sunI) * k; env.hemiI += (tgt.hemiI - env.hemiI) * k; env.lamp += (tgt.lamp - env.lamp) * k;
    env.office += (tgt.office - env.office) * k; env.screen += (tgt.screen - env.screen) * k;
    env.sunDir.lerp(new THREE.Vector3(...tgt.dir).normalize(), k);
    W.sun.color.copy(env.sun); W.sun.intensity = env.sunI;
    W.sun.position.copy(W.sun.target.position).addScaledVector(env.sunDir, 30);
    W.hemi.color.copy(env.hemiSky); W.hemi.groundColor.copy(env.hemiG); W.hemi.intensity = env.hemiI;
    scene.background.copy(env.bg);
    W.lamps.forEach((l) => { l.pl.intensity = env.lamp; l.bm.emissiveIntensity = 0.3 + env.lamp; });
    W.office.forEach((l) => (l.intensity = env.office));
    W.screens.forEach((m) => (m.emissiveIntensity = env.screen));
    W.skyMats.forEach((m) => { if (m.map !== W.sky[tgt.tex]) m.map = W.sky[tgt.tex]; });
    // 시계
    const hour = night ? 21 : 9 + p * 9, mins = (hour % 1) * 60;
    W.hourHand.rotation.z = -((hour % 12) / 12) * Math.PI * 2; W.minHand.rotation.z = -(mins / 60) * Math.PI * 2;
    W.hourHand.matrixAutoUpdate = W.minHand.matrixAutoUpdate = true;
  }

  function updateMarkers(dt, t) {
    const target = World.target(), card = S.game.phase === "play" ? World.curCard() : null;
    const showBang = target && Story.mode === "walk";
    W.bang.visible = !!showBang; W.ring.visible = !!showBang;
    if (showBang) {
      const h = headPos(target), ip = ipoint(World.find(target));
      W.bang.position.set(h.x, h.y + 0.62 + Math.sin(t * 4) * 0.07, h.z);
      W.ring.position.set(ip.x, 0.02, ip.z); const s = 1 + Math.sin(t * 4) * 0.08; W.ring.scale.set(s, s, s);
      W.ring.material.opacity = 0.45 + Math.sin(t * 4) * 0.2;
    }
    // 전화 벨 · 새 메일 · 문 · 게시판 강조
    const ringing = card && card.id === "c4" && !talkTarget;
    W.phoneLight.emissiveIntensity = ringing ? (Math.sin(t * 12) > 0 ? 2 : 0) : 0;
    W.handset.position.y = 0.06 + (ringing && Math.sin(t * 30) > 0 ? 0.012 : 0); W.handset.rotation.z = ringing ? Math.sin(t * 40) * 0.08 : 0;
    W.handset.matrixAutoUpdate = true;
    if (ringing && Story.mode === "walk") { ringT -= dt; if (ringT <= 0) { ringT = 1.6; if (Math.hypot(player.x - 12.5, player.z - 9) < 9) { Story.sfx("blip"); setTimeout(() => Story.sfx("blip"), 120); } } }
    const mail = card && ["c1", "c5", "c11"].includes(card.id);
    W.myScreen.map = W.myScreen.emissiveMap = mail ? W.texs.notify : W.texs.mail;
    if (mail) W.myScreen.emissiveIntensity = env.screen + 0.25 + Math.sin(t * 5) * 0.2;
    const doorOn = target === "door" && Story.mode === "walk";
    W.doorMats.forEach((m) => { m.emissiveIntensity = doorOn ? 0.25 + Math.sin(t * 4) * 0.2 : 0; });
    W.boardMat.emissiveIntensity = target === "board" ? 0.2 + Math.sin(t * 4) * 0.15 : 0;
    W.tvMat.emissiveIntensity = target === "meeting" ? 0.55 : 0.3;
    W.goalRing.material.opacity = Math.max(0, W.goalRing.material.opacity - dt * (player.path ? 0 : 2));
  }

  const tmpV = new THREE.Vector3();
  function updateCamera(dt, t) {
    const gm = S.game;
    let pos, look;
    if (cine.cam) { pos = cine.cam.pos; look = cine.cam.look; }
    else if (gm.phase === "dayIntro") {
      overviewT += dt;
      const a = -0.25 + Math.sin(overviewT * 0.12) * 0.18;
      pos = new THREE.Vector3(14 + Math.sin(a) * 17, 17, 10 + Math.cos(a) * 17); look = new THREE.Vector3(14, 0, 9.5);
    } else if (gm.phase === "retro" || gm.phase === "ending") {
      // 실내 쪽에서 플레이어를 비추는 고정 구도 + 살짝 흔들림
      const ix = player.x < 15 ? 1 : -1, iz = player.z > 9 ? -1 : 1, sw = Math.sin(t * 0.3) * 0.5;
      pos = new THREE.Vector3(Math.max(1.6, Math.min(28.4, player.x + ix * 3.2 + sw)), 2.3, Math.max(2.6, Math.min(16.4, player.z + iz * 3.2)));
      look = new THREE.Vector3(player.x, 1.05, player.z);
    } else if (talkTarget && player.stand === "mydesk") {
      pos = new THREE.Vector3(15.0, 2.35, 13.9); look = new THREE.Vector3(13.1, 0.3, 9.6);
    } else if (talkTarget && player.stand === "meeting") {
      pos = new THREE.Vector3(7.6, 2.35, 10.9); look = new THREE.Vector3(5.7, 0.3, 6.8);
    } else if (talkTarget && player.seated && talkTarget.id === "mydesk") {
      pos = new THREE.Vector3(13.5, 1.95, 11.0); look = new THREE.Vector3(12.4, 0.55, 8.6);
    } else if (talkTarget && player.seated && talkTarget.id === "meeting") {
      pos = new THREE.Vector3(8.5, 3.0, 7.9); look = new THREE.Vector3(4.8, 0.25, 4.6);
    } else if (talkTarget) {
      const h = headPos(talkTarget.id), P = new THREE.Vector3(player.x, 1.6, player.z);
      const dir = new THREE.Vector3(h.x - P.x, 0, h.z - P.z); if (dir.lengthSq() < 0.01) dir.set(0, 0, -1); dir.normalize();
      const perp = new THREE.Vector3(-dir.z, 0, dir.x);
      const side = perp.dot(tmpV.copy(cam.pos).sub(P)) >= 0 ? 1 : -1;
      pos = P.clone().addScaledVector(dir, -2.1).addScaledVector(perp, 1.35 * side); pos.y = 2.15;
      look = h.clone().addScaledVector(perp, 0.35 * side); look.y -= 0.62;
    } else {
      look = new THREE.Vector3(player.x, 1.25, player.z);
      pos = new THREE.Vector3(
        player.x + Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist,
        1.25 + Math.sin(cam.pitch) * cam.dist,
        player.z + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist);
    }
    const k = 1 - Math.exp(-dt * (gm.phase === "dayIntro" ? 1.2 : 4.5));
    cam.pos.lerp(pos, k); cam.look.lerp(look, k);
    camera.position.copy(cam.pos);
    if (cam.shake > 0) { cam.shake -= dt; const s = cam.shake * 0.25; camera.position.x += (Math.random() - 0.5) * s; camera.position.y += (Math.random() - 0.5) * s; }
    camera.lookAt(cam.look);
  }

  function updateWalls(dt) {
    const c = camera.position, out = { n: c.z < 2.0, s: c.z > 17.0, w: c.x < 1.0, e: c.x > 29.0 };
    Object.keys(W.sides).forEach((k) => {
      const tgt = out[k] ? 0.1 : 1;
      W.sideOpacity[k] += (tgt - W.sideOpacity[k]) * Math.min(1, dt * 8);
      const o = W.sideOpacity[k];
      W.sides[k].forEach((m) => { m.opacity = o * (m.userData.baseOpacity ?? 1); m.depthWrite = o > 0.95; });
    });
  }

  function toScreen(v) {
    const p = v.clone().project(camera);
    if (p.z > 1 || p.z < -1) return null;
    const w = stageEl.clientWidth, h = stageEl.clientHeight;
    return { x: (p.x + 1) / 2 * w, y: (1 - p.y) / 2 * h };
  }
  function updateLabels() {
    const target = World.target(), walk = Story.mode === "walk" && S.game.phase === "play";
    NPCS.forEach((n) => {
      const el = labelEls[n.id], o = npcs[n.id];
      if (!el) return;
      if (!o.visible || !walk) { el.style.display = "none"; return; }
      const h = headPos(n.id); h.y += 0.32;
      const sp = toScreen(h), d = camera.position.distanceTo(h);
      if (!sp || d > 16) { el.style.display = "none"; return; }
      el.style.display = "block"; el.style.transform = `translate(${sp.x}px, ${sp.y}px) translate(-50%, -100%)`;
      el.classList.toggle("target", n.id === target);
      el.style.opacity = Math.max(0.35, Math.min(1, 1.6 - d / 12));
    });
    const nb = walk ? nearest() : null;
    if (nb) {
      const h = headPos(nb.id); h.y += nb.look ? 0.75 : 0.45;
      const sp = toScreen(h);
      if (sp) {
        promptEl.style.display = "block"; promptEl.style.transform = `translate(${sp.x}px, ${sp.y}px) translate(-50%, -100%)`;
        promptEl.innerHTML = `<b>Space</b> ${nb.look ? "말 걸기" : esc(nb.name)}`;
        return;
      }
    }
    promptEl.style.display = "none";
  }

  function drawMinimap(t) {
    if (!mctx) return;
    const w = mini.width, h = mini.height, s = w / 30;
    mctx.drawImage(Game2D.getBG(), 0, 0, w, h);
    if (isNight()) { mctx.fillStyle = "rgba(20,24,60,.45)"; mctx.fillRect(0, 0, w, h); }
    World.visibleNpcs().forEach((n) => {
      const o = npcs[n.id]; if (!o.visible) return;
      mctx.fillStyle = "#2f4b6e"; mctx.beginPath(); mctx.arc(o.x * s, o.z * s, 3.2, 0, 7); mctx.fill();
    });
    const target = World.target();
    if (target) {
      const ip = ipoint(World.find(target)), pulse = 5 + Math.sin(t * 5) * 2;
      mctx.strokeStyle = "#e8a33d"; mctx.lineWidth = 2.5; mctx.beginPath(); mctx.arc(ip.x * s, ip.z * s, pulse, 0, 7); mctx.stroke();
      mctx.fillStyle = "#e8a33d"; mctx.beginPath(); mctx.arc(ip.x * s, ip.z * s, 2.5, 0, 7); mctx.fill();
    }
    mctx.save(); mctx.translate(player.x * s, player.z * s); mctx.rotate(-player.rot + Math.PI);
    mctx.fillStyle = "#c2453d"; mctx.strokeStyle = "#fff"; mctx.lineWidth = 1.5;
    mctx.beginPath(); mctx.moveTo(0, -7); mctx.lineTo(5, 5); mctx.lineTo(0, 2.5); mctx.lineTo(-5, 5); mctx.closePath(); mctx.fill(); mctx.stroke();
    mctx.restore();
  }

  // ---------------------------------------------------------------
  // 캐릭터 만들기 미리보기
  // ---------------------------------------------------------------
  let pv = null;
  function preview(container, lk) {
    if (!pv) {
      const r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); r.outputEncoding = THREE.sRGBEncoding; r.toneMapping = THREE.ACESFilmicToneMapping;
      r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
      const sc = new THREE.Scene();
      sc.add(new THREE.HemisphereLight("#ffffff", "#c9b9a0", 0.8));
      const d = new THREE.DirectionalLight("#ffffff", 0.9); d.position.set(2, 4, 3); d.castShadow = true; d.shadow.mapSize.set(1024, 1024); sc.add(d);
      const fl = new THREE.Mesh(new THREE.CircleGeometry(0.9, 40), new THREE.MeshStandardMaterial({ color: "#e4ddcf", roughness: 1 }));
      fl.rotation.x = -Math.PI / 2; fl.receiveShadow = true; sc.add(fl);
      const cm = new THREE.PerspectiveCamera(30, 220 / 280, 0.1, 20); cm.position.set(0, 1.25, 4.3); cm.lookAt(0, 0.95, 0);
      pv = { r, sc, cm, ch: null, key: "", raf: null, clock: new THREE.Clock() };
    }
    pv.r.setSize(220, 280);
    container.innerHTML = ""; container.appendChild(pv.r.domElement);
    const key = JSON.stringify(lk);
    if (pv.key !== key) { if (pv.ch) pv.sc.remove(pv.ch); pv.ch = makeChar(lk); pv.sc.add(pv.ch); pv.key = key; }
    if (!pv.raf) {
      const tick = () => {
        if (!document.body.contains(pv.r.domElement)) { pv.raf = null; return; }
        const dt = Math.min(0.05, pv.clock.getDelta()), t = pv.clock.elapsedTime;
        pv.ch.rotation.y = Math.sin(t * 0.6) * 0.7;
        animate(pv.ch, { wave: (t % 6) < 1.6, seed: 0 }, dt, t);
        pv.r.render(pv.sc, pv.cm); pv.raf = requestAnimationFrame(tick);
      };
      pv.raf = requestAnimationFrame(tick);
    }
  }

  return { supported: true, mount, preview, _player: player, _R: R, _goTo: goTo, _npcs: npcs };
})();
