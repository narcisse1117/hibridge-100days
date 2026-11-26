// =============================================================
// 소통 공간 API — AWS Lambda (함수 URL) + DynamoDB + Cognito
//   요청:  POST { op, ...args }   헤더 Authorization: Bearer <Cognito ID 토큰>
//   응답:  { ok:true, ... } 또는 { error }
// 환경 변수: TABLE, USER_POOL_ID, CLIENT_ID (AWS_REGION은 Lambda가 넣어 줌)
// 익명 글·1:1 대화의 작성자 정보(sub)는 서버에만 남기고 화면으로 보내지 않는다.
// =============================================================
import crypto from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand, DeleteCommand, BatchGetCommand } from "@aws-sdk/lib-dynamodb";

const { TABLE, USER_POOL_ID, CLIENT_ID, AWS_REGION, HRD_CODE } = process.env;
const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
const ISS = `https://cognito-idp.${AWS_REGION}.amazonaws.com/${USER_POOL_ID}`;

/* ---------- 응답 ---------- */
const json = (status, body) => ({ statusCode: status, headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify(body) });
const ok = (body = {}) => json(200, { ok: true, ...body });
const bad = (msg, status = 400) => json(status, { error: msg });
const clip = (s, n) => String(s ?? "").trim().slice(0, n);
const now = () => Date.now();
const rid = () => crypto.randomBytes(9).toString("base64url");

/* ---------- Cognito ID 토큰 검증 (RS256, JWKS) ---------- */
let JWKS = null, JWKS_AT = 0;
async function keys() {
  if (!JWKS || now() - JWKS_AT > 6 * 3600e3) { JWKS = (await (await fetch(`${ISS}/.well-known/jwks.json`)).json()).keys; JWKS_AT = now(); }
  return JWKS;
}
const b64 = (s) => Buffer.from(s, "base64url");
async function verify(token) {
  const [h, p, s] = String(token || "").split("."); if (!s) return null;
  let head, pay; try { head = JSON.parse(b64(h)); pay = JSON.parse(b64(p)); } catch { return null; }
  if (head.alg !== "RS256") return null;
  const jwk = (await keys()).find((k) => k.kid === head.kid); if (!jwk) return null;
  const okSig = crypto.verify("RSA-SHA256", Buffer.from(`${h}.${p}`), crypto.createPublicKey({ key: jwk, format: "jwk" }), b64(s));
  if (!okSig || pay.iss !== ISS || pay.token_use !== "id" || pay.aud !== CLIENT_ID || pay.exp * 1000 < now()) return null;
  return { sub: pay.sub, email: pay.email };
}

/* ---------- 남용 방지 (컨테이너별 · 사용자별) ---------- */
const hits = new Map();
function limited(sub, n = 60) {
  const t = now(), a = (hits.get(sub) || []).filter((x) => t - x < 60e3); a.push(t); hits.set(sub, a); return a.length > n;
}

/* ---------- DB 도우미 ---------- */
const get = async (pk, sk) => (await db.send(new GetCommand({ TableName: TABLE, Key: { pk, sk } }))).Item;
const put = (item) => db.send(new PutCommand({ TableName: TABLE, Item: item }));
async function query(pk, { limit = 200, desc = true, after } = {}) {
  const r = await db.send(new QueryCommand({ TableName: TABLE, KeyConditionExpression: after ? "pk = :p AND sk > :a" : "pk = :p",
    ExpressionAttributeValues: after ? { ":p": pk, ":a": after } : { ":p": pk }, ScanIndexForward: !desc, Limit: limit }));
  return r.Items || [];
}
async function profiles(subs) {
  const out = {}, list = [...new Set(subs)].filter(Boolean);
  for (let i = 0; i < list.length; i += 100) {
    const r = await db.send(new BatchGetCommand({ RequestItems: { [TABLE]: { Keys: list.slice(i, i + 100).map((s) => ({ pk: "USER", sk: s })) } } }));
    (r.Responses?.[TABLE] || []).forEach((u) => (out[u.sk] = u));
  }
  return out;
}

