// HiBridge 공용 일러스트: 브리(SVG) · 선배 인물 일러스트(SVG) — 사이트 본문과 같은 코드
const HBArt=(()=>{
function bri(o={}){
  const c=o.c||'#004aad', wave=o.wave!==false, sz=o.size||120, head=!!o.head, dark='#0b1a3a';
  let top=o.top, face=o.face, neck=o.neck, ear=o.ear;
  if(top===undefined){const a=o.acc||'none';top=a==='sprout'?'sprout':a==='ribbon'?'ribbon':'dot';face=a==='glasses'?'glasses':'none';neck=a==='tie'?'tie':a==='badge'?'badge':'none';ear=a==='headset'?'headset':'none';}
  const eyes=o.eyes||'round', mouth=o.mouth||'smile', cheek=o.cheek===undefined?'#ff8fab':o.cheek;
  const parts=[];
  if(!head)parts.push(`<ellipse cx="100" cy="206" rx="58" ry="7" fill="#0b1a3a" opacity=".08"/>`);
  parts.push(wave?`<path d="M152 128 Q174 112 180 86" stroke="${c}" stroke-width="15" stroke-linecap="round" fill="none"/>`:`<path d="M152 132 Q168 146 172 160" stroke="${c}" stroke-width="15" stroke-linecap="round" fill="none"/>`);
  parts.push(`<path d="M48 132 Q32 146 28 160" stroke="${c}" stroke-width="15" stroke-linecap="round" fill="none"/>`);
  // body: arch-shaped (bridge) with an arch opening between the legs
  parts.push(`<path d="M38 104 A62 62 0 0 1 162 104 L162 186 Q162 198 150 198 L132 198 Q130 166 100 164 Q70 166 68 198 L50 198 Q38 198 38 186 Z" fill="${c}"/>`);
  parts.push(`<path d="M58 80 A48 48 0 0 1 96 54" stroke="#fff" stroke-opacity=".28" stroke-width="7" stroke-linecap="round" fill="none"/>`);
  // eyes
  if(eyes==='smile')parts.push(`<path d="M68 110 Q80 94 92 110 M108 110 Q120 94 132 110" stroke="#fff" stroke-width="7" stroke-linecap="round" fill="none"/>`);
  else if(eyes==='wink')parts.push(`<ellipse cx="80" cy="106" rx="12" ry="14" fill="#fff"/><circle cx="82" cy="109" r="7" fill="${dark}"/><circle cx="85" cy="105" r="2.6" fill="#fff"/><path d="M108 108 Q120 98 132 108" stroke="#fff" stroke-width="7" stroke-linecap="round" fill="none"/>`);
  else if(eyes==='sparkle')parts.push(`<ellipse cx="80" cy="106" rx="14" ry="16" fill="#fff"/><ellipse cx="120" cy="106" rx="14" ry="16" fill="#fff"/><circle cx="81" cy="108" r="10" fill="${dark}"/><circle cx="121" cy="108" r="10" fill="${dark}"/><circle cx="85" cy="103" r="3.6" fill="#fff"/><circle cx="125" cy="103" r="3.6" fill="#fff"/><circle cx="77" cy="113" r="1.8" fill="#fff"/><circle cx="117" cy="113" r="1.8" fill="#fff"/>`);
  else if(eyes==='calm')parts.push(`<ellipse cx="80" cy="108" rx="12" ry="11" fill="#fff"/><ellipse cx="120" cy="108" rx="12" ry="11" fill="#fff"/><circle cx="81" cy="111" r="6.5" fill="${dark}"/><circle cx="121" cy="111" r="6.5" fill="${dark}"/><path d="M67 101 Q80 96 93 101 M107 101 Q120 96 133 101" stroke="${c}" stroke-width="6" stroke-linecap="round" fill="none"/>`);
  else parts.push(`<ellipse cx="80" cy="106" rx="12" ry="14" fill="#fff"/><ellipse cx="120" cy="106" rx="12" ry="14" fill="#fff"/><circle cx="82" cy="109" r="7" fill="${dark}"/><circle cx="122" cy="109" r="7" fill="${dark}"/><circle cx="85" cy="105" r="2.6" fill="#fff"/><circle cx="125" cy="105" r="2.6" fill="#fff"/>`);
  // cheeks + mouth
  if(cheek!=='none')parts.push(`<ellipse cx="64" cy="128" rx="9" ry="5.5" fill="${cheek}" opacity=".75"/><ellipse cx="136" cy="128" rx="9" ry="5.5" fill="${cheek}" opacity=".75"/>`);
  if(mouth==='open')parts.push(`<path d="M90 127 Q100 127 110 127 Q109 142 100 142 Q91 142 90 127Z" fill="${dark}"/><path d="M94 137 Q100 133 106 137 Q103 141 100 141 Q97 141 94 137Z" fill="#ff8fab"/>`);
  else if(mouth==='cat')parts.push(`<path d="M88 128 Q94 135 100 128 Q106 135 112 128" stroke="#fff" stroke-width="3.5" stroke-linecap="round" fill="none"/>`);
  else if(mouth==='o')parts.push(`<ellipse cx="100" cy="132" rx="5" ry="6" fill="${dark}"/>`);
  else parts.push(`<path d="M91 128 Q100 138 109 128" stroke="#fff" stroke-width="3.5" stroke-linecap="round" fill="none"/>`);
  // neck
  if(neck==='tie')parts.push(`<path d="M94 146 L106 146 L109 152 L100 176 L91 152 Z" fill="#ffb400"/><path d="M94 146 L106 146 L100 153 Z" fill="#e09a00"/>`);
  if(neck==='bowtie')parts.push(`<path d="M100 152 L82 142 L82 162 Z M100 152 L118 142 L118 162 Z" fill="#ff6f91"/><circle cx="100" cy="152" r="5" fill="#e0557a"/>`);
  if(neck==='badge')parts.push(`<path d="M78 140 L96 160 M122 140 L104 160" stroke="#ffb400" stroke-width="3.5"/><rect x="88" y="158" width="24" height="30" rx="4" fill="#fff"/><rect x="92" y="164" width="16" height="4" rx="2" fill="${c}"/><rect x="92" y="172" width="11" height="3" rx="1.5" fill="#c9d6ee"/>`);
  if(neck==='scarf')parts.push(`<path d="M44 140 Q100 158 156 140 L156 152 Q100 170 44 152 Z" fill="#ff6f61"/><path d="M128 152 L134 186 L120 186 L116 156 Z" fill="#ff6f61"/><path d="M60 146 L60 156 M76 150 L76 160 M92 152 L92 162 M108 152 L108 162 M124 150 L124 160 M140 146 L140 156" stroke="#fff" stroke-opacity=".5" stroke-width="3"/>`);
  // face
  if(face==='glasses')parts.push(`<g fill="none" stroke="${dark}" stroke-width="3.5"><circle cx="80" cy="106" r="17"/><circle cx="120" cy="106" r="17"/><path d="M97 104 Q100 101 103 104"/></g>`);
  if(face==='sunglasses')parts.push(`<path d="M60 96 H140 V104 Q140 122 122 122 Q106 122 104 104 H96 Q94 122 78 122 Q60 122 60 104 Z" fill="${dark}"/><path d="M68 102 l10 0 M110 102 l10 0" stroke="#fff" stroke-opacity=".5" stroke-width="3" stroke-linecap="round"/>`);
  if(face==='star')parts.push(`<path d="M138 120 l3 7 7 1 -5 5 1 7 -6 -3 -6 3 1 -7 -5 -5 7 -1z" fill="#ffd54d"/>`);
  // ear
  if(ear==='headset')parts.push(`<path d="M40 100 A60 60 0 0 1 160 100" stroke="${dark}" stroke-width="6" fill="none"/><rect x="31" y="92" width="14" height="26" rx="6" fill="${dark}"/><rect x="155" y="92" width="14" height="26" rx="6" fill="${dark}"/><path d="M38 118 Q42 140 66 140" stroke="${dark}" stroke-width="3.5" fill="none"/><circle cx="68" cy="140" r="4.5" fill="${dark}"/>`);
  if(ear==='earmuff')parts.push(`<path d="M40 96 A60 60 0 0 1 160 96" stroke="#ff8fab" stroke-width="6" fill="none"/><circle cx="38" cy="104" r="13" fill="#fff"/><circle cx="162" cy="104" r="13" fill="#fff"/><circle cx="38" cy="104" r="13" fill="none" stroke="#ff8fab" stroke-width="3"/><circle cx="162" cy="104" r="13" fill="none" stroke="#ff8fab" stroke-width="3"/>`);
  // top of head
  if(top==='ribbon')parts.push(`<g transform="translate(140 52) rotate(18)"><path d="M0 0 L-17 -10 L-17 10 Z" fill="#ff8fab"/><path d="M0 0 L17 -10 L17 10 Z" fill="#ff8fab"/><circle r="5" fill="#ff6f91"/></g>`);
  if(top==='sprout')parts.push(`<path d="M100 44 L100 30" stroke="#2b8a6e" stroke-width="4" stroke-linecap="round"/><path d="M100 32 Q86 18 76 26 Q88 38 100 32Z" fill="#3fb37f"/><path d="M100 30 Q112 14 124 22 Q112 36 100 30Z" fill="#3fb37f"/>`);
  if(top==='cap')parts.push(`<path d="M46 78 Q50 30 100 30 Q150 30 154 78 Q100 66 46 78Z" fill="${dark}"/><path d="M150 72 Q182 70 188 84 Q166 88 150 80Z" fill="${dark}"/><circle cx="100" cy="30" r="5" fill="#ffb400"/><path d="M92 52 h16" stroke="#ffb400" stroke-width="5" stroke-linecap="round"/>`);
  if(top==='crown')parts.push(`<path d="M74 52 L78 26 L90 40 L100 20 L110 40 L122 26 L126 52 Z" fill="#ffc83d" stroke="#e09a00" stroke-width="2.5" stroke-linejoin="round"/><circle cx="100" cy="42" r="4" fill="#ff6f91"/>`);
  // signature amber dot (the 'i' of Hi / aha moment)
  if(top==='dot'||top==='ribbon')parts.push(`<circle cx="100" cy="24" r="12" fill="#ffb400"/><path d="M78 20 L71 16 M122 20 L129 16 M100 6 L100 0" stroke="#ffb400" stroke-width="3" stroke-linecap="round" opacity=".7"/>`);
  if(head)return `<svg viewBox="24 2 152 152" width="100%" height="100%" aria-hidden="true">${parts.join('')}</svg>`;
  return `<svg viewBox="0 -4 200 216" width="${sz}" height="${sz*216/200}" role="img" aria-label="${o.label||'하이브릿지 캐릭터 브리'}">${parts.join('')}</svg>`;
}


const PORTRAITS={
  'p-han': {bg:['#eef3ff','#cfdcf6'],skin:'#f5cdb0',hair:'#34343e',hl:'#5a5a68',style:'part', cloth:'#25324d',top:'suit',f:0,gray:1},
  'p-park':{bg:['#fff1ec','#fbd3c8'],skin:'#ffdcc6',hair:'#4a2c22',hl:'#7a4d3c',style:'long', cloth:'#ff8a73',top:'knit',badge:1,f:1},
  'p-lee': {bg:['#ecfaf3','#c6ecd9'],skin:'#f7d1b4',hair:'#2a2129',hl:'#4d3f4b',style:'curly',cloth:'#2f8f6f',top:'knit',glasses:1,f:0},
  'p-jung':{bg:['#fff8e6','#fbe2a8'],skin:'#ffdec9',hair:'#231c24',hl:'#463a47',style:'bob',  cloth:'#e2a427',top:'cardigan',glasses:1,f:1},
  'p-oh':  {bg:['#f1f2f7','#d6d9e6'],skin:'#f1c6a4',hair:'#1d1a22',hl:'#3e3a46',style:'short',cloth:'#4b5567',top:'hood',f:0},
  'p-yoon':{bg:['#eef5ff','#c9ddff'],skin:'#ffe2cf',hair:'#6a3f2c',hl:'#9a6650',style:'pony', cloth:'#5b8def',top:'shirt',f:1}
};
function shade(hex,amt){const n=parseInt(hex.slice(1),16);const c=[n>>16,(n>>8)&255,n&255].map(v=>Math.max(0,Math.min(255,Math.round(v+amt))));return '#'+c.map(v=>v.toString(16).padStart(2,'0')).join('')}
function portrait(id,crop){return drawPortrait(PORTRAITS[id],id.replace(/\W/g,''),crop)}

function drawPortrait(P,k,crop,noBg){
  const h=P.hair, sk=P.skin, skD=shade(sk,-38), cl=P.cloth, clD=shade(cl,-30), o=[];
  o.push(`<defs><radialGradient id="${k}bg" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="${P.bg[0]}"/><stop offset="1" stop-color="${P.bg[1]}"/></radialGradient><linearGradient id="${k}sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(sk,8)}"/><stop offset="1" stop-color="${sk}"/></linearGradient><linearGradient id="${k}cl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${cl}"/><stop offset="1" stop-color="${clD}"/></linearGradient><linearGradient id="${k}hr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.hl}"/><stop offset=".45" stop-color="${h}"/></linearGradient><radialGradient id="${k}bl"><stop offset="0" stop-color="#ff7d9a" stop-opacity=".55"/><stop offset="1" stop-color="#ff7d9a" stop-opacity="0"/></radialGradient></defs>`);
  if(!noBg)o.push(`<rect width="200" height="200" fill="url(#${k}bg)"/><circle cx="160" cy="44" r="10" fill="#fff" opacity=".5"/><circle cx="36" cy="150" r="6" fill="#fff" opacity=".45"/>`);
  const HR=`url(#${k}hr)`;
  if(P.style==='long')o.push(`<path d="M56 98 Q50 38 100 36 Q150 38 144 98 L152 178 Q100 192 48 178Z" fill="${HR}"/>`);
  if(P.style==='bob')o.push(`<path d="M54 98 Q50 36 100 36 Q150 36 146 98 L149 140 Q138 150 124 144 L76 144 Q62 150 51 140Z" fill="${HR}"/>`);
  if(P.style==='pony')o.push(`<path d="M128 58 Q180 52 172 112 Q168 144 146 156 Q158 114 134 84Z" fill="${h}"/><path d="M150 70 Q168 82 160 120" stroke="${P.hl}" stroke-width="3" fill="none" stroke-linecap="round" opacity=".7"/>`);
  o.push(`<path d="M24 204 Q26 166 70 156 Q100 150 130 156 Q174 166 176 204Z" fill="url(#${k}cl)"/>`);
  o.push(`<path d="M87 124 L87 150 Q100 160 113 150 L113 124Z" fill="${sk}"/><path d="M87 128 Q100 146 113 128 L113 124 L87 124Z" fill="${skD}" opacity=".35"/>`);
  const T={
    suit:`<path d="M80 156 L100 186 L120 156 Q100 150 80 156Z" fill="#fff"/><path d="M80 156 L100 186 L88 204 L60 204 Q62 172 80 156Z M120 156 L100 186 L112 204 L140 204 Q138 172 120 156Z" fill="#000" opacity=".2"/><path d="M95 158 h10 l3 6 -8 26 -8 -26z" fill="#ffb400"/><path d="M95 158 h10 l-5 7z" fill="#e09a00"/><rect x="128" y="176" width="14" height="4" rx="2" fill="#fff" opacity=".7"/>`,
    knit:`<path d="M80 156 Q100 172 120 156" stroke="${clD}" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M60 182 v22 M140 182 v22" stroke="#000" stroke-opacity=".08" stroke-width="3"/>`,
    cardigan:`<path d="M80 155 L100 184 L120 155 Q100 150 80 155Z" fill="#fff"/><path d="M100 184 V204" stroke="${clD}" stroke-width="3"/><circle cx="107" cy="192" r="2.6" fill="#fff"/><path d="M80 155 L100 184 M120 155 L100 184" stroke="${clD}" stroke-width="4"/>`,
    hood:`<path d="M66 162 Q100 190 134 162 Q126 150 116 150 Q100 168 84 150 Q74 150 66 162Z" fill="${clD}"/><path d="M92 170 v20 M108 170 v20" stroke="#fff" stroke-width="3" stroke-linecap="round"/><circle cx="92" cy="191" r="2.6" fill="#fff"/><circle cx="108" cy="191" r="2.6" fill="#fff"/>`,
    shirt:`<path d="M82 154 L96 172 L100 158 L104 172 L118 154 Q100 149 82 154Z" fill="#fff"/><path d="M100 172 V204" stroke="#fff" stroke-opacity=".5" stroke-width="2"/><circle cx="100" cy="182" r="1.8" fill="#fff"/><circle cx="100" cy="194" r="1.8" fill="#fff"/>`
  };
  o.push(T[P.top]);
  if(P.badge)o.push(`<path d="M84 157 L97 182 M116 157 L103 182" stroke="#004aad" stroke-width="3"/><rect x="90" y="180" width="20" height="24" rx="3" fill="#fff"/><rect x="94" y="185" width="12" height="4" rx="2" fill="#004aad"/><rect x="94" y="192" width="8" height="3" rx="1.5" fill="#c9d6ee"/>`);
  o.push(`<ellipse cx="63" cy="100" rx="8" ry="11" fill="${sk}"/><ellipse cx="137" cy="100" rx="8" ry="11" fill="${sk}"/><ellipse cx="64" cy="101" rx="3.5" ry="5.5" fill="${skD}" opacity=".35"/><ellipse cx="136" cy="101" rx="3.5" ry="5.5" fill="${skD}" opacity=".35"/>`);
  o.push(`<path d="M63 92 Q63 52 100 52 Q137 52 137 92 Q137 126 100 138 Q63 126 63 92Z" fill="url(#${k}sk)"/>`);
  const F={
    short:`<path d="M60 100 Q52 46 100 42 Q148 46 140 100 Q138 78 130 66 Q122 74 108 70 Q100 78 88 70 Q74 74 68 70 Q62 82 60 100Z" fill="${HR}"/><path d="M80 52 Q100 44 122 52" stroke="#fff" stroke-opacity=".22" stroke-width="5" fill="none" stroke-linecap="round"/>`,
    part:`<path d="M60 104 Q50 44 100 40 Q150 44 140 104 Q140 80 132 64 Q106 74 84 54 Q72 72 60 104Z" fill="${HR}"/><path d="M84 54 Q100 68 132 64" stroke="${shade(h,-12)}" stroke-width="2" fill="none"/>${P.gray?`<path d="M134 70 Q140 84 140 98 M62 84 Q60 92 61 100" stroke="#b9bdc7" stroke-width="4" fill="none" stroke-linecap="round"/>`:''}<path d="M92 48 Q112 42 128 50" stroke="#fff" stroke-opacity=".22" stroke-width="5" fill="none" stroke-linecap="round"/>`,
    curly:[[62,90,11],[64,72,12],[74,57,13],[90,47,14],[110,46,14],[126,55,13],[136,70,12],[138,88,11],[100,58,14],[82,66,10],[118,66,10]].map(([x,y,r])=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${h}"/>`).join('')+[[88,44],[108,42],[124,52]].map(([x,y])=>`<path d="M${x-5} ${y} q5 -5 10 0" stroke="${P.hl}" stroke-width="3" fill="none" stroke-linecap="round"/>`).join(''),
    long:`<path d="M62 102 Q56 48 100 46 Q144 48 138 98 Q132 66 110 60 Q98 86 62 102Z" fill="${HR}"/><path d="M76 56 Q94 46 114 50" stroke="#fff" stroke-opacity=".25" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M58 120 Q56 150 62 170 M142 120 Q146 150 140 170" stroke="${P.hl}" stroke-width="2.5" fill="none" stroke-linecap="round" opacity=".6"/>`,
    bob:`<path d="M61 90 Q60 46 100 46 Q140 46 139 90 Q124 79 100 79 Q76 79 61 90Z" fill="${HR}"/><path d="M78 54 Q100 44 122 54" stroke="#fff" stroke-opacity=".25" stroke-width="5" fill="none" stroke-linecap="round"/>`,
    pony:`<path d="M62 100 Q56 46 100 44 Q144 46 138 94 Q128 64 100 62 Q84 64 74 72 Q66 82 62 100Z" fill="${HR}"/><path d="M100 62 Q86 70 80 84" stroke="${shade(h,-14)}" stroke-width="2" fill="none"/><path d="M80 52 Q100 44 120 50" stroke="#fff" stroke-opacity=".28" stroke-width="5" fill="none" stroke-linecap="round"/><ellipse cx="134" cy="62" rx="7" ry="9" fill="#ffb400" transform="rotate(-25 134 62)"/>`
  };
  o.push(F[P.style]);
  o.push(`<path d="M74 84 Q83 79 92 83 M108 83 Q117 79 126 84" stroke="${shade(h,10)}" stroke-width="3.6" stroke-linecap="round" fill="none"/>`);
  const eye=x=>`<ellipse cx="${x}" cy="99" rx="6" ry="7.5" fill="#2b1f24"/><ellipse cx="${x}" cy="101.5" rx="4.2" ry="4.2" fill="#5b3b33" opacity=".7"/><circle cx="${x+2}" cy="96" r="2.4" fill="#fff"/><circle cx="${x-2}" cy="103" r="1.1" fill="#fff" opacity=".9"/>`;
  o.push(eye(84)+eye(116));
  o.push(P.f?`<path d="M76 95 Q84 88 92 94 M108 94 Q116 88 124 95" stroke="#2b1f24" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M76.5 95 l-4 -3 M123.5 95 l4 -3" stroke="#2b1f24" stroke-width="2.2" stroke-linecap="round"/>`
            :`<path d="M77 94 Q84 89 91 93 M109 93 Q116 89 123 94" stroke="#2b1f24" stroke-width="2.2" fill="none" stroke-linecap="round"/>`);
  o.push(`<path d="M100 106 Q97.5 112 101.5 113.5" stroke="${skD}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`);
  o.push(`<ellipse cx="74" cy="113" rx="11" ry="7" fill="url(#${k}bl)"/><ellipse cx="126" cy="113" rx="11" ry="7" fill="url(#${k}bl)"/>`);
  o.push(`<path d="M91 119 Q100 130 109 119 Q100 122 91 119Z" fill="#b8433f"/><path d="M93.5 120.2 Q100 122.6 106.5 120.2 L106 122 Q100 124 94 122Z" fill="#fff"/>`);
  if(P.glasses)o.push(`<g fill="#fff" fill-opacity=".14" stroke="#2b1f24" stroke-width="2.6"><rect x="70" y="88" width="28" height="22" rx="10"/><rect x="102" y="88" width="28" height="22" rx="10"/></g><path d="M98 97 Q100 95 102 97 M70 96 L63 93 M130 96 L137 93" stroke="#2b1f24" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M75 92 l6 -1" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".7"/>`);
  return `<svg viewBox="${crop?'52 38 96 96':noBg?'10 26 180 180':'16 22 168 168'}" width="100%" height="100%" aria-hidden="true">${o.join('')}</svg>`;
}


return {bri, face:(id,crop)=>portrait(id,crop), PORTRAITS};
})();
