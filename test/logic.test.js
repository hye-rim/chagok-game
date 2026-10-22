'use strict';
// 막내의 차곡차곡 규칙 시험. 실행: node test/logic.test.js
const test = require('node:test');
const assert = require('node:assert');
const L = require('../logic.js');

function rng(seed) {                                   // mulberry32 (시험용 고정 난수)
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const next = (st) => L.recipeOf(st).items[st.placed.length];

test('recipes grow from 3 to 8 layers and only use known foods', () => {
  assert.strictEqual(L.RECIPES.length, 10);
  assert.strictEqual(L.RECIPES[0].items.length, 3);
  assert.strictEqual(L.RECIPES[9].items.length, 8);
  for (let i = 1; i < L.RECIPES.length; i++) assert.ok(L.RECIPES[i].items.length >= L.RECIPES[i - 1].items.length);
  for (const r of L.RECIPES) for (const id of r.items) assert.ok(L.BY_ID[id], id);
});

test('the pantry has every needed food, at least two decoys, and the decoys change', () => {
  const st = L.newGame();
  const decoySets = new Set();
  for (let level = 0; level < L.RECIPES.length; level++) {
    st.level = level;
    const need = new Set(L.RECIPES[level].items);
    for (let s = 1; s <= 30; s++) {
      const p = L.pantry(st, rng(level * 100 + s));
      const ids = p.map((f) => f.id);
      assert.strictEqual(new Set(ids).size, ids.length, 'no food twice');
      for (const id of need) assert.ok(ids.includes(id));
      const decoys = ids.filter((id) => !need.has(id));
      assert.strictEqual(decoys.length, Math.max(2, 4 - need.size));
      if (level === 0) decoySets.add(decoys.slice().sort().join());
    }
  }
  assert.ok(decoySets.size > 3, 'decoys are not always the same two foods');
});

test('right foods score, fast streaks add a bonus, finishing a tower adds 250 and 4 seconds', () => {
  const st = L.newGame();
  let r = L.choose(st, next(st));
  assert.deepStrictEqual(r, { ok: true, gain: 100, combo: 1, done: false });
  L.tick(st, 0.5);
  r = L.choose(st, next(st));
  assert.strictEqual(r.gain, 130, 'second within 1.05 s');
  L.tick(st, 2);
  const t = st.timeLeft;
  r = L.choose(st, next(st));
  assert.strictEqual(r.combo, 1, 'too slow: the streak starts over');
  assert.ok(r.done);
  assert.strictEqual(st.score, 100 + 130 + 100 + L.CLEAR_SCORE);
  assert.strictEqual(st.timeLeft, t + L.CLEAR_TIME);
  assert.strictEqual(st.state, 'between');
  const left = st.timeLeft;
  L.tick(st, 5);
  assert.strictEqual(st.timeLeft, left, 'the clock waits between towers');
  assert.ok(L.nextLevel(st));
  assert.strictEqual(st.level, 1);
  assert.deepStrictEqual(st.placed, []);
});

test('the streak bonus is capped at +150', () => {
  assert.strictEqual(L.gainFor(6), 250);
  assert.strictEqual(L.gainFor(30), 250);
});

test('wrong foods cost 2 seconds; the third mistake ends the game', () => {
  const st = L.newGame();
  const wrong = L.FOODS.find((f) => f.id !== next(st)).id;
  assert.deepStrictEqual(L.choose(st, wrong), { ok: false, mistakes: 1 });
  assert.strictEqual(st.timeLeft, L.START_TIME - 2);
  assert.strictEqual(st.combo, 0);
  L.choose(st, wrong);
  L.choose(st, wrong);
  assert.strictEqual(st.state, 'over');
  assert.strictEqual(st.reason, 'mistake');
  assert.strictEqual(L.choose(st, next(st)), null, 'nothing after the end');
});

test('running out of time ends the game; a wrong answer can also run it out', () => {
  const st = L.newGame();
  L.tick(st, L.START_TIME + 1);
  assert.strictEqual(st.state, 'over');
  assert.strictEqual(st.reason, 'time');
  const s2 = L.newGame();
  s2.timeLeft = 1.5;
  L.choose(s2, L.FOODS.find((f) => f.id !== next(s2)).id);
  assert.strictEqual(s2.state, 'over');
  assert.strictEqual(s2.reason, 'time');
});

test('time bombs: two of them, +5 s each, not when the clock is full', () => {
  const st = L.newGame();
  st.timeLeft = 58;
  assert.ok(L.useBomb(st));
  assert.strictEqual(st.timeLeft, L.MAX_TIME);
  assert.ok(!L.canBomb(st), 'full clock');
  st.timeLeft = 20;
  assert.ok(L.useBomb(st));
  assert.strictEqual(st.timeLeft, 25);
  assert.ok(!L.useBomb(st), 'no bombs left');
});

test('a quick, perfect player finishes all ten towers inside the time', () => {
  const st = L.newGame();
  while (st.state === 'play' || st.state === 'between') {
    if (st.state === 'between') { L.tick(st, 0.42); if (!L.nextLevel(st)) break; continue; }
    L.tick(st, 0.6);                                     // 재료마다 0.6초
    L.choose(st, next(st));
  }
  assert.strictEqual(st.state, 'won');
  const layers = L.RECIPES.reduce((s, r) => s + r.items.length, 0);
  assert.ok(st.score > layers * 100 + 10 * L.CLEAR_SCORE, 'streak bonuses counted: ' + st.score);
});

test('a slow player (2.5 s per food, no bombs) runs out of time before the end', () => {
  const st = L.newGame();
  while (st.state === 'play' || st.state === 'between') {
    if (st.state === 'between') { if (!L.nextLevel(st)) break; continue; }
    L.tick(st, 2.5);
    if (st.state === 'play') L.choose(st, next(st));
  }
  assert.strictEqual(st.state, 'over');
  assert.ok(st.level >= 2 && st.level < 9, 'stopped at level ' + (st.level + 1));
});