/* ---------- 읽음 표시: 방마다 사람별로 마지막으로 본 시각 ---------- */
const markRead = (room, sub) => put({ pk: `READ#${room}`, sk: sub, at: now() });
async function readsOf(room) { return Object.fromEntries((await query(`READ#${room}`, { limit: 1000, desc: false })).map((r) => [r.sk, r.at])); }

/* ---------- 프로필 ---------- */
// 구분은 HRD 담당자만 따로 둔다. 신입·인턴·선배는 직급·연차·입사 시기로 보인다.
const RANKS = ["인턴", "사원", "주임", "대리", "과장", "차장", "부장", "팀장"];
function cleanProfile(p, old) {
  let role = p.role === "HRD" ? "HRD" : "멤버";
  // HRD 담당자는 인증 코드가 맞을 때만 (이미 HRD면 유지)
  if (role === "HRD" && old?.role !== "HRD" && !(HRD_CODE && String(p.hrdCode || "").trim() === HRD_CODE)) role = "HRD?";
  return {
    name: clip(p.name, 20), dept: clip(p.dept, 40), job: clip(p.job, 30), rank: RANKS.includes(p.rank) ? p.rank : "사원",
    yrs: Math.max(0, Math.min(40, parseInt(p.yrs, 10) || 0)), role, bio: clip(p.bio, 120),
    joined: /^(19|20)\d\d-(0[1-9]|1[0-2])$/.test(String(p.joined || "")) ? p.joined : old?.joined || ym(now()),
    tags: (Array.isArray(p.tags) ? p.tags : String(p.tags || "").split(/[,#]+/)).map((t) => clip(t, 15)).filter(Boolean).slice(0, 5),
    bri: p.bri && typeof p.bri === "object" ? Object.fromEntries(Object.entries(p.bri).slice(0, 12).map(([k, v]) => [clip(k, 10), clip(v, 20)])) : old?.bri || null,
  };
}
// 동기방: HRD가 만든 기수(초대 링크로 들어옴)가 있으면 그 기수, 없으면 입사 시기의 반기 (예: "2026 하반기")
const ym = (t) => { const d = new Date(t + 9 * 3600e3); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
const halfOf = (u) => { const j = u.joined || ym(u.created || now()), [y, m] = j.split("-").map(Number); return `${y} ${m <= 6 ? "상반기" : "하반기"}`; };
const cohortOf = (u) => u.cohortName || halfOf(u);
const cohortKey = (u) => (u.cohortId ? `C#${u.cohortId}` : `H#${halfOf(u)}`);
// 다른 사람에게 보여도 되는 프로필 필드
const pub = (u) => u && { uid: u.sk, name: u.name, dept: u.dept, job: u.job, rank: u.rank, yrs: u.yrs, role: u.role, bio: u.bio, tags: u.tags || [], bri: u.bri,
  joined: u.joined || (u.created ? ym(u.created) : ""), cohort: u.name ? cohortOf(u) : "", ckey: u.name ? cohortKey(u) : "", on: now() - (u.seen || 0) < 5 * 60e3 };
const label = (u) => (u.role === "HRD" ? `HRD 담당자 · ${u.dept}` : `${u.dept}${u.rank === "인턴" ? " 인턴" : u.yrs ? ` ${u.yrs}년차` : " 신입"}`);
const isAdmin = (u) => u && u.role === "HRD";
// 1:1 질문을 받은 사람에게 보이는 별명: 큰 부서 이름만 (예: "인사팀 · 브리 #27") — 파트까지 보이면 누군지 짐작되기 쉬움
const nickOf = (u) => `${String(u.dept || "").split(/\s+/)[0] || "하이브릿지"} · 브리 #${u.nick}`;

/* ---------- 익명 질문방 첫 질문: 신입·인턴 설문과 현직자 인터뷰에서 나온 고민 (비어 있을 때 한 번만 넣음) ---------- */
const SEED_Q = [
  ["업무", "선배님들이 다 바빠 보이는데, 모르는 게 생기면 언제 물어보는 게 좋을까요? 메신저로 바로 물어봐도 되는지, 모아서 한 번에 여쭤봐야 하는지 고민돼요."],
  ["업무", "아직 맡은 일이 없어서 자리에 앉아만 있는 시간이 많아요. 이럴 때 뭘 해 두면 좋을까요?"],
  ["업무", "회의에서 전결, 품의, 발령처럼 처음 듣는 말이 많이 나와요. 검색해도 우리 회사에서 쓰는 뜻이랑 다른 것 같은데 어디서 확인하나요?"],
  ["보고", "일을 맡긴 사수님보다 팀장님이 먼저 진행 상황을 물어보시면 바로 답해도 되나요? 보고 순서를 어떻게 잡아야 할지 모르겠어요."],
  ["업무", "전임자가 남긴 인수인계 자료가 거의 없어요. 이전 자료를 어디서부터 찾아보면 될까요?"],
  ["보고", "보고서 양식이 따로 있나요? 매번 새로 만들어야 하는지, 지난 문서를 참고해도 되는지 궁금해요."],
  ["업무", "다른 부서에 처음 협조 요청을 해야 하는데 메일과 메신저 중 뭐가 좋을까요? 어디까지 설명해야 할지도 모르겠어요."],
  ["업무", "일이 한꺼번에 몰리면 우선순위를 어떻게 정하세요? 다 급하다고 하시는데 순서를 제가 정해도 되는지 모르겠어요."],
  ["기타", "초안을 AI로 써도 되나요? 회사 자료를 넣어도 되는지, 결과는 어떻게 확인해야 하는지 궁금해요."],
  ["휴가·근태", "퇴근 시간 분위기는 팀마다 다른가요? 일을 다 끝냈는데 먼저 일어나기가 눈치 보여요."],
];
async function seedAnon() {
  if (await get("META", "anon-seeded")) return false;
  await put({ pk: "META", sk: "anon-seeded", at: now() });
  const n = SEED_Q.length, t0 = now();
  for (let i = 0; i < n; i++) {   // 지난 며칠 동안 하나씩 올라온 것처럼 (오래된 것부터)
    const at = t0 - (n - i) * 9 * 3600e3 - crypto.randomInt(3600e3);
    await put({ pk: "ANON", sk: `${at}#${rid()}`, from: "seed", t: SEED_Q[i][1], cat: SEED_Q[i][0], at, reps: [], views: 3 + crypto.randomInt(25) });
  }
  return true;
}

/* ---------- 기능 ---------- */
const OPS = {
  // 내 프로필
  async "me.get"(me) { const u = await get("USER", me.sub); return { me: u ? { ...pub(u), email: me.email, nick: nickOf(u) } : null }; },
  async "me.put"(me, a) {
    const old = await get("USER", me.sub), p = cleanProfile(a.profile || {}, old);
    if (!p.name || !p.dept) return { error: "이름과 부서를 입력해 주세요" };
    if (p.role === "HRD?") return { error: "HRD 인증 코드가 맞지 않아요. 인사팀에 확인해 주세요." };
    const u = { pk: "USER", sk: me.sub, ...p, cohortId: old?.cohortId, cohortName: old?.cohortName, nick: old?.nick || 10 + crypto.randomInt(90), created: old?.created || now(), seen: now() };
    await put(u); return { me: { ...pub(u), email: me.email, nick: nickOf(u) } };
  },
  // 가입한 사람 목록 (동기방 대화상대 · 선배 찾기)
  async "users.list"(me) {
    await db.send(new UpdateCommand({ TableName: TABLE, Key: { pk: "USER", sk: me.sub }, UpdateExpression: "SET seen = :t", ConditionExpression: "attribute_exists(pk)", ExpressionAttributeValues: { ":t": now() } })).catch(() => {});
    return { users: (await query("USER", { limit: 1000, desc: false })).map(pub) };
  },

  // 동기방 (단체) — 내 입사 반기 방
  async "peer.list"(me, a) {
    const u = await get("USER", me.sub); if (!u) return { error: "프로필이 없어요" };
    const room = cohortKey(u), pk = `PEER#${room}`;
    if (a.read) await markRead(room, me.sub);
    const [items, reads] = await Promise.all([a.after ? query(pk, { after: a.after, desc: false }) : query(pk, { limit: 150 }).then((x) => x.reverse()), readsOf(room)]);
    const ps = await profiles(items.map((m) => m.from));
    return { reads, msgs: items.map((m) => ({ id: m.sk, t: m.t, at: m.at, by: ps[m.from]?.name || "알 수 없음", uid: m.from, tag: ps[m.from] ? label(ps[m.from]) : "", bri: ps[m.from]?.bri, me: m.from === me.sub })) };
  },
  async "peer.send"(me, a) {
    const t = clip(a.t, 500); if (!t) return { error: "내용을 입력해 주세요" };
    const u = await get("USER", me.sub); if (!u) return { error: "프로필이 없어요" };
    const at = now(); await put({ pk: `PEER#${cohortKey(u)}`, sk: `${at}#${rid()}`, from: me.sub, t, at }); await markRead(cohortKey(u), me.sub); return {};
  },

  // 기수 · 초대 링크 (HRD가 만들고, 받은 사람은 초대 코드로 들어감)
  async "cohort.create"(me, a) {
    const u = await get("USER", me.sub); if (!isAdmin(u)) return { error: "HRD 담당자만 기수를 만들 수 있어요" };
    const name = clip(a.name, 30); if (name.length < 2) return { error: "기수 이름을 입력해 주세요" };
    const id = rid(), code = crypto.randomBytes(5).toString("base64url").replace(/[-_]/g, "x").slice(0, 7).toUpperCase();
    await put({ pk: "COHORT", sk: id, name, code, by: me.sub, at: now() }); await put({ pk: "CODE", sk: code, id, name });
    return { id, code, name };
  },
  async "cohort.list"(me) {
    const u = await get("USER", me.sub); if (!isAdmin(u)) return { error: "HRD 담당자만 볼 수 있어요" };
    const [cs, us] = await Promise.all([query("COHORT", { limit: 200 }), query("USER", { limit: 1000, desc: false })]);
    return { cohorts: cs.map((c) => ({ id: c.sk, name: c.name, code: c.code, at: c.at, members: us.filter((x) => x.cohortId === c.sk).map((x) => x.name) })) };
  },
  async "cohort.join"(me, a) {
    const c = await get("CODE", clip(a.code, 20).toUpperCase()); if (!c) return { error: "초대 코드가 맞지 않아요" };
    const u = await get("USER", me.sub); if (!u) return { error: "프로필을 먼저 만들어 주세요" };
    await db.send(new UpdateCommand({ TableName: TABLE, Key: { pk: "USER", sk: me.sub }, UpdateExpression: "SET cohortId = :i, cohortName = :n", ExpressionAttributeValues: { ":i": c.id, ":n": c.name } }));
    return { name: c.name };
  },

  // 1:1 대화 (동기끼리 peer · 누구에게나 질문하는 mentor). 질문을 받은 사람에게는 질문한 사람의 별명만 보인다.
  async "dm.threads"(me) {
    const idx = await query(`UTH#${me.sub}`, { limit: 100, desc: false });
    const metas = await Promise.all(idx.map((x) => get(`TH#${x.sk}`, "META")));
    const ps = await profiles(metas.flatMap((m) => (m ? [m.a, m.b] : [])));
    return { threads: metas.filter(Boolean).map((m) => threadView(m, me.sub, ps)).sort((x, y) => y.lastAt - x.lastAt) };
  },
  async "dm.open"(me, a) {
    const kind = a.kind === "mentor" ? "mentor" : "peer", to = clip(a.to, 60);
    if (!to || to === me.sub) return { error: "대화 상대를 확인해 주세요" };
    const [mine, other] = [await get("USER", me.sub), await get("USER", to)];
    if (!mine || !other) return { error: "프로필이 없어요" };
    const pairKey = kind === "mentor" ? `${me.sub}>${to}` : [me.sub, to].sort().join("~");
    let pair = await get("PAIR", `${kind}#${pairKey}`), tid = pair?.tid;
    if (!tid) {
      tid = rid(); const m = { pk: `TH#${tid}`, sk: "META", tid, kind, a: me.sub, b: to, revealed: kind === "peer", lastAt: now(), lastT: "" };
      await put(m); await put({ pk: "PAIR", sk: `${kind}#${pairKey}`, tid });
      await put({ pk: `UTH#${me.sub}`, sk: tid }); await put({ pk: `UTH#${to}`, sk: tid });
    }
    return { tid };
  },
  async "dm.get"(me, a) {
    const m = await member(me, a.tid); if (!m) return { error: "대화를 찾을 수 없어요" };
    if (a.read) await markRead(`TH#${a.tid}`, me.sub);
    const items = a.after ? await query(`TH#${a.tid}`, { after: a.after, desc: false }) : (await query(`TH#${a.tid}`, { limit: 200 })).reverse();
    const ps = await profiles([m.a, m.b]), reads = await readsOf(`TH#${a.tid}`);
    // 상대가 마지막으로 읽은 시각만 (상대가 누구인지는 보내지 않음)
    return { otherRead: reads[m.a === me.sub ? m.b : m.a] || 0, thread: threadView(m, me.sub, ps), msgs: items.filter((x) => x.sk !== "META").map((x) => ({ id: x.sk, t: x.t, at: x.at, me: x.from === me.sub })) };
  },
  async "dm.send"(me, a) {
    const m = await member(me, a.tid); if (!m) return { error: "대화를 찾을 수 없어요" };
    const t = clip(a.t, 1000); if (!t) return { error: "내용을 입력해 주세요" };
    const at = now(); await put({ pk: `TH#${a.tid}`, sk: `MSG#${at}#${rid()}`, from: me.sub, t, at }); await markRead(`TH#${a.tid}`, me.sub);
    await db.send(new UpdateCommand({ TableName: TABLE, Key: { pk: `TH#${a.tid}`, sk: "META" }, UpdateExpression: "SET lastAt = :a, lastT = :t, lastFrom = :f",
      ExpressionAttributeValues: { ":a": at, ":t": t.slice(0, 80), ":f": me.sub } }));
    return {};
  },
  async "dm.reveal"(me, a) {   // 질문한 사람이 실명 공개
    const m = await member(me, a.tid); if (!m || m.kind !== "mentor" || m.a !== me.sub) return { error: "실명 공개는 질문한 사람만 할 수 있어요" };
    await db.send(new UpdateCommand({ TableName: TABLE, Key: { pk: `TH#${a.tid}`, sk: "META" }, UpdateExpression: "SET revealed = :r", ExpressionAttributeValues: { ":r": true } }));
    return {};
  },

  // 익명 질문방
  async "anon.list"(me) {
    let items = await query("ANON", { limit: 300 });
    if (!items.length && (await seedAnon())) items = await query("ANON", { limit: 300 });
    const ps = await profiles(items.flatMap((p) => (p.reps || []).map((r) => r.from)));
    return { posts: items.map((p) => anonView(p, me.sub, ps)) };
  },
  async "anon.post"(me, a) {
    const t = clip(a.t, 1500); if (t.length < 5) return { error: "질문을 조금 더 적어 주세요" };
    const at = now(), id = `${at}#${rid()}`;
    await put({ pk: "ANON", sk: id, from: me.sub, t, cat: clip(a.cat, 10) || "기타", ref: clip(a.ref, 80) || undefined, at, reps: [], views: 0 });
    return { id };
  },
  async "anon.reply"(me, a) {
    const t = clip(a.t, 1000); if (!t) return { error: "내용을 입력해 주세요" };
    const r = { id: rid(), from: me.sub, t, at: now() };
    try {
      await db.send(new UpdateCommand({ TableName: TABLE, Key: { pk: "ANON", sk: String(a.id) }, ConditionExpression: "attribute_exists(pk)",
        UpdateExpression: "SET reps = list_append(if_not_exists(reps, :e), :r)", ExpressionAttributeValues: { ":r": [r], ":e": [] } }));
    } catch { return { error: "글을 찾을 수 없어요" }; }
    return {};
  },
  async "anon.view"(me, a) {
    await db.send(new UpdateCommand({ TableName: TABLE, Key: { pk: "ANON", sk: String(a.id) }, ConditionExpression: "attribute_exists(pk)",
      UpdateExpression: "ADD views :one", ExpressionAttributeValues: { ":one": 1 } })).catch(() => {});
    return {};
  },
  async "anon.delete"(me, a) {   // 내 글만
    try { await db.send(new DeleteCommand({ TableName: TABLE, Key: { pk: "ANON", sk: String(a.id) }, ConditionExpression: "#f = :me", ExpressionAttributeNames: { "#f": "from" }, ExpressionAttributeValues: { ":me": me.sub } })); }
    catch { return { error: "내가 쓴 글만 지울 수 있어요" }; }
    return {};
  },
};

async function member(me, tid) {
  const m = tid && (await get(`TH#${String(tid)}`, "META"));
  return m && (m.a === me.sub || m.b === me.sub) ? m : null;
}
function threadView(m, mySub, ps) {
  const otherSub = m.a === mySub ? m.b : m.a, o = ps[otherSub], iAmAsker = m.a === mySub;
  // 질문을 받은 쪽에서 본 질문자: 실명 공개 전에는 별명만
  const hide = m.kind === "mentor" && !iAmAsker && !m.revealed;
  return { tid: m.tid, kind: m.kind, mine: iAmAsker, revealed: !!m.revealed, lastAt: m.lastAt, lastT: m.lastT, lastMe: m.lastFrom === mySub,
    other: hide ? { name: o ? nickOf(o) : "익명", anon: true } : { ...pub(o || { sk: otherSub, name: "알 수 없음" }) },
    myNick: m.kind === "mentor" && iAmAsker && ps[mySub] ? nickOf(ps[mySub]) : undefined };
}
function anonView(p, mySub, ps) {
  return { id: p.sk, t: p.t, cat: p.cat, ref: p.ref, at: p.at, views: p.views || 0, mine: p.from === mySub, survey: p.from === "seed",
    // 답변도 모두 익명: 질문자 / 익명 1, 익명 2 … (같은 글 안에서 같은 사람은 같은 번호)
    reps: (() => { const no = {}; let k = 0;
      return (p.reps || []).map((r) => { const isAuthor = r.from === p.from; if (!isAuthor && !no[r.from]) no[r.from] = ++k;
        return { id: r.id, t: r.t, at: r.at, mine: r.from === mySub, au: isAuthor, by: isAuthor ? "질문자" : `익명 ${no[r.from]}` }; }); })() };
}

/* ---------- 진입점 ---------- */
export const handler = async (event) => {
  const method = event.requestContext?.http?.method;
  if (method === "OPTIONS") return { statusCode: 204 };
  if (method !== "POST") return bad("POST only", 405);
  let a; try { a = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString() : event.body || "{}"); } catch { return bad("bad json"); }
  if (a.op === "cohort.peek") { const c = await get("CODE", clip(a.code, 20).toUpperCase()).catch(() => null); return c ? ok({ name: c.name }) : bad("초대 코드가 맞지 않아요", 404); }
  const me = await verify((event.headers?.authorization || "").replace(/^Bearer\s+/i, ""));
  if (!me) return bad("로그인이 필요해요", 401);
  if (limited(me.sub)) return bad("잠시 후 다시 시도해 주세요", 429);
  const fn = OPS[a.op]; if (!fn) return bad("unknown op");
  try { const r = await fn(me, a); return r.error ? bad(r.error) : ok(r); }
  catch (e) { console.error(a.op, e); return bad("server", 500); }
};
