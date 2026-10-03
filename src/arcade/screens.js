import * as THREE from 'three';
import { makeCanvas, canvasTexture, screenBackground, withAlpha, mixWithWhite, PIXEL_FONT, CRT_FONT } from './textures.js';

const W = 512;
const H = 384;

const AVATAR = [
  '...hhhhhh...',
  '..hhhhhhhh..',
  '.hhssssssh..',
  '..swwsswws..',
  '..sbwssbws..',
  '..ssssssss..',
  '...ssmmss...',
  '....ssss....',
  '..gggddggg..',
  '.gggggggggg.',
  '.ggdggggdgg.',
  '.gg.gggg.gg.',
  '.ss.gggg.ss.',
  '....dddd....',
  '....d..d....',
];

const INVADER = [
  '..x.....x..',
  '...x...x...',
  '..xxxxxxx..',
  '.xx.xxx.xx.',
  'xxxxxxxxxxx',
  'x.xxxxxxx.x',
  'x.x.....x.x',
  '...xx.xx...',
];

function drawSprite(ctx, rows, x, y, scale, palette) {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) {
      const fill = palette[row[c]];
      if (!fill) continue;
      ctx.fillStyle = fill;
      ctx.fillRect(x + c * scale, y + r * scale, scale, scale);
    }
  }
}

/** Seeded random so attract screens look the same on every visit. */
function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * One cabinet's screen: an offscreen 2D canvas redrawn as an "attract mode" loop,
 * uploaded to a texture that the CRT shader samples.
 */
export class ArcadeScreen {
  constructor({ type, color, label }) {
    this.type = type;
    this.color = color;
    this.label = label;
    this.bg = screenBackground(color);
    this.bright = mixWithWhite(color, 0.35);
    const { canvas, ctx } = makeCanvas(W, H);
    this.canvas = canvas;
    this.ctx = ctx;
    this.texture = canvasTexture(canvas, { anisotropy: 8 });
    this.texture.generateMipmaps = false;
    this.texture.minFilter = THREE.LinearFilter;
    this.mode = 'attract';
    this.modeStart = 0;
    this.time = 0;
    this.rand = rng(type.length * 977 + label.length * 131);
    this.stars = Array.from({ length: 70 }, () => ({ x: this.rand() * W, y: this.rand() * H, s: 0.3 + this.rand() * 1.7 }));
    this.noise = makeCanvas(128, 96);
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.modeStart = this.time;
  }

  draw(time) {
    this.time = time;
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = this.bg;
    ctx.fillRect(0, 0, W, H);
    if (this.mode === 'boot') this.drawBoot(time - this.modeStart);
    else if (this.mode === 'off') {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
    } else {
      const fn = this[`draw_${this.type}`];
      if (fn) fn.call(this, time);
    }
    ctx.restore();
    this.texture.needsUpdate = true;
  }

