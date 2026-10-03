import * as THREE from 'three';

export const PIXEL_FONT = '"Press Start 2P", monospace';
export const CRT_FONT = '"VT323", monospace';

export function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return { canvas, ctx: canvas.getContext('2d') };
}

export function canvasTexture(canvas, { repeat, srgb = true, anisotropy = 4 } = {}) {
  const texture = new THREE.CanvasTexture(canvas);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  if (repeat) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat[0], repeat[1]);
  }
  return texture;
}

/** Mixes a hex colour towards near-black; used for screen backgrounds in 3D and in the HTML screen. */
export function screenBackground(hex, amount = 0.085) {
  const c = new THREE.Color(hex);
  const base = new THREE.Color('#04050a');
  const r = Math.round((base.r + (c.r - base.r) * amount) * 255);
  const g = Math.round((base.g + (c.g - base.g) * amount) * 255);
  const b = Math.round((base.b + (c.b - base.b) * amount) * 255);
  return `rgb(${r}, ${g}, ${b})`;
}

export function withAlpha(hex, alpha) {
  const c = new THREE.Color(hex);
  return `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${alpha})`;
}

/** Text drawn as glowing neon: wide soft halo, coloured tube, hot near-white core. */
export function drawNeonText(ctx, text, x, y, { color, font, size, align = 'center' }) {
  ctx.save();
  ctx.font = `${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.fillStyle = color;
  for (const [blur, alpha] of [[size * 0.7, 0.5], [size * 0.3, 0.8], [size * 0.1, 1]]) {
    ctx.shadowBlur = blur;
    ctx.globalAlpha = alpha;
    ctx.fillText(text, x, y);
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = size * 0.05;
  ctx.shadowColor = mixWithWhite(color, 0.5);
  ctx.fillStyle = mixWithWhite(color, 0.6);
  ctx.fillText(text, x, y);
  ctx.restore();
}

export function mixWithWhite(hex, amount) {
  const c = new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), amount);
  return `#${c.getHexString()}`;
}

export function noiseCanvas(size, { base = '#0b0b12', amount = 18, lines = 0 } = {}) {
  const { canvas, ctx } = makeCanvas(size, size);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const image = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    image.data[i] += n;
    image.data[i + 1] += n;
    image.data[i + 2] += n;
  }
  ctx.putImageData(image, 0, 0);
  if (lines) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    for (let i = 0; i < lines; i++) ctx.fillRect(Math.round((i * size) / lines), 0, 2, size);
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    for (let i = 0; i < lines; i++) ctx.fillRect(Math.round((i * size) / lines) + 2, 0, 1, size);
  }
  return canvas;
}

export function radialShadowTexture() {
  const { canvas, ctx } = makeCanvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.85)');
  g.addColorStop(0.5, 'rgba(0,0,0,0.45)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return canvasTexture(canvas);
}

export function softDotTexture() {
  const { canvas, ctx } = makeCanvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return canvasTexture(canvas, { srgb: false });
}
