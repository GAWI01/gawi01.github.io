import * as THREE from 'three';
import { glowMaterial, setGlow } from './materials.js';
import { makeCanvas, canvasTexture, drawNeonText, withAlpha, PIXEL_FONT, CRT_FONT } from './textures.js';

/*
 * Ambient props that make the room read as a real arcade: a claw machine that plays
 * itself, an air hockey table with a ghost match, and a prize counter.
 * Each prop is { group, lit, color, update(time, dt) } and is lit by the intro like the cabinets.
 */

const bodyMat = () => new THREE.MeshStandardMaterial({ color: '#0d0c12', roughness: 0.55, metalness: 0.25 });
const metalMat = () => new THREE.MeshStandardMaterial({ color: '#8b9099', roughness: 0.3, metalness: 0.9 });
const glassMat = () => new THREE.MeshStandardMaterial({ color: '#b9d6ff', transparent: true, opacity: 0.09, roughness: 0.05, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide });

function signTexture(text, color, sub, { w = 512, h = 160, size = 52 } = {}) {
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.fillStyle = '#060509';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = withAlpha(color, 0.55);
  ctx.lineWidth = 5;
  ctx.strokeRect(6, 6, w - 12, h - 12);
  drawNeonText(ctx, text, w / 2, sub ? h * 0.42 : h / 2, { color, font: PIXEL_FONT, size });
  if (sub) {
    ctx.font = `30px ${CRT_FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(sub, w / 2, h * 0.8);
  }
  return canvasTexture(canvas, { anisotropy: 8 });
}

const PLUSH = ['#ff4fa3', '#4cc9ff', '#ffd166', '#8ce7bd', '#b388ff', '#ff8a3d', '#ffffff', '#ff6b6b'];

export function createClawMachine() {
  const color = '#ff4fa3';
  const group = new THREE.Group();
  group.name = 'claw-machine';
  const body = bodyMat();
  const metal = metalMat();
  const W = 0.92;
  const BASE_H = 0.86;
  const BOX_H = 1.02;
  const TOP = BASE_H + BOX_H;

  const base = new THREE.Mesh(new THREE.BoxGeometry(W, BASE_H, W), body);
  base.position.y = BASE_H / 2;
  group.add(base);
  const front = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.06, 0.4), glowMaterial('#ffffff', 0, { map: signTexture('WIN!', '#ffd166', 'GRAB A PRIZE', { size: 60 }) }));
  front.position.set(0, 0.46, W / 2 + 0.002);
  group.add(front);
  // Prize chute and control ledge.
  const chute = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 0.02), new THREE.MeshStandardMaterial({ color: '#050507', roughness: 0.9 }));
  chute.position.set(0.28, 0.16, W / 2 + 0.01);
  const ledge = new THREE.Mesh(new THREE.BoxGeometry(W, 0.05, 0.18), body);
  ledge.position.set(0, BASE_H - 0.02, W / 2 + 0.07);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.09, 8), metal);
  stick.position.set(-0.18, BASE_H + 0.05, W / 2 + 0.08);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.026, 16, 10), new THREE.MeshStandardMaterial({ color, roughness: 0.3, emissive: color, emissiveIntensity: 0.2 }));
  knob.position.set(-0.18, BASE_H + 0.1, W / 2 + 0.08);
  const buttonMat = glowMaterial('#ffd166', 0);
  const button = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 16), buttonMat);
  button.position.set(0.12, BASE_H + 0.012, W / 2 + 0.08);
  group.add(chute, ledge, stick, knob, button);

  // Glass box with corner posts.
  const glass = glassMat();
  for (const [x, z, ry] of [[0, W / 2, 0], [0, -W / 2, 0], [W / 2, 0, Math.PI / 2], [-W / 2, 0, Math.PI / 2]]) {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(W, BOX_H), glass);
    pane.position.set(x, BASE_H + BOX_H / 2, z);
    pane.rotation.y = ry;
    pane.renderOrder = 2;
    group.add(pane);
  }
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.035, BOX_H, 0.035), metal);
    post.position.set((x * W) / 2, BASE_H + BOX_H / 2, (z * W) / 2);
    group.add(post);
  }
  const trim = glowMaterial(color, 0);
  for (const y of [BASE_H, TOP]) {
    for (const [w, d, x, z] of [[W, 0.02, 0, W / 2], [W, 0.02, 0, -W / 2], [0.02, W, W / 2, 0], [0.02, W, -W / 2, 0]]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), trim);
      strip.position.set(x, y, z);
      group.add(strip);
    }
  }
  // Header with marquee.
  const header = new THREE.Mesh(new THREE.BoxGeometry(W, 0.32, W), body);
  header.position.y = TOP + 0.16;
  const marqueeMat = glowMaterial('#ffffff', 0, { map: signTexture('CLAW KING', color, null, { size: 46 }) });
  const marquee = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.04, 0.28), marqueeMat);
  marquee.position.set(0, TOP + 0.16, W / 2 + 0.002);
  group.add(header, marquee);
  // Light strip inside the roof.
  const roofLight = glowMaterial('#ffe8f4', 0);
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.12, 0.05), roofLight);
  strip.rotation.x = Math.PI / 2;
  strip.position.set(0, TOP - 0.01, 0.2);
  group.add(strip);

  // Pile of plush toys.
  const floorY = BASE_H + 0.01;
  const plushGeometry = new THREE.SphereGeometry(1, 14, 10);
  const plushMat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, emissive: '#ffffff', emissiveIntensity: 0.06 });
  const count = 34;
  const plush = new THREE.InstancedMesh(plushGeometry, plushMat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const c = new THREE.Color();
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < count; i++) {
    const r = 0.06 + rand() * 0.035;
    const x = (rand() - 0.5) * (W - 0.2);
    const z = (rand() - 0.5) * (W - 0.2);
    // Keep the chute corner clear, pile up towards the middle.
    const centre = 1 - Math.min(1, Math.hypot(x, z) / 0.5);
    p.set(x, floorY + r * 0.8 + centre * 0.14 + rand() * 0.06, z);
    if (x > 0.15 && z > 0.15) p.set(x - 0.2, p.y, z - 0.2);
    q.setFromEuler(new THREE.Euler(rand() * 3, rand() * 3, rand() * 3));
    s.set(r, r * (0.85 + rand() * 0.3), r);
    m.compose(p, q, s);
    plush.setMatrixAt(i, m);
    plush.setColorAt(i, c.set(PLUSH[i % PLUSH.length]));
  }
  group.add(plush);

  // Gantry: a carriage on rails, a cable and a three-prong claw.
  const railMat = metal;
  for (const x of [-W / 2 + 0.06, W / 2 - 0.06]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, W - 0.08), railMat);
    rail.position.set(x, TOP - 0.05, 0);
    group.add(rail);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(W - 0.1, 0.025, 0.04), railMat);
  bridge.position.y = TOP - 0.05;
  group.add(bridge);
  const carriage = new THREE.Group();
  carriage.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.08), metal));
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 1, 6).translate(0, -0.5, 0), metal);
  carriage.add(cable);
  const head = new THREE.Group();
  head.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.05, 12), metal));
  const prongs = [];
  for (let i = 0; i < 3; i++) {
    const pivot = new THREE.Group();
    pivot.rotation.y = (i / 3) * Math.PI * 2;
    const prong = new THREE.Group();
    prong.position.set(0.035, -0.02, 0);
    const finger = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.09, 0.014).translate(0, -0.045, 0), metal);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.035, 0.014).translate(0, -0.0175, 0), metal);
    tip.position.y = -0.09;
    tip.rotation.z = 0.7;
    prong.add(finger, tip);
    pivot.add(prong);
    head.add(pivot);
    prongs.push(prong);
  }
  carriage.add(head);
  carriage.position.y = TOP - 0.05;
  group.add(carriage);

  // Self-playing loop: wander, drop, grab, lift, carry to the chute, release.
  const chuteSpot = new THREE.Vector2(0.28, 0.28);
  const anim = { phase: 'wait', t: 0, from: new THREE.Vector2(0, 0), to: new THREE.Vector2(), drop: 0, open: 1 };
  const pos2 = new THREE.Vector2(0, 0);
  const maxDrop = TOP - 0.05 - (floorY + 0.28);
  function next(phase) {
    anim.phase = phase;
    anim.t = 0;
  }

  return {
    group,
    color,
    lit: 0,
    poolAt: new THREE.Vector3(0, 0, 0.9),
    update(time, dt) {
      const lit = this.lit;
      setGlow(trim, lit * (1.1 + 0.25 * Math.sin(time * 2.2)));
      setGlow(marqueeMat, lit * 1.2);
      setGlow(roofLight, lit * 2.2);
      setGlow(buttonMat, lit * (Math.sin(time * 5) > 0 ? 1.6 : 0.4));
      setGlow(front.material, lit * 0.9);
      plushMat.emissiveIntensity = 0.03 + 0.07 * lit;

      anim.t += dt;
      switch (anim.phase) {
        case 'wait':
          if (anim.t > 1.4) {
            anim.from.copy(pos2);
            anim.to.set((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5);
            next('move');
          }
          break;
        case 'move': {
          const k = Math.min(1, anim.t / 1.8);
          // Jerky, two-axis motion like a real gantry.
          const kx = THREE.MathUtils.smoothstep(k, 0, 0.55);
          const kz = THREE.MathUtils.smoothstep(k, 0.45, 1);
          pos2.set(THREE.MathUtils.lerp(anim.from.x, anim.to.x, kx), THREE.MathUtils.lerp(anim.from.y, anim.to.y, kz));
          if (k >= 1) next('drop');
          break;
        }
        case 'drop':
          anim.drop = Math.min(1, anim.t / 1.1);
          if (anim.drop >= 1) next('grab');
          break;
        case 'grab':
          anim.open = Math.max(0, 1 - anim.t / 0.5);
          if (anim.t > 0.7) next('lift');
          break;
        case 'lift':
          anim.drop = Math.max(0, 1 - anim.t / 1.1);
          if (anim.drop <= 0) {
            anim.from.copy(pos2);
            anim.to.copy(chuteSpot);
            next('carry');
          }
          break;
        case 'carry': {
          const k = Math.min(1, anim.t / 1.6);
          const e = THREE.MathUtils.smoothstep(k, 0, 1);
          pos2.lerpVectors(anim.from, anim.to, e);
          if (k >= 1) next('release');
          break;
        }
        case 'release':
          anim.open = Math.min(1, anim.t / 0.3);
          if (anim.t > 0.8) next('wait');
          break;
        default:
          break;
      }
      const sway = anim.phase === 'move' || anim.phase === 'carry' ? Math.sin(time * 9) * 0.04 : 0;
      carriage.position.x = pos2.x;
      carriage.position.z = pos2.y;
      const length = 0.06 + anim.drop * maxDrop;
      cable.scale.y = length;
      head.position.y = -length;
      head.rotation.z = sway;
      for (const prong of prongs) prong.rotation.z = 0.15 + anim.open * 0.45;
    },
  };
}

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

export function createPrizeCounter() {
  const color = '#ffd166';
  const group = new THREE.Group();
  group.name = 'prize-counter';
  const body = bodyMat();
  const L = 1.9;
  const D = 0.6;
  const H = 1.0;
  const base = new THREE.Mesh(new THREE.BoxGeometry(L, 0.4, D), body);
  base.position.y = 0.2;
  group.add(base);
  const glass = glassMat();
  for (const [w, h, x, y, z, rx, ry] of [
    [L, H - 0.4, 0, 0.7, D / 2, 0, 0],
    [L, H - 0.4, 0, 0.7, -D / 2, 0, 0],
    [D, H - 0.4, L / 2, 0.7, 0, 0, Math.PI / 2],
    [D, H - 0.4, -L / 2, 0.7, 0, 0, Math.PI / 2],
    [L, D, 0, H, 0, Math.PI / 2, 0],
  ]) {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glass);
    pane.position.set(x, y, z);
    pane.rotation.set(rx, ry, 0);
    pane.renderOrder = 2;
    group.add(pane);
  }
  const edgeMat = glowMaterial(color, 0);
  for (const [w, d, z] of [[L, 0.015, D / 2], [L, 0.015, -D / 2]]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(w, 0.015, d), edgeMat);
    edge.position.set(0, H, z);
    group.add(edge);
    const low = edge.clone();
    low.position.y = 0.4;
    group.add(low);
  }
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(L - 0.04, 0.015, D - 0.04), new THREE.MeshStandardMaterial({ color: '#c9d6ff', transparent: true, opacity: 0.25, roughness: 0.1 }));
  shelf.position.y = 0.66;
  group.add(shelf);
  const glowStrip = glowMaterial('#fff3d6', 0);
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(L - 0.1, 0.03), glowStrip);
  strip.rotation.x = Math.PI / 2;
  strip.position.set(0, H - 0.01, -D / 2 + 0.06);
  group.add(strip);

  // Prizes: a mix of shapes in candy colours, two rows on two levels.
  const shapes = [
    new THREE.TorusKnotGeometry(0.035, 0.012, 48, 6),
    new THREE.OctahedronGeometry(0.05),
    new THREE.BoxGeometry(0.07, 0.07, 0.07),
    new THREE.SphereGeometry(0.045, 16, 10),
    new THREE.TorusGeometry(0.04, 0.014, 8, 20),
  ];
  const prizeMats = PLUSH.map((c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0, roughness: 0.35, metalness: 0.3 }));
  const prizes = [];
  let n = 0;
  for (const y of [0.47, 0.73]) {
    for (let i = 0; i < 9; i++) {
      const mesh = new THREE.Mesh(shapes[n % shapes.length], prizeMats[(n * 3) % prizeMats.length]);
      mesh.position.set(-L / 2 + 0.16 + i * ((L - 0.32) / 8), y + 0.05, (n % 2 ? 0.08 : -0.06));
      mesh.rotation.set(n * 0.7, n * 1.3, 0);
      group.add(mesh);
      prizes.push(mesh);
      n++;
    }
  }
  // Neon sign on a stand above the counter.
  const signMat = glowMaterial('#ffffff', 0, { map: signTexture('PRIZES', color, '1000 TICKETS = ★', { w: 512, h: 200, size: 56 }), transparent: true });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.43), signMat);
  sign.position.set(0, H + 0.95, -D / 2 + 0.05);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.75, 8), metalMat());
  pole.position.set(0, H + 0.38, -D / 2 + 0.05);
  group.add(sign, pole);

  return {
    group,
    color,
    lit: 0,
    poolAt: new THREE.Vector3(0, 0, 0.6),
    update(time, dt) {
      const lit = this.lit;
      setGlow(edgeMat, lit * 1.3);
      setGlow(glowStrip, lit * 2);
      setGlow(signMat, lit * (Math.sin(time * 0.9) > 0.97 ? 0.4 : 1.2));
      for (const mat of prizeMats) mat.emissiveIntensity = lit * 0.35;
      prizes.forEach((mesh, i) => {
        mesh.rotation.y += dt * (0.3 + (i % 3) * 0.1);
      });
    },
  };
}
