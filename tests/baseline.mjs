import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Headless engine checks only. This does not verify browser layout or PeerJS.
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).filter(source => source.trim()).join('\n');
new vm.Script(script, {filename: 'index.html'});

const noop = () => {};
function node() {
  return {
    value: '', innerHTML: '', textContent: '', children: [],
    style: {setProperty: noop},
    classList: {add: noop, remove: noop, contains: () => false},
    appendChild(child) { this.children.push(child); return child; },
    querySelector: () => node(), querySelectorAll: () => [], remove: noop,
    getContext: () => ({clearRect: noop, fillRect: noop}),
  };
}
const nodes = new Map();
const storage = new Map();
const getNode = selector => {
  if (!nodes.has(selector)) nodes.set(selector, node());
  return nodes.get(selector);
};
const context = vm.createContext({
  console, assert,
  document: {
    querySelector: getNode, getElementById: getNode,
    querySelectorAll: () => [], createElement: node,
  },
  window: {scrollTo: noop},
  localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
  },
  // Resolve presentation delays immediately while retaining Promise ordering.
  setTimeout: callback => { callback(); return 0; }, clearTimeout: noop,
});
vm.runInContext(script, context, {filename: 'index.html', timeout: 10_000});
console.log('PASS JavaScript syntax and startup with DOM stubs');

await vm.runInContext(`(async () => {
  assert.equal(SPECIES.length, 18);
  assert.equal(new Set(SPECIES.map(s => s.id)).size, 18);
  for (const s of SPECIES) {
    assert.ok(TYPES.includes(s.t) && TYPES.includes(s.aff), s.id + ': types');
    for (const key of ['hp', 'atk', 'def', 'spd']) assert.ok(s[key] > 0, s.id + ': ' + key);
    assert.equal(SPRITES[s.id].px.length, 32, s.id + ': sprite height');
    assert.ok(SPRITES[s.id].px.every(row => row.length === 32), s.id + ': sprite width');
    assert.equal(ABIL_OF[s.id].length, ['homura','shiogame','saikaku','fuen'].includes(s.id) ? 3 : 2);
    assert.ok(ABIL_OF[s.id].every(key => ABILITIES[key]), s.id + ': abilities');
    const pool = learnable(s);
    assert.ok(pool.length >= 4);
    assert.equal(new Set(pool).size, pool.length, s.id + ': move pool');
    assert.ok(pool.every(key => MOVES[key] && (!MOVES[key].own || MOVES[key].t === s.t)));
  }
  for (const a of TYPES) for (const d of TYPES) assert.ok(Number.isFinite(eff(a, d)));
  for (const [key, move] of Object.entries(MOVES)) {
    assert.ok(TYPES.includes(move.t), key + ': type');
    assert.ok(Number.isFinite(move.p) && Number.isFinite(move.en), key + ': numeric data');
  }
  console.log('PASS all 18 species, sprites, abilities, moves, and type chart');

  setSeed(12345);
  for (let n = 0; n < 100; n++) {
    party = randBuild();
    assert.equal(party.length, 3);
    assert.equal(new Set(party.map(p => p.id)).size, 3);
    for (const p of party) {
      assert.equal(new Set(p.moves).size, 4);
      assert.ok(p.moves.every(key => learnable(spec(p.id)).includes(key)));
      assert.ok(EQUIPS[p.equip] && ABIL_OF[p.id].includes(p.ability));
    }
    saveDraft();
    assert.equal(JSON.stringify(loadDraft()), JSON.stringify(party));
  }
  localStorage.setItem(DRAFT_KEY, '{broken');
  assert.equal(loadDraft(), null);
  localStorage.setItem(DRAFT_KEY, JSON.stringify([null, {id:'deleted'}, {
    id: 'homura', moves: ['invalid', 'invalid'], equip: 'deleted', ability: 'deleted'
  }]));
  const repaired = loadDraft();
  assert.equal(repaired.length, 1);
  assert.equal(repaired[0].equip, 'none');
  assert.equal(repaired[0].ability, ABIL_OF.homura[0]);
  assert.equal(repaired[0].moves.length, 0);
  console.log('PASS 100 random parties, draft roundtrips, malformed draft recovery');

  // Automate only the human replacement choice. Keep engine and AI unchanged.
  chooseReplacement = async () => myTeam().findIndex(u => !u.dead && u !== MY());
  const choosePlayerMove = () => {
    const u = YOU(), target = FOE();
    if (u.encore) return {kind:'move', key:u.encore.key};
    const usable = u.moves.filter(key => !moveBlocked(u,key) && enCost(u,key) <= u.en);
    usable.sort((a,b) => MOVES[b].p * eff(MOVES[b].t,target.type) - MOVES[a].p * eff(MOVES[a].t,target.type));
    return {kind:'move', key:usable[0] ?? null};
  };
  let finished = 0, turns = 0;
  for (let seed = 1; seed <= 20; seed++) {
    setSeed(seed);
    const you = randBuild(), foe = randBuild();
    beginBattle(you, foe, seed, 'you');
    for (let turn = 0; turn < 150 && !B.over; turn++) {
      const previous = B.turn;
      await resolve(choosePlayerMove());
      turns++;
      assert.ok(B.over || B.turn === previous + 1, 'turn must advance');
      assert.ok(B.over || !B.busy, 'commands must unlock');
      for (const u of [...B.you,...B.foe]) {
        assert.ok(Number.isFinite(u.hp) && Number.isFinite(u.en), 'finite HP/energy');
        assert.ok(u.en >= 0 && u.en <= u.maxen, 'energy bounds');
        assert.ok(u.hp <= u.maxhp, 'HP upper bound');
        assert.ok(!u.dead || u.hp === 0, 'fainted HP is zero');
      }
    }
    if (B.over) finished++;
  }
  assert.ok(finished > 0, 'at least one match must reach a result');
  console.log('PASS ' + turns + ' simulated turns across 20 seeded AI matches (' + finished + ' finished within 150 turns)');
})()`, context, {filename: 'baseline-checks', timeout: 10_000});
console.log('Unverified: real browser rendering/input and live PeerJS matches.');
