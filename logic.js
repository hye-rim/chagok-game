'use strict';

// 막내의 차곡차곡: 규칙만 모아 둔 파일 (그리기·입력·소리 없음). 브라우저와 테스트(Node)가 같이 쓴다.
//
// - 완성 그림의 맨 아래 재료부터 차례로 골라 쌓는다. 10단계까지 탑이 길어진다
// - 45초로 시작, 단계를 완성하면 +4초(최대 60초). 오답은 -2초와 실수 하나, 세 번 틀리면 끝
// - 시간 폭탄 2개: 각 +5초 (60초가 꽉 찼으면 못 쓴다)
// - 점수: 재료 하나 100점 + 빠른 연속 정답 보너스(1.05초 안에 이어서, 최대 +150), 단계 완성 +250
const LOGIC_CHAGOK = (() => {
const FOODS = [
  { id: 'bread', icon: '🍞', name: '빵' }, { id: 'patty', icon: '🍖', name: '패티' },
  { id: 'cheese', icon: '🧀', name: '치즈' }, { id: 'lettuce', icon: '🥬', name: '상추' },
  { id: 'tomato', icon: '🍅', name: '토마토' }, { id: 'egg', icon: '🍳', name: '달걀' },
  { id: 'bacon', icon: '🥓', name: '베이컨' }, { id: 'onion', icon: '🧅', name: '양파' },
  { id: 'pancake', icon: '🥞', name: '팬케이크' }, { id: 'strawberry', icon: '🍓', name: '딸기' },
];
const BY_ID = Object.fromEntries(FOODS.map((food) => [food.id, food]));
// 순서는 접시에서 위로 쌓이는 순서가 아니라, 접시 위 첫 재료부터의 순서다.
const RECIPES = [
  { name: '햄버거', items: ['bread', 'patty', 'cheese'] },
  { name: '아침 샌드위치', items: ['bread', 'egg', 'lettuce', 'bread'] },
  { name: '치즈버거', items: ['bread', 'patty', 'cheese', 'tomato', 'bread'] },
  { name: '베이컨 버거', items: ['bread', 'lettuce', 'patty', 'bacon', 'cheese'] },
  { name: '더블 버거', items: ['bread', 'patty', 'cheese', 'patty', 'lettuce', 'bread'] },
  { name: '아침 타워', items: ['pancake', 'strawberry', 'pancake', 'egg', 'bacon', 'bread'] },
  { name: '든든 버거', items: ['bread', 'onion', 'patty', 'cheese', 'tomato', 'lettuce', 'bread'] },
  { name: '막내 스페셜', items: ['pancake', 'strawberry', 'egg', 'bacon', 'cheese', 'patty', 'bread'] },
  { name: '가족 버거', items: ['bread', 'lettuce', 'tomato', 'patty', 'cheese', 'onion', 'bacon', 'bread'] },
  { name: '차곡차곡 대장', items: ['pancake', 'strawberry', 'pancake', 'egg', 'lettuce', 'patty', 'cheese', 'bread'] },
];
const START_TIME = 45, MAX_TIME = 60, BOMB_TIME = 5, BOMB_COUNT = 2;
const WRONG_TIME = 2, CLEAR_TIME = 4, MAX_MISTAKES = 3, COMBO_GAP = 1.05;
const CLEAR_SCORE = 250;

function newGame() {
  return { level: 0, mistakes: 0, score: 0, combo: 0, placed: [], state: 'play', timeLeft: START_TIME, bombs: BOMB_COUNT, lastCorrectAt: -1e9, clock: 0, reason: null };
}
const recipeOf = (st) => RECIPES[st.level];

// 이번 단계의 재료 바구니: 필요한 재료 전부 + 헷갈리게 하는 재료(필요한 종류가 적을수록 많이, 최소 2개). 순서는 무작위
function pantry(st, rand = Math.random) {
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const required = new Set(recipeOf(st).items);
  const decoys = shuffle(FOODS.filter((food) => !required.has(food.id)));
  return shuffle([...FOODS.filter((food) => required.has(food.id)), ...decoys.slice(0, Math.max(2, 4 - required.size))]);
}

const gainFor = (combo) => 100 + Math.min(combo - 1, 5) * 30;

// 재료를 고른다. 결과: { ok:false, mistakes } 또는 { ok:true, gain, combo, done(단계 완성) } — 끝났으면 st.state 가 'over'
function choose(st, id) {
  if (st.state !== 'play') return null;
  const expected = recipeOf(st).items[st.placed.length];
  if (id !== expected) {
    st.mistakes++; st.combo = 0;
    st.timeLeft = Math.max(0, st.timeLeft - WRONG_TIME);
    if (st.mistakes >= MAX_MISTAKES) finish(st, false, 'mistake');
    else if (st.timeLeft <= 0) finish(st, false, 'time');
    return { ok: false, mistakes: st.mistakes };
  }
  st.combo = st.clock - st.lastCorrectAt <= COMBO_GAP ? st.combo + 1 : 1;
  st.lastCorrectAt = st.clock;
  st.placed.push(id);
  const gain = gainFor(st.combo);
  st.score += gain;
  const done = st.placed.length === recipeOf(st).items.length;
  if (done) {
    st.score += CLEAR_SCORE;
    st.timeLeft = Math.min(MAX_TIME, st.timeLeft + CLEAR_TIME);
    st.state = 'between';                              // 다음 단계로 넘어가기 전 잠깐 (시간이 안 간다)
  }
  return { ok: true, gain, combo: st.combo, done };
}

// 완성 뒤 다음 단계로 (마지막 단계였으면 승리)
function nextLevel(st) {
  if (st.state !== 'between') return false;
  if (st.level === RECIPES.length - 1) { finish(st, true); return false; }
  st.level++; st.placed = []; st.state = 'play';
  return true;
}

const canBomb = (st) => st.state === 'play' && st.bombs > 0 && st.timeLeft < MAX_TIME;
function useBomb(st) {
  if (!canBomb(st)) return false;
  st.bombs--;
  st.timeLeft = Math.min(MAX_TIME, st.timeLeft + BOMB_TIME);
  return true;
}

// 시간이 흐른다 (play 일 때만 남은 시간이 준다)
function tick(st, dt) {
  st.clock += dt;
  if (st.state !== 'play') return;
  st.timeLeft = Math.max(0, st.timeLeft - dt);
  if (st.timeLeft <= 0) finish(st, false, 'time');
}

function finish(st, won, reason = 'mistake') {
  st.state = won ? 'won' : 'over';
  st.reason = won ? null : reason;
}

return { FOODS, BY_ID, RECIPES, START_TIME, MAX_TIME, BOMB_TIME, BOMB_COUNT, WRONG_TIME, CLEAR_TIME, MAX_MISTAKES, COMBO_GAP, CLEAR_SCORE, newGame, recipeOf, pantry, gainFor, choose, nextLevel, canBomb, useBomb, tick };
})();
if (typeof module !== 'undefined') module.exports = LOGIC_CHAGOK;
