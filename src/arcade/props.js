import * as THREE from 'three';
import { glowMaterial, setGlow } from './materials.js';
import { makeCanvas, canvasTexture } from './textures.js';

/*
 * Ambient props that make the room read as a real arcade: an air hockey table with a ghost match.
 * Each prop is { group, lit, color, update(time, dt) } and is lit by the intro like the cabinets.
 */

const bodyMat = () => new THREE.MeshStandardMaterial({ color: '#0d0c12', roughness: 0.55, metalness: 0.25 });

function hockeySurface() {
  const { canvas, ctx } = makeCanvas(256, 512);
  ctx.fillStyle = '#0b1a2a';
  ctx.fillRect(0, 0, 256, 512);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  for (let y = 10; y < 512; y += 16) for (let x = 10; x < 256; x += 16) ctx.fillRect(x, y, 2, 2);
  ctx.strokeStyle = 'rgba(255,79,163,0.85)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, 256);
  ctx.lineTo(256, 256);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(128, 256, 46, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(76,201,255,0.85)';
  for (const y of [0, 512]) {
    ctx.beginPath();
    ctx.arc(128, y, 70, 0, Math.PI * 2);
    ctx.stroke();
  }
  return canvasTexture(canvas, { anisotropy: 8 });
}

export function createAirHockey() {
  const color = '#4cc9ff';
  const group = new THREE.Group();
  group.name = 'air-hockey';
  const body = bodyMat();
  const W = 1.05;
  const L = 1.95;
  const TOP = 0.8;
  const legGeometry = new THREE.BoxGeometry(0.08, TOP - 0.18, 0.08);
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const leg = new THREE.Mesh(legGeometry, body);
    leg.position.set(x * (W / 2 - 0.1), (TOP - 0.18) / 2, z * (L / 2 - 0.12));
    group.add(leg);
  }
  const apron = new THREE.Mesh(new THREE.BoxGeometry(W, 0.2, L), body);
  apron.position.y = TOP - 0.1;
  group.add(apron);
  const surfaceMat = glowMaterial('#ffffff', 0, { map: hockeySurface() });
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.1, L - 0.1), surfaceMat);
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = TOP + 0.002;
  group.add(surface);
  // Rails with LED strips: blue side and pink side.
  const blue = glowMaterial('#4cc9ff', 0);
  const pink = glowMaterial('#ff4fa3', 0);
  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, L), body);
    rail.position.set((s * (W - 0.05)) / 2, TOP + 0.03, 0);
    group.add(rail);
    const end = new THREE.Mesh(new THREE.BoxGeometry(W, 0.06, 0.05), body);
    end.position.set(0, TOP + 0.03, (s * (L - 0.05)) / 2);
    group.add(end);
    for (const half of [-1, 1]) {
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, L / 2 - 0.04), half < 0 ? blue : pink);
      led.position.set((s * (W - 0.03)) / 2, TOP + 0.062, (half * L) / 4);
      group.add(led);
    }
    const goal = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.012, 0.012), s < 0 ? blue : pink);
    goal.position.set(0, TOP + 0.062, (s * (L - 0.03)) / 2);
    group.add(goal);
  }
  // Overhead score light.
  const puckMat = glowMaterial('#ffd166', 0);
  const puck = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.01, 20), puckMat);
  puck.position.y = TOP + 0.007;
  const malletGeometry = new THREE.CylinderGeometry(0.045, 0.05, 0.025, 20);
  const knobGeometry = new THREE.CylinderGeometry(0.018, 0.022, 0.05, 12).translate(0, 0.035, 0);
  const mallets = [blue, pink].map((mat, i) => {
    const mallet = new THREE.Group();
    mallet.add(new THREE.Mesh(malletGeometry, new THREE.MeshStandardMaterial({ color: i ? '#ff4fa3' : '#4cc9ff', roughness: 0.3, emissive: i ? '#ff4fa3' : '#4cc9ff', emissiveIntensity: 0.4 })));
    mallet.add(new THREE.Mesh(knobGeometry, new THREE.MeshStandardMaterial({ color: '#e8e8ee', roughness: 0.4 })));
    mallet.position.set(0, TOP + 0.013, (i ? 1 : -1) * (L / 2 - 0.2));
    group.add(mallet);
    return { group: mallet, side: i ? 1 : -1, home: (i ? 1 : -1) * (L / 2 - 0.2) };
  });
  group.add(puck);

  const halfX = W / 2 - 0.09;
  const halfZ = L / 2 - 0.09;
  const v = new THREE.Vector2(0.55, 0.9);
  const pp = new THREE.Vector2(0, 0);
  return {
    group,
    color,
    lit: 0,
    poolAt: new THREE.Vector3(0, 0, 0),
    update(time, dt) {
      const lit = this.lit;
      setGlow(surfaceMat, lit * 0.55);
      setGlow(blue, lit * 1.6);
      setGlow(pink, lit * 1.6);
      setGlow(puckMat, lit * 1.8);
      if (lit < 0.5) return;
      const h = Math.min(dt, 0.05);
      pp.addScaledVector(v, h);
      if (Math.abs(pp.x) > halfX) {
        pp.x = Math.sign(pp.x) * halfX;
        v.x *= -1;
      }
      if (Math.abs(pp.y) > halfZ) {
        pp.y = Math.sign(pp.y) * halfZ;
        v.y *= -1;
      }
      for (const m of mallets) {
        const g = m.group.position;
        // Each ghost player defends its half and strikes when the puck comes close.
        const coming = Math.sign(v.y) === m.side;
        const tx = THREE.MathUtils.clamp(pp.x + Math.sin(time * 1.3 + m.side) * 0.05, -halfX + 0.03, halfX - 0.03);
        const tz = coming && Math.abs(pp.y - m.home) < 0.55 ? pp.y + m.side * 0.06 : m.home;
        g.x += (tx - g.x) * (1 - Math.exp(-h * 6));
        g.z += (tz - g.z) * (1 - Math.exp(-h * 4));
        const dx = pp.x - g.x;
        const dz = pp.y - g.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.085 && d > 1e-4) {
          const speed = THREE.MathUtils.clamp(v.length() * 1.05, 0.8, 1.8);
          v.set(dx / d, dz / d).multiplyScalar(speed);
          if (Math.sign(v.y) === m.side) v.y = -v.y;
          if (Math.abs(v.y) < 0.4) v.y = -m.side * 0.5;
          pp.set(g.x + (dx / d) * 0.086, g.z + (dz / d) * 0.086);
        }
      }
      v.multiplyScalar(Math.exp(-h * 0.05));
      if (v.length() < 0.6) v.setLength(0.6);
      puck.position.x = pp.x;
      puck.position.z = pp.y;
    },
  };
}
