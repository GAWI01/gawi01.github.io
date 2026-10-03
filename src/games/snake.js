/**
 * A small, complete Snake game. It mounts into any element, so the 2D site and the
 * 3D arcade screen share it. Arrow keys / WASD, swipes, or the on-screen pad.
 */
const COLS = 24;
const ROWS = 18;
const CELL = 20;
const W = COLS * CELL;
const H = ROWS * CELL;
const DIRS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
const KEYS = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
};
const PIXEL = '"Press Start 2P", monospace';
const HI_KEY = 'gawi-snake-hi';

function readHi() {
  try {
    return Number(localStorage.getItem(HI_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeHi(value) {
  try {
    localStorage.setItem(HI_KEY, String(value));
  } catch {
    // Not remembered; fine.
  }
}

export function mountSnake(root, { color = '#3dff7a', onSound } = {}) {
  root.replaceChildren();
  const wrap = document.createElement('div');
  wrap.className = 'snake';
  wrap.tabIndex = 0;
  wrap.setAttribute('role', 'application');
  wrap.setAttribute('aria-label', 'Snake. Press Space to start, steer with the arrow keys or WASD, or swipe.');
  wrap.style.setProperty('--snake', color);
  wrap.innerHTML = `
    <div class="snake__bar"><span>Score <b data-score>0</b></span><span>Hi <b data-hi>0</b></span></div>
    <canvas class="snake__canvas" width="${W}" height="${H}"></canvas>
    <div class="snake__pad" aria-label="Controls">
      <button type="button" data-dir="up" aria-label="Up">▲</button>
      <button type="button" data-dir="left" aria-label="Left">◀</button>
      <button type="button" data-dir="start" class="snake__start" aria-label="Start or pause">●</button>
      <button type="button" data-dir="right" aria-label="Right">▶</button>
      <button type="button" data-dir="down" aria-label="Down">▼</button>
    </div>
    <p class="snake__live" aria-live="polite"></p>`;
  root.append(wrap);
  const canvas = wrap.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const scoreEl = wrap.querySelector('[data-score]');
  const hiEl = wrap.querySelector('[data-hi]');
  const live = wrap.querySelector('.snake__live');

  let hi = readHi();
  hiEl.textContent = hi;
  let state = 'ready';
  let snake = [];
  let dir = DIRS.right;
  let queue = [];
  let food = null;
  let score = 0;
  let stepMs = 120;
  let acc = 0;
  let last = performance.now();
  let raf = 0;
  let deathAt = 0;
  let visible = true;
  let destroyed = false;

  function reset() {
    const y = Math.floor(ROWS / 2);
    snake = [{ x: 8, y }, { x: 7, y }, { x: 6, y }, { x: 5, y }];
    dir = DIRS.right;
    queue = [];
    score = 0;
    stepMs = 120;
    scoreEl.textContent = '0';
    placeFood();
  }

  function placeFood() {
    const free = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (!snake.some((s) => s.x === x && s.y === y)) free.push({ x, y });
    food = free[Math.floor(Math.random() * free.length)] || null;
  }

  function start() {
    reset();
    state = 'playing';
    acc = 0;
    live.textContent = 'Game started.';
    onSound?.('start');
  }

  function togglePause() {
    if (state === 'playing') state = 'paused';
    else if (state === 'paused') state = 'playing';
  }

  function steer(name) {
    if (name === 'start') {
      if (state === 'playing' || state === 'paused') togglePause();
      else start();
      return;
    }
    if (state !== 'playing') {
      if (state === 'ready' || (state === 'over' && performance.now() - deathAt > 500)) start();
      else return;
    }
    const next = DIRS[name];
    const prev = queue.length ? queue[queue.length - 1] : dir;
    if (next === prev || (next.x === -prev.x && next.y === -prev.y)) return;
    if (queue.length < 3) queue.push(next);
  }

  function step() {
    if (queue.length) dir = queue.shift();
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    const eating = food && head.x === food.x && head.y === food.y;
    const body = eating ? snake : snake.slice(0, -1);
    if (head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS || body.some((s) => s.x === head.x && s.y === head.y)) {
      state = 'over';
      deathAt = performance.now();
      if (score > hi) {
        hi = score;
        hiEl.textContent = hi;
        writeHi(hi);
      }
      live.textContent = `Game over. Score ${score}.`;
      onSound?.('over');
      return;
    }
    snake.unshift(head);
    if (eating) {
      score++;
      scoreEl.textContent = score;
      stepMs = Math.max(62, 120 - score * 2.5);
      onSound?.('eat');
      placeFood();
    } else {
      snake.pop();
    }
  }

  function text(str, x, y, size, fill, glow = 10) {
    ctx.font = `${size}px ${PIXEL}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = fill;
    ctx.shadowBlur = glow;
    ctx.fillStyle = fill;
    ctx.fillText(str, x, y);
    ctx.shadowBlur = 0;
  }

  function draw(now) {
    ctx.fillStyle = '#03080a';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.035)';
    for (let x = 1; x < COLS; x++) ctx.fillRect(x * CELL, 0, 1, H);
    for (let y = 1; y < ROWS; y++) ctx.fillRect(0, y * CELL, W, 1);

    if (food) {
      const pulse = 0.75 + 0.25 * Math.sin(now / 140);
      ctx.shadowColor = '#ff4fa3';
      ctx.shadowBlur = 16 * pulse;
      ctx.fillStyle = '#ff4fa3';
      const s = CELL * 0.62 * pulse;
      ctx.fillRect(food.x * CELL + (CELL - s) / 2, food.y * CELL + (CELL - s) / 2, s, s);
      ctx.shadowBlur = 0;
    }

    const dead = state === 'over' && Math.floor((now - deathAt) / 120) % 2 === 0 && now - deathAt < 900;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    snake.forEach((s, i) => {
      ctx.fillStyle = dead ? '#ff3b2f' : i === 0 ? '#eafff2' : color;
      ctx.globalAlpha = i === 0 ? 1 : Math.max(0.45, 1 - i / (snake.length + 6));
      ctx.fillRect(s.x * CELL + 2, s.y * CELL + 2, CELL - 4, CELL - 4);
    });
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    if (state !== 'playing') {
      ctx.fillStyle = 'rgba(2, 4, 6, 0.62)';
      ctx.fillRect(0, 0, W, H);
      const blink = Math.floor(now / 520) % 2 === 0;
      if (state === 'ready') {
        text('SNAKE', W / 2, H / 2 - 46, 34, color, 18);
        if (blink) text('PRESS START', W / 2, H / 2 + 14, 14, '#ffffff', 8);
        text('ARROWS · WASD · SWIPE', W / 2, H / 2 + 56, 10, 'rgba(255,255,255,0.7)', 0);
      } else if (state === 'paused') {
        text('PAUSED', W / 2, H / 2, 24, color, 14);
      } else {
        text('GAME OVER', W / 2, H / 2 - 40, 26, '#ff4fa3', 16);
        text(`SCORE ${score}`, W / 2, H / 2 + 6, 14, '#ffffff', 6);
        if (blink) text('PRESS START', W / 2, H / 2 + 48, 12, color, 8);
      }
    }
  }

  function frame(now) {
    raf = 0;
    if (destroyed) return;
    const dt = Math.min(250, now - last);
    last = now;
    if (state === 'playing') {
      acc += dt;
      while (acc >= stepMs && state === 'playing') {
        acc -= stepMs;
        step();
      }
    }
    draw(now);
    if (visible) raf = requestAnimationFrame(frame);
  }

  function resume() {
    if (raf || destroyed) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  // Input
  const onKey = (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (KEYS[e.code]) {
      e.preventDefault();
      steer(KEYS[e.code]);
    } else if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyP') {
      if (e.target.closest?.('button') && e.code !== 'KeyP') return;
      e.preventDefault();
      steer('start');
    }
  };
  wrap.addEventListener('keydown', onKey);

  let swipe = null;
  canvas.addEventListener('pointerdown', (e) => {
    wrap.focus({ preventScroll: true });
    swipe = { x: e.clientX, y: e.clientY, used: false };
    canvas.setPointerCapture?.(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!swipe || swipe.used) return;
    const dx = e.clientX - swipe.x;
    const dy = e.clientY - swipe.y;
    if (Math.hypot(dx, dy) < 24) return;
    steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
    // Allow chaining turns in one long swipe.
    swipe = { x: e.clientX, y: e.clientY, used: false };
    swipe.turned = true;
  });
  canvas.addEventListener('pointerup', () => {
    if (swipe && !swipe.turned && state !== 'playing') steer('start');
    swipe = null;
  });
  wrap.querySelector('.snake__pad').addEventListener('click', (e) => {
    const button = e.target.closest('[data-dir]');
    if (button) steer(button.dataset.dir);
  });

  // Only animate while on screen.
  const observer = 'IntersectionObserver' in window
    ? new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (!visible && state === 'playing') state = 'paused';
      if (visible) resume();
    })
    : null;
  observer?.observe(canvas);

  reset();
  resume();

  return {
    focus() {
      wrap.focus({ preventScroll: true });
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      observer?.disconnect();
      wrap.removeEventListener('keydown', onKey);
    },
  };
}
