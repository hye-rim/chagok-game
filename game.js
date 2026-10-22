'use strict';

// 막내의 차곡차곡: 화면·입력·소리. 규칙(레시피·판정·점수·시간·폭탄)은 logic.js (LOGIC_CHAGOK) 에 있다.
(() => {
  const L = LOGIC_CHAGOK;
  const $ = (id) => document.getElementById(id);
  const BEST_KEY = 'chagokBest';
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch (_) { return null; } },
    set(key, value) { try { localStorage.setItem(key, String(value)); } catch (_) {} },
  };
  let best = Number(store.get(BEST_KEY)) || 0;
  let st = L.newGame(), ui = 'title', muted = store.get('chagokMuted') === '1';   // ui: title | play | paused (게임이 끝나면 st.state 가 won/over)
  let lastShownTime = -1;
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
  const current = () => L.recipeOf(st);
  const playing = () => ui === 'play' && st.state === 'play';
  function saveBest() { if (st.score > best) { best = st.score; store.set(BEST_KEY, best); } }
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
    current().items.forEach((id) => target.append(makeLayer(L.BY_ID[id])));
    st.placed.forEach((id) => player.append(makeLayer(L.BY_ID[id])));
    $('stackCount').textContent = `${st.placed.length}/${current().items.length}`;
    $('progress').style.width = `${(st.placed.length / current().items.length) * 100}%`;
    $('level').textContent = st.level + 1;
    $('score').textContent = st.score.toLocaleString();
    $('best').textContent = best.toLocaleString();
    $('mistakes').textContent = `${st.mistakes}/${L.MAX_MISTAKES}`;
    $('prompt').innerHTML = st.placed.length === 0 ? `첫 재료부터! <b>${current().name}</b>` : `다음 재료 · <b>${current().name}</b>`;
    $('bombs').textContent = `×${st.bombs}`;
    updateClock();
  }
  function makePantry() {
    const pantry = $('pantry'); pantry.replaceChildren();
    // 다양한 보기 수를 유지하면서 순서를 매 단계 바꿔 기억이나 위치 찍기로 풀리지 않게 한다.
    L.pantry(st).forEach((food) => {
      const button = document.createElement('button'); button.className = 'food'; button.type = 'button';
      button.setAttribute('aria-label', food.name); button.innerHTML = `${food.icon}<small>${food.name}</small>`;
      button.addEventListener('click', () => choose(food.id, button)); pantry.append(button);
    });
  }
  function render() { makePantry(); drawTowers(); }
  function showOverlay(html) { $('modal').innerHTML = html; $('overlay').classList.remove('hidden'); }
  function hideOverlay() { $('overlay').classList.add('hidden'); }
  function begin() {
    st = L.newGame(); ui = 'play'; lastShownTime = -1;
    render(); hideOverlay(); $('feedback').textContent = '그림은 아래층부터 쌓여 있어요!';
  }
  function choose(id, button) {
    if (!playing()) return;
    const r = L.choose(st, id);
    if (!r.ok) {
      tone(180, .12, 'square');
      $('mistakes').textContent = `${st.mistakes}/${L.MAX_MISTAKES}`;
      $('feedback').textContent = `앗, ${eunNeun(L.BY_ID[id].name)} 아니에요. ${L.WRONG_TIME}초 줄었어요!`;
      button.animate([{ transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }], { duration: 220 });
      updateClock(true);
      if (st.state === 'over') finish();
      return;
    }
    saveBest();
    tone(440 + st.placed.length * 55);
    $('feedback').textContent = `${r.combo >= 5 ? '🔥 빠른 손! ' : '착착! '}+${r.gain}점${r.combo > 1 ? ` · ${r.combo}연속` : ''}`;
    drawTowers();
    if (r.done) {
      saveBest();
      cheer();
      updateClock(true);
      $('feedback').textContent = `완성! +${L.CLEAR_SCORE}점 · 시간 보너스 +${L.CLEAR_TIME}초`;
      setTimeout(() => {
        if (st.state !== 'between') return;
        if (L.nextLevel(st)) { render(); $('feedback').textContent = `${current().name} 도전! 더 길어졌어요.`; }
        else finish();
      }, 420);
    }
  }
  function updateClock(force = false) {
    const shown = Math.ceil(st.timeLeft * 10);
    if (force || shown !== lastShownTime) {
      lastShownTime = shown;
      $('time').textContent = Math.max(0, st.timeLeft).toFixed(1);
      $('timePill').classList.toggle('urgent', st.timeLeft <= 10);
    }
    $('bombBtn').disabled = ui !== 'play' || !L.canBomb(st);
  }
  function useBomb() {
    if (ui !== 'play' || !L.useBomb(st)) return;
    tone(220, .2, 'sawtooth');
    $('feedback').textContent = `💣 시간 폭탄! +${L.BOMB_TIME}초`;
    drawTowers(); updateClock(true);
  }
  function finish() {
    const won = st.state === 'won', reason = st.reason;
    saveBest();
    showOverlay(`<div class="sticker">${won ? '🏆🍔' : reason === 'time' ? '⏰🍽️' : '🥺🧺'}</div><h2>${won ? '차곡차곡 완성!' : reason === 'time' ? '시간이 다 됐어요!' : '재료가 헷갈렸어요!'}</h2><p>${won ? '10가지 음식 탑을 모두 완성했어요.' : `${st.level + 1}단계에서 멈췄어요. ${reason === 'time' ? '폭탄을 아껴 쓰고 더 빠르게 쌓아봐요.' : '그림을 아래부터 다시 살펴봐요.'}`}</p><p>점수 <b>${st.score.toLocaleString()}</b>점 · 최고 ${best.toLocaleString()}점</p><button class="primary" id="again">${won ? '한 번 더 쌓기' : '다시 도전'}</button>`);
    $('again').onclick = begin;
  }
  function pause() {
    if (ui === 'play' && st.state === 'play') {
      ui = 'paused';
      showOverlay('<div class="sticker">⏸️</div><h2>잠깐 쉬어요</h2><p>내 탑과 완성 그림은 그대로예요.</p><button class="primary" id="resume">계속하기</button>');
      $('resume').onclick = () => { ui = 'play'; hideOverlay(); };
    } else if (ui === 'paused') { ui = 'play'; hideOverlay(); }
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
    if (ui === 'play' && (st.state === 'play' || st.state === 'between')) {
      L.tick(st, dt);
      if (st.state === 'over') { updateClock(true); finish(); }
      else updateClock();
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  /* @test-hooks:start */
  window.__chagok = { get st() { return st; }, get ui() { return ui; }, begin };
  /* @test-hooks:end */
})();
