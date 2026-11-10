// =============================================================
// 상황 컷씬 — 카드가 시작될 때 / 출퇴근할 때 재생되는 1인칭 애니메이션 일러스트 (SVG + CSS)
// 내 캐릭터는 화면에 나오지 않고, 내 손(아바타 피부 · 옷 색)과 나를 바라보는 사람들만 보인다.
// 규칙: 요소의 기본 상태 = 마지막 장면. CSS 애니메이션은 '처음 상태 → 기본 상태'로 움직인다.
//       그래서 정지 화면(.still)에서는 애니메이션만 끄면 최종 장면이 그대로 보인다.
//       .tmp 요소는 연출 중에만 잠깐 보이는 것(전화 벨 파동, 날아가는 종이비행기 등).
// =============================================================
const Scenes = (() => {
  const W = 640, H = 360;
  const FONT = "'Noto Sans KR', Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";
  const e = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const L = (id) => ({ ...DEFAULT_LOOK, ...(LOOKS[id] || id || {}) });

  // ---------- 애니메이션 래퍼 ----------
  // cls: 애니메이션 클래스, d: 지연(초), extra: 추가 style
  const A = (cls, d, inner, extra) => `<g class="${cls}" style="animation-delay:${d || 0}s;${extra || ""}">${inner}</g>`;
  const at = (x, y, inner, s) => `<g transform="translate(${x},${y})${s && s !== 1 ? ` scale(${s})` : ""}">${inner}</g>`;
  const T = (x, y, txt, o) => {
    o = o || {};
    return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${o.fs || 14}" font-weight="${o.fw || 600}" fill="${o.c || "#1f2733"}" text-anchor="${o.a || "start"}"${o.ls ? ` letter-spacing="${o.ls}"` : ""}>${e(txt)}</text>`;
  };

  // 한글 폭 대략 계산 후 줄바꿈
  const tw = (s, fs) => [...s].reduce((w, ch) => w + (/[ㄱ-힝]/.test(ch) ? 0.98 : /[A-Z0-9%]/.test(ch) ? 0.62 : /\s/.test(ch) ? 0.3 : 0.52) * fs, 0);
  function wrap(s, maxW, fs) {
    const out = []; let line = "";
    for (const word of s.split(" ")) {
      const t = line ? line + " " + word : word;
      if (tw(t, fs) > maxW && line) { out.push(line); line = word; } else line = t;
    }
    if (line) out.push(line);
    return out;
  }

  // ---------- 말풍선 ----------
  // tail: 꼬리 방향 "bl"(아래 왼쪽) "br" "b" | think: 생각 풍선
  function bubble(x, y, text, o) {
    o = o || {};
    const fs = o.fs || 15, maxW = o.maxW || 210, lines = wrap(text, maxW, fs);
    const w = Math.max(...lines.map((l) => tw(l, fs))) + 28, h = lines.length * (fs * 1.4) + 18;
    const bx = o.anchor === "r" ? x - w : o.anchor === "c" ? x - w / 2 : x, by = y - h;
    const fill = o.fill || "#fff", stroke = o.stroke || "#1f2733";
    const tail = o.think
      ? `<circle cx="${o.tx || bx + 26}" cy="${by + h + 9}" r="6" fill="${fill}" stroke="${stroke}" stroke-width="2"/><circle cx="${(o.tx || bx + 26) - 8}" cy="${by + h + 21}" r="3.5" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`
      : (() => { const tx = o.tx != null ? o.tx : o.anchor === "r" ? bx + w - 30 : bx + 30, dir = o.tdir || (o.anchor === "r" ? 1 : -1);
        return `<path d="M${tx - 9},${by + h - 1} L${tx + dir * 12},${by + h + 16} L${tx + 9},${by + h - 1}Z" fill="${fill}" stroke="${stroke}" stroke-width="2" stroke-linejoin="round"/><rect x="${tx - 10}" y="${by + h - 4}" width="20" height="4" fill="${fill}"/>`; })();
    const body = `<rect x="${bx}" y="${by}" width="${w}" height="${h}" rx="${o.think ? h / 2.2 : 14}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>${tail}
      ${lines.map((l, i) => T(bx + w / 2, by + 9 + fs * 1.05 + i * fs * 1.4, l, { fs, a: "middle", c: o.color || "#1f2733" })).join("")}`;
    return A("c-pop c-orig-b", o.d, body);
  }
  const chip = (x, y, text, o) => {
    o = o || {}; const fs = o.fs || 13, w = tw(text, fs) + 22;
    return A(o.cls || "c-in", o.d, `<rect x="${x}" y="${y}" width="${w}" height="${fs + 13}" rx="${(fs + 13) / 2}" fill="${o.bg || "#1f2733"}" opacity="${o.op || 0.88}"/>${T(x + 11, y + fs + 3, text, { fs, c: o.c || "#fff" })}`);
  };

  // ---------- 사람 ----------
  // 원점 = 두 발 가운데. 키 약 200. pose: stand | phone | think | point | wave | hold | cheer | arms
  // expr: smile | worry | surprise | angry | tired | neutral | happy
  function person(look, o) {
    o = o || {};
    const lk = { ...DEFAULT_LOOK, ...look }, sk = lk.skin, hr = lk.hair, sh = lk.shirt, pt = lk.pants;
    const gx = o.gaze || 0, ex = o.expr || "neutral";
    const darker = shade(sh, -0.18);
    const arm = (side, ang, cls) => {
      const sx = side < 0 ? -25 : 25;
      return `<g transform="translate(${sx},-122)"><g class="${cls || ""}"><g transform="rotate(${ang})"><rect x="-6" y="-4" width="12" height="54" rx="6" fill="${darker}"/><circle cx="0" cy="54" r="7.5" fill="${sk}"/></g></g></g>`;
    };
    const poses = {
      stand: [8, -8], phone: [8, -166], think: [8, -173], point: [8, -96], wave: [8, -150], hold: [-30, 30],
      cheer: [150, -150], arms: [40, -40], tea: [8, -40],
    };
    const [al, ar] = poses[o.pose || "stand"];
    const hairBack = lk.style === "long" ? `<path d="M-33,-165 Q-36,-118 -26,-104 L26,-104 Q36,-118 33,-165Z" fill="${hr}"/>` : "";
    const hairTop = `<path d="M-32,-158 Q-34,-198 0,-197 Q34,-198 32,-158 Q27,-176 10,-178 Q-6,-171 -20,-176 Q-28,-172 -32,-158Z" fill="${hr}"/>` +
      (lk.style === "bun" ? `<circle cx="0" cy="-200" r="13" fill="${hr}"/>` : "") +
      (lk.style === "long" ? `<path d="M-32,-162 Q-35,-140 -31,-122 L-26,-124 Q-29,-148 -27,-166Z M32,-162 Q35,-140 31,-122 L26,-124 Q29,-148 27,-166Z" fill="${hr}"/>` : "");
    const brows = { worry: `<path d="M${-15 + gx},-172 L${-5 + gx},-169 M${15 + gx},-172 L${5 + gx},-169" stroke="${shade(hr, -0.1)}" stroke-width="2.6" stroke-linecap="round" transform="rotate(0)"/>`,
      angry: `<path d="M${-16 + gx},-174 L${-4 + gx},-168 M${16 + gx},-174 L${4 + gx},-168" stroke="#2a1d18" stroke-width="3.2" stroke-linecap="round"/>`,
      surprise: `<path d="M${-15 + gx},-176 Q${-10 + gx},-180 ${-5 + gx},-176 M${15 + gx},-176 Q${10 + gx},-180 ${5 + gx},-176" stroke="#2a1d18" stroke-width="2.4" fill="none" stroke-linecap="round"/>` }[ex] || "";
    const eyes = ex === "tired"
      ? `<path d="M${-14 + gx},-158 L${-6 + gx},-158 M${6 + gx},-158 L${14 + gx},-158" stroke="#1f2733" stroke-width="3" stroke-linecap="round"/>`
      : ex === "happy"
        ? `<path d="M${-14 + gx},-157 Q${-10 + gx},-163 ${-6 + gx},-157 M${6 + gx},-157 Q${10 + gx},-163 ${14 + gx},-157" stroke="#1f2733" stroke-width="2.8" fill="none" stroke-linecap="round"/>`
        : `<g class="c-blink"><ellipse cx="${-10 + gx}" cy="-158" rx="3.3" ry="${ex === "surprise" ? 4.6 : 3.8}" fill="#1f2733"/><ellipse cx="${10 + gx}" cy="-158" rx="3.3" ry="${ex === "surprise" ? 4.6 : 3.8}" fill="#1f2733"/></g>`;
    const mouth = {
      smile: `<path d="M${-8 + gx},-144 Q${gx},-136 ${8 + gx},-144" stroke="#7a3b2e" stroke-width="2.6" fill="none" stroke-linecap="round"/>`,
      happy: `<path d="M${-9 + gx},-145 Q${gx},-133 ${9 + gx},-145Z" fill="#7a3b2e"/>`,
      worry: `<path d="M${-7 + gx},-139 Q${gx},-145 ${7 + gx},-139" stroke="#7a3b2e" stroke-width="2.6" fill="none" stroke-linecap="round"/>`,
      surprise: `<ellipse cx="${gx}" cy="-140" rx="5" ry="6.5" fill="#7a3b2e"/>`,
      angry: `<path d="M${-9 + gx},-137 Q${gx},-145 ${9 + gx},-137" stroke="#7a3b2e" stroke-width="3" fill="none" stroke-linecap="round"/>`,
      tired: `<path d="M${-6 + gx},-141 L${6 + gx},-141" stroke="#7a3b2e" stroke-width="2.6" stroke-linecap="round"/>`,
    }[ex] || `<path d="M${-6 + gx},-142 Q${gx},-139 ${6 + gx},-142" stroke="#7a3b2e" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
    const glasses = lk.glasses ? `<g stroke="#2b2b33" stroke-width="2" fill="rgba(255,255,255,.18)"><circle cx="${-10 + gx}" cy="-158" r="8.5"/><circle cx="${10 + gx}" cy="-158" r="8.5"/><path d="M${-1.5 + gx},-158 L${1.5 + gx},-158"/></g>` : "";
    const tie = lk.tie ? `<path d="M-4,-126 L4,-126 L6,-86 L0,-78 L-6,-86Z" fill="${lk.tie}"/>` : `<path d="M-9,-128 L0,-118 L9,-128" stroke="${shade(sh, -0.3)}" stroke-width="2" fill="none"/>`;
    const sweat = o.sweat ? A("c-drip", o.sweatD || 0, `<path d="M30,-186 Q36,-176 30,-171 Q24,-176 30,-186Z" fill="#7cc4f2" stroke="#3d8fd1" stroke-width="1.2"/>`) : "";
    const held = o.pose === "phone" ? `<rect x="22" y="-190" width="12" height="24" rx="3" fill="#2b2f3a" transform="rotate(14 28 -178)"/>`
      : o.pose === "hold" ? `<rect x="-22" y="-112" width="44" height="54" rx="3" fill="#fff" stroke="#c9d2de" stroke-width="2"/><path d="M-14,-100 H14 M-14,-91 H10 M-14,-82 H12 M-14,-73 H6" stroke="#9aa6b6" stroke-width="2.4" stroke-linecap="round"/>`
      : o.pose === "tea" ? `<g transform="translate(24,-74)"><rect x="-8" y="-10" width="16" height="18" rx="3" fill="#fff" stroke="#c9d2de" stroke-width="1.5"/><path d="M8,-6 Q14,-3 8,2" stroke="#c9d2de" stroke-width="2" fill="none"/></g>` : "";
    const legs = o.seated ? "" : `<rect x="-17" y="-68" width="14" height="66" rx="6" fill="${pt}"/><rect x="3" y="-68" width="14" height="66" rx="6" fill="${pt}"/>
      <ellipse cx="-11" cy="-1" rx="11" ry="5" fill="#2b2b33"/><ellipse cx="11" cy="-1" rx="11" ry="5" fill="#2b2b33"/>`;
    const body = `${legs}
      ${arm(-1, al)}
      <rect x="-27" y="-130" width="54" height="${o.seated ? 130 : 70}" rx="16" fill="${sh}"/>
      ${o.seated ? "" : `<rect x="-27" y="-74" width="54" height="10" rx="3" fill="${pt}"/>`}
      ${tie}
      ${o.pose === "wave" ? `<g transform="translate(25,-122)"><g class="c-wave"><g transform="rotate(-150)"><rect x="-6" y="-4" width="12" height="54" rx="6" fill="${darker}"/><circle cx="0" cy="54" r="7.5" fill="${sk}"/></g></g></g>` : arm(1, ar)}
      ${held}
      <rect x="-7" y="-136" width="14" height="10" fill="${shade(sk, -0.08)}"/>
      ${hairBack}
      <circle cx="0" cy="-158" r="30" fill="${sk}"/>
      <ellipse cx="-29" cy="-156" rx="5" ry="7" fill="${shade(sk, -0.06)}"/><ellipse cx="29" cy="-156" rx="5" ry="7" fill="${shade(sk, -0.06)}"/>
      ${hairTop}
      <ellipse cx="${-17 + gx}" cy="-146" rx="5.5" ry="3.2" fill="#ff8f8f" opacity=".35"/><ellipse cx="${17 + gx}" cy="-146" rx="5.5" ry="3.2" fill="#ff8f8f" opacity=".35"/>
      ${brows}${eyes}${glasses}${mouth}${sweat}`;
    const shadowEl = o.seated ? "" : `<ellipse cx="0" cy="0" rx="34" ry="7" fill="rgba(0,0,0,.14)"/>`;
    return `${shadowEl}<g class="${o.idle === false ? "" : "c-breathe"}">${body}</g>`;
  }
  // 몸 전체 배치 + 애니메이션 묶음
  const P = (x, y, s, look, o, anim) => at(x, y, anim ? A(anim.cls, anim.d, person(look, o), anim.style) : person(look, o), s);
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const f = (c) => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
    return "#" + ((1 << 24) | (f(r) << 16) | (f(g) << 8) | f(b)).toString(16).slice(1);
  }

  // ---------- 배경 · 소품 ----------
  function bgOffice(o) {
    o = o || {};
    const sky = o.night ? ["#1b2440", "#2c3a63"] : o.sunset ? ["#f6b26b", "#f9d9a6"] : ["#8cc8f0", "#d8eefb"];
    const wall = o.night ? "#3a4258" : "#eef1f5", floor = o.night ? "#4b4652" : "#d8c6a8";
    return `<defs><linearGradient id="sk${o.id || ""}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient></defs>
      <rect width="${W}" height="${H}" fill="${wall}"/>
      <rect y="262" width="${W}" height="${H - 262}" fill="${floor}"/>
      <rect y="258" width="${W}" height="6" fill="${o.night ? "#2e3445" : "#c9cfd8"}"/>
      ${(o.win || [[40, 40, 150, 120], [450, 40, 150, 120]]).map(([x, y, w, h]) => `<rect x="${x - 6}" y="${y - 6}" width="${w + 12}" height="${h + 12}" rx="6" fill="${o.night ? "#232a3b" : "#fff"}"/>
        <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#sk${o.id || ""})"/>
        ${o.night ? `<circle cx="${x + w - 30}" cy="${y + 30}" r="13" fill="#f6efc4"/><circle cx="${x + w - 24}" cy="${y + 26}" r="12" fill="#2a3557"/>
          ${[[0.2, 0.3], [0.45, 0.2], [0.3, 0.65], [0.6, 0.55], [0.15, 0.8]].map(([a, b]) => `<circle class="c-twinkle" style="animation-delay:${a * 3}s" cx="${x + w * a}" cy="${y + h * b}" r="1.6" fill="#fff"/>`).join("")}`
          : `<g opacity=".85"><rect x="${x + 14}" y="${y + h - 46}" width="22" height="46" fill="${o.sunset ? "#c98a63" : "#a7c4dc"}"/><rect x="${x + 40}" y="${y + h - 70}" width="28" height="70" fill="${o.sunset ? "#b97b58" : "#93b4d0"}"/><rect x="${x + 72}" y="${y + h - 38}" width="24" height="38" fill="${o.sunset ? "#d29a72" : "#b6cfe3"}"/><rect x="${x + 100}" y="${y + h - 58}" width="30" height="58" fill="${o.sunset ? "#c08562" : "#9fbdd6"}"/></g>
             <g class="c-cloud"><ellipse cx="${x + 40}" cy="${y + 28}" rx="20" ry="8" fill="#fff" opacity=".9"/><ellipse cx="${x + 54}" cy="${y + 24}" rx="14" ry="8" fill="#fff" opacity=".9"/></g>`}
        <path d="M${x + w / 2},${y} V${y + h}" stroke="${o.night ? "#232a3b" : "#fff"}" stroke-width="5"/>`).join("")}
      ${o.sign !== false ? `<g><rect x="262" y="34" width="116" height="34" rx="8" fill="${o.night ? "#2c3346" : "#1f2733"}"/>${T(320, 57, o.sign || "인사팀 · HR", { fs: 14, a: "middle", c: "#ffd27a", fw: 700 })}</g>` : ""}`;
  }
  const plant = (x, y, s) => at(x, y, `<g class="c-sway"><ellipse cx="-14" cy="-58" rx="12" ry="24" fill="#3f8a68" transform="rotate(-24 -14 -58)"/><ellipse cx="14" cy="-60" rx="12" ry="26" fill="#4fa37c" transform="rotate(22 14 -60)"/><ellipse cx="0" cy="-70" rx="11" ry="28" fill="#5cb88b"/></g><path d="M-18,-36 L18,-36 L13,0 L-13,0Z" fill="#c8794a"/>`, s);
  const desk = (x, y, w, o) => {
    o = o || {};
    return `<g><rect x="${x}" y="${y}" width="${w}" height="14" rx="4" fill="${o.top || "#b98a5e"}"/><rect x="${x + 8}" y="${y + 14}" width="${w - 16}" height="${H - y - 14}" fill="${o.front || "#a37650"}"/>
      <rect x="${x + 8}" y="${y + 14}" width="${w - 16}" height="6" fill="rgba(0,0,0,.12)"/></g>`;
  };
  // 모니터 (screen: 내부 SVG, 좌표 0..sw, 0..sh)
  const monitor = (x, y, sw, sh, screen) => `<g transform="translate(${x},${y})">
    <rect x="${sw / 2 - 8}" y="${sh}" width="16" height="22" fill="#5b6270"/><rect x="${sw / 2 - 30}" y="${sh + 20}" width="60" height="6" rx="3" fill="#5b6270"/>
    <rect x="-8" y="-8" width="${sw + 16}" height="${sh + 16}" rx="8" fill="#2b2f3a"/>
    <rect width="${sw}" height="${sh}" rx="3" fill="#f7f9fc"/>
    <svg width="${sw}" height="${sh}" viewBox="0 0 ${sw} ${sh}" overflow="hidden">${screen || ""}</svg></g>`;
  const mug = (x, y, steam) => at(x, y, `${steam ? `<g opacity=".6">${[0, 1].map((k) => `<path class="c-rise" style="animation-delay:${k * 0.7}s" d="M${-4 + k * 8},-20 q-5,-8 0,-16 q5,-8 0,-16" stroke="#cfd6df" stroke-width="2.5" fill="none" stroke-linecap="round"/>`).join("")}</g>` : ""}
    <rect x="-11" y="-18" width="22" height="20" rx="4" fill="#fff" stroke="#c9d2de" stroke-width="1.5"/><path d="M11,-13 Q19,-9 11,-3" stroke="#c9d2de" stroke-width="2.4" fill="none"/>`);
  const clock = (x, y, r, hh, mm, spin) => {
    const ha = (hh % 12) * 30 + mm * 0.5, ma = mm * 6;
    return at(x, y, `<circle r="${r + 4}" fill="#2b2f3a"/><circle r="${r}" fill="#fff"/>
      ${Array.from({ length: 12 }, (_, i) => `<rect x="-1.2" y="${-r + 3}" width="2.4" height="${i % 3 ? 4 : 7}" fill="#2b2f3a" transform="rotate(${i * 30})"/>`).join("")}
      <g transform="rotate(${ha})"><g class="${spin ? "c-spin-h" : ""}"><rect x="-2.5" y="${-r * 0.5}" width="5" height="${r * 0.5}" rx="2" fill="#2b2f3a"/></g></g>
      <g transform="rotate(${ma})"><g class="${spin ? "c-spin" : ""}"><rect x="-1.6" y="${-r * 0.8}" width="3.2" height="${r * 0.8}" rx="1.5" fill="#c2453d"/></g></g>
      <circle r="3.5" fill="#2b2f3a"/>`);
  };
  const qmarks = (x, y, d, txt) => A("c-pop", d, at(x, y, `${A("c-float", 0, `${T(0, 0, txt || "?", { fs: 30, fw: 800, c: "#e8a33d" })}${T(22, -16, txt === "!" ? "!" : "?", { fs: 22, fw: 800, c: "#e8a33d" })}`)}`));
  const doc = (x, y, label, color) => at(x, y, `<rect x="-26" y="-34" width="52" height="66" rx="4" fill="#fff" stroke="#c9d2de" stroke-width="2"/><rect x="-26" y="-34" width="52" height="14" rx="4" fill="${color || "#5b8def"}"/>
    ${T(0, -23, label, { fs: 9, a: "middle", c: "#fff", fw: 700 })}<path d="M-16,-8 H16 M-16,2 H12 M-16,12 H14 M-16,22 H6" stroke="#b5bfcc" stroke-width="2.4" stroke-linecap="round"/>`);

  // ---------- 1인칭 소품: 내 손 · 상반신 클로즈업 ----------
  // 손등이 보이는 손 (손가락이 화면 위쪽). 소매는 화면 밖으로 이어진다. flip: 왼손
  function hand(me, x, y, ang, o) {
    o = o || {};
    if (me && me.bri) {
      const c = me.bri.c || me.skin, d = shade(c, -0.25), s2 = o.s || 1;
      return `<g transform="translate(${x},${y}) rotate(${ang}) scale(${o.flip ? -s2 : s2},${s2})"><rect x="-26" y="-6" width="52" height="260" rx="26" fill="${c}"/><ellipse cx="0" cy="-6" rx="30" ry="28" fill="${c}" stroke="${d}" stroke-width="1.6"/><path d="M-12,-20 a14,14 0 0 1 16,-6" stroke="#fff" stroke-opacity=".35" stroke-width="5" stroke-linecap="round" fill="none"/></g>`;
    }
    const sk = me.skin, d = shade(sk, -0.2), sl = me.shirt, s = o.s || 1;
    const finger = (fx, fh) => `<rect x="${fx - 5.5}" y="${-22 - fh}" width="11" height="${fh + 12}" rx="5.5" fill="${sk}" stroke="${d}" stroke-width="1.6"/>`;
    return `<g transform="translate(${x},${y}) rotate(${ang}) scale(${o.flip ? -s : s},${s})">
      <rect x="-27" y="12" width="54" height="240" rx="12" fill="${sl}"/><rect x="-27" y="12" width="54" height="14" rx="6" fill="${shade(sl, -0.2)}"/>
      ${o.fist ? "" : finger(-15, 18) + finger(-5, 24) + finger(5, 23) + finger(15, 17)}
      <rect x="-22" y="-26" width="44" height="44" rx="16" fill="${sk}" stroke="${d}" stroke-width="1.6"/>
      <ellipse cx="-24" cy="-4" rx="8" ry="15" fill="${sk}" stroke="${d}" stroke-width="1.6" transform="rotate(-32 -24 -4)"/>
      ${o.fist ? `<path d="M-14,-24 v8 M-4,-26 v8 M6,-26 v8 M15,-23 v7" stroke="${d}" stroke-width="1.6"/>` : ""}</g>`;
  }
  const keyboard = (me, slow) => `<path d="M150,296 L490,296 L560,360 L80,360Z" fill="#3b4250"/>
    ${[0, 1, 2].map((r) => `<path d="M${165 - r * 22},${308 + r * 17} L${475 + r * 22},${308 + r * 17}" stroke="#5b6270" stroke-width="9" stroke-dasharray="16 4"/>`).join("")}
    ${A("c-tap", 0, hand(me, 230, 330, 14, { flip: true }), slow ? "animation-duration:.5s" : "")}
    ${A("c-tap", 0.12, hand(me, 410, 330, -14), slow ? "animation-duration:.5s;animation-delay:.3s" : "animation-delay:.12s")}`;
  const deskTop = (y, c) => `<rect y="${y}" width="${W}" height="${H - y}" fill="${c || "#c49a6c"}"/><rect y="${y}" width="${W}" height="7" fill="${shade(c || "#c49a6c", -0.12)}"/>`;
  // 서류를 두 손으로 들고 보는 모습 (inner: 0..280 × 0..200 좌표)
  const paperInHands = (me, inner, cls, d) => A(cls || "c-up", d || 0, `<g transform="translate(180,150) rotate(-2)"><rect x="-4" y="4" width="288" height="230" rx="6" fill="rgba(0,0,0,.15)"/><rect width="280" height="230" rx="6" fill="#fff" stroke="#d6dbe3" stroke-width="2"/>
    <svg width="280" height="200" viewBox="0 0 280 200">${inner}</svg></g>${hand(me, 182, 330, 18, { flip: true, fist: true })}${hand(me, 452, 330, -18, { fist: true })}`);
  // 다른 사람 상반신 (나를 바라봄)
  const Bu = (x, look, o, s, y, anim) => P(x, y || 430, s || 1.5, look, { seated: true, ...(o || {}) }, anim);
  // 내 생각 (아래쪽 = 나에게서 나오는 생각 풍선)
  const mine = (x, y, text, d, o) => bubble(x, y, text, { think: true, anchor: "c", tx: x + 6, fill: "#fffdf3", d, fs: 13, maxW: 190, ...(o || {}) });
  const vignette = `<defs><radialGradient id="vig" cx="50%" cy="48%" r="75%"><stop offset=".62" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".32"/></radialGradient></defs><rect width="${W}" height="${H}" fill="url(#vig)" pointer-events="none"/>`;

  // ---------- 개별 장면 (모두 1인칭: 내 눈에 보이는 화면) ----------
  // 반환: { svg, dur(ms), place, sfx: [[초, 효과음]] }
  const SC = {};

  // 출근 · 퇴근 — 엘리베이터 안에서 문을 바라보는 시점
  SC.elevator = (ctx, dir) => {
    const up = dir !== "down", day = ctx.day || 1, me = ctx.me, night = !up;
    const floors = up ? [1, 2, 3, 4, 5, 6] : [7, 6, 5, 4, 3, 2], last = up ? 7 : 1;
    const step = 0.2, t0 = up ? 0.15 : 1.9;
    const greet = [["park", "어서 와요! 첫 출근 환영해요 🎉"], ["lee", "채용 시즌 시작! 오늘도 화이팅 ☀️"], ["jung", "오늘 첫 교육 운영이죠? 잘 될 거예요"], ["han", "벌써 80일이네요. 오늘도 잘 부탁해요"]][day - 1] || ["park", "좋은 아침이에요!"];
    // 문 너머로 보이는 7층 사무실
    const office = up
      ? `${bgOffice({ id: "ev", win: [[120, 96, 110, 90], [410, 96, 110, 90]] })}
         ${P(330, 330, 0.85, L(greet[0]), { expr: "happy", pose: "wave" })}
         <rect x="150" y="262" width="340" height="12" rx="4" fill="#b98a5e"/>`
      : `${bgOffice({ id: "evn", night: true, win: [[120, 96, 110, 90], [410, 96, 110, 90]] })}
         <rect x="150" y="226" width="340" height="12" rx="4" fill="#5e4a3a"/>
         ${[200, 300, 400].map((x) => `<rect x="${x}" y="186" width="56" height="38" rx="3" fill="#232a3b"/>`).join("")}
         <rect x="300" y="186" width="56" height="38" rx="3" fill="#ffe9a8" opacity=".55"/>`;
    const doorDelay = up ? 1.75 : 0.95;
    const door = (x0, dx) => `<g class="c-door" style="--dx:${dx}px;animation-delay:${doorDelay}s"><rect x="${x0}" y="78" width="160" height="262" fill="url(#steel)"/><rect x="${x0 < 320 ? x0 + 156 : x0}" y="78" width="4" height="262" fill="#9aa1ad"/></g>`;
    const hold = up ? (day === 1
      ? A("c-up", 0.1, `<g transform="translate(520,250) rotate(-8)"><path d="M-30,-90 L0,-40 L30,-90" stroke="#5b8def" stroke-width="5" fill="none"/><rect x="-40" y="-44" width="80" height="108" rx="8" fill="#fff" stroke="#c9d2de" stroke-width="2"/><rect x="-40" y="-44" width="80" height="22" rx="8" fill="#004aad"/>${T(0, -28, "HiBridge", { fs: 10, a: "middle", c: "#fff", fw: 800 })}
          <g transform="translate(-20,-20)"><svg width="40" height="40" viewBox="24 2 152 152">${me.bri ? HBArt.bri({ ...me.bri, head: true, wave: false }).replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "") : ""}</svg></g>${T(0, 40, ctx.name || "신입사원", { fs: 11, a: "middle", fw: 800 })}${T(0, 55, "인사팀 · 신입", { fs: 8, a: "middle", c: "#7a8494" })}</g>${hand(me, 536, 330, -6, { fist: true })}`)
      : A("c-up", 0.1, `<g transform="translate(530,268)"><rect x="-26" y="-50" width="52" height="64" rx="8" fill="#fff" stroke="#c9d2de" stroke-width="2"/><rect x="-26" y="-36" width="52" height="20" fill="#004aad"/><rect x="-28" y="-56" width="56" height="10" rx="4" fill="#2b2f3a"/>
          <g opacity=".6">${[0, 1].map((k) => `<path class="c-rise" style="animation-delay:${k * 0.7}s" d="M${-6 + k * 12},-62 q-6,-9 0,-18 q6,-9 0,-18" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>`).join("")}</g></g>${hand(me, 540, 300, -90, { fist: true, s: 0.9 })}`)) : "";
    return {
      place: up ? `🏢 하이브릿지 본사 엘리베이터 · 오전 8:5${day}` : `🌙 퇴근길 엘리베이터 · 오후 ${(["6:05", "6:40", "7:10", "9:20"][day - 1] || "6:00")}`,
      dur: up ? 4400 : 4000,
      sfx: up ? [[1.55, "ding"], [2.7, "pop"]] : [[0.95, "door"], [3.3, "ding"]],
      svg: `<defs><linearGradient id="steel" x1="0" x2="1"><stop offset="0" stop-color="#d9dde3"/><stop offset=".5" stop-color="#b3b9c3"/><stop offset="1" stop-color="#cdd2d9"/></linearGradient>
          <clipPath id="evclip"><rect x="160" y="78" width="320" height="262"/></clipPath></defs>
        ${A(up ? "c-walkout" : "", up ? 2.6 : 0, `
          <g clip-path="url(#evclip)">${office}${up ? door(0, 160) + door(480, -160) : door(160, -160) + door(320, 160)}</g>
          <!-- 엘리베이터 안쪽 벽 · 천장 · 바닥 (원근) -->
          <path d="M0,0 L160,78 L160,340 L0,360Z" fill="${night ? "#7d828d" : "#b9bec8"}"/><path d="M640,0 L480,78 L480,340 L640,360Z" fill="${night ? "#747984" : "#b0b6c0"}"/>
          <path d="M0,0 L640,0 L480,78 L160,78Z" fill="${night ? "#5d626c" : "#9aa0aa"}"/><rect x="250" y="18" width="140" height="18" rx="6" fill="${night ? "#f3e6b8" : "#fffbe8"}" opacity=".85"/>
          <path d="M0,360 L160,340 L480,340 L640,360Z" fill="${night ? "#55565e" : "#8d8f96"}"/>
          <path d="M0,200 L160,188" stroke="#d6dae0" stroke-width="7" stroke-linecap="round"/><path d="M640,200 L480,188" stroke="#d6dae0" stroke-width="7" stroke-linecap="round"/>
          <rect x="156" y="74" width="328" height="270" fill="none" stroke="${night ? "#596178" : "#8f97a3"}" stroke-width="8"/>
          <rect x="270" y="46" width="100" height="26" rx="5" fill="#1b1f27"/>${T(292, 65, up ? "▲" : "▼", { fs: 13, a: "middle", c: "#ff8a3d" })}
          ${floors.map((f, i) => A("c-flash", t0 + i * step, T(336, 66, `${f}F`, { fs: 17, fw: 800, a: "middle", c: "#ff8a3d" }), `animation-duration:${step}s`)).join("")}
          ${A("c-in", t0 + floors.length * step, T(336, 66, `${last}F`, { fs: 17, fw: 800, a: "middle", c: "#ffb36b" }))}
          <g transform="translate(560,170) skewY(8)"><rect width="40" height="96" rx="6" fill="#9ba3af"/>${[1, 2, 3, 4, 5, 6, 7].map((f, i) => `<circle cx="${i % 2 ? 28 : 12}" cy="${14 + Math.floor(i / 2) * 20}" r="7" fill="${f === 7 ? "#ffd27a" : "#e7eaef"}" stroke="#6b7380" stroke-width="1.5"/>`).join("")}</g>`)}
        ${up ? bubble(330, 116, greet[1], { d: 2.7, fs: 13, maxW: 200, anchor: "c", tx: 330 }) : ""}
        ${hold}
        ${up && day === 1 ? mine(150, 300, "두근두근… 첫 출근이다", 0.6) : ""}
        ${!up ? mine(320, 300, (["첫날 끝! '오늘 중'은 꼭 물어보자", "친절과 약속은 다르다… 기억하자", "나쁜 소식은 빨리, 결론부터", "하아… 길었다. 내일은 도움 요청하기"][day - 1] || "오늘도 수고했다"), 2.4) : ""}`,
    };
  };

  // ===== 하이브릿지 상황 카드 장면 (c1 ~ c12) =====
  // 메신저 창 (screen 안에서 쓰는 SVG)
  const chatRow = (y, who, text, me, d) => A("c-pop", d, `<g><circle cx="${me ? 286 : 20}" cy="${y + 10}" r="10" fill="${me ? "#004aad" : "#c9d6ee"}"/>
    <rect x="${me ? 140 : 36}" y="${y}" width="138" height="${who ? 30 : 22}" rx="8" fill="${me ? "#004aad" : "#eef3fc"}"/>
    ${who ? T(me ? 148 : 44, y + 11, who, { fs: 8, c: me ? "#cfe0ff" : "#7a8494", fw: 700 }) : ""}${T(me ? 148 : 44, y + (who ? 24 : 15), text, { fs: 10, c: me ? "#fff" : "#1f2733" })}</g>`);
  const msgr = (title, rows) => `<rect width="330" height="22" fill="#004aad"/>${T(12, 15, title, { fs: 11, c: "#fff", fw: 800 })}${rows}`;

  SC.c1 = (ctx) => ({
    place: "💻 내 자리 · 입사 첫날 오전", dur: 3800, sfx: [[0.6, "pop"], [1.5, "pop"], [2.2, "pop"]],
    svg: `${bgOffice({ id: "a1", win: [[470, 30, 150, 110]], sign: false })}
      ${deskTop(262)}
      ${monitor(150, 30, 330, 200, msgr("# 인사팀 · 8명", `
        ${chatRow(32, "한지훈 팀장님", "오늘 합류했어요. 다들 환영해 주세요!", false, 0.2)}
        ${A("c-pop", 1.2, `<g>${["👏", "🎉", "👍", "😊"].map((e, i) => `<rect x="${44 + i * 34}" y="70" width="30" height="20" rx="10" fill="#fff" stroke="#c9d6ee"/>${T(52 + i * 34, 85, e, { fs: 11 })}${T(64 + i * 34, 85, String(i + 1), { fs: 8, c: "#7a8494" })}`).join("")}</g>`)}
        <rect x="12" y="160" width="306" height="28" rx="8" fill="#f1f4f8"/>${A("c-in", 2.2, T(22, 179, "안녕하세요! 오늘 입사한…▍", { fs: 11, c: "#4a5468" }))}`))}
      ${mug(560, 300, true)}
      ${keyboard(ctx.me)}
      ${mine(110, 150, "다들 이모지만… 나는 뭐라고 쓰지?", 2.0)}${vignette}`,
  });

  SC.c2 = (ctx) => ({
    place: "🏢 인사팀 · 오후 1시", dur: 3800, sfx: [[0.4, "pop"], [2.0, "pop"]],
    svg: `${bgOffice({ id: "a2", win: [[40, 40, 150, 110]], sign: false })}
      <g transform="translate(470,40)"><rect width="140" height="120" rx="6" fill="#fff" stroke="#d6dbe3" stroke-width="2"/><rect width="140" height="24" rx="6" fill="#004aad"/>${T(70, 17, "오늘 일정", { fs: 12, a: "middle", c: "#fff" })}
        ${A("c-pop", 1.8, `<rect x="10" y="62" width="120" height="42" rx="6" fill="#fff3d6" stroke="#ffb400" stroke-width="2"/>${T(70, 80, "14:00 ~ 17:00", { fs: 11, a: "middle", fw: 800, c: "#8a5a00" })}${T(70, 96, "필수 신입 입문교육", { fs: 10, a: "middle", c: "#8a5a00" })}`)}</g>
      ${Bu(250, L("park"), { expr: "smile", pose: "hold" }, 1.7, 450, { cls: "c-in", d: 0 })}
      ${bubble(380, 110, "지원자 서류 50건, 오늘 중으로 줄 수 있어요?", { d: 0.4, fs: 13, maxW: 170, tx: 300, tdir: -1 })}
      ${A("c-drop", 0.9, doc(520, 300, "서류 50건", "#ff8a73"))}
      ${mine(170, 300, "오늘 중…? 몇 시까지지?", 2.2)}${vignette}`,
  });

  SC.c3 = (ctx) => ({
    place: "🕕 인사팀 사무실 · 오후 6시", dur: 3800, sfx: [[1.4, "ding"]],
    svg: `${bgOffice({ id: "a3", sunset: true, win: [[40, 40, 160, 110], [440, 40, 160, 110]], sign: false })}
      ${clock(320, 96, 40, 6, 0, true)}
      ${Bu(120, L("lee"), { expr: "neutral" }, 1.15, 380)}${Bu(220, L("jung"), { expr: "neutral" }, 1.15, 380)}${Bu(420, L("park"), { expr: "neutral" }, 1.15, 380)}${Bu(520, L("han"), { expr: "neutral" }, 1.15, 380)}
      <rect y="300" width="${W}" height="60" fill="#c49a6c"/><rect y="300" width="${W}" height="7" fill="#a9825a"/>
      ${A("c-pop", 1.4, chip(258, 160, "할 일 전부 완료 ✓", { bg: "#2f8f6f" }))}
      ${A("c-in", 2.0, `${A("c-look", 0, `${T(286, 250, "◀", { fs: 22, c: "#ffb400" })}${T(338, 250, "▶", { fs: 22, c: "#ffb400" })}`)}`)}
      ${mine(320, 330, "다들 아직 자리에… 먼저 가도 되나?", 1.8)}${vignette}`,
  });

  SC.c4 = (ctx) => ({
    place: "📞 내 자리 · 14일차 오전", dur: 4000, sfx: [[0.1, "ring"], [0.9, "ring"], [2.0, "pop"]],
    svg: `<rect width="${W}" height="${H}" fill="#e6eaf0"/>
      <g><rect x="380" y="20" width="200" height="170" rx="6" fill="#fff" stroke="#d6dbe3" stroke-width="2"/><rect x="380" y="20" width="200" height="30" rx="6" fill="#004aad"/>${T(480, 41, "다음 주 2차 면접", { fs: 14, a: "middle", c: "#fff" })}
        ${["월", "화", "수", "목", "금"].map((d, i) => `${T(398 + i * 37, 70, d, { fs: 11, c: "#7a8494", a: "middle" })}<rect x="${382 + i * 37}" y="78" width="33" height="96" rx="4" fill="${i === 1 ? "#fff3d6" : "#f1f4f8"}"/>`).join("")}
        ${[0, 1, 2].map((k) => `<rect x="420" y="${86 + k * 28}" width="31" height="20" rx="4" fill="#c9d6ee"/>${T(435, 100 + k * 28, "면접관", { fs: 7, a: "middle", c: "#004aad", fw: 700 })}`).join("")}
        ${A("c-pop", 2.2, `<circle cx="436" cy="128" r="30" fill="none" stroke="#c2453d" stroke-width="3.5"/>${T(392, 186, "면접관 3명 확정 일정", { fs: 11, c: "#c2453d", fw: 800 })}`)}</g>
      ${A("c-ring", 0, `<g transform="translate(150,170)"><rect x="-60" y="-24" width="150" height="70" rx="14" fill="#2b2f3a"/><rect x="-50" y="-16" width="130" height="54" rx="8" fill="#9fd3a8"/>${T(15, 8, "📞 지원자", { fs: 14, a: "middle", fw: 800 })}${T(15, 28, "수신 중…", { fs: 11, a: "middle", c: "#2b4d33" })}</g>`)}
      ${[0, 1, 2].map((k) => `<circle class="c-waves tmp" style="animation-delay:${k * 0.4}s" cx="165" cy="185" r="60" fill="none" stroke="#ffb400" stroke-width="3"/>`).join("")}
      ${bubble(40, 300, "2차 면접이 다른 회사랑 겹쳤어요. 조정 가능할까요?", { d: 1.0, fs: 12, maxW: 210, tx: 160 })}
      ${hand(ctx.me, 560, 360, -20, { fist: true })}${vignette}`,
  });

  SC.c5 = (ctx) => ({
    place: "💻 내 자리 · 14일차 13:50", dur: 3800, sfx: [[0.5, "pop"], [1.6, "pop"]],
    svg: `${bgOffice({ id: "a5", win: [[30, 40, 120, 100]], sign: false })}
      ${clock(560, 70, 34, 1, 50)}${A("c-in", 0.3, chip(510, 112, "면접 10분 전", { bg: "#c2453d" }))}
      ${deskTop(262)}
      ${monitor(150, 30, 330, 200, msgr("오정민 팀장님 (면접관)", `
        ${chatRow(36, "", "질문지 어디 있어요?", false, 0.5)}
        ${chatRow(70, "", "면접 곧 시작인데…", false, 1.6)}
        <rect x="12" y="120" width="306" height="56" rx="8" fill="#f1f4f8"/>${T(22, 138, "📎 어제 보낸 메일 · 2차 면접 질문지.pdf", { fs: 10, c: "#4a5468" })}${T(22, 158, "보낸 시각: 어제 오후 4:12", { fs: 9, c: "#7a8494" })}`))}
      ${A("c-drop", 1.0, doc(560, 300, "질문지", "#004aad"))}
      ${keyboard(ctx.me)}
      ${mine(110, 180, "어제 분명히 보냈는데…", 2.2)}${vignette}`,
  });

  SC.c6 = (ctx) => ({
    place: "🍚 사내 식당 · 14일차 점심", dur: 3800, sfx: [[0.5, "pop"], [1.8, "pop"]],
    svg: `${bgOffice({ id: "a6", win: [[60, 30, 200, 110], [380, 30, 200, 110]], sign: "사내 식당" })}
      ${Bu(110, { ...DEFAULT_LOOK, ...L("lee"), shirt: "#9b7bd4", hair: "#3b2a20", glasses: false }, { expr: "smile" }, 1.25, 400)}
      ${Bu(530, { ...L("park"), shirt: "#7bc8a4", hair: "#2a1d18", style: "short" }, { expr: "smile" }, 1.25, 400)}
      ${Bu(320, L("yoon"), { expr: "happy", pose: "tea" }, 1.55, 440, { cls: "c-in", d: 0 })}
      <path d="M0,282 L640,282 L640,360 L0,360Z" fill="#e9dcc7"/><path d="M0,282 L640,282" stroke="#d3c2a6" stroke-width="6"/>
      ${[150, 320, 490].map((x) => `<ellipse cx="${x}" cy="318" rx="46" ry="14" fill="#fff"/><ellipse cx="${x}" cy="314" rx="30" ry="8" fill="#ffd27a"/>`).join("")}
      ${bubble(400, 110, "너 인사팀이잖아. 다른 팀 연봉 테이블 봤어?", { d: 0.5, fs: 13, maxW: 170, tx: 350, tdir: -1 })}
      ${A("c-pop", 1.8, `${T(80, 200, "👀", { fs: 22 })}${T(540, 200, "👀", { fs: 22 })}`)}
      ${mine(320, 332, "다들 쳐다보는데… 뭐라고 하지", 2.2)}${vignette}`,
  });

  SC.c7 = (ctx) => ({
    place: "📊 내 자리 · 45일차 오전", dur: 3800, sfx: [[1.0, "bad"], [2.2, "pop"]],
    svg: `${bgOffice({ id: "a7", win: [[440, 30, 170, 100]], sign: false })}
      ${Bu(120, L("han"), { expr: "neutral" }, 1.0, 300)}${A("c-pop", 2.2, bubble(60, 90, "오후에 결과 좀 볼까요?", { fs: 12, maxW: 150, tx: 110 }))}
      ${paperInHands(ctx.me, `${T(16, 30, "📋 신입 입문교육 만족도", { fs: 15, fw: 800 })}
        <rect x="40" y="50" width="70" height="130" fill="#f1f4f8"/><rect x="160" y="50" width="70" height="130" fill="#f1f4f8"/>
        ${A("c-up", 0.2, `<rect x="40" y="${180 - 4.1 * 26}" width="70" height="${4.1 * 26}" fill="#7fa2dc"/>`)}
        ${A("c-up", 0.6, `<rect x="160" y="${180 - 3.2 * 26}" width="70" height="${3.2 * 26}" fill="#c2453d"/>`)}
        ${T(75, 180 - 4.1 * 26 - 6, "4.1", { fs: 14, a: "middle", fw: 800 })}${A("c-pop", 1.0, T(195, 180 - 3.2 * 26 - 6, "3.2", { fs: 16, a: "middle", fw: 900, c: "#c2453d" }))}
        ${T(75, 196, "지난 기수", { fs: 10, a: "middle", c: "#7a8494" })}${T(195, 196, "이번 기수", { fs: 10, a: "middle", c: "#7a8494" })}`)}
      ${mine(520, 300, "숫자만 들고 가도 될까…", 2.4)}${vignette}`,
  });

  SC.c8 = (ctx) => ({
    place: "🏫 교육장 · 45일차 08:55", dur: 4000, sfx: [[0.6, "ring"], [1.6, "pop"]],
    svg: `<rect width="${W}" height="${H}" fill="#eef1f5"/>
      <rect x="170" y="30" width="300" height="130" rx="6" fill="#2b2f3a"/><rect x="178" y="38" width="284" height="114" rx="3" fill="#f7f9fc"/>
      ${T(320, 82, "2026 하반기 신입 입문교육", { fs: 15, a: "middle", fw: 800, c: "#004aad" })}${T(320, 108, "09:00 시작 · 강사 OOO", { fs: 12, a: "middle", c: "#7a8494" })}
      ${clock(560, 70, 30, 8, 55, true)}
      ${Array.from({ length: 12 }, (_, i) => {
        const r = Math.floor(i / 6), c = i % 6, lk = { ...DEFAULT_LOOK, hair: ["#2b2b33", "#5a3825", "#8a5a3b", "#2a1d18"][i % 4], shirt: ["#5b8def", "#f29bb5", "#7bc8a4", "#f7c548", "#9b7bd4", "#8d99ae"][c], style: i % 3 ? "short" : "long" };
        return P(80 + c * 96 + r * 30, 300 + r * 60, 0.7 + r * 0.15, lk, { seated: true, back: true, idle: false });
      }).join("")}
      ${A("c-up", 0.3, `<g transform="translate(470,250) rotate(-6)"><rect x="-50" y="-80" width="100" height="160" rx="14" fill="#2b2f3a"/><rect x="-42" y="-68" width="84" height="132" rx="6" fill="#fff"/>
        ${T(0, -44, "외부 강사", { fs: 11, a: "middle", fw: 800 })}<rect x="-36" y="-34" width="72" height="56" rx="8" fill="#eef3fc"/>
        ${T(-30, -16, "죄송합니다, 차가", { fs: 9 })}${T(-30, -2, "막혀 30분 정도", { fs: 9 })}${T(-30, 12, "늦을 것 같습니다", { fs: 9 })}</g>${hand(ctx.me, 470, 350, -8, { fist: true })}`)}
      ${mine(200, 220, "24명이 기다리는데…!", 1.8)}${vignette}`,
  });

  SC.c9 = (ctx) => ({
    place: "💻 내 자리 · 45일차 오후", dur: 3800, sfx: [[0.6, "pop"], [1.4, "pop"]],
    svg: `${bgOffice({ id: "a9", win: [[40, 30, 140, 100]], sign: false })}
      ${Bu(540, L("park"), { expr: "neutral" }, 1.0, 300)}${A("c-in", 0.4, chip(470, 60, "면접 4건 · 바쁨", { bg: "#c2453d", fs: 11 }))}
      ${paperInHands(ctx.me, `${T(16, 30, "✉️ 교육 안내 메일 (초안)", { fs: 15, fw: 800 })}
        ${[0, 1, 2, 3, 4, 5].map((k) => `<rect x="16" y="${48 + k * 22}" width="${[240, 200, 230, 150, 220, 120][k]}" height="8" rx="3" fill="#dfe5ec"/>`).join("")}
        ${A("c-pop", 0.6, `<path d="M16,52 L250,52" stroke="#e05555" stroke-width="3"/><path d="M16,96 L170,96" stroke="#e05555" stroke-width="3"/>`)}
        ${A("c-pop", 1.0, `<path d="M20,140 q40,-14 80,0 t80,0" stroke="#e05555" stroke-width="3" fill="none"/>${T(196, 128, "→ 간결하게", { fs: 11, c: "#e05555", fw: 800 })}`)}
        ${A("c-pop", 1.4, `<circle cx="230" cy="78" r="14" fill="none" stroke="#e05555" stroke-width="3"/>${T(196, 176, "날짜 먼저!", { fs: 11, c: "#e05555", fw: 800 })}`)}`)}
      ${mine(500, 330, "절반 넘게 고쳐졌다… 왜지?", 2.2)}${vignette}`,
  });

  SC.c10 = (ctx) => ({
    place: "🏢 인사팀 자리 · 80일차 오후", dur: 3800, sfx: [[0.4, "pop"]],
    svg: `${bgOffice({ id: "a10", win: [[40, 30, 140, 100], [460, 30, 140, 100]] })}
      ${Bu(320, L("oh"), { expr: "worry", pose: "arms" }, 1.75, 460, { cls: "c-in", d: 0 })}
      ${bubble(460, 100, "우리 팀 직원이 요즘 지각도 잦고 태도가 영… 인사팀에서 좀 어떻게 해 줘요.", { d: 0.4, fs: 12, maxW: 160, tx: 380, tdir: -1 })}
      ${A("c-in", 1.6, chip(30, 150, "사수 박서연 선배 · 외근 중", { bg: "#4a5468", fs: 11 }))}
      ${A("c-up", 1.8, `<g transform="translate(150,300) rotate(-4)"><rect x="-60" y="-50" width="120" height="100" rx="6" fill="#fff8b5"/>${T(-48, -26, "면담 메모", { fs: 11, fw: 800 })}${T(-48, -6, "· 언제?", { fs: 10, c: "#7a6a40" })}${T(-48, 10, "· 몇 번?", { fs: 10, c: "#7a6a40" })}${T(-48, 26, "· 무엇을?", { fs: 10, c: "#7a6a40" })}</g>${hand(ctx.me, 170, 360, 10, { fist: true })}`)}
      ${mine(470, 320, "바로 약속해도 되나…?", 2.2)}${vignette}`,
  });

  SC.c11 = (ctx) => ({
    place: "📨 내 자리 · 80일차 오전", dur: 3800, sfx: [[0.5, "pop"], [1.8, "bad"]],
    svg: `<rect width="${W}" height="${H}" fill="#e6eaf0"/>
      ${deskTop(262)}
      ${monitor(140, 26, 360, 210, `<rect width="360" height="24" fill="#4a5468"/>${T(12, 16, "익명 고충 접수함 · 시스템 알림", { fs: 11, c: "#fff", fw: 800 })}
        ${A("c-pop", 0.5, `<g><rect x="20" y="40" width="320" height="120" rx="10" fill="#fff" stroke="#c2453d" stroke-width="2.5"/>${T(36, 66, "🔒 새 익명 제보 1건", { fs: 14, fw: 800, c: "#c2453d" })}
          ${T(36, 94, "\"팀 회식 참석을 사실상 강요받고 있습니다.\"", { fs: 12 })}${T(36, 120, "대상: OO팀 팀장", { fs: 11, c: "#7a8494" })}</g>`)}
        ${A("c-pop", 1.8, `<rect x="20" y="170" width="320" height="26" rx="6" fill="#fff3d6"/>${T(32, 188, "⚠ 친한 선배의 팀이다", { fs: 11, c: "#8a5a00", fw: 700 })}`)}`)}
      ${keyboard(ctx.me, true)}
      ${mine(540, 160, "어떡하지… 선배한테 물어볼까?", 2.2)}${vignette}`,
  });

  SC.c12 = (ctx) => ({
    place: "🌙 내 자리 · 80일차 21:00", dur: 3800, sfx: [[0.6, "pop"]],
    svg: `${bgOffice({ id: "a12", night: true, win: [[40, 30, 160, 110], [440, 30, 160, 110]], sign: false })}
      ${clock(320, 80, 36, 9, 0)}
      <rect y="262" width="${W}" height="100" fill="#3a3340"/><rect y="262" width="${W}" height="7" fill="#2c2731"/>
      <ellipse cx="130" cy="250" rx="90" ry="40" fill="#ffe9a8" opacity=".25"/><path d="M110,200 L150,200 L170,250 L90,250Z" fill="#ffd27a" opacity=".85"/><rect x="126" y="250" width="8" height="14" fill="#5a5f6c"/>
      ${monitor(200, 120, 260, 120, `<rect width="260" height="120" fill="#f7f9fc"/>${T(12, 22, "평가 데이터 검증 · 2주째", { fs: 12, fw: 800 })}${Array.from({ length: 5 }, (_, k) => `<rect x="12" y="${34 + k * 16}" width="${[220, 180, 230, 160, 200][k]}" height="8" rx="3" fill="#dfe5ec"/>`).join("")}
        ${A("c-pop", 0.6, `<rect x="150" y="90" width="100" height="22" rx="6" fill="#c2453d"/>${T(200, 105, "마감까지 7일", { fs: 10, a: "middle", c: "#fff", fw: 800 })}`)}`)}
      ${[0, 1, 2].map((k) => A("c-rise", k * 0.6, T(500 + k * 22, 200 - k * 18, "z", { fs: 18 + k * 4, c: "#c9d6ee", fw: 800 }))).join("")}
      ${keyboard(ctx.me, true)}
      ${mine(510, 250, "오늘도 9시… 언제 끝나지", 1.6)}${vignette}`,
  });

  // 선배 등록 카드 · 그 외: 게시판 앞에 서서 보는 시점
  SC.custom = (ctx, card) => ({
    place: "📌 선배 경험 게시판 앞", dur: 3200, sfx: [[0.6, "pop"]],
    svg: `<rect width="${W}" height="${H}" fill="#e6eaf0"/>
      <g transform="translate(70,30)"><rect width="500" height="300" rx="12" fill="#c49a6c"/><rect x="14" y="14" width="472" height="272" rx="8" fill="#e9d3b2"/>
        <g transform="rotate(4 70 70)"><rect x="34" y="34" width="90" height="70" fill="#cde8ff"/></g><g transform="rotate(-5 420 220)"><rect x="380" y="190" width="80" height="64" fill="#ffd6e0"/></g>
        ${A("c-drop", 0.3, `<g transform="rotate(-3 250 150)"><rect x="110" y="56" width="280" height="170" fill="#fff8b5"/><circle cx="250" cy="66" r="8" fill="#c2453d"/>
          ${wrap(card ? card.title : "선배의 경험", 240, 20).slice(0, 2).map((l, i) => T(250, 124 + i * 30, l, { fs: 20, fw: 800, a: "middle" })).join("")}
          ${T(250, 204, "— " + (card && card.author ? card.author : "선배"), { fs: 13, a: "middle", c: "#7a6a40" })}</g>`)}</g>
      ${hand(ctx.me, 470, 340, -30)}
      ${mine(320, 330, "선배도 이런 일이 있었구나", 1.2)}${vignette}`,
  });

  // 카드 → 장면
  const build = (key, ctx, card) => (SC[key] ? SC[key](ctx, card) : null);
  function forCard(card, ctx) {
    if (!card) return null;
    return SC[card.id] ? build(card.id, ctx, card) : build("custom", ctx, card);
  }
  const svgOf = (sc, cls) => `<svg class="scene ${cls || ""}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">${A("c-zoom", 0, A("c-pov", 0, sc.svg))}</svg>`;

  return { forCard, elevator: (ctx, dir) => SC.elevator(ctx, dir), svgOf };
})();
