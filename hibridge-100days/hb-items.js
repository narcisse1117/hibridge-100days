/* =============================================================
   드랍 아이템 (1단계) — 사이트(index.html)와 게임(game/)이 함께 쓰는 정의
   - 획득 여부는 같은 출처 localStorage 'hb-items' 하나에 저장 (사이트·게임 공유)
   - slot: 브리의 어느 자리에 착용하는지 (top/neck/hand/back), v: 그 자리의 값
   - 드랍 조건은 '정답'이 아니라 '배우는 행동'에 붙인다 (하루 마치기 · 회고 · 질문 · 탐험)
   ============================================================= */
var HB_ITEMS = [
  { id: "goldbadge", slot: "neck", v: "goldbadge", n: "금빛 사원증",   tier: "rare",   how: "D+1 입사 첫날 마치기",           desc: "정식으로 우리 팀이 됐어요!" },
  { id: "clipboard", slot: "hand", v: "clipboard", n: "클립보드",       tier: "common", how: "D+14 채용 시즌 마치기",          desc: "면접 일정 관리는 이제 문제없어요" },
  { id: "gradcap",   slot: "top",  v: "gradcap",   n: "교육 수료 학사모", tier: "rare",  how: "D+45 첫 교육 운영 마치기",       desc: "처음 맡은 교육을 끝까지 해냈어요" },
  { id: "briefcase", slot: "hand", v: "briefcase", n: "서류가방",       tier: "rare",   how: "D+80 조직문화·평가 시즌 마치기", desc: "이제 어엿한 인사담당자" },
  { id: "notebook",  slot: "hand", v: "notebook",  n: "회고 노트",      tier: "common", how: "퇴근 회고 처음 쓰기",            desc: "기록하는 사람이 성장해요" },
  { id: "bubble",    slot: "top",  v: "bubble",    n: "말풍선 머리핀",  tier: "common", how: "게임에서 선배에게 처음 질문하기", desc: "묻는 것도 실력이에요" },
  { id: "coffee",    slot: "hand", v: "coffee",    n: "탕비실 커피",    tier: "hidden", how: "사무실 어딘가를 둘러보기",       desc: "숨은 아이템을 찾았어요!", hint: "탕비실 커피 머신" },
  { id: "cape",      slot: "back", v: "cape",      n: "100일 망토",     tier: "epic",   how: "100일 완주하기",                 desc: "100일을 버틴 신입의 망토" },
];
var HB_TIER = { common: ["일반", "#6b7280"], rare: ["레어", "#2f6fd6"], epic: ["에픽", "#d99a00"], hidden: ["히든", "#7a4fd6"] };
// 게임 날짜(1~4번째 날)를 마치면 받는 아이템
var HB_DAY_ITEM = ["goldbadge", "clipboard", "gradcap", "briefcase"];

function hbItemsOwned() { try { return JSON.parse(localStorage.getItem("hb-items") || "[]"); } catch (e) { return []; } }
function hbItemHas(id) { return hbItemsOwned().indexOf(id) > -1; }
/** 처음 얻으면 true (이미 있으면 false) */
function hbItemGive(id) {
  var o = hbItemsOwned(); if (o.indexOf(id) > -1) return false;
  o.push(id); try { localStorage.setItem("hb-items", JSON.stringify(o)); } catch (e) {}
  return true;
}
function hbItem(id) { for (var i = 0; i < HB_ITEMS.length; i++) if (HB_ITEMS[i].id === id) return HB_ITEMS[i]; return null; }
