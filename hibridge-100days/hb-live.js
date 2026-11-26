/* =============================================================
   소통 공간 · 실사용 모드 (로그인 + 공유 저장소)
   - Cognito로 이메일 가입·로그인, Lambda API(community/lambda)로 글·대화를 주고받는다.
   - HB_LIVE 설정(pool·client·api)이 비어 있으면 아무것도 바꾸지 않고, 기존 시연 모드가 그대로 동작한다.
   - index.html 의 전역(S, save, route, VIEWS, bind, esc, UI, avatar, bri, toast, anonTitle, anonCat, ANON_CATS, SEED_POSTS, CHANNELS …)을 사용한다.
   ============================================================= */
(function () {
  const HB_LIVE = {
    region: "ap-southeast-2",
    pool: "ap-southeast-2_pC4kw55uW",                                                  // Cognito 사용자 풀 ID   (setup.sh 출력의 POOL)
    client: "5l7rh0ff9jhjlalf7rock4eunt",                                              // Cognito 앱 클라이언트 ID (setup.sh 출력의 CLIENT)
    api: "https://udrxtzxtlrzsw7kbw5ohyto7440hqzoa.lambda-url.ap-southeast-2.on.aws/", // Lambda 함수 URL         (setup.sh 출력의 URL)
  };
  try { Object.assign(HB_LIVE, JSON.parse(localStorage.getItem("hb-live-cfg") || "{}")); } catch (e) {}
  if (!HB_LIVE.pool || !HB_LIVE.client || !HB_LIVE.api) return;   // 설정 전: 시연 모드 유지

  /* ---------- 저장 도우미 ---------- */
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };

  /* ---------- Cognito (SDK 없이 REST 호출) ---------- */
  const COG_ERR = {
    UsernameExistsException: "이미 가입한 이메일이에요. 로그인해 주세요.",
    CodeMismatchException: "인증 코드가 맞지 않아요. 메일에서 다시 확인해 주세요.",
    ExpiredCodeException: "인증 코드가 만료됐어요. 코드를 다시 받아 주세요.",
    NotAuthorizedException: "이메일 또는 비밀번호가 맞지 않아요.",
    UserNotConfirmedException: "이메일 인증이 아직 안 됐어요. 메일로 받은 코드를 입력해 주세요.",
    InvalidPasswordException: "비밀번호는 8자 이상, 숫자를 하나 이상 넣어 주세요.",
    LimitExceededException: "시도가 너무 많아요. 잠시 후 다시 해 주세요.",
    TooManyRequestsException: "시도가 너무 많아요. 잠시 후 다시 해 주세요.",
    UserNotFoundException: "가입하지 않은 이메일이에요.",
    InvalidParameterException: "입력한 내용을 다시 확인해 주세요.",
    CodeDeliveryFailureException: "인증 메일을 보내지 못했어요. 이메일 주소를 확인해 주세요.",
  };
  async function cog(action, body) {
    const r = await fetch(HB_LIVE.cognito || `https://cognito-idp.${HB_LIVE.region}.amazonaws.com/`, {
      method: "POST", headers: { "content-type": "application/x-amz-json-1.1", "x-amz-target": "AWSCognitoIdentityProviderService." + action },
      body: JSON.stringify({ ClientId: HB_LIVE.client, ...body }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const t = String(j.__type || "").split("#").pop(); const e = new Error(COG_ERR[t] || j.message || "잠시 후 다시 시도해 주세요."); e.code = t; throw e; }
    return j;
  }
  const AUTH_KEY = "hb-live-auth";
  let auth = ls.get(AUTH_KEY, null);   // { id, refresh, exp, email }
  const saveAuth = (a) => { auth = a; ls.set(AUTH_KEY, a); };
  async function login(email, pw) {
    const j = await cog("InitiateAuth", { AuthFlow: "USER_PASSWORD_AUTH", AuthParameters: { USERNAME: email, PASSWORD: pw } });
    const a = j.AuthenticationResult; saveAuth({ id: a.IdToken, refresh: a.RefreshToken, exp: Date.now() + a.ExpiresIn * 1000 - 60e3, email });
  }
  async function refresh() {
    if (!auth || !auth.refresh) throw new Error("로그인이 필요해요");
    const j = await cog("InitiateAuth", { AuthFlow: "REFRESH_TOKEN_AUTH", AuthParameters: { REFRESH_TOKEN: auth.refresh } });
    const a = j.AuthenticationResult; saveAuth({ ...auth, id: a.IdToken, exp: Date.now() + a.ExpiresIn * 1000 - 60e3 });
  }
  function logout() { saveAuth(null); Object.assign(L, fresh()); updateTop(); route(); }

  /* ---------- API ---------- */
  async function api(op, args = {}, retry = true) {
    if (!auth) throw Object.assign(new Error("로그인이 필요해요"), { status: 401 });
    if (Date.now() > auth.exp) await refresh().catch(() => { saveAuth(null); });
    if (!auth) { route(); throw Object.assign(new Error("다시 로그인해 주세요"), { status: 401 }); }
    const r = await fetch(HB_LIVE.api, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + auth.id }, body: JSON.stringify({ op, ...args }) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && retry) { await refresh().catch(() => saveAuth(null)); return api(op, args, false); }
    if (!r.ok) throw Object.assign(new Error(j.error || "잠시 후 다시 시도해 주세요"), { status: r.status });
    return j;
  }

  /* ---------- 상태 ---------- */
  const fresh = () => ({ me: undefined, users: [], peer: [], threads: [], th: {}, anon: null, loading: false, err: "",
    step: "login", email: "", room: "group", mtid: null, aopen: null, awrite: false, af: "all", aq: "", mtf: "전체", mtOn: false, editing: false });
  const L = fresh();
  const PENDING = "hb-live-pending";
  const JOIN = "hb-live-join";   // 초대 링크로 받은 기수 코드
  (function readInvite() {
    const q = new URLSearchParams(location.search), code = (q.get("join") || "").trim().toUpperCase();
    if (!code) return;
    ls.set(JOIN, { code }); q.delete("join");
    history.replaceState(null, "", location.pathname + (q.toString() ? "?" + q : "") + "#community");
  })();   // 가입하면서 적은 프로필 (첫 로그인 때 저장)
  const DEPTS = ["인사팀 채용파트", "인사팀 HRD파트", "인사팀 평가보상파트", "인사팀 노무파트", "인사팀 조직문화파트", "경영지원본부", "개발본부", "마케팅팀", "영업팀"];
  const JOBS = ["채용", "교육(HRD)", "평가·보상", "노무", "조직문화", "개발", "마케팅", "영업", "기획"];
  const RANKS = ["인턴", "사원", "주임", "대리", "과장", "차장", "부장", "팀장"];
  const isHrd = () => L.me && L.me.role === "HRD";
  // 동기방 이름: HRD가 만든 기수면 그 이름 그대로, 아니면 "2026 하반기 입사"
  const roomName = () => (L.me && L.me.ckey && L.me.ckey.startsWith("C#") ? L.me.cohort : `${L.me.cohort} 입사`);
  const yrsTx = (y) => (y ? `${y}년차` : "1년 미만");
  const uAv = (u, cls) => (u && u.bri ? avatar({ bri: u.bri }, cls) : avatar({ icon: "user" }, cls));
  const meAv = (cls) => (L.me && L.me.bri ? avatar({ bri: L.me.bri }, cls) : avatar({ me: true }, cls));
  const hm = (d) => `${d.getHours() < 12 ? "오전" : "오후"} ${((d.getHours() + 11) % 12) + 1}:${String(d.getMinutes()).padStart(2, "0")}`;
  function when(at) {
    if (!at) return "";
    const d = new Date(at), n = new Date(), s = (n - d) / 1000;
    if (s < 60) return "방금"; if (s < 3600) return Math.floor(s / 60) + "분 전";
    const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime(), dd = Math.round((day(n) - day(d)) / 864e5);
    if (dd === 0) return "오늘 " + hm(d); if (dd === 1) return "어제"; if (dd < 7) return dd + "일 전";
    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  }
  const isToday = (at) => at && new Date(at).toDateString() === new Date().toDateString();

  /* ---------- 데이터 불러오기 ---------- */
  async function loadMe() {
    try {
      const j = await api("me.get"); let me = j.me;
      const pend = ls.get(PENDING, null);
      if (!me && pend && pend.email === auth.email) { me = (await api("me.put", { profile: pend.profile })).me; ls.set(PENDING, null); }
      L.me = me; L.err = "";
      if (me) { await joinPending(); await Promise.all([loadUsers(), loadChannel(true)]); }
    } catch (e) { if (e.status !== 401) L.err = e.message; L.me = auth ? null : undefined; }
    rerender();
  }
  async function joinPending() {
    const j = ls.get(JOIN, null); if (!j || !L.me) return;
    ls.set(JOIN, null);
    try { const r = await api("cohort.join", { code: j.code }); L.me = (await api("me.get")).me; S.channel = "peer"; L.room = "group"; save(); toast(`'${r.name}' 동기방에 들어왔어요 🎉`); }
    catch (e) { toast(e.message); }
  }
  async function loadUsers() { L.users = (await api("users.list")).users; L.usersAt = Date.now(); }
  async function loadChannel(all) {
    const ch = S.channel;
    const jobs = [];
    if (all || ch === "anon") jobs.push(api("anon.list").then((j) => (L.anon = j.posts)));
    if (all || ch === "peer" || ch === "ask") jobs.push(api("dm.threads").then((j) => (L.threads = j.threads)));
    // 보고 있는 방은 '읽음'으로 표시 (10초에 한 번까지만 서버에 알림)
    L.marked = L.marked || {};
    const read = (room) => { const v = !document.hidden && Date.now() - (L.marked[room] || 0) > 10e3; if (v) L.marked[room] = Date.now(); return v; };
    if (ch === "peer" && L.room === "group") jobs.push(api("peer.list", { read: read("group") }).then((j) => { L.peer = j.msgs; L.peerReads = j.reads || {}; }));
    const tid = ch === "peer" && L.room !== "group" ? L.room : ch === "ask" ? L.mtid : null;
    if (tid) jobs.push(api("dm.get", { tid, read: read(tid) }).then((j) => (L.th[tid] = j)));
    await Promise.all(jobs);
  }

  /* ---------- 다시 그리기 (입력 중인 글·스크롤 지키기) ---------- */
  function rerender() {
    updateTop();
    if (!["#community", "#hrd"].includes(location.hash || "#home")) return;
    const keep = {}, act = document.activeElement, actKey = act && (act.id || (act.closest && act.closest("[data-p]") && "rp-" + act.closest("[data-p]").dataset.p));
    document.querySelectorAll("#chatText,#ptext,.lv-form input,.lv-form textarea,.lv-form select,[data-p] input").forEach((el) => {
      const k = el.id || (el.closest("[data-p]") ? "rp-" + el.closest("[data-p]").dataset.p : el.name); if (k) keep[k] = { v: el.type === "checkbox" || el.type === "radio" ? el.checked : el.value, s: el.selectionStart };
    });
    const log = document.getElementById("chatLog"), atBottom = !log || log.scrollHeight - log.scrollTop - log.clientHeight < 60, top = log ? log.scrollTop : 0;
    const y = window.scrollY;
    route();
    document.querySelectorAll("#chatText,#ptext,.lv-form input,.lv-form textarea,.lv-form select,[data-p] input").forEach((el) => {
      const k = el.id || (el.closest("[data-p]") ? "rp-" + el.closest("[data-p]").dataset.p : el.name), v = keep[k]; if (!v) return;
      if (el.type === "checkbox" || el.type === "radio") { if (el.type === "checkbox") el.checked = v.v; } else if (v.v) el.value = v.v;
      if (k === actKey) { el.focus({ preventScroll: true }); try { if (v.s != null) el.setSelectionRange(v.s, v.s); } catch (e) {} }
    });
    const log2 = document.getElementById("chatLog"); if (log2) log2.scrollTop = atBottom ? log2.scrollHeight : top;
    window.scrollTo(0, y);
  }

  /* ---------- 주기적으로 새 글 확인 ---------- */
  let sig = "";
  setInterval(async () => {
    if ((location.hash || "#home") !== "#community" || !auth || !L.me || document.hidden || L.busy) return;
    try {
      if (Date.now() - (L.usersAt || 0) > 30e3) await loadUsers();
      await loadChannel(false);
      const s = JSON.stringify([L.peer, L.peerReads, L.threads, L.anon, L.th, L.users.map((u) => u.uid + u.on)]);
      if (s !== sig) { sig = s; rerender(); }
    } catch (e) {}
  }, 4000);

  /* ---------- 화면: 로그인 · 회원가입 ---------- */
  function authHTML() {
    const st = L.step, err = L.err ? `<p class="lv-err" role="alert">${esc(L.err)}</p>` : "";
    const tabs = `<div class="lv-tabs" role="tablist"><button type="button" data-lstep="login" aria-selected="${st === "login"}">로그인</button><button type="button" data-lstep="signup" aria-selected="${st === "signup"}">회원가입</button></div>`;
    let body = "";
    if (st === "login") body = `${tabs}
      <form class="lv-form" id="lvLogin">
        <label>회사 이메일<input type="email" name="email" required autocomplete="email" value="${esc(L.email)}" placeholder="name@company.com"></label>
        <label>비밀번호<input type="password" name="pw" required autocomplete="current-password" minlength="8"></label>
        ${err}<button class="btn lv-wide" type="submit" ${L.loading ? "disabled" : ""}>${L.loading ? "로그인 중…" : "로그인"}</button>
        <button type="button" class="lv-link" data-lstep="forgot">비밀번호를 잊었어요</button>
      </form>`;
    else if (st === "signup") body = `${tabs}
      <form class="lv-form" id="lvSignup">
        <fieldset><legend>계정</legend>
          <label>회사 이메일<input type="email" name="email" required autocomplete="email" value="${esc(L.email)}" placeholder="name@company.com"></label>
          <div class="lv-row"><label>비밀번호<input type="password" name="pw" required minlength="8" autocomplete="new-password" placeholder="8자 이상, 숫자 포함"></label>
          <label>비밀번호 확인<input type="password" name="pw2" required minlength="8" autocomplete="new-password"></label></div>
        </fieldset>
        ${profileFields({ rank: "사원", yrs: 0 })}
        <label class="lv-agree"><input type="checkbox" name="agree" required><span>익명 질문방의 글은 다른 사람에게 이름이 보이지 않아요. 다만 욕설·괴롭힘처럼 문제가 되는 글은 운영자가 작성자를 확인할 수 있다는 것에 동의해요.</span></label>
        ${err}<button class="btn lv-wide" type="submit" ${L.loading ? "disabled" : ""}>${L.loading ? "가입 중…" : "가입하고 인증 메일 받기"}</button>
      </form>`;
    else if (st === "code") body = `<h3 class="lv-h">이메일 인증</h3>
      <p class="lv-p"><b>${esc(L.email)}</b>로 보낸 6자리 인증 코드를 입력해 주세요. 메일이 안 보이면 스팸함도 확인해 주세요.</p>
      <form class="lv-form" id="lvCode">
        <label>인증 코드<input name="code" required inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6자리 숫자"></label>
        ${err}<button class="btn lv-wide" type="submit" ${L.loading ? "disabled" : ""}>${L.loading ? "확인 중…" : "인증하고 시작하기"}</button>
        <div class="lv-links"><button type="button" class="lv-link" data-lresend>코드 다시 받기</button><button type="button" class="lv-link" data-lstep="login">로그인으로 돌아가기</button></div>
      </form>`;
    else if (st === "forgot") body = `<h3 class="lv-h">비밀번호 찾기</h3><p class="lv-p">가입한 이메일로 인증 코드를 보내 드려요.</p>
      <form class="lv-form" id="lvForgot">
        <label>회사 이메일<input type="email" name="email" required value="${esc(L.email)}"></label>
        ${err}<button class="btn lv-wide" type="submit" ${L.loading ? "disabled" : ""}>인증 코드 받기</button>
        <button type="button" class="lv-link" data-lstep="login">로그인으로 돌아가기</button>
      </form>`;
    else if (st === "forgot2") body = `<h3 class="lv-h">새 비밀번호 정하기</h3><p class="lv-p"><b>${esc(L.email)}</b>로 보낸 코드를 입력해 주세요.</p>
      <form class="lv-form" id="lvForgot2">
        <label>인증 코드<input name="code" required inputmode="numeric" maxlength="6"></label>
        <label>새 비밀번호<input type="password" name="pw" required minlength="8" autocomplete="new-password" placeholder="8자 이상, 숫자 포함"></label>
        ${err}<button class="btn lv-wide" type="submit" ${L.loading ? "disabled" : ""}>비밀번호 바꾸고 로그인</button>
      </form>`;
    const inv = ls.get(JOIN, null);
    if (inv && !inv.name && !inv.peeked) { inv.peeked = true; ls.set(JOIN, inv);
      fetch(HB_LIVE.api, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "cohort.peek", code: inv.code }) })
        .then((r) => r.json()).then((j) => { if (j.name) { ls.set(JOIN, { ...inv, name: j.name }); route(); } }).catch(() => {}); }
    return `<section class="lv-auth">
      <div class="lv-card">
        <div class="lv-card-h">${bri({ head: true, wave: false })}<div><b>소통 공간</b><small>하이브릿지 임직원만 쓰는 공간이라 로그인이 필요해요</small></div></div>
        ${inv ? `<div class="lv-invite">🎉 <b>${esc(inv.name || "동기방")}</b> 초대를 받았어요. ${st === "login" ? "로그인하면" : "가입하면"} 바로 동기방에 들어가요.</div>` : ""}
        ${body}
      </div>
      <aside class="lv-side">
        <h3>로그인하면 이렇게 쓸 수 있어요</h3>
        <ul>
          <li>${UI("group")}<div><b>동기방</b><span>같은 시기에 입사한 동기들과 단체·1:1 대화</span></div></li>
          <li>${UI("ask")}<div><b>1:1 질문하기</b><span>물어보고 싶은 사람을 골라 1:1로. 상대에게는 내 이름 대신 별명으로 보여요</span></div></li>
          <li>${UI("anon")}<div><b>익명 질문방</b><span>이름 없이 묻고, 이름 없이 답해요</span></div></li>
        </ul>
        <p class="lv-note">${UI("lock")} 100일 게임, 경험 등록, 운영 대시보드는 로그인 없이 그대로 쓸 수 있어요.</p>
      </aside>
    </section>`;
  }
  function profileFields(p) {
    return `<fieldset><legend>프로필 <small>동료들에게 보이는 정보예요</small></legend>
      <label>이름<input name="name" required maxlength="20" value="${esc(p.name || "")}" placeholder="홍길동"></label>
      <div class="lv-row"><label>부서<input name="dept" required maxlength="40" list="lvDepts" value="${esc(p.dept || "")}" placeholder="예: 인사팀 채용파트"></label>
        <label>직무<input name="job" maxlength="30" list="lvJobs" value="${esc(p.job || "")}" placeholder="예: 채용"></label></div>
      <div class="lv-row lv-row3"><label>직급<select name="rank">${RANKS.map((r) => `<option ${p.rank === r ? "selected" : ""}>${r}</option>`).join("")}</select></label>
        <label>입사 시기 <small>(동기방이 정해져요)</small><input name="joined" type="month" required value="${esc(p.joined || thisMonth())}" max="${thisMonth(1)}"></label>
        <label>연차 <small>(1년 미만은 0)</small><input name="yrs" type="number" min="0" max="40" value="${esc(p.yrs ?? 0)}"></label></div>
      <label class="lv-check"><input type="checkbox" name="hrd" ${p.role === "HRD" ? "checked" : ""}><span>HRD 담당자예요 <small>(운영 대시보드에서 기수를 만들고 시나리오를 검토해요)</small></span></label>
      <label class="lv-hrd" ${p.role === "HRD" && !(L.me && L.me.role === "HRD") ? "" : "hidden"}>HRD 인증 코드 <small>(인사팀에서 받은 6자리)</small><input name="hrdCode" inputmode="numeric" maxlength="12" autocomplete="off"></label>
      <div class="lv-sr">
        <label>한 줄 소개 <small>(1:1 질문하기 프로필에 보여요 · 선택)</small><input name="bio" maxlength="120" value="${esc(p.bio || "")}" placeholder="예: 면접 일정이 꼬였을 때 제일 먼저 찾는 사람"></label>
        <label>자신 있는 주제 <small>(쉼표로 구분, 5개까지 · 선택)</small><input name="tags" maxlength="80" value="${esc((p.tags || []).join(", "))}" placeholder="예: 면접 운영, 지원자 응대"></label>
      </div>
      <datalist id="lvDepts">${DEPTS.map((d) => `<option value="${d}">`).join("")}</datalist>
      <datalist id="lvJobs">${JOBS.map((d) => `<option value="${d}">`).join("")}</datalist>
    </fieldset>`;
  }
  const thisMonth = (add = 0) => { const d = new Date(); d.setMonth(d.getMonth() + add); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
  const cohortTx = (j) => { const [y, m] = String(j || "").split("-").map(Number); return y ? `${y} ${m <= 6 ? "상반기" : "하반기"}` : ""; };
  const joinedTx = (j) => { const [y, m] = String(j || "").split("-").map(Number); return y ? `${y}년 ${m}월 입사` : ""; };
  const readProfile = (f) => ({ hrdCode: f.hrdCode ? f.hrdCode.value : "", joined: f.joined.value, name: f.name.value, role: f.hrd && f.hrd.checked ? "HRD" : "멤버", dept: f.dept.value, job: f.job.value,
    rank: f.rank.value, yrs: f.yrs.value, bio: f.bio ? f.bio.value : "", tags: f.tags ? f.tags.value : "", bri: typeof myBri === "function" ? myBri() : null });

  function profileHTML(first) {
    const p = L.me || ls.get(PENDING, {})?.profile || { rank: "사원", yrs: 0 };
    return `<section class="lv-auth one"><div class="lv-card">
      <div class="lv-card-h">${bri({ head: true, wave: false })}<div><b>${first ? "프로필을 만들어 주세요" : "프로필 수정"}</b><small>${first ? "처음 한 번만 적으면 돼요" : "동료들에게 보이는 정보예요"}</small></div></div>
      <form class="lv-form" id="lvProfile">${profileFields(p)}
        ${L.err ? `<p class="lv-err" role="alert">${esc(L.err)}</p>` : ""}
        <div class="lv-links">${first ? `<button type="button" class="lv-link" data-lout>다른 계정으로 로그인</button>` : `<button type="button" class="btn ghost" data-pcancel>취소</button>`}
          <button class="btn" type="submit" ${L.loading ? "disabled" : ""}>${first ? "시작하기" : "저장"}</button></div>
        <p class="lv-p small">아바타는 100일 게임에서 꾸민 브리로 보여요.</p>
      </form></div></section>`;
  }

  /* ---------- 맨 위: 내 계정 (모든 화면) ---------- */
  function updateTop() {
    let el = document.getElementById("lvTop");
    if (!el) {
      const row = document.querySelector(".top-row"); if (!row) return;
      el = document.createElement("div"); el.id = "lvTop"; el.className = "lv-top"; row.appendChild(el);
      const close = () => { const m = el.querySelector(".lv-menu"); if (m) { m.hidden = true; el.querySelector(".lv-user").setAttribute("aria-expanded", "false"); } };
      el.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return;
        if (b.classList.contains("lv-user")) { const m = el.querySelector(".lv-menu"), open = m.hidden; m.hidden = !open; b.setAttribute("aria-expanded", String(open)); return; }
        close();
        if (b.dataset.t === "login") { L.step = "login"; if (location.hash === "#community") route(); else location.hash = "#community"; }
        if (b.dataset.t === "join") { L.step = "signup"; if (location.hash === "#community") route(); else location.hash = "#community"; }
        if (b.dataset.t === "edit") { L.editing = true; L.err = ""; if (location.hash === "#community") route(); else location.hash = "#community"; window.scrollTo(0, 0); }
        if (b.dataset.t === "cm") { L.editing = false; if (location.hash === "#community") route(); else location.hash = "#community"; }
        if (b.dataset.t === "out" && confirm("로그아웃할까요?")) logout(); });
      document.addEventListener("click", (e) => { if (!el.contains(e.target)) close(); });
      document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
    }
    el.innerHTML = auth && L.me
      ? `<button type="button" class="lv-user" aria-haspopup="menu" aria-expanded="false" title="내 계정">${meAv("av")}<span class="lv-user-tx"><b>${esc(L.me.name)}</b><small>${esc(L.me.dept)}</small></span><svg class="lv-chev" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <div class="lv-menu" role="menu" hidden>
          <div class="lv-menu-h">${meAv("av")}<div><b>${esc(L.me.name)} <small>${esc(L.me.rank)}</small></b><span>${esc(L.me.dept)}${isHrd() ? " · HRD 담당자" : ""} · ${esc(joinedTx(L.me.joined))}</span><span class="lv-mail">${esc(L.me.email || (auth && auth.email) || "")}</span></div></div>
          <button type="button" role="menuitem" data-t="edit">${UI("user")}내 프로필 수정</button>
          <hr>
          <button type="button" role="menuitem" data-t="out" class="lv-out"><svg class="ui" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4"/></svg>로그아웃</button>
        </div>`
      : auth ? "" : `<button type="button" class="lv-ghostbtn" data-t="join">회원가입</button><button type="button" class="lv-solidbtn" data-t="login">로그인</button>`;
  }

  /* ---------- 화면: 소통 공간 ---------- */
  function liveCommunity() {
    setTimeout(updateTop, 0);
    if (!auth) return authHTML();
    if (L.me === undefined) { if (!L.loadingMe) { L.loadingMe = true; loadMe().finally(() => (L.loadingMe = false)); } return `<div class="lv-loading">${bri({ size: 72 })}<p>소통 공간을 불러오는 중…</p></div>`; }
    if (L.me === null || L.editing) return profileHTML(L.me === null);
    const anon = anonAll(), wait = anon.filter((p) => !p.reps.length).length, today = anon.filter((p) => isToday(p.at)).length;
    const ch = CHANNELS.find((c) => c.id === S.channel) || CHANNELS[1];
    const others = L.users.filter((u) => u.uid !== L.me.uid).length;
    const unread = L.threads.filter((t) => t.kind === "mentor" && !t.mine && t.lastT && !t.lastMe).length;
    // 채팅 화면(동기방 · 1:1 대화)에서는 위 소개 상자를 빼고 채팅방을 화면 높이에 맞춘다
    const chatView = ch.id === "peer" || (ch.id === "ask" && L.mtid && L.threads.some((t) => t.tid === L.mtid));
    return `${chatView ? "" : `
    <section class="cm-hero">
      <div class="cm-hero-copy">
        <h1>소통 공간</h1>
        <p>메신저로 묻기 어려운 것, 여기서 편하게 물어보세요. 좋은 질문과 답변은 다음 신입의 상황 카드가 됩니다.</p>
        <div class="cm-stats cm-stats-btn" role="group" aria-label="익명 질문 모아 보기">
          <button type="button" data-laf="today" aria-pressed="${S.channel === "anon" && L.af === "today"}"><b>${today}</b> 오늘 새 글</button>
          <button type="button" data-laf="wait" class="${wait ? "warn" : ""}" aria-pressed="${S.channel === "anon" && L.af === "wait"}"><b>${wait}</b> 답변 기다리는 질문</button>
          <button type="button" data-laf="all" aria-pressed="${S.channel === "anon" && L.af === "all" && !L.aopen}"><b>${anon.length}</b> 전체 글</button></div>
      </div>
      <div class="cm-hero-bri" aria-hidden="true">${bri({ size: 96 })}</div>
    </section>`}
    <div class="cm-tabs" id="chans" role="tablist" aria-label="채널">
      ${CHANNELS.map((c) => {
        const badge = c.id === "ask" ? (unread ? `<span class="cm-badge warn">받은 질문 ${unread}</span>` : `<span class="cm-badge on">${others}명</span>`)
          : c.id === "anon" ? `<span class="cm-badge${wait ? " warn" : ""}">${wait ? `답변 대기 ${wait}` : anon.length}</span>` : `<span class="cm-badge">${L.users.filter((u) => u.ckey === L.me.ckey).length}명</span>`;
        return `<button data-c="${c.id}" role="tab" aria-selected="${c.id === ch.id}" aria-pressed="${c.id === ch.id}"><span class="cm-ic">${UI(c.id === "peer" ? "chat" : c.id)}</span><span class="cm-tx"><b>${c.n}</b><small>${c.id === "ask" ? "누구에게나 1:1로 · 받은 질문도 여기서" : c.id === "peer" ? `${esc(roomName())} 동기끼리` : c.d}</small></span>${badge}</button>`;
      }).join("")}
    </div>
    ${L.err ? `<p class="lv-err wide" role="alert">${esc(L.err)} <button type="button" class="lv-link" data-lretry>다시 시도</button></p>` : ""}
    ${ch.id === "peer" ? peerHTML() : ch.id === "ask" ? askHTML2() : anonHTML()}`;
  }

  /* 채팅 메시지 목록 */
  function logHTML(msgs, group) {
    let lastDay = "";
    const day = (at) => { const w = when(at); return /오늘|방금|분 전/.test(w) ? "오늘" : w; };
    return msgs.map((m, i) => {
      const prev = msgs[i - 1], d = day(m.at), div = d !== lastDay ? `<div class="chat-day"><span>${esc(d)}</span></div>` : ""; lastDay = d;
      const cont = prev && (prev.uid || prev.me) === (m.uid || m.me) && prev.me === m.me && !div && m.at - prev.at < 5 * 60e3;
      const av = m.me ? "" : cont ? '<span class="cmsg-sp"></span>' : m.av;
      return `${div}<div class="cmsg${m.me ? " me" : ""}${cont ? " cont" : ""}">${av}<div class="cmsg-col">${!m.me && !cont && group ? `<span class="cmsg-nm">${esc(m.by)}${m.tag ? ` <small>${esc(m.tag)}</small>` : ""}</span>` : ""}
        <div class="cmsg-row"><p class="cmsg-bub">${esc(m.t)}</p><span class="cmsg-meta">${m.unread ? `<b class="cmsg-unread" title="아직 안 읽은 사람 ${m.unread}명">${m.unread}</b>` : ""}<span class="cmsg-tm">${hm(new Date(m.at))}</span></span></div></div></div>`;
    }).join("") || `<div class="cm-empty">${UI("chat")}<p>첫 인사를 남겨 보세요!</p></div>`;
  }

  /* 동기방 */
  function peerHTML() {
    const peers = L.users.filter((u) => u.uid !== L.me.uid && u.ckey === L.me.ckey);
    const dms = L.threads.filter((t) => t.kind === "peer");
    const room = L.room !== "group" && dms.some((t) => t.tid === L.room) ? L.room : "group";
    const cur = room === "group" ? null : L.th[room];
    const lastG = L.peer[L.peer.length - 1];
    const side = `<aside class="chat-side" aria-label="대화 목록"><div class="chat-side-h">대화</div>
      <button type="button" class="chat-it" data-lroom="group" aria-pressed="${room === "group"}"><span class="chat-it-av grp">${UI("group")}</span><span class="chat-it-tx"><b>${esc(L.me.cohort)} 동기방 <small>${peers.length + 1}명</small></b><span>${lastG ? esc((lastG.me ? "나: " : lastG.by + ": ") + lastG.t) : "아직 대화가 없어요"}</span></span></button>
      ${dms.map((t) => `<button type="button" class="chat-it" data-lroom="${t.tid}" aria-pressed="${room === t.tid}">${uAv(t.other, "av sm")}<span class="chat-it-tx"><b>${esc(t.other.name)} <small>1:1</small></b><span>${t.lastT ? esc((t.lastMe ? "나: " : "") + t.lastT) : "아직 대화가 없어요"}</span></span></button>`).join("")}
    </aside>`;
    let head, msgs;
    if (room === "group") {
      head = `<div class="chat-head"><span class="cm-ic">${UI("group")}</span><div class="chat-title"><b>${esc(roomName())} 동기방</b><small>${peers.length + 1}명 · 같은 시기에 입사한 동료들이에요</small></div></div>`;
      // 동기방: 보낸 사람과 나를 빼고, 그 메시지 이후로 아직 방을 열지 않은 동기 수
      const mem = L.users.filter((u) => u.ckey === L.me.ckey && u.uid !== L.me.uid), rd = L.peerReads || {};
      msgs = L.peer.map((m) => ({ ...m, unread: mem.filter((u) => u.uid !== m.uid && (rd[u.uid] || 0) < m.at).length, av: `<button type="button" class="cmsg-avbtn" data-lprof="${m.uid}" aria-label="${esc(m.by)} 프로필">${uAv(m, "av sm")}</button>` }));
    } else {
      const t = dms.find((x) => x.tid === room);
      head = `<div class="chat-head">${uAv(t.other, "av sm")}<div class="chat-title"><b>${esc(t.other.name)}</b><small>1:1 대화 · ${esc(t.other.dept || "")}</small></div><span class="chip gray">${UI("lock")} 둘만 보여요</span></div>`;
      msgs = cur ? cur.msgs.map((m) => ({ ...m, unread: m.me && (cur.otherRead || 0) < m.at ? 1 : 0, av: uAv(t.other, "av sm") })) : null;
    }
    const mem = `<aside class="chat-mem" aria-label="대화상대">
      <div class="chat-mem-h">대화상대 <b>${peers.length + 1}</b></div>
      <div class="chat-mem-it me">${meAv("av sm")}<span class="chat-mem-tx"><b>${esc(L.me.name)} <em>나</em></b><small>${esc(L.me.dept)} · ${esc(joinedTx(L.me.joined))}</small></span><i class="on"></i></div>
      ${peers.map((u) => `<button type="button" class="chat-mem-it" data-lprof="${u.uid}">${uAv(u, "av sm")}<span class="chat-mem-tx"><b>${esc(u.name)}</b><small>${esc(u.dept)} · ${esc(joinedTx(u.joined))}</small></span><i class="${u.on ? "on" : ""}" title="${u.on ? "접속 중" : "자리 비움"}"></i></button>`).join("") || `<p class="chat-mem-note">아직 ${esc(roomName())} 동기가 가입하지 않았어요. 동기들에게 가입을 알려 주세요!</p>`}
      ${L.me.ckey && L.me.ckey.startsWith("H#") ? `<div class="chat-mem-h sub">기수 초대 코드</div>
      <p class="lv-codehint">지금은 입사 시기로 정해진 임시 방이에요. 인사팀에서 기수 코드를 받았다면 넣어 주세요. 그 기수 동기방으로 옮겨 가요.</p>
      <form class="lv-code" id="lvJoin"><input name="code" maxlength="12" placeholder="예: JMNYN1C" aria-label="기수 초대 코드" autocomplete="off"><button class="btn sm" type="submit">옮기기</button></form>` : ""}
      <div class="chat-mem-h sub">함께 볼 것</div>
      <a class="chat-mem-link" href="#game">🎮 100일 게임 이어 하기</a>
      <button type="button" class="chat-mem-link" data-c2="ask">🙋 1:1로 질문하기</button>
    </aside>`;
    return `<div class="chat-room has-mem lv-fit">${side}
      <div class="chat-main">${head}
        <div class="chat-log" id="chatLog" role="log" aria-live="polite">${msgs ? logHTML(msgs, room === "group") : `<div class="lv-loading sm">불러오는 중…</div>`}</div>
        <form class="chat-input" id="lvChat" data-room="${room}">${meAv("av sm")}
          <input type="text" id="chatText" placeholder="${room === "group" ? "동기들에게 메시지 보내기" : "1:1 메시지 보내기"}" autocomplete="off" aria-label="메시지 입력" maxlength="500">
          <button class="btn sm" type="submit">전송</button></form>
      </div>${mem}</div>`;
  }

  /* 1:1 질문하기 — 가입한 모든 사람에게 1:1로 (질문한 사람은 별명으로 보임) */
  const card = (u, me) => `<article class="mt-card${u.on || me ? "" : " off"}${me ? " lv-mecard2" : ""}">
      <div class="mt-card-top">${me ? meAv("av") : uAv(u, "av")}<span class="mt-dot${u.on || me ? " on" : ""}"></span>
        <div><b>${esc(u.name)}<small>${esc(u.rank)}</small>${me ? '<em class="lv-me">나</em>' : ""}</b><span>${esc(u.dept)} · ${yrsTx(u.yrs)}</span></div></div>
      ${u.bio ? `<p class="mt-bio">${esc(u.bio)}</p>` : me ? `<p class="mt-bio muted">한 줄 소개와 자신 있는 주제를 적으면 동료들이 나를 고르기 쉬워요.</p>` : ""}
      ${u.tags && u.tags.length ? `<div class="mt-tags">${u.tags.map((t) => `<span>#${esc(t)}</span>`).join("")}</div>` : ""}
      <div class="mt-foot"><span class="mt-resp"><i class="${u.on || me ? "on" : ""}"></i>${me ? "다른 사람들에게 이렇게 보여요" : u.on ? "지금 접속 중" : "자리 비움"}${!me && u.job ? " · " + esc(u.job) : ""}</span>
        ${me ? `<button type="button" class="btn sm ghost" data-pedit>프로필 수정</button>` : `<button type="button" class="btn sm" data-lask="${u.uid}">1:1로 물어보기</button>`}</div>
    </article>`;
  function askHTML2() {
    const all = L.threads.filter((t) => t.kind === "mentor");
    if (L.mtid && all.some((t) => t.tid === L.mtid)) return mentorChatHTML(all, L.mtid);
    const others = L.users.filter((u) => u.uid !== L.me.uid);
    const got = all.filter((t) => !t.mine), sent = all.filter((t) => t.mine);
    const dr = S.draft || {};
    const jobs = ["전체", ...new Set(others.map((u) => u.job).filter(Boolean))];
    const q = (L.mq || "").trim().toLowerCase();
    // 연차가 높은 사람부터 (같으면 이름순)
    const list = others.filter((u) => (L.mtf === "전체" || u.job === L.mtf) && (!L.mtOn || u.on)
      && (!q || [u.name, u.dept, u.job, u.bio, ...(u.tags || [])].join(" ").toLowerCase().includes(q)))
      .sort((x, y) => (y.yrs || 0) - (x.yrs || 0) || String(x.name).localeCompare(y.name, "ko"));
    const row = (t) => `<button type="button" class="bd-row" data-lmt="${t.tid}">
        ${t.other.anon ? avatar({ bri: { c: "#9aa3b5" } }, "av sm") : uAv(t.other, "av sm")}
        <span class="bd-main"><span class="bd-title"><span class="cm-text">${esc(t.other.name)}${t.other.rank ? ` <small>${esc(t.other.rank)}</small>` : ""}</span>${t.lastT && !t.lastMe ? '<em class="bd-new">N</em>' : ""}</span><span class="bd-sub">${t.lastT ? esc((t.lastMe ? "나: " : "") + t.lastT) : "아직 메시지가 없어요"} · ${when(t.lastAt)}</span></span>
        <span class="bd-ans ${t.lastT && !t.lastMe ? "wait" : "done"}">${t.lastT && !t.lastMe ? (t.mine ? "새 답장" : "답장 필요") : t.mine ? "답장 대기" : "답장함"}</span></button>`;
    return `<div class="mt-wrap">
      ${dr.ref || dr.t ? `<div class="mt-ref">${UI("card")}<span>${dr.ref ? `게임 상황 <b>${esc(dr.ref)}</b>에 대해 ` : ""}물어볼 사람을 골라 주세요. 질문은 미리 적어 둘게요.</span></div>` : ""}
      <div class="mt-intro">${meAv("av")}<div><b>물어보고 싶은 사람을 골라 1:1로 대화해요</b><p>상대에게는 내 이름 대신 <b>'${esc(L.me.nick)}'</b>로 보여요. 원할 때 실명을 공개할 수 있어요. 나에게 온 질문도 여기서 답해요.</p></div></div>
      ${got.length || sent.length ? `<div class="lv-boxes">
        <section><h3>받은 질문 <b>${got.length}</b></h3><div class="lv-inbox">${got.map(row).join("") || `<p class="lv-none">아직 받은 질문이 없어요</p>`}</div></section>
        <section><h3>내가 한 질문 <b>${sent.length}</b></h3><div class="lv-inbox">${sent.map(row).join("") || `<p class="lv-none">아직 물어본 사람이 없어요</p>`}</div></section>
      </div>` : ""}
      <div class="mt-filters" role="group" aria-label="직무 필터">
        ${jobs.map((f) => `<button type="button" class="mt-chip" data-lmtf="${esc(f)}" aria-pressed="${L.mtf === f}">${esc(f)}</button>`).join("")}
        <label class="cm-sbox lv-msearch">${UI("search")}<input type="search" id="lvMq" value="${esc(L.mq || "")}" placeholder="이름 · 부서 · 주제로 찾기" aria-label="사람 찾기" autocomplete="off"></label>
        <label class="cm-toggle mt-onl" for="lvOn"><input type="checkbox" id="lvOn" ${L.mtOn ? "checked" : ""}><span></span>지금 접속 중만</label>
      </div>
      <div class="mt-grid">
        ${L.mtf === "전체" && !q && !L.mtOn ? card(L.me, true) : ""}
        ${list.map((u) => card(u, false)).join("") || (others.length ? `<div class="cm-empty">${UI("user")}<p>조건에 맞는 사람이 없어요. 필터나 검색어를 바꿔 보세요.</p></div>` : "")}
      </div>
    </div>`;
  }
  function mentorChatHTML(list, tid) {
    const t = L.threads.find((x) => x.tid === tid), cur = L.th[tid], o = t.other, asker = t.mine, dr = S.draft || {};
    const shown = asker ? (t.revealed ? `${L.me.name} (${L.me.dept})` : t.myNick || L.me.nick) : "";
    const pre = asker && cur && !cur.msgs.some((m) => m.me) ? dr.t || "" : "";
    const oAv = o.anon ? avatar({ bri: { c: "#9aa3b5" } }, "av sm") : uAv(o, "av sm");
    return `<div class="chat-room mt-room lv-fit">
      <aside class="chat-side" aria-label="1:1 대화">
        <button type="button" class="chat-it mt-back" data-lmtback><span class="chat-it-av">←</span><span class="chat-it-tx"><b>목록으로</b><span>다른 사람 찾기 · 받은 질문</span></span></button>
        <div class="chat-side-h">1:1 대화</div>
        ${list.map((y) => `<button type="button" class="chat-it" data-lmt="${y.tid}" aria-pressed="${y.tid === tid}">${y.other.anon ? avatar({ bri: { c: "#9aa3b5" } }, "av sm") : uAv(y.other, "av sm")}<span class="chat-it-tx"><b>${esc(y.other.name)} <small>${y.mine ? "내가 질문" : "받은 질문"}</small></b><span>${y.lastT ? esc((y.lastMe ? "나: " : "") + y.lastT) : "아직 대화가 없어요"}</span></span></button>`).join("")}
      </aside>
      <div class="chat-main">
        <div class="chat-head">${oAv}<div class="chat-title"><b>${esc(o.name)} ${o.anon ? "" : esc(o.rank || "")}${o.anon ? "" : ` <span class="mt-dot-in${o.on ? " on" : ""}"></span>`}</b>
          <small>${o.anon ? "이름을 공개하지 않은 질문자예요" : `${esc(o.job || "")} · ${esc(o.dept || "")} · ${yrsTx(o.yrs)}`}</small></div>
          ${asker ? (t.revealed ? `<span class="chip gray">${UI("user")} 실명 공개함</span>` : `<button type="button" class="btn sm ghost" data-lreveal title="상대에게 내 이름을 보여 줘요">실명 공개하기</button>`) : t.revealed ? `<span class="chip gray">실명 공개</span>` : ""}</div>
        <div class="chat-log" id="chatLog" role="log" aria-live="polite">
          <div class="mt-note">${UI("lock")} ${asker ? `${esc(o.name)} 님과 나만 보는 대화예요. 상대에게 나는 <b>'${esc(shown)}'</b>로 보여요.` : `질문한 사람과 나만 보는 대화예요. 질문한 사람이 실명을 공개하기 전까지는 별명으로 보여요. 답이 어려우면 "확인하고 언제까지 답할게요"처럼 기한을 알려 주세요.`}</div>
          ${cur ? logHTML(cur.msgs.map((m) => ({ ...m, unread: m.me && (cur.otherRead || 0) < m.at ? 1 : 0, av: oAv })), false) : `<div class="lv-loading sm">불러오는 중…</div>`}
        </div>
        <form class="chat-input" id="lvMt" data-tid="${tid}">${meAv("av sm")}
          <input type="text" id="chatText" value="${esc(pre)}" placeholder="${asker ? `${esc(o.name)} 님에게 질문하기 (반익명)` : "답장 보내기"}" autocomplete="off" aria-label="메시지 입력" maxlength="1000">
          <button class="btn sm" type="submit">전송</button></form>
      </div></div>`;
  }

  /* 익명 질문방 */
  // 실사용 모드: 서버의 실제 글만 (처음 질문 몇 개는 설문·인터뷰에서 나온 고민)
  function anonAll() { return L.anon || []; }
  function anonHTML() {
    const all = anonAll(), dr = S.draft || {};
    if (L.anon === null) return `<div class="lv-loading">${bri({ size: 60 })}<p>질문을 불러오는 중…</p></div>`;
    const open = L.aopen && all.find((p) => p.id === L.aopen);
    if (open) return anonDetailHTML(open);
    const list = all.filter((p) => L.af === "wait" ? !p.reps.length : L.af === "today" ? isToday(p.at) : true);
    const done = all.filter((p) => p.reps.length).length;
    const writing = L.awrite || S.anonWrite;
    return `<div class="cm-feed bd">
      <header class="bd-head"><div><h3>익명 질문방</h3><p>이름 없이 묻고, 이름 없이 답해요 · 질문 <b>${all.length}</b> · 답변 대기 <b class="w">${all.length - done}</b></p></div>
        <button type="button" class="btn" data-lwrite>${UI("pen")} 질문하기</button></header>
      <form class="bd-write lv-form" id="lvAnonForm" ${writing ? "" : "hidden"}>
        <div class="bd-write-h"><b>익명으로 질문하기</b><small>이름 없이 올라가요 · 첫 문장이 제목이 돼요</small></div>
        ${dr.ref ? `<span class="cm-ref">${UI("card")} ${esc(dr.ref)}</span>` : ""}
        <div class="bd-cats" role="radiogroup" aria-label="말머리">${ANON_CATS.map((c, i) => `<label><input type="radio" name="acat" value="${c}" ${i === 0 ? "checked" : ""}><span>${c}</span></label>`).join("")}</div>
        <textarea id="ptext" rows="4" aria-label="질문 내용" placeholder="예: 입사 2주 차인데 연차를 써도 될까요? 병원 예약이 평일밖에 안 돼서요.">${esc(dr.t || "")}</textarea>
        <div class="bd-write-f"><span>${UI("lock")} 다른 사람에게는 '익명'으로만 보여요</span><button type="button" class="btn sm ghost" data-lwcancel>취소</button><button class="btn sm" type="submit">올리기</button></div>
      </form>
      <div class="bd-search" role="search">
        <label class="cm-sbox">${UI("search")}<input type="search" id="lvQ" value="${esc(L.aq)}" placeholder="궁금한 내용을 검색해 보세요 (예: 연차, 회식, 메일)" aria-label="익명 질문 검색" autocomplete="off"></label>
        <div class="cm-skw">${["연차", "회식", "메일", "보고", "평가", "야근"].map((k) => `<button type="button" data-lkw="${k}">#${k}</button>`).join("")}</div>
      </div>
      <div class="bd-list" aria-label="익명 질문 목록">
        <div class="bd-tabs" role="group" aria-label="답변 상태">
          <button type="button" data-laf2="all" aria-pressed="${L.af === "all"}">전체 <b>${all.length}</b></button>
          <button type="button" data-laf2="wait" aria-pressed="${L.af === "wait"}">답변 대기 <b>${all.length - done}</b></button>
          <button type="button" data-laf2="today" aria-pressed="${L.af === "today"}">오늘 <b>${all.filter((p) => isToday(p.at)).length}</b></button>
          <span class="cm-scount" id="lvCount" aria-live="polite" hidden></span>
        </div>
        ${list.map((p) => { const r = p.reps.length;
          return `<button type="button" class="bd-row lv-arow" data-lopen="${esc(p.id)}" data-s="${esc([p.t, p.cat, ...p.reps.map((x) => x.t + " " + x.by)].join(" ").toLowerCase())}">
            <span class="bd-cat">${esc(p.cat || anonCat(p))}</span>
            <span class="bd-main"><span class="bd-title"><span class="cm-text">${esc(anonTitle(p.t))}</span>${isToday(p.at) ? '<em class="bd-new">N</em>' : ""}${p.mine ? '<em class="bd-mine">내 글</em>' : ""}${p.survey ? '<em class="lv-ex" title="신입·인턴 설문과 현직자 인터뷰에서 나온 고민이에요">설문·인터뷰</em>' : ""}</span>
              <span class="bd-sub">익명 · ${esc(p.ex ? p.seedWhen || "" : when(p.at))}${p.ex ? "" : ` · 조회 ${p.views}`}</span></span>
            <span class="bd-ans ${r ? "done" : "wait"}">${r ? `${UI("chat")} ${r}` : "답변 대기"}</span></button>`; }).join("")
          || `<div class="cm-empty">${UI("chat")}<p>${L.af === "wait" ? "답변을 기다리는 질문이 없어요 🎉" : L.af === "today" ? "오늘 올라온 질문이 아직 없어요" : "아직 질문이 없어요"}</p></div>`}
        <div class="cm-empty" id="lvNone" hidden>${UI("search")}<p>찾는 질문이 없어요. <button type="button" class="bd-link" data-lwrite>익명으로 직접 물어보기</button></p></div>
      </div>
      <p class="sample">'설문·인터뷰' 표시가 있는 질문은 신입·인턴 설문과 현직자 인터뷰에서 실제로 나온 고민이에요. 겪어 본 일이라면 답을 남겨 주세요.</p></div>`;
  }
  function anonDetailHTML(p) {
    return `<div class="cm-feed bd">
      <div class="bd-nav"><button type="button" class="bd-back" data-lback>← 목록으로</button></div>
      <article class="bd-post">
        <div class="bd-post-h"><span class="bd-cat ch-anon">${esc(p.cat || anonCat(p))}</span><span class="bd-ans ${p.reps.length ? "done" : "wait"}">${p.reps.length ? `답변 ${p.reps.length}` : "답변 대기"}</span>${p.mine ? '<span class="bd-mine">내 글</span>' : ""}${p.survey ? '<span class="lv-ex">설문·인터뷰</span>' : ""}</div>
        <h2>${esc(anonTitle(p.t))}</h2>
        <div class="bd-sub">익명 · ${esc(p.ex ? p.seedWhen || "" : when(p.at))}${p.ex ? "" : ` · 조회 ${p.views}`}</div>
        ${p.ref ? `<span class="cm-ref">${UI("card")} ${esc(p.ref)}</span>` : ""}
        <p class="bd-body">${esc(p.t)}</p>
        <section class="bd-answers" aria-label="답변"><h4>답변 <b>${p.reps.length}</b></h4>
          ${p.reps.map((r) => `<div class="bd-a">${avatar({ bri: { c: r.au ? "#7c8db5" : "#9aa3b5" } }, "av sm")}
            <div><div class="bd-a-h"><b>${esc(r.by)}${r.mine ? " (나)" : ""}</b>${r.at ? `<small>${when(r.at)}</small>` : ""}</div><p>${esc(r.t)}</p></div></div>`).join("")
            || `<div class="bd-a-empty">아직 답변이 없어요. 곧 누군가 답해 줄 거예요 🙂</div>`}
        </section>
        ${p.ex ? `<p class="lv-p small">예시 글에는 답글을 달 수 없어요.</p>` : `<form class="reply-form bd-reply" id="lvReply" data-p="${esc(p.id)}"><input type="text" aria-label="답글" maxlength="1000" placeholder="${p.mine ? "질문자로 덧붙이기" : "답변 달기 (익명으로 보여요)"}"><button class="btn sm" type="submit">등록</button></form>`}
        ${p.mine ? `<div class="bd-prop"><button type="button" class="btn sm ghost" data-ldel="${esc(p.id)}">내 글 지우기</button></div>` : ""}
      </article></div>`;
  }

  /* ---------- 이벤트 ---------- */
  const busy = async (fn) => { L.busy = true; try { await fn(); } catch (e) { toast(e.message || "잠시 후 다시 시도해 주세요"); } finally { L.busy = false; } };
  async function openChannel(c) { S.channel = c; S.cmFilter = null; save(); L.err = ""; rerender(); await busy(() => Promise.all([loadChannel(false), Date.now() - (L.usersAt || 0) > 5e3 ? loadUsers() : null])); rerender(); }
  // 비밀번호 보기/숨기기 (눈 아이콘)
  const EYE = '<svg class="ui" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYE_OFF = '<svg class="ui" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A10.7 10.7 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a10 10 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
  function pwToggles(root) {
    root.querySelectorAll('.lv-form input[type=password]').forEach((i) => {
      if (i.parentElement.classList.contains("lv-pw")) return;
      const w = document.createElement("span"); w.className = "lv-pw"; i.replaceWith(w); w.appendChild(i);
      const b = document.createElement("button"); b.type = "button"; b.className = "lv-pw-eye";
      const set = (show) => { i.type = show ? "text" : "password"; b.innerHTML = show ? EYE_OFF : EYE; b.setAttribute("aria-label", show ? "비밀번호 숨기기" : "비밀번호 보기"); b.setAttribute("aria-pressed", String(show)); b.title = show ? "숨기기" : "보기"; };
      b.addEventListener("click", () => { const pos = i.selectionStart; set(i.type === "password"); i.focus(); try { i.setSelectionRange(pos, pos); } catch {} });
      set(false); w.appendChild(b);
    });
  }
  function liveBind() {
    const app = document.getElementById("app");
    const on = (sel, ev, fn) => app.querySelectorAll(sel).forEach((el) => el.addEventListener(ev, fn));
    // 로그인 · 가입
    on("[data-lstep]", "click", (e) => { L.step = e.currentTarget.dataset.lstep; L.err = ""; route(); });
    pwToggles(app);
    const f1 = document.getElementById("lvLogin");
    if (f1) f1.addEventListener("submit", async (e) => { e.preventDefault(); L.email = f1.email.value.trim(); L.loading = true; L.err = ""; route();
      try { await login(L.email, f1.pw.value); L.loading = false; L.me = undefined; route(); }
      catch (err) { L.loading = false; L.err = err.message; if (err.code === "UserNotConfirmedException") { L.step = "code"; L.pw = f1.pw.value; } route(); } });
    const f2 = document.getElementById("lvSignup");
    if (f2) {
      roleToggle(f2);
      f2.addEventListener("submit", async (e) => { e.preventDefault();
        if (f2.pw.value !== f2.pw2.value) { L.err = "비밀번호가 서로 달라요."; return rerender(); }
        L.email = f2.email.value.trim(); const profile = readProfile(f2); L.loading = true; L.err = ""; route();
        try { await cog("SignUp", { Username: L.email, Password: f2.pw.value, UserAttributes: [{ Name: "email", Value: L.email }] });
          ls.set(PENDING, { email: L.email, profile }); L.pw = f2.pw.value; L.step = "code"; }
        catch (err) { L.err = err.message; if (err.code === "UsernameExistsException") { L.step = "login"; } }
        L.loading = false; route(); });
    }
    const f3 = document.getElementById("lvCode");
    if (f3) f3.addEventListener("submit", async (e) => { e.preventDefault(); L.loading = true; L.err = ""; route();
      try { await cog("ConfirmSignUp", { Username: L.email, ConfirmationCode: f3.code.value.trim() }).catch((err) => { if (!/CONFIRMED/i.test(err.message)) throw err; });
        if (L.pw) { await login(L.email, L.pw); L.pw = ""; L.me = undefined; toast("가입을 마쳤어요. 환영해요! 🎉"); }
        else { L.step = "login"; toast("이메일 인증을 마쳤어요. 로그인해 주세요"); } }
      catch (err) { L.err = err.message; }
      L.loading = false; route(); });
    on("[data-lresend]", "click", async () => { try { await cog("ResendConfirmationCode", { Username: L.email }); toast("인증 코드를 다시 보냈어요"); } catch (err) { toast(err.message); } });
    const f4 = document.getElementById("lvForgot");
    if (f4) f4.addEventListener("submit", async (e) => { e.preventDefault(); L.email = f4.email.value.trim(); L.loading = true; L.err = ""; route();
      try { await cog("ForgotPassword", { Username: L.email }); L.step = "forgot2"; } catch (err) { L.err = err.message; } L.loading = false; route(); });
    const f5 = document.getElementById("lvForgot2");
    if (f5) f5.addEventListener("submit", async (e) => { e.preventDefault(); L.loading = true; L.err = ""; route();
      try { await cog("ConfirmForgotPassword", { Username: L.email, ConfirmationCode: f5.code.value.trim(), Password: f5.pw.value }); await login(L.email, f5.pw.value); L.me = undefined; toast("비밀번호를 바꿨어요"); }
      catch (err) { L.err = err.message; } L.loading = false; route(); });
    // 프로필
    const fp = document.getElementById("lvProfile");
    if (fp) {
      roleToggle(fp);
      fp.addEventListener("submit", async (e) => { e.preventDefault(); L.loading = true; L.err = ""; route();
        try { L.me = (await api("me.put", { profile: readProfile(fp) })).me; L.editing = false; ls.set(PENDING, null); await Promise.all([loadUsers(), loadChannel(true)]); toast("프로필을 저장했어요"); }
        catch (err) { L.err = err.message; } L.loading = false; route(); });
    }
    on("[data-pedit]", "click", () => { L.editing = true; L.err = ""; route(); window.scrollTo(0, 0); });
    on("[data-pcancel]", "click", () => { L.editing = false; L.err = ""; route(); });
    on("[data-lout]", "click", () => { if (confirm("로그아웃할까요?")) logout(); });
    on("[data-lretry]", "click", () => { L.err = ""; L.me = undefined; route(); });
    // 채널
    const chans = document.getElementById("chans");
    if (chans) chans.addEventListener("click", (e) => { const b = e.target.closest("button[data-c]"); if (b) { L.mtid = null; L.aopen = null; openChannel(b.dataset.c); } });
    on("[data-c2]", "click", (e) => { L.mtid = null; openChannel(e.currentTarget.dataset.c2); window.scrollTo(0, 0); });
    on("[data-laf]", "click", (e) => { L.af = e.currentTarget.dataset.laf; L.aopen = null; L.aq = ""; openChannel("anon"); });
    // 동기방
    on("[data-lroom]", "click", async (e) => { L.room = e.currentTarget.dataset.lroom; rerender(); await busy(() => loadChannel(false)); rerender(); focusIn(); });
    const fc = document.getElementById("lvChat");
    if (fc) fc.addEventListener("submit", (e) => { e.preventDefault(); const i = document.getElementById("chatText"), t = i.value.trim(); if (!t) return; i.value = "";
      busy(async () => { if (fc.dataset.room === "group") await api("peer.send", { t }); else await api("dm.send", { tid: fc.dataset.room, t }); await loadChannel(false); }).then(() => { rerender(); focusIn(); }); });
    on("[data-lprof]", "click", (e) => profPop(e.currentTarget));
    const fj = document.getElementById("lvJoin");
    if (fj) fj.addEventListener("submit", (e) => { e.preventDefault(); const code = fj.code.value.trim(); if (!code) return;
      ls.set(JOIN, { code }); busy(async () => { await joinPending(); await Promise.all([loadUsers(), loadChannel(false)]); }).then(rerender); });
    // 1:1 질문하기
    on("[data-lmtf]", "click", (e) => { L.mtf = e.currentTarget.dataset.lmtf; route(); });
    const mq = document.getElementById("lvMq");
    if (mq) { mq.addEventListener("input", () => { L.mq = mq.value; clearTimeout(L.mqT); L.mqT = setTimeout(() => { rerender(); const i = document.getElementById("lvMq"); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 200); }); }
    const lo = document.getElementById("lvOn"); if (lo) lo.addEventListener("change", () => { L.mtOn = lo.checked; route(); });
    on("[data-lask]", "click", (e) => { const to = e.currentTarget.dataset.lask;
      busy(async () => { const j = await api("dm.open", { kind: "mentor", to }); L.mtid = j.tid; await loadChannel(false); }).then(() => { rerender(); focusIn(); window.scrollTo(0, 0); }); });
    on("[data-lmt]", "click", async (e) => { L.mtid = e.currentTarget.dataset.lmt; rerender(); await busy(() => loadChannel(false)); rerender(); focusIn(); });
    on("[data-lmtback]", "click", () => { L.mtid = null; rerender(); });
    on("[data-lreveal]", "click", () => { if (!confirm(`상대에게 내 이름(${L.me.name})과 부서를 공개할까요? 공개하면 되돌릴 수 없어요.`)) return;
      busy(async () => { await api("dm.reveal", { tid: L.mtid }); await loadChannel(false); }).then(rerender); });
    const fm = document.getElementById("lvMt");
    if (fm) fm.addEventListener("submit", (e) => { e.preventDefault(); const i = document.getElementById("chatText"), t = i.value.trim(); if (!t) return; i.value = "";
      busy(async () => { await api("dm.send", { tid: fm.dataset.tid, t }); S.draft = null; save(); await loadChannel(false); }).then(() => { rerender(); focusIn(); }); });
    // 익명 질문방
    on("[data-lwrite]", "click", () => { L.awrite = true; const f = document.getElementById("lvAnonForm"); if (f) { f.hidden = false; f.scrollIntoView({ block: "nearest" }); document.getElementById("ptext").focus({ preventScroll: true }); } });
    on("[data-lwcancel]", "click", () => { L.awrite = false; S.anonWrite = false; S.draft = null; save(); route(); });
    const fa = document.getElementById("lvAnonForm");
    if (fa) fa.addEventListener("submit", (e) => { e.preventDefault(); const t = document.getElementById("ptext").value.trim(); if (t.length < 5) return toast("질문을 조금 더 적어 주세요");
      const cat = (fa.querySelector("input[name=acat]:checked") || {}).value;
      busy(async () => { await api("anon.post", { t, cat, ref: (S.draft || {}).ref }); L.awrite = false; S.anonWrite = false; S.draft = null; save(); L.af = "all"; await loadChannel(false); toast("익명으로 올렸어요"); }).then(rerender); });
    on("[data-laf2]", "click", (e) => { L.af = e.currentTarget.dataset.laf2; route(); });
    on("[data-lopen]", "click", (e) => { const id = e.currentTarget.dataset.lopen; L.aopen = id; route(); const f = document.querySelector(".cm-feed"); if (f && f.getBoundingClientRect().top < 0) f.scrollIntoView({ block: "start" });
      if (!id.startsWith("seed-")) api("anon.view", { id }).catch(() => {}); });
    on("[data-lback]", "click", () => { L.aopen = null; route(); });
    const fr = document.getElementById("lvReply");
    if (fr) fr.addEventListener("submit", (e) => { e.preventDefault(); const i = fr.querySelector("input"), t = i.value.trim(); if (!t) return; i.value = "";
      busy(async () => { await api("anon.reply", { id: fr.dataset.p, t }); await loadChannel(false); }).then(rerender); });
    on("[data-ldel]", "click", (e) => { if (!confirm("이 글을 지울까요? 답변도 함께 지워져요.")) return; const id = e.currentTarget.dataset.ldel;
      busy(async () => { await api("anon.delete", { id }); L.aopen = null; await loadChannel(false); toast("글을 지웠어요"); }).then(rerender); });
    const q = document.getElementById("lvQ");
    if (q) {
      const rows = [...app.querySelectorAll(".lv-arow")];
      rows.forEach((a) => { const t = a.querySelector(".cm-text"); t.dataset.raw = t.textContent; });
      const reEsc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const apply = () => { L.aq = q.value; const terms = q.value.trim().toLowerCase().split(/\s+/).filter(Boolean); let n = 0;
        rows.forEach((a) => { const okk = terms.every((w) => a.dataset.s.includes(w)); a.hidden = !okk; if (okk) n++;
          const t = a.querySelector(".cm-text"); t.innerHTML = terms.length ? esc(t.dataset.raw).replace(new RegExp(terms.map((w) => reEsc(esc(w))).join("|"), "gi"), "<mark>$&</mark>") : esc(t.dataset.raw); });
        const c = document.getElementById("lvCount"); c.hidden = !terms.length; c.textContent = `"${q.value.trim()}" 검색 결과 ${n}개`;
        document.getElementById("lvNone").hidden = !terms.length || n > 0; };
      q.addEventListener("input", apply);
      on("[data-lkw]", "click", (e) => { q.value = e.currentTarget.dataset.lkw; apply(); q.focus(); });
      if (L.aq) apply();
    }
    const log = document.getElementById("chatLog"); if (log) log.scrollTop = log.scrollHeight;
  }
  function roleToggle(f) {
    const set = () => { const c = f.querySelector("[name=hrd]"), h = f.querySelector(".lv-hrd"); if (h) h.hidden = !(c && c.checked) || (L.me && L.me.role === "HRD"); };
    f.querySelectorAll("[name=hrd]").forEach((r) => r.addEventListener("change", set));
  }
  const focusIn = () => setTimeout(() => { const i = document.getElementById("chatText"); if (i) { i.focus({ preventScroll: true }); i.setSelectionRange(i.value.length, i.value.length); } }, 0);
  function profPop(btn) {
    document.querySelectorAll(".prof-pop").forEach((x) => x.remove());
    const u = L.users.find((x) => x.uid === btn.dataset.lprof); if (!u) return;
    const room = btn.closest(".chat-room"); if (!room) return;
    const el = document.createElement("div"); el.className = "prof-pop"; el.setAttribute("role", "dialog");
    const me = u.uid === L.me.uid;
    el.innerHTML = `<button type="button" class="prof-x" aria-label="닫기">✕</button>
      <div class="prof-top">${uAv(u, "av")}<div><b>${esc(u.name)} <small>${esc(u.rank)}</small></b><small>${esc(u.dept)}${u.job ? " · " + esc(u.job) : ""} · ${u.yrs ? yrsTx(u.yrs) : esc(joinedTx(u.joined))}</small></div></div>
      ${u.bio ? `<p class="prof-bio">${esc(u.bio)}</p>` : ""}
      ${me ? "" : `<button type="button" class="btn sm prof-go">💬 1:1 채팅하기</button>`}
      <span class="prof-meta">${u.on ? "지금 접속 중" : "자리 비움"}</span>`;
    room.appendChild(el);
    const r = btn.getBoundingClientRect(), rr = room.getBoundingClientRect();
    let left = r.right - rr.left + 8, top = r.top - rr.top - 6;
    if (left + el.offsetWidth > rr.width - 8) left = Math.max(8, r.left - rr.left - el.offsetWidth - 8);
    el.style.left = left + "px"; el.style.top = Math.max(8, Math.min(top, rr.height - el.offsetHeight - 8)) + "px";
    el.querySelector(".prof-x").onclick = () => el.remove();
    const go = el.querySelector(".prof-go");
    if (go) go.onclick = () => busy(async () => { const j = await api("dm.open", { kind: "peer", to: u.uid }); L.room = j.tid; await loadChannel(false); }).then(() => { rerender(); focusIn(); });
  }

  /* ---------- 게임·챗봇에서 넘어온 질문 ---------- */
  // 게임에서 '익명 질문방에 바로 올리기' / 'D+100 동기방에 공유'
  function handleGameMsg(m) {
    if (m.type === "ask" && m.ch === "anon") {
      const ref = (m.card && (m.card.day + " · " + m.card.title)) || "", t = String(m.text || "").slice(0, 1500);
      if (auth && L.me) { api("anon.post", { t, cat: "업무", ref }).then(() => toast("익명 질문방에 올렸어요"), (e) => toast(e.message)); L.anon = null; }
      else { S.draft = { ref, t }; S.channel = "anon"; S.anonWrite = true; save(); toast("소통 공간에 로그인하면 바로 올릴 수 있어요 · 질문은 적어 뒀어요"); }
      return true;
    }
    if (m.type === "share") {
      const t = String(m.text || "").slice(0, 500);
      S.shared = true; S.channel = "peer"; save();
      if (auth && L.me) api("peer.send", { t }).then(() => toast("동기방에 공유했어요"), (e) => toast(e.message));
      else toast("소통 공간에 로그인하면 동기방에 공유할 수 있어요");
      setTimeout(() => { location.hash = "#community"; }, 600);
      return true;
    }
    return false;
  }
  // 챗봇(브리) 자료: 실제 익명 질문방의 답변 (질문자가 덧붙인 글은 빼고)
  function kbPosts() {
    return (L.anon || []).filter((p) => p.reps.some((r) => !r.au)).map((p) => ({ id: "live-" + p.id, ch: "anon", t: p.t, rep: p.reps.filter((r) => !r.au).map((r) => ({ by: "익명 동료", tag: "", t: r.t })) }));
  }

  /* ---------- 운영 대시보드: 기수 · 동기방 초대 링크 (HRD) ---------- */
  const inviteUrl = (code) => `${location.origin}${location.pathname}?join=${encodeURIComponent(code)}#community`;
  function cohortPanelHTML() {
    const head = `<div class="hd-card-h"><div><h2>기수 · 동기방 초대 링크</h2><p>기수를 만들고 링크를 입문교육 안내 메일에 넣어 보내세요. 링크로 가입한 사람은 그 기수 동기방에 바로 들어가요.</p></div></div>`;
    if (!auth || !L.me) return `<section class="hd-card lv-cohorts">${head}
      <div class="lv-cohort-empty">${UI("lock")}<p>HRD 담당자 계정으로 로그인하면 기수를 만들고 초대 링크를 보낼 수 있어요.</p><button type="button" class="btn sm" data-hlogin>로그인</button></div></section>`;
    if (!isHrd()) return "";
    if (!L.cohorts) { if (!L.cLoading) { L.cLoading = true; api("cohort.list").then((j) => { L.cohorts = j.cohorts; }).catch((e) => toast(e.message)).finally(() => { L.cLoading = false; rerender(); }); }
      return `<section class="hd-card lv-cohorts">${head}<div class="lv-loading sm">불러오는 중…</div></section>`; }
    return `<section class="hd-card lv-cohorts">${head}
      <form class="lv-cform lv-form" id="lvCohort"><input name="name" maxlength="30" required placeholder="예: 2026년 12월 입사 1기"><button class="btn" type="submit">${UI("pen")} 기수 만들기</button></form>
      <div class="lv-clist">${L.cohorts.map((c) => `<div class="lv-crow">
          <div class="lv-cname"><b>${esc(c.name)}</b><small>${c.members.length ? `${c.members.length}명 · ${esc(c.members.slice(0, 4).join(", "))}${c.members.length > 4 ? " 외" : ""}` : "아직 들어온 사람이 없어요"}</small></div>
          <code class="lv-ccode" title="초대 코드">${esc(c.code)}</code>
          <input class="lv-clink" readonly value="${esc(inviteUrl(c.code))}" aria-label="${esc(c.name)} 초대 링크">
          <button type="button" class="btn sm" data-ccopy="${esc(c.code)}">링크 복사</button></div>`).join("") || `<div class="cm-empty">${UI("group")}<p>아직 만든 기수가 없어요. 위에서 첫 기수를 만들어 보세요.</p></div>`}</div>
    </section>`;
  }
  function bindCohort() {
    document.querySelectorAll("[data-hlogin]").forEach((b) => b.addEventListener("click", () => { L.step = "login"; location.hash = "#community"; }));
    const f = document.getElementById("lvCohort");
    if (f) f.addEventListener("submit", (e) => { e.preventDefault(); const name = f.name.value.trim(); if (!name) return;
      busy(async () => { const c = await api("cohort.create", { name }); L.cohorts = (await api("cohort.list")).cohorts; toast(`'${c.name}'을 만들었어요 · 초대 코드 ${c.code}`); }).then(() => { f.name.value = ""; rerender(); }); });
    document.querySelectorAll("[data-ccopy]").forEach((b) => b.addEventListener("click", () => {
      const url = inviteUrl(b.dataset.ccopy);
      const done = () => { toast("초대 링크를 복사했어요"); b.textContent = "✓ 복사됨"; setTimeout(() => (b.textContent = "링크 복사"), 1600); };
      try { navigator.clipboard.writeText(url).then(done, () => { b.previousElementSibling.select(); document.execCommand("copy"); done(); }); } catch (e) { b.previousElementSibling.select(); document.execCommand("copy"); done(); }
    }));
  }
  if (VIEWS.hrd) {
    const hrdView = VIEWS.hrd, hrdBind = bind.hrd;
    VIEWS.hrd = () => { const html = hrdView(); const panel = cohortPanelHTML(); if (!panel) return html;
      // 대시보드 첫 카드(머리말) 바로 아래에 넣는다
      const i = html.indexOf("</section>"); return i > 0 ? html.slice(0, i + 10) + panel + html.slice(i + 10) : panel + html; };
    bind.hrd = () => { if (hrdBind) hrdBind(); bindCohort(); };
  }

  /* ---------- 연결 ---------- */
  VIEWS.community = liveCommunity;
  bind.community = liveBind;
  window.HBLive = { handleGameMsg, kbPosts, logout, state: L, isHrd: () => !!(auth && isHrd()) };
  // 로그인 상태면 챗봇 자료를 위해 미리 한 번 불러 둔다
  if (auth) { api("anon.list").then((j) => { L.anon = j.posts; }).catch(() => {});
    if ((location.hash || "#home") !== "#community") api("me.get").then((j) => { if (L.me === undefined && j.me) { L.me = j.me; updateTop(); if (location.hash === "#hrd") route(); } }).catch(() => {}); }
  updateTop();

  /* ---------- 스타일 ---------- */
  const css = `
  .lv-auth{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,.85fr);gap:24px;max-width:1120px;margin:0 auto;align-items:start}
  .lv-auth.one{grid-template-columns:minmax(0,640px);justify-content:center}
  .lv-card{background:#fff;border:1.5px solid var(--blue-line,#c9d8f2);border-radius:22px;padding:clamp(18px,3vw,28px);box-shadow:0 18px 40px -30px rgba(0,48,122,.6);display:grid;gap:16px}
  .lv-card-h{display:flex;gap:12px;align-items:center}.lv-card-h svg{width:52px;height:auto;flex:none}.lv-card-h div{display:grid;gap:2px}.lv-card-h b{font-size:20px}.lv-card-h small{color:var(--ink-3,#6b7280);font-size:13.5px}
  .lv-tabs{display:grid;grid-template-columns:1fr 1fr;background:var(--bg-soft,#f5f7fb);border-radius:12px;padding:4px}
  .lv-tabs button{border:0;background:none;border-radius:9px;padding:9px;font:inherit;font-weight:700;color:var(--ink-3,#6b7280);cursor:pointer}
  .lv-tabs button[aria-selected=true]{background:#fff;color:var(--blue,#004aad);box-shadow:0 1px 3px rgba(0,30,80,.12)}
  .lv-form{display:grid;gap:12px}
  .lv-form fieldset{border:0;padding:0;margin:0;display:grid;gap:12px}
  .lv-form legend{font-weight:800;font-size:14px;margin-bottom:4px;padding:0}.lv-form legend small{font-weight:500;color:var(--ink-3,#6b7280);margin-left:6px}
  .lv-form label{display:grid;gap:6px;font-size:13px;font-weight:700;color:var(--ink-2,#3b4252)}.lv-form label small{font-weight:500;color:var(--ink-3,#6b7280)}
  .lv-form input:not([type=checkbox]):not([type=radio]),.lv-form select,.lv-form textarea{width:100%;box-sizing:border-box;border:1.5px solid var(--line,#e3e8f0);border-radius:11px;padding:10px 12px;font:inherit;font-size:14.5px;background:#fff;color:inherit}
  .lv-form input:focus,.lv-form select:focus,.lv-form textarea:focus{outline:none;border-color:var(--blue,#004aad);box-shadow:0 0 0 3px rgba(0,74,173,.12)}
  .lv-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:end}.lv-row3{grid-template-columns:1fr 1.3fr 1fr}
  .lv-radio{display:flex;flex-wrap:wrap;gap:6px;font-size:13px;font-weight:700;color:var(--ink-2,#3b4252);align-self:end}.lv-radio>span{flex-basis:100%}
  .lv-radio label{display:inline-flex!important}.lv-radio label span{padding:10px 16px!important}.lv-radio input{position:absolute;opacity:0;pointer-events:none}
  .lv-radio label span{border:1.5px solid var(--line,#e3e8f0);border-radius:999px;padding:8px 14px;cursor:pointer;font-weight:700}
  .lv-radio input:checked+span{border-color:var(--blue,#004aad);background:var(--blue-soft,#eef3fc);color:var(--blue,#004aad)}
  .lv-radio input:focus-visible+span{outline:2px solid var(--blue,#004aad);outline-offset:2px}
  .lv-form label.lv-check{display:flex;align-items:flex-start;gap:8px;font-weight:600;cursor:pointer}.lv-check input{margin-top:2px;accent-color:var(--blue,#004aad)}
  .lv-pw input::-ms-reveal,.lv-pw input::-ms-clear{display:none}
  .lv-pw{position:relative;display:block}.lv-pw input{padding-right:44px!important}
  .lv-pw-eye{position:absolute;right:6px;top:50%;transform:translateY(-50%);width:34px;height:34px;display:grid;place-items:center;border:0;background:none;border-radius:8px;color:var(--ink-3,#6b7280);cursor:pointer}
  .lv-pw-eye:hover{background:var(--bg-soft,#f5f7fb);color:var(--ink,#111)}.lv-pw-eye:focus-visible{outline:2px solid var(--blue,#004aad)}.lv-pw-eye .ui{width:19px;height:19px}
  .lv-agree{grid-template-columns:auto 1fr!important;align-items:start;font-weight:500!important;font-size:12.5px!important;line-height:1.55;background:var(--bg-soft,#f5f7fb);border-radius:12px;padding:10px 12px}
  .lv-agree input{margin-top:3px}
  .lv-wide{width:100%;justify-content:center}
  .lv-link{border:0;background:none;color:var(--blue,#004aad);font:inherit;font-size:13px;font-weight:700;cursor:pointer;padding:4px;justify-self:center}
  .lv-links{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
  .lv-err{margin:0;color:#b42318;background:#fef3f2;border-radius:10px;padding:9px 12px;font-size:13px;font-weight:600}.lv-err.wide{max-width:none;margin:0 auto 12px;width:100%;box-sizing:border-box}
  .lv-h{margin:0;font-size:18px}.lv-p{margin:0;color:var(--ink-2,#3b4252);font-size:14px;line-height:1.6}.lv-p.small{font-size:12.5px;color:var(--ink-3,#6b7280)}
  .lv-side{background:var(--blue-soft,#eef3fc);border-radius:22px;padding:clamp(18px,3vw,26px);display:grid;gap:14px}
  .lv-side h3{margin:0;font-size:16px}.lv-side ul{list-style:none;margin:0;padding:0;display:grid;gap:12px}
  .lv-side li{display:flex;gap:10px;align-items:flex-start}.lv-side li .ui{width:22px;height:22px;flex:none;color:var(--blue,#004aad);margin-top:2px}
  .lv-side li div{display:grid;gap:2px}.lv-side li span{font-size:13px;color:var(--ink-2,#3b4252);line-height:1.5}
  .lv-note{margin:0;font-size:12.5px;color:var(--ink-3,#6b7280);display:flex;gap:6px;align-items:flex-start}.lv-note .ui{width:15px;height:15px;flex:none;margin-top:2px}
  .lv-loading{display:grid;justify-items:center;gap:10px;padding:60px 16px;color:var(--ink-3,#6b7280)}.lv-loading svg{width:72px;height:auto}.lv-loading.sm{padding:30px}
  .lv-mecard{position:relative;z-index:1;display:flex;align-items:center;gap:10px;background:#fff;border:1.5px solid var(--blue-line,#c9d8f2);border-radius:16px;padding:12px 14px;flex-wrap:wrap;max-width:330px;color:var(--ink,#1d2433)}
  .lv-mecard .av{width:44px;height:44px;border-radius:50%}.lv-mecard>div:nth-child(2){display:grid;gap:2px;min-width:0}.lv-mecard b{font-size:15px}.lv-mecard b small{font-weight:500;color:var(--ink-3,#6b7280)}.lv-mecard span{font-size:12.5px;color:var(--ink-3,#6b7280)}
  .lv-mebtns{display:flex;gap:6px;margin-left:auto}.lv-mebtns button{border:1.5px solid var(--blue-line,#c9d8f2);background:#fff;color:var(--blue,#004aad);border-radius:999px;padding:5px 12px;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer}.lv-mebtns button:hover{background:var(--blue-soft,#eef3fc)}
  .lv-top{position:relative;display:flex;align-items:center;gap:10px;margin-left:auto;flex:none}
  .lv-user{display:flex;align-items:center;gap:12px;border:1px solid transparent;background:none;border-radius:12px;padding:6px 10px 6px 6px;cursor:pointer;color:inherit;font:inherit;text-align:left;transition:background .12s,border-color .12s}
  .lv-user:hover,.lv-user[aria-expanded=true]{background:var(--bg-soft,#f6f8fc);border-color:var(--line,#e3e8f0)}
  .lv-user .av{width:38px;height:38px;border-radius:50%;box-shadow:0 0 0 1px var(--line,#e3e8f0)}
  .lv-user-tx{display:grid;line-height:1.25}.lv-user-tx b{font-size:14px;font-weight:700}.lv-user-tx small{font-size:12px;color:var(--ink-3,#7c8597)}
  .lv-chev{width:16px;height:16px;color:var(--ink-3,#7c8597);transition:transform .15s}.lv-user[aria-expanded=true] .lv-chev{transform:rotate(180deg)}
  .lv-menu{position:absolute;right:0;top:calc(100% + 8px);width:260px;background:#fff;border:1px solid var(--line,#e3e8f0);border-radius:14px;box-shadow:0 16px 40px -12px rgba(16,24,40,.22),0 2px 6px rgba(16,24,40,.06);padding:6px;display:grid;z-index:50;animation:lvMenu .14s ease both}
  @keyframes lvMenu{from{opacity:0;transform:translateY(-4px)}}
  .lv-menu-h{display:flex;gap:10px;align-items:center;padding:10px 10px 12px;border-bottom:1px solid var(--line,#e3e8f0);margin-bottom:4px}
  .lv-menu-h .av{width:40px;height:40px;border-radius:50%;flex:none}.lv-menu-h div{display:grid;min-width:0;line-height:1.35}
  .lv-menu-h b{font-size:14.5px}.lv-menu-h b small{font-weight:500;color:var(--ink-3,#7c8597)}.lv-menu-h span{font-size:12.5px;color:var(--ink-2,#4a5468)}.lv-menu-h .lv-mail{color:var(--ink-3,#7c8597);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .lv-menu button{display:flex;align-items:center;gap:10px;border:0;background:none;border-radius:9px;padding:9px 10px;font:inherit;font-size:14px;color:var(--ink,#1c2333);cursor:pointer;text-align:left}
  .lv-menu button:hover{background:var(--bg-soft,#f6f8fc)}.lv-menu .ui{width:18px;height:18px;color:var(--ink-3,#7c8597)}
  .lv-menu hr{border:0;border-top:1px solid var(--line,#e3e8f0);margin:4px 0}
  .lv-menu .lv-out{color:#b42318}.lv-menu .lv-out .ui{color:#b42318}
  .lv-solidbtn,.lv-ghostbtn{border-radius:10px;padding:8px 16px;font:inherit;font-size:14px;font-weight:700;cursor:pointer;white-space:nowrap}
  .lv-solidbtn{border:1px solid var(--blue,#004aad);background:var(--blue,#004aad);color:#fff}.lv-solidbtn:hover{background:var(--blue-deep,#00307a)}
  .lv-ghostbtn{border:1px solid var(--line,#e3e8f0);background:#fff;color:var(--ink,#1c2333)}.lv-ghostbtn:hover{background:var(--bg-soft,#f6f8fc)}
  @media (max-width:760px){.lv-user-tx,.lv-chev{display:none}.lv-user{padding:3px}}
  @media (max-width:560px){.lv-ghostbtn{display:none}.lv-solidbtn{padding:6px 12px;font-size:13px}.lv-user .av{width:30px;height:30px}}
  .chat-room.lv-fit{height:max(440px,calc(100vh - 250px));height:max(440px,calc(100dvh - 250px))}
  @media (max-width:900px){.chat-room.lv-fit{height:max(420px,calc(100dvh - 290px))}}
  @media (max-width:720px){
    .cm-tabs{grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:6px!important}
    .cm-tabs button{padding:10px 6px!important;justify-content:center;gap:0!important;position:relative}
    .cm-tabs .cm-ic,.cm-tabs .cm-tx small{display:none}.cm-tabs .cm-tx b{font-size:13.5px;white-space:nowrap}
    .cm-tabs .cm-badge{position:absolute;top:-7px;right:-4px;font-size:10px;padding:1px 6px}
    .chat-room.lv-fit{height:calc(100dvh - 235px);min-height:380px}
  }
  /* 채팅 화면에서는 '브리에게 물어보기' 버튼이 전송 버튼을 가리지 않게 위로 */
  body:has(.chat-room.lv-fit) #hbBot{bottom:calc(96px + env(safe-area-inset-bottom,0px))}
  body:has(.chat-room.lv-fit) .hbb-fab:not(.on) .hbb-fab-tx{display:none}body:has(.chat-room.lv-fit) .hbb-fab:not(.on){padding:6px}
  @media (max-width:720px){body:has(.chat-room.lv-fit) #hbBot{bottom:calc(84px + env(safe-area-inset-bottom,0px))}}
  .cmsg-meta{display:flex;flex-direction:column;align-items:flex-end;justify-content:flex-end;gap:1px;flex:none}.cmsg.me .cmsg-meta{align-items:flex-end}
  .cmsg-unread{font-size:11px;font-weight:800;color:#e0a100;line-height:1}
  .lv-boxes{display:grid;grid-template-columns:1fr 1fr;gap:14px}.lv-boxes h3{font-size:14.5px;margin:0 0 8px}.lv-boxes h3 b{color:var(--blue,#004aad)}
  .lv-boxes .bd-row{grid-template-columns:auto minmax(0,1fr) auto}.lv-boxes .bd-title small{font-weight:500;color:var(--ink-3,#7c8597)}
  .lv-none{margin:0;padding:16px;color:var(--ink-3,#7c8597);font-size:13.5px}
  .lv-msearch{flex:1;min-width:200px;max-width:360px;margin-left:auto}
  .lv-me{font-style:normal;font-size:11px;font-weight:800;background:var(--blue,#004aad);color:#fff;border-radius:5px;padding:1px 6px;margin-left:6px}
  .lv-mecard2{border-style:dashed;background:var(--bg-soft,#f6f8fc)}
  @media (max-width:860px){.lv-boxes{grid-template-columns:minmax(0,1fr)}}
  .lv-invite{background:#fff6de;border:1px solid #ffe2a1;color:#7a4b00;border-radius:12px;padding:10px 12px;font-size:13.5px}
  .lv-hrd input{letter-spacing:.2em}
  .lv-codehint{margin:0 6px 8px;font-size:12px;line-height:1.5;color:var(--ink-3,#7c8597)}
  .lv-code{display:flex;gap:6px;margin:0 6px 8px}.lv-code input{flex:1;min-width:0;border:1px solid var(--line,#e3e8f0);border-radius:9px;padding:7px 9px;font:inherit;font-size:13px;text-transform:uppercase}
  .lv-cohorts{display:grid;gap:14px}
  .lv-cform{display:flex!important;gap:8px;max-width:560px}.lv-cform input{flex:1}
  .lv-clist{display:grid;border:1px solid var(--line,#e3e8f0);border-radius:14px;overflow:hidden}
  .lv-crow{display:grid;grid-template-columns:minmax(160px,1.2fr) auto minmax(200px,2fr) auto;gap:12px;align-items:center;padding:12px 14px;border-top:1px solid var(--line,#e3e8f0);background:#fff}.lv-crow:first-child{border-top:0}
  .lv-cname{display:grid;min-width:0}.lv-cname small{color:var(--ink-3,#7c8597);font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .lv-ccode{font-family:ui-monospace,Consolas,monospace;font-weight:700;letter-spacing:.12em;background:var(--blue-soft,#eef3fc);color:var(--blue,#004aad);border-radius:8px;padding:5px 9px}
  .lv-clink{width:100%;border:1px solid var(--line,#e3e8f0);border-radius:9px;padding:7px 10px;font:inherit;font-size:12.5px;color:var(--ink-2,#4a5468);background:var(--bg-soft,#f6f8fc)}
  .lv-cohort-empty{display:flex;align-items:center;gap:12px;background:var(--bg-soft,#f6f8fc);border-radius:12px;padding:14px 16px}.lv-cohort-empty .ui{width:20px;height:20px;color:var(--ink-3,#7c8597);flex:none}.lv-cohort-empty p{flex:1;margin:0;font-size:14px}
  @media (max-width:760px){.lv-crow{grid-template-columns:minmax(0,1fr) auto}.lv-clink{grid-column:1/-1}}
  .lv-panel{max-width:900px;margin:0 auto;display:flex;gap:14px;align-items:flex-start;background:#fff;border:1.5px solid var(--blue-line,#c9d8f2);border-radius:20px;padding:22px}
  .lv-panel>.ui{width:30px;height:30px;color:var(--blue,#004aad);flex:none}.lv-panel p{margin:6px 0 12px;color:var(--ink-2,#3b4252);font-size:14px;line-height:1.6}
  .lv-inbox{background:#fff;border:1.5px solid var(--line,#e3e8f0);border-radius:18px;overflow:hidden}
  .lv-ex{font-style:normal;font-size:10.5px;font-weight:800;color:#8a5a00;background:#fff3d6;border-radius:5px;padding:1px 6px;margin-left:6px}
  .lv-preview{max-width:360px}
  button.chat-mem-link{border:0;font:inherit;text-align:left;cursor:pointer;width:calc(100% - 12px);box-sizing:border-box}
  @media (max-width:820px){.lv-auth{grid-template-columns:minmax(0,1fr)}.lv-mecard{max-width:none;width:100%}.cm-hero{flex-wrap:wrap}}
  @media (max-width:520px){.lv-row{grid-template-columns:minmax(0,1fr)}}`;
  const style = document.createElement("style"); style.textContent = css; document.head.appendChild(style);
  if (["#community", "#hrd"].includes(location.hash || "#home")) route();   // 처음 그린 화면을 실사용 모드로 다시 그림
})();
