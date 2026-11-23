/* Read-only battle information and command affordances. No battle RNG or rule edits. */
(() => {
'use strict';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct=v=>Math.round(v*100)+'%';
const reason=(u,key)=>!B||B.over?'対戦終了':u!==MY()?'場の幻獣が変わりました':u.restTurns?'反動で行動できません':u.combo?'けんけんまを継続中':B.busy?'ターン進行中':moveLock(u,key)||(u.en<enCost(u,key)?'気力が足りません':'');
const turns=(n,start)=>`${n}回の行動分${start>B.turn?'（次ターンから）':''}`;
function unitEffects(u){
 if(u.side!==ME)u=BattleIntel.view(u)||u;
 const a=[];const add=(name,text)=>a.push([name,text]);
 if(u.dead||u.hp<=0)add('戦闘不能','行動できません');
 if(u.status)add(u.status,u.status==='凍結'?'1〜3ターン行動不可。火炎で解凍、通常被弾で20%解凍。残り期間は非表示':u.status==='眠り'?'1〜3回の行動を休む。残り回数は非表示':u.status==='麻痺'?'速度1/2、行動時1/8で動けない':'物理攻撃3/4、ターン終了時にダメージ');
 if(u.pendingStatus)add('やせ我慢',`${u.pendingStatus.status}の発症待ち。交代で解除`);
 if(u.bleedLevel)add('流血 Lv.'+u.bleedLevel,`終了時に最大HPの${[0,1,2,4,8,16][u.bleedLevel]}%。実際にHPが回復すると1段階軽減。交代で維持`);
 if(u.bleedPending?.length)add('流血の発症待ち',`${u.bleedPending.length}段階分。回復で軽減可能`);
 if(u.drowsy)add('眠気','次の発症タイミングで眠り。交代で解除');
 if(u.encore)add('反響',`${MOVES[u.encore.key]?.n}に固定。${turns(u.encore.turns,u.encore.startTurn)}。交代で解除`);
 if(u.disabled)add('封技',`${MOVES[u.disabled.key]?.n}を使えない。${turns(u.disabled.turns,u.disabled.startTurn)}。交代で解除`);
 if(u.tauntTurns)add('挑発',`変化技を使えない。${turns(u.tauntTurns,u.tauntStartTurn)}。交代で解除`);
 if(u.statusOnly)add('騙し合い','次の対象行動は変化技のみ。交代で解除');
 if(u.restTurns)add('反動',`あと${u.restTurns}回行動できません`);
 if(u.combo)add('けんけんま',`次は${u.combo+1}段階目。コマンド入力なしで継続`);
 if(isBound(u))add('拘束',u.trapped?'挟み撃ち。使用者が場を離れると解除':`あと${u.bindTurns}ターン。使用者が場を離れると解除`);
 if(u.seedTurns)add('寄生',`残り${u.seedTurns}。交代では解除されない`);
 if(u.perish)add('滅びの唄',`残り${u.perish}カウント。交代で解除`);
 if(u.sub>0)add('身代わり',u.publicView?'展開中。耐久値は不明。交代で解除':`耐久${u.sub}。交代で解除`);
 if(u.windMantle)add('風纏','次に受ける特殊攻撃に作用。必中技には命中低下なし');
 if(u.wildAwakened)add('野生回帰','次の攻撃まで相性を極端化。野生攻撃の威力1.5倍');
 if(u.snowball)add('雪合戦','攻撃を受けるまで終了時に速度-1');
 if(u.inviting)add('眠気を誘っている','次の自分の行動まで、接触してきた相手に眠気');
 if(u.headlongLock)add('猪突猛進','交代まで技が固定');
 if(u.choiceMove&&EQUIPS[u.equip].choice)add('持ち物による技固定',`${MOVES[u.choiceMove]?.n}のみ。交代で解除`);
 const rank=Object.entries(u.rank).filter(([,v])=>v).map(([k,v])=>`${RANK_LABEL[k]} ${v>0?'+':''}${v}`);
 if(rank.length)add('能力変化',rank.join(' ／ '));
 return a;
}
function rows(items){return items.length?items.map(([k,v])=>`<div class="battle-fact"><strong>${escape(k)}</strong><span>${escape(v)}</span></div>`).join(''):'<p class="hint">継続中の効果はありません。</p>';}
function fieldPanel(){
 const body=$('#modalBody');body.innerHTML='';if(!B)return;
 const global=[];if(B.weather){const k=B.weather.kind;global.push([{rain:'雨',shower:'夕立',snow:'雪',sandstorm:'砂嵐'}[k],`残り${B.weather.turns}ターン。`+({rain:'流水技1.5倍・火炎技1/2。雷撃と迅雷が必中',snow:'氷雪属性の防御1.5倍',sandstorm:'岩石・大地以外に終了時ダメージ。岩石の特防1.5倍',shower:'終了時に流水相性と特性に応じてHPが変動'}[k])]);}
 if(B.reverseTurns)global.push(['アベコベルーム',`残り${B.reverseTurns}ターン。攻撃の属性相性が反転`]);
 body.appendChild(el('h3','battle-section-title','場全体'));body.appendChild(el('div','battle-facts',rows(global)));
 for(const [u,label] of [[MY(),'じぶん'],[OP(),'あいて']]){
  body.appendChild(el('h3','battle-section-title',`${label}：${escape(u.name)}`));const hz=B.hazard?.[u.side]||{};const items=unitEffects(u);if(hz.rock)items.unshift(['岩棘','交代で登場した時にダメージ']);if(hz.sand)items.unshift(['痺れ砂','交代で登場した時に50%で麻痺']);body.appendChild(el('div','battle-facts',rows(items)));
 }
}
let inspected=null;
function movePanel(){
 const body=$('#modalBody');body.innerHTML='';if(!inspected||!B)return;
 const {u,key}=inspected,op=BattleIntel.opponent(OP()),m=effectiveMove(MOVES[key],u,op);let mult=1;const notes=[];
 if(m.sound&&(has(u,'minorityWave')||has(u,'lowVoice'))){mult*=1.5;notes.push('音技強化 ×1.5');}
 if(m.kick&&has(u,'superLegs')){mult*=2;notes.push('超脚力 ×2');}
 if(m.rush&&has(u,'rockhead')){mult*=1.5;notes.push('いしあたま ×1.5・反動なし');}
 if(m.t==='野'&&u.wildAwakened){mult*=1.5;notes.push('野生回帰 ×1.5');}
 const facts=[['分類',`${m.category==='status'?'変化':m.category==='physical'?'物理':'特殊'} ／ ${isContactMove(m)?'接触':'非接触'}`],['威力',m.p?`${m.p} → ${Math.round(m.p*mult*100)/100}（特性などの威力補正後）`:'ダメージを直接与えない'],['補正の内訳',notes.join(' ／ ')||'常時の威力補正なし']];
 let accuracy=m.acc==null?'必中（技自体の失敗条件は別）':`${Math.min(100,Math.max(0,m.acc*accMul(Math.max(-6,Math.min(6,u.rank.acc-op.rank.eva))))).toFixed(1).replace('.0','')}%`;
 facts.push(['命中',`${accuracy}${m.acc==null?'':` ／ 基本${m.acc}%・自身の命中${u.rank.acc}・相手の回避${op.rank.eva}`}`]);
 facts.push(['気力',`基本${m.en} → 今回${enCost(u,key)} ／ 現在${Math.floor(u.en)}/${u.maxen}`]);
 facts.push(['連続使用',m.fx==='guard'?`現在${u.guardStreak}回。守るの連用は消費が倍増`:`現在${u.repeatMove===key?u.repeatCount:0}回。同じ技の連用は1回ごとに+5`]);
 const tags=[m.sound?'音':'',m.kick?'蹴り':'',m.rush?'突進':'',m.explosion?'爆発':''].filter(Boolean);facts.push(['技の性質',tags.join('・')||'追加の分類なし']);
 if(m.p){facts.push(['属性一致',hasType(u,m.t)?'×1.5（威力表示とは別にダメージへ作用）':'なし']);facts.push(['天候の攻撃補正',`×${weatherDamageFactor(m)}（ダメージへ作用）`]);facts.push(['相性',`×${attackEff(m.t,op,u)}。特性などで防がれる場合あり`]);}
 if(m.pr){let pr=m.pr;if(has(u,'tempo')&&SPD(u)>SPD(op))pr*=1.5;if(inSandstorm()&&has(u,'hani'))pr*=2;if(hasVs(op,'blur',u))pr*=.5;facts.push(['追加効果の抽選',`${pct(Math.min(1,pr))}（基本${pct(m.pr)}）。免疫・身代わり等は別判定`]);}
 if(key==='iceMake'){const slot=op.side+':'+B[op.side].indexOf(OP());const n=u.iceHits.find(x=>x.slot===slot)?.count||0;facts.push(['製氷の蓄積',`この相手に${n}命中。次の基本凍結確率${[25,50,100][Math.min(n,2)]}%（特性・免疫は別）`]);}
 if(m.fx==='jumpKick')facts.push(['条件付き威力','相手がこのターン既に変化技を使っていた場合はさらに×1.5']);
 if(has(u,'armPiece')&&(m.hits>1||m.fx==='multi'))facts.push(['腕ピース','同じターンに当たる2発目以降の威力×1.5']);
 if(m.fx==='multi')facts.push(['攻撃回数','2〜5回。2回35%・3回35%・4回15%・5回15%']);else if(m.hits)facts.push(['攻撃回数',`${m.hits}回`]);
 if(m.speedAttack)facts.push(['攻撃に使う能力',`素早さ ${Math.floor(SPD(u))}。攻撃の数値は使わない`]);
 if(op.windMantle&&m.category==='special'&&m.p)facts.push(['風纏','発動すると命中率を100ポイント低下。必中技は低下なし']);
 facts.push(['相手の情報','確認済みの情報から表示。未判明の特性・持ち物で結果が変わる場合があります。'],['効果',m.d||'追加効果なし'],['現在の選択状態',reason(u,key)||'使用可能']);
 body.appendChild(el('h3','battle-section-title',`${chip(m.t)} ${escape(m.n)}`));body.appendChild(el('div','battle-facts',rows(facts)));
 const use=el('button','primary wide',reason(u,key)||'この技を使う');use.disabled=!!reason(u,key);use.onclick=()=>{if(reason(u,key))return;GameUI.close();void resolve({kind:'move',key});};body.appendChild(use);
 body.appendChild(el('p','hint','威力補正と攻撃能力・相性・一致補正は別です。相手がこれから選ぶ行動は予測していません。'));
}
GameUI.titles.fieldEffects='場の効果';GameUI.titles.moveDetails='技の詳細';
const oldRender=GameUI.render;GameUI.render=function(){oldRender.call(this);if(this.kind==='fieldEffects')fieldPanel();if(this.kind==='moveDetails')movePanel();};
const oldBattle=GameUI.battle;GameUI.battle=function(){oldBattle.call(this);if(this.kind==='fieldEffects')fieldPanel();if(this.kind==='moveDetails')movePanel();};
const oldSwitch=GameUI.switchReason;GameUI.switchReason=function(i){const original=oldSwitch.call(this,i);if(original)return original;if(this.replacement?.battle!==B&&(MY().restTurns||MY().combo))return 'この行動の間は交代できません。状態の確認はできます。';return '';};
const inspect=(u,key)=>{inspected={u,key};GameUI.open('moveDetails');};
const oldCmd=renderCmd;renderCmd=function(){
 oldCmd();if(!B)return;const u=MY(),box=$('#cmd');
 if(u.restTurns||u.combo){box.innerHTML='';for(const key of u.moves){const m=MOVES[key];box.appendChild(el('button','move-command',`<span class="mvn">${chip(m.t)} ${escape(m.n)}</span><span class="mvd">気力 ${enCost(u,key)}</span>`));}}
 const buttons=Array.from(box.querySelectorAll('button'));
 buttons.forEach((b,i)=>{
  const key=u.moves[i];if(!key)return;const why=reason(u,key),tile=el('div','command-tile '+(why?'is-unavailable':'is-available'));
  b.disabled=false;b.setAttribute('aria-disabled',why?'true':'false');b.setAttribute('aria-label',`${MOVES[key].n}。${why||'使用可能'}。長押しで詳細`);
  let timer=null,suppressed=false,start=null;const cancel=()=>{clearTimeout(timer);timer=null;};
  tile.onpointerdown=e=>{if(e.target.closest?.('.move-inspect'))return;start=[e.clientX,e.clientY];cancel();timer=setTimeout(()=>{suppressed=true;inspect(u,key);},450);};
  tile.onpointerup=cancel;tile.onpointercancel=cancel;tile.onpointerleave=cancel;tile.onpointermove=e=>{if(start&&Math.hypot(e.clientX-start[0],e.clientY-start[1])>10)cancel();};
  b.onclick=()=>{cancel();if(suppressed){suppressed=false;return;}if(reason(u,key))inspect(u,key);else void resolve({kind:'move',key});};
  b.oncontextmenu=e=>{e.preventDefault();cancel();inspect(u,key);};
  b.onkeydown=e=>{if(e.key==='i'||e.key==='I'){e.preventDefault();inspect(u,key);}};
  const info=el('button','move-inspect','詳細');info.setAttribute('aria-label',MOVES[key].n+'の詳細');info.onclick=e=>{e.stopPropagation();cancel();inspect(u,key);};
  b.replaceWith(tile);tile.appendChild(b);if(why)tile.appendChild(el('span','command-reason',escape(why)));tile.appendChild(info);
 });
 const monsters=$('#btnBattleMonsters');monsters.disabled=false;monsters.onclick=()=>GameUI.open('monsters');
};
const stage=$('#stage');
const field=el('button','stage-info-button','場の効果');field.id='btnFieldEffects';field.onclick=()=>GameUI.open('fieldEffects');stage.appendChild(field);
const toggle=el('button','stage-command-toggle','コマンド');toggle.id='btnToggleCommands';toggle.setAttribute('aria-expanded','true');toggle.onclick=()=>{const folded=document.body.classList.toggle('commands-folded');toggle.setAttribute('aria-expanded',String(!folded));const sidebar=$('.battle-sidebar');sidebar.inert=folded;sidebar.setAttribute('aria-hidden',String(folded));};stage.appendChild(toggle);
window.addEventListener('resize',()=>{if(!window.matchMedia('(max-width:999px) and (orientation:landscape)').matches){document.body.classList.remove('commands-folded');toggle.setAttribute('aria-expanded','true');const sidebar=$('.battle-sidebar');sidebar.inert=false;sidebar.removeAttribute('aria-hidden');}});
const oldMenu=GameUI.renderBattleMenu;GameUI.renderBattleMenu=function(){oldMenu.call(this);const b=el('button','ghost','場の効果');b.onclick=()=>this.open('fieldEffects');$('#modalBody .battle-menu')?.prepend(b);};
if(B&&!B.over)renderCmd();
})();
