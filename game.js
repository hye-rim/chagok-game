'use strict';

(() => {
  const $ = (id) => document.getElementById(id);
  const foods = [
    { id: 'bread', icon: '🍞', name: '빵' }, { id: 'patty', icon: '🍖', name: '패티' },
    { id: 'cheese', icon: '🧀', name: '치즈' }, { id: 'lettuce', icon: '🥬', name: '상추' },
    { id: 'tomato', icon: '🍅', name: '토마토' }, { id: 'egg', icon: '🍳', name: '달걀' },
    { id: 'bacon', icon: '🥓', name: '베이컨' }, { id: 'onion', icon: '🧅', name: '양파' },
    { id: 'pancake', icon: '🥞', name: '팬케이크' }, { id: 'strawberry', icon: '🍓', name: '딸기' },
  ];
  const byId = Object.fromEntries(foods.map((food) => [food.id, food]));
  // 순서는 접시에서 위로 쌓이는 순서가 아니라, 접시 위 첫 재료부터의 순서다.
  const recipes = [
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
  const BEST_KEY = 'chagokBest';
  const START_TIME = 45;
  const MAX_TIME = 60;
  const BOMB_TIME = 5;
  const BOMB_COUNT = 2;
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch (_) { return null; } },
    set(key, value) { try { localStorage.setItem(key, String(value)); } catch (_) {} },
  };
  let best = Number(store.get(BEST_KEY)) || 0;
  let level = 0, mistakes = 0, score = 0, combo = 0, placed = [], state = 'title', muted = store.get('chagokMuted') === '1';
  let timeLeft = START_TIME, bombs = BOMB_COUNT, lastCorrectAt = 0, lastShownTime = -1;
  let audio;

  function tone(freq, duration = .08, type = 'triangle') {
    if (muted || store.get('arcade_muted') === '1') return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const osc = audio.createOscillator(), gain = audio.createGain(), now = audio.currentTime;
      osc.type = type; osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(.075, now); gain.gain.exponentialRampToValueAtTime(.001, now + duration);
      osc.connect(gain).connect(audio.destination); osc.start(now); osc.stop(now + duration);
    } catch (_) {}
  }
  const cheer = () => [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, .12), i * 70));

  // 받침이 있으면 '은', 없으면 '는'
  const eunNeun = (word) => { const c = word.charCodeAt(word.length - 1) - 0xAC00; return `${word}${c >= 0 && c % 28 !== 0 ? '은' : '는'}`; };
  function current() { return recipes[level]; }
  function makeLayer(food) {
    const el = document.createElement('div');
    el.className = 'layer';
    const icon = document.createElement('span'); icon.textContent = food.icon;
    el.append(icon);
    return el;
  }
  function drawTowers() {
    const target = $('targetStack'), player = $('playerStack');
    target.style.setProperty('--stack-count', current().items.length);
    player.style.setProperty('--stack-count', Math.max(1, current().items.length));
    target.replaceChildren(); player.replaceChildren();
    current().items.forEach((id, i) => {
      target.append(makeLayer(byId[id]));
    });
    placed.forEach((id) => player.append(makeLayer(byId[id])));
    $('stackCount').textContent = `${placed.length}/${current().items.length}`;
    $('progress').style.width = `${(placed.length / current().items.length) * 100}%`;
    $('level').textContent = level + 1;
    $('score').textContent = score.toLocaleString();
    $('best').textContent = best.toLocaleString();
    $('mistakes').textContent = `${mistakes}/3`;
    $('prompt').innerHTML = placed.length === 0 ? `첫 재료부터! <b>${current().name}</b>` : `다음 재료 · <b>${current().name}</b>`;
    $('bombs').textContent = `×${bombs}`;
    $('bombBtn').disabled = state !== 'play' || bombs <= 0 || timeLeft >= MAX_TIME;
    if (lastShownTime !== Math.ceil(timeLeft * 10)) {
      lastShownTime = Math.ceil(timeLeft * 10);
      $('time').textContent = Math.max(0, timeLeft).toFixed(1);
      $('timePill').classList.toggle('urgent', timeLeft <= 10);
    }
  }
  function makePantry() {
    const required = new Set(current().items);
    const decoys = foods.filter((food) => !required.has(food.id));
    const options = [...foods.filter((food) => required.has(food.id)), ...decoys.slice(0, Math.max(2, 4 - required.size))];
    // 다양한 보기 수를 유지하면서 순서를 매 단계 바꿔 기억이나 위치 찍기로 풀리지 않게 한다.
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1)); [options[i], options[j]] = [options[j], options[i]];
    }
    const pantry = $('pantry'); pantry.replaceChildren();
    options.forEach((food) => {
      const button = document.createElement('button'); button.className = 'food'; button.type = 'button';
      button.setAttribute('aria-label', food.name); button.innerHTML = `${food.icon}<small>${food.name}</small>`;
      button.addEventListener('click', () => choose(food.id, button)); pantry.append(button);
    });
  }
  function render() { makePantry(); drawTowers(); }
  function showOverlay(html) { $('modal').innerHTML = html; $('overlay').classList.remove('hidden'); }
  function hideOverlay() { $('overlay').classList.add('hidden'); }
  function begin() {
    level = 0; mistakes = 0; score = 0; combo = 0; placed = []; state = 'play';
    timeLeft = START_TIME; bombs = BOMB_COUNT; lastCorrectAt = 0; lastShownTime = -1;
    render(); hideOverlay(); $('feedback').textContent = '그림은 아래층부터 쌓여 있어요!';
  }
  function choose(id, button) {
    if (state !== 'play') return;
    const expected = current().items[placed.length];
    if (id !== expected) {
      mistakes++; combo = 0; tone(180, .12, 'square');
      timeLeft = Math.max(0, timeLeft - 2);
      $('mistakes').textContent = `${mistakes}/3`;
      $('feedback').textContent = `앗, ${eunNeun(byId[id].name)} 아니에요. 2초 줄었어요!`;
      button.animate([{ transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }], { duration: 220 });
      updateClock();
      if (mistakes >= 3) finish(false, 'mistake');
      else if (timeLeft <= 0) finish(false, 'time');
      return;
    }
    const now = performance.now();
    combo = now - lastCorrectAt <= 1050 ? combo + 1 : 1;
    lastCorrectAt = now;
    placed.push(id);
    const gain = 100 + Math.min(combo - 1, 5) * 30;
    score += gain; if (score > best) { best = score; store.set(BEST_KEY, best); }
    tone(440 + placed.length * 55);
    $('feedback').textContent = `${combo >= 5 ? '🔥 빠른 손! ' : '착착! '}+${gain}점${combo > 1 ? ` · ${combo}연속` : ''}`;
    drawTowers();
    if (placed.length === current().items.length) {
      score += 250; if (score > best) { best = score; store.set(BEST_KEY, best); }
      timeLeft = Math.min(MAX_TIME, timeLeft + 4);
      state = 'between'; cheer();
      updateClock();
      $('feedback').textContent = `완성! +250점 · 시간 보너스 +4초`;
      setTimeout(() => {
        if (state !== 'between') return;
        if (level === recipes.length - 1) finish(true);
        else {
          level++; placed = []; state = 'play'; render(); $('feedback').textContent = `${current().name} 도전! 더 길어졌어요.`;
        }
      }, 420);
    }
  }
  function updateClock(force = false) {
    const shown = Math.ceil(timeLeft * 10);
    if (force || shown !== lastShownTime) {
      lastShownTime = shown;
      $('time').textContent = Math.max(0, timeLeft).toFixed(1);
      $('timePill').classList.toggle('urgent', timeLeft <= 10);
    }
    $('bombBtn').disabled = state !== 'play' || bombs <= 0 || timeLeft >= MAX_TIME;
  }
  function useBomb() {
    if (state !== 'play' || bombs <= 0 || timeLeft >= MAX_TIME) return;
    bombs--;
    timeLeft = Math.min(MAX_TIME, timeLeft + BOMB_TIME);
    tone(220, .2, 'sawtooth');
    $('feedback').textContent = `💣 시간 폭탄! +${BOMB_TIME}초`;
    drawTowers(); updateClock();
  }
  function finish(won, reason = 'mistake') {
    state = won ? 'won' : 'over';
    if (score > best) { best = score; store.set(BEST_KEY, best); }
    showOverlay(`<div class="sticker">${won ? '🏆🍔' : reason === 'time' ? '⏰🍽️' : '🥺🧺'}</div><h2>${won ? '차곡차곡 완성!' : reason === 'time' ? '시간이 다 됐어요!' : '재료가 헷갈렸어요!'}</h2><p>${won ? '10가지 음식 탑을 모두 완성했어요.' : `${level + 1}단계에서 멈췄어요. ${reason === 'time' ? '폭탄을 아껴 쓰고 더 빠르게 쌓아봐요.' : '그림을 아래부터 다시 살펴봐요.'}`}</p><p>점수 <b>${score.toLocaleString()}</b>점 · 최고 ${best.toLocaleString()}점</p><button class="primary" id="again">${won ? '한 번 더 쌓기' : '다시 도전'}</button>`);
    $('again').onclick = begin;
  }
  function pause() {
    if (state === 'play') {
      state = 'paused';
      showOverlay('<div class="sticker">⏸️</div><h2>잠깐 쉬어요</h2><p>내 탑과 완성 그림은 그대로예요.</p><button class="primary" id="resume">계속하기</button>');
      $('resume').onclick = () => { state = 'play'; hideOverlay(); };
    } else if (state === 'paused') { state = 'play'; hideOverlay(); }
  }
  $('pause').addEventListener('click', pause);
  $('bombBtn').addEventListener('click', useBomb);
  window.addEventListener('keydown', (e) => { if (e.key.toLowerCase() === 'p' || e.key === 'Escape') pause(); });
  window.addEventListener('storage', (e) => { if (e.key === 'arcade_muted') muted = e.newValue === '1'; });
  showOverlay('<div class="sticker">🥞🍓🍔</div><h2>막내의 차곡차곡</h2><p>완성 그림을 보고 <b>접시 맨 아래부터 빠르게</b> 쌓아요.<br>45초 안에 도전! 정답 콤보와 단계 완성은 점수·시간 보너스.<br>💣 폭탄은 5초 연장, 오답은 2초 차감.<br>10단계 음식 탑에 도전해 보세요!</p><button class="primary" id="start">쌓기 시작</button><p class="small">원작처럼 목표 그림을 보며 빠른 손으로 완성해요</p>');
  $('start').onclick = begin;
  let clockAt = performance.now();
  function tick(now) {
    const dt = Math.min(.1, (now - clockAt) / 1000); clockAt = now;
    if (state === 'play') {
      timeLeft = Math.max(0, timeLeft - dt);
      if (timeLeft <= 0) { updateClock(true); finish(false, 'time'); }
      else updateClock();
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