  text(str, x, y, { size = 16, font = PIXEL_FONT, color = this.color, align = 'left', glow = 8, alpha = 1 } = {}) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `${size}px ${font}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  blink(period = 1, duty = 0.55) {
    return (this.time / period) % 1 < duty;
  }

  starfield(speed = 20) {
    const ctx = this.ctx;
    for (const star of this.stars) {
      const x = (((star.x - this.time * speed * star.s) % W) + W) % W;
      ctx.fillStyle = withAlpha('#ffffff', 0.25 + star.s * 0.3);
      const size = star.s > 1.4 ? 3 : 2;
      ctx.fillRect(Math.round(x), Math.round(star.y), size, size);
    }
  }

  scoreBar(label = '1UP') {
    const score = String(Math.floor(this.time * 40) % 1000000).padStart(6, '0');
    this.text(`${label} ${score}`, 18, 14, { size: 12, color: '#ffffff', glow: 4 });
    this.text('HI 999999', W - 18, 14, { size: 12, color: this.color, align: 'right', glow: 4 });
  }

  drawBoot(t) {
    const ctx = this.ctx;
    this.text(this.label.toUpperCase(), W / 2, H / 2 - 34, { size: 28, align: 'center', glow: 18 });
    const dots = '.'.repeat(1 + (Math.floor(t * 6) % 3));
    this.text(`LOADING${dots}`, W / 2 - 52, H / 2 + 14, { size: 26, font: CRT_FONT, color: this.bright, glow: 6 });
    const progress = Math.min(1, t / 1.2);
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 2;
    ctx.strokeRect(W / 2 - 100, H / 2 + 52, 200, 12);
    ctx.fillStyle = this.color;
    ctx.fillRect(W / 2 - 97, H / 2 + 55, 194 * progress, 6);
  }

  draw_about(t) {
    this.starfield(14);
    this.scoreBar();
    const bob = Math.round(Math.sin(t * 3) * 3);
    const blinkEyes = t % 3.4 < 0.14;
    const palette = {
      h: '#2a1d16',
      s: '#f0c49b',
      w: blinkEyes ? '#f0c49b' : '#ffffff',
      b: blinkEyes ? '#f0c49b' : '#141414',
      m: '#b06a55',
      g: this.color,
      d: '#1d2a33',
    };
    const ctx = this.ctx;
    ctx.fillStyle = withAlpha(this.color, 0.12);
    ctx.fillRect(44, 92, 128, 176);
    ctx.strokeStyle = withAlpha(this.color, 0.6);
    ctx.lineWidth = 2;
    ctx.strokeRect(44, 92, 128, 176);
    drawSprite(ctx, AVATAR, 60, 112 + bob, 8, palette);
    this.text('PLAYER 1', 196, 96, { size: 14 });
    this.text('GABRIEL', 196, 128, { size: 20, color: '#ffffff', glow: 10 });
    this.text('WITZØE', 196, 158, { size: 20, color: '#ffffff', glow: 10 });
    // The pixel font's Ø lacks a slash; draw one.
    this.ctx.font = `20px ${PIXEL_FONT}`;
    const ox = 196 + this.ctx.measureText('WITZ').width;
    this.ctx.save();
    this.ctx.strokeStyle = '#ffffff';
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.moveTo(ox + 1, 178);
    this.ctx.lineTo(ox + 18, 157);
    this.ctx.stroke();
    this.ctx.restore();
    const lines = ['CLASS  CYBERSECURITY', 'SKILLS SOFTWARE + AI', 'BASE   GAWI.NO'];
    const typed = Math.floor(((t * 14) % 90));
    let budget = typed;
    lines.forEach((line, i) => {
      const shown = line.slice(0, Math.max(0, Math.min(line.length, budget)));
      budget -= line.length;
      this.text(shown, 196, 196 + i * 24, { size: 24, font: CRT_FONT, color: this.bright, glow: 4 });
    });
    if (this.blink(1.1)) this.text('PRESS START', W / 2, 322, { size: 16, align: 'center', glow: 12 });
  }

  draw_projects(t) {
    const ctx = this.ctx;
    this.starfield(8);
    this.text('SELECT STAGE', W / 2, 30, { size: 20, align: 'center', glow: 14 });
    const tiles = [
      { x: 40, label: 'FPL-AI', sub: 'ACTIVE', color: '#b388ff' },
      { x: 272, label: 'BAJAZZO', sub: 'PROTOTYPE', color: '#ffad42' },
    ];
    const active = Math.floor(t / 1.6) % 2;
    tiles.forEach((tile, i) => {
      const y = 82;
      ctx.fillStyle = withAlpha(tile.color, 0.1);
      ctx.fillRect(tile.x, y, 200, 180);
      ctx.strokeStyle = withAlpha(tile.color, 0.55);
      ctx.lineWidth = 2;
      ctx.strokeRect(tile.x, y, 200, 180);
      if (i === 0) this.miniPitch(tile.x + 30, y + 22, 140, 92, tile.color, t);
      else this.miniCloche(tile.x + 100, y + 70, tile.color, t);
      this.text(tile.label, tile.x + 100, y + 128, { size: 14, align: 'center', color: tile.color });
      this.text(tile.sub, tile.x + 100, y + 152, { size: 20, font: CRT_FONT, align: 'center', color: '#ffffff', glow: 4 });
      if (i === active) {
        const pulse = this.blink(0.4) ? 1 : 0.5;
        ctx.save();
        ctx.strokeStyle = withAlpha('#ffffff', pulse);
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 14;
        ctx.lineWidth = 4;
        ctx.strokeRect(tile.x - 8, y - 8, 216, 196);
        ctx.restore();
        this.text('▼', tile.x + 100, y - 30 + Math.round(Math.sin(t * 6) * 3), { size: 16, align: 'center', color: '#ffffff' });
      }
    });
    if (this.blink(1)) this.text('PRESS START', W / 2, 310, { size: 14, align: 'center' });
    this.text('2 STAGES UNLOCKED', W / 2, 340, { size: 22, font: CRT_FONT, align: 'center', color: this.bright, glow: 3 });
  }

  miniPitch(x, y, w, h, color, t) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(40, 120, 70, 0.35)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(220,255,230,0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w / 2, y + h);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h / 2, h * 0.18, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const px = x + 14 + ((i * 23 + Math.sin(t * 1.3 + i) * 8) % (w - 24));
      const py = y + 12 + ((i * 37 + Math.cos(t * 1.1 + i * 2) * 8) % (h - 20));
      ctx.fillStyle = i % 2 ? color : '#ffffff';
      ctx.fillRect(Math.round(px), Math.round(py), 6, 6);
    }
  }

  miniCloche(cx, cy, color, t) {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 22, 64, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy + 18, 46, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = mixWithWhite(color, 0.6);
    ctx.fillRect(cx - 5, cy - 36, 10, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(cx - 30, cy - 6, 8, 18);
    for (let i = 0; i < 3; i++) {
      const phase = (t * 0.8 + i / 3) % 1;
      ctx.fillStyle = withAlpha('#ffffff', 0.5 * (1 - phase));
      ctx.fillRect(cx - 20 + i * 18 + Math.sin(t * 3 + i) * 4, cy - 44 - phase * 30, 4, 8);
    }
  }

  draw_fpl(t) {
    const ctx = this.ctx;
    this.text('FPL-AI', 18, 16, { size: 16 });
    this.text('GW ANALYSIS', W - 18, 12, { size: 22, font: CRT_FONT, align: 'right', color: this.bright, glow: 3 });
    // Pitch with a drifting 4-4-2 formation and a ball pinging between players.
    const px = 18;
    const py = 50;
    const pw = 290;
    const ph = 270;
    ctx.fillStyle = 'rgba(30, 110, 60, 0.32)';
    ctx.fillRect(px, py, pw, ph);
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.05)';
      ctx.fillRect(px, py + (i * ph) / 6, pw, ph / 6);
    }
    ctx.strokeStyle = 'rgba(220,255,230,0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(px, py, pw, ph);
    ctx.beginPath();
    ctx.moveTo(px, py + ph / 2);
    ctx.lineTo(px + pw, py + ph / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px + pw / 2, py + ph / 2, 30, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeRect(px + pw / 2 - 60, py, 120, 40);
    ctx.strokeRect(px + pw / 2 - 60, py + ph - 40, 120, 40);
    const formation = [[0.5, 0.92], [0.15, 0.74], [0.38, 0.77], [0.62, 0.77], [0.85, 0.74], [0.15, 0.5], [0.38, 0.54], [0.62, 0.54], [0.85, 0.5], [0.38, 0.27], [0.62, 0.27]];
    const players = formation.map(([fx, fy], i) => [
      px + fx * pw + Math.sin(t * 0.9 + i * 1.7) * 9,
      py + fy * ph + Math.cos(t * 0.7 + i * 2.3) * 7,
    ]);
    const captain = 9 + (Math.floor(t / 3) % 2);
    players.forEach(([x, y], i) => {
      ctx.fillStyle = i === 0 ? '#ffd166' : this.color;
      ctx.fillRect(Math.round(x) - 5, Math.round(y) - 5, 10, 10);
      if (i === captain && this.blink(0.5)) this.text('C', x + 8, y - 14, { size: 10, color: '#ffffff', glow: 6 });
    });
    const leg = Math.floor(t * 0.8) % players.length;
    const next = (leg + 3) % players.length;
    const k = (t * 0.8) % 1;
    const bx = players[leg][0] + (players[next][0] - players[leg][0]) * k;
    const by = players[leg][1] + (players[next][1] - players[leg][1]) * k;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.round(bx) - 3, Math.round(by) - 3, 6, 6);

    // Expected points bars.
    const cx = 330;
    this.text('xPTS', cx, 56, { size: 12, color: '#ffffff', glow: 4 });
    const labels = ['FWD', 'MID', 'MID', 'DEF', 'GK'];
    labels.forEach((label, i) => {
      const y = 86 + i * 40;
      const v = 0.35 + 0.6 * (0.5 + 0.5 * Math.sin(t * 0.6 + i * 1.3));
      this.text(label, cx, y, { size: 20, font: CRT_FONT, color: this.bright, glow: 2 });
      ctx.fillStyle = withAlpha(this.color, 0.18);
      ctx.fillRect(cx + 44, y + 4, 120, 14);
      ctx.fillStyle = this.color;
      ctx.fillRect(cx + 44, y + 4, Math.round(120 * v), 14);
    });
    const ticker = '   TRANSFERS  ·  CAPTAINCY  ·  SQUAD PLANNING  ·  DATA + STATISTICS  ·';
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 332, W, 40);
    ctx.clip();
    const offset = (t * 60) % (ticker.length * 11);
    this.text(ticker + ticker, 18 - offset, 340, { size: 26, font: CRT_FONT, color: '#ffffff', glow: 4 });
    ctx.restore();
  }

  draw_bajazzo(t) {
    const ctx = this.ctx;
    this.text('BAJAZZO', 18, 16, { size: 16 });
    this.text('KITCHEN DISPLAY', W - 18, 12, { size: 22, font: CRT_FONT, align: 'right', color: this.bright, glow: 3 });
    const items = ['PIZZA MARGHERITA', 'CATERING TRAY', 'PASTA x2', 'TAPAS BOARD', 'SALAD + BREAD', 'LASAGNE x3', 'DESSERT PLATE'];
    const statuses = [['NEW', '#4cc9ff'], ['PREP', '#ffad42'], ['READY', '#8ce7bd']];
    const step = Math.floor(t / 1.4);
    ctx.save();
    ctx.beginPath();
    ctx.rect(14, 52, 330, 270);
    ctx.clip();
    for (let i = 0; i < 6; i++) {
      const n = step + i;
      const y = 56 + i * 44 - ((t / 1.4) % 1) * 44 * Math.min(1, ((t / 1.4) % 1) * 4);
      const status = statuses[(n + (n >> 2)) % 3];
      ctx.fillStyle = withAlpha(this.color, i % 2 ? 0.06 : 0.11);
      ctx.fillRect(14, y, 330, 40);
      this.text(`#${String(400 + n).padStart(4, '0')}`, 24, y + 8, { size: 24, font: CRT_FONT, color: '#ffffff', glow: 2 });
      this.text(items[n % items.length], 92, y + 8, { size: 24, font: CRT_FONT, color: this.bright, glow: 2 });
      ctx.fillStyle = status[1];
      ctx.fillRect(272, y + 10, 62, 20);
      this.text(status[0], 303, y + 12, { size: 10, align: 'center', color: '#05060a', glow: 0 });
    }
    ctx.restore();
    this.miniCloche(430, 160, this.color, t);
    this.text('ORDER', 430, 220, { size: 12, align: 'center', color: '#ffffff', glow: 4 });
    if (this.blink(0.7)) this.text('UP!', 430, 240, { size: 16, align: 'center' });
    this.text('ONLINE ORDERING · MENU · ADMIN', W / 2, 340, { size: 24, font: CRT_FONT, align: 'center', color: '#ffffff', glow: 3 });
  }

  draw_contact(t) {
    this.starfield(30);
    this.text('CONTINUE?', W / 2, 40, { size: 28, align: 'center', glow: 18 });
    const n = 9 - (Math.floor(t) % 10);
    const scale = 1 + 0.25 * Math.max(0, 1 - (t % 1) * 4);
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(W / 2, 170);
    ctx.scale(scale, scale);
    this.text(String(n), 0, -48, { size: 96, align: 'center', color: '#ffffff', glow: 24 });
    ctx.restore();
    if (this.blink(0.9)) this.text('INSERT COIN', W / 2, 252, { size: 16, align: 'center' });
    this.text('GITHUB  ·  LINKEDIN', W / 2, 300, { size: 28, font: CRT_FONT, align: 'center', color: this.bright, glow: 4 });
    this.scoreBar('2UP');
  }

  draw_invaders(t) {
    const ctx = this.ctx;
    this.scoreBar();
    const shift = Math.round(Math.sin(t * 0.8) * 40);
    const frameDrop = Math.floor(t * 2) % 2;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 7; c++) {
        const colors = { x: r === 0 ? '#ff4fa3' : r === 1 ? '#4cc9ff' : this.color };
        drawSprite(ctx, INVADER, 70 + c * 54 + shift, 60 + r * 40 + frameDrop * 2, 3, colors);
      }
    }
    const shipX = W / 2 + Math.sin(t * 1.3) * 160;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(shipX - 16, 330, 32, 8);
    ctx.fillRect(shipX - 4, 322, 8, 8);
    const shot = (t * 1.6) % 1;
    ctx.fillRect(shipX - 1, 316 - shot * 200, 3, 10);
    ctx.fillStyle = withAlpha(this.color, 0.5);
    ctx.fillRect(0, 350, W, 2);
  }

  draw_pong(t) {
    const ctx = this.ctx;
    ctx.fillStyle = withAlpha('#ffffff', 0.4);
    for (let y = 10; y < H; y += 24) ctx.fillRect(W / 2 - 2, y, 4, 12);
    const bx = W / 2 + Math.sin(t * 1.7) * 210;
    const by = H / 2 + Math.sin(t * 2.9) * 150;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(bx - 5, by - 5, 10, 10);
    ctx.fillRect(28, by - 30 + Math.sin(t * 3) * 14, 10, 60);
    ctx.fillRect(W - 38, by - 30 - Math.sin(t * 2.6) * 14, 10, 60);
    this.text(String(Math.floor(t / 7) % 10), W / 2 - 50, 20, { size: 32, align: 'center', color: '#ffffff' });
    this.text(String(Math.floor(t / 9) % 10), W / 2 + 50, 20, { size: 32, align: 'center', color: '#ffffff' });
  }

  draw_static() {
    const { canvas, ctx } = this.noise;
    const image = ctx.createImageData(canvas.width, canvas.height);
    for (let i = 0; i < image.data.length; i += 4) {
      const v = Math.random() * 120;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = v;
      image.data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(canvas, 0, 0, W, H);
    this.ctx.fillStyle = 'rgba(0,0,0,0.75)';
    this.ctx.fillRect(96, 150, 320, 84);
    this.text('OUT OF ORDER', W / 2, 172, { size: 18, align: 'center', color: '#ff5a4f', glow: 10 });
    this.text('SORRY, PLAYER', W / 2, 202, { size: 22, font: CRT_FONT, align: 'center', color: '#ffffff', glow: 2 });
  }
}
