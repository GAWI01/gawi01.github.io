import * as THREE from 'three';
import { ArcadeScreen } from './screens.js';
import { createCrtMaterial, glowMaterial, setGlow } from './materials.js';
import { makeCanvas, canvasTexture, drawNeonText, withAlpha, mixWithWhite, PIXEL_FONT, CRT_FONT } from './textures.js';

// Side profile of the cabinet in (z, y) metres; front faces +z.
const P = {
  backBottom: [-0.42, 0],
  frontBottom: [0.36, 0],
  kickTop: [0.36, 0.86],
  cpFrontLow: [0.5, 0.9],
  cpFrontTop: [0.5, 0.97],
  cpBack: [0.22, 1.06],
  screenTop: [0.1, 1.56],
  hoodFront: [0.3, 1.62],
  marqueeTop: [0.33, 1.9],
  topBack: [-0.3, 1.9],
  backUpper: [-0.42, 1.7],
};
const OUTLINE = ['backBottom', 'frontBottom', 'kickTop', 'cpFrontLow', 'cpFrontTop', 'cpBack', 'screenTop', 'hoodFront', 'marqueeTop', 'topBack', 'backUpper'];
const TRIM_PATH = ['frontBottom', 'kickTop', 'cpFrontLow', 'cpFrontTop', 'cpBack', 'screenTop', 'hoodFront', 'marqueeTop', 'topBack', 'backUpper', 'backBottom'];

const BODY_W = 0.72;
const SIDE_T = 0.022;
export const SCREEN_W = 0.56;
export const SCREEN_H = 0.42;

const shared = {};
function sharedResources() {
  if (shared.ready) return shared;
  shared.ready = true;
  const shape = new THREE.Shape(OUTLINE.map((k) => new THREE.Vector2(P[k][0], P[k][1])));
  // Maps extrude space (u = profile z, v = height, e = depth) onto world (x = across, y, z = front).
  const toWorld = (depth) => new THREE.Matrix4().set(0, 0, -1, depth / 2, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1);
  shared.body = new THREE.ExtrudeGeometry(shape, { depth: BODY_W, bevelEnabled: false }).applyMatrix4(toWorld(BODY_W));
  shared.side = new THREE.ExtrudeGeometry(shape, { depth: SIDE_T, bevelEnabled: false }).applyMatrix4(toWorld(SIDE_T));
  shared.bodyMat = new THREE.MeshStandardMaterial({ color: '#0c0c11', roughness: 0.62, metalness: 0.15 });
  shared.edgeMat = new THREE.MeshStandardMaterial({ color: '#141419', roughness: 0.4, metalness: 0.3 });
  shared.metal = new THREE.MeshStandardMaterial({ color: '#5a5f69', roughness: 0.35, metalness: 0.85 });
  shared.black = new THREE.MeshStandardMaterial({ color: '#08080a', roughness: 0.3, metalness: 0.2 });

  // Screen: slightly bulged like a real tube.
  const crt = new THREE.PlaneGeometry(SCREEN_W, SCREEN_H, 24, 18);
  const pos = crt.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / (SCREEN_W / 2);
    const y = pos.getY(i) / (SCREEN_H / 2);
    pos.setZ(i, 0.016 * (1 - x * x * 0.85) * (1 - y * y * 0.85));
  }
  crt.computeVertexNormals();
  shared.crt = crt;

  shared.button = new THREE.CylinderGeometry(0.019, 0.021, 0.014, 20).rotateX(Math.PI / 2).translate(0, 0, 0.007);
  shared.buttonRing = new THREE.CylinderGeometry(0.026, 0.026, 0.004, 20).rotateX(Math.PI / 2).translate(0, 0, 0.002);
  shared.stickBase = new THREE.CylinderGeometry(0.032, 0.036, 0.008, 20).rotateX(Math.PI / 2).translate(0, 0, 0.004);
  shared.stickShaft = new THREE.CylinderGeometry(0.006, 0.006, 0.075, 8).rotateX(Math.PI / 2).translate(0, 0, 0.0375);
  shared.stickBall = new THREE.SphereGeometry(0.024, 20, 14).translate(0, 0, 0.08);
  return shared;
}

/** Placement for a flat panel lying on the profile segment a→b (a lower/front, b the panel's "up"). */
function segmentFrame(a, b) {
  const dz = P[b][0] - P[a][0];
  const dy = P[b][1] - P[a][1];
  const length = Math.hypot(dz, dy);
  const angle = Math.atan2(dz, dy);
  const center = new THREE.Vector3(0, (P[a][1] + P[b][1]) / 2, (P[a][0] + P[b][0]) / 2);
  const normal = new THREE.Vector3(0, -Math.sin(angle), Math.cos(angle));
  return { length, angle, center, normal };
}

function placeOn(mesh, frame, offset) {
  mesh.position.copy(frame.center).addScaledVector(frame.normal, offset);
  mesh.rotation.x = frame.angle;
  return mesh;
}

function sideArtTexture(color) {
  const { canvas, ctx } = makeCanvas(512, 1024);
  const g = ctx.createLinearGradient(0, 0, 0, 1024);
  g.addColorStop(0, '#111019');
  g.addColorStop(1, '#07070b');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 1024);
  // Synthwave sun with cut lines near the top-front.
  ctx.save();
  ctx.beginPath();
  ctx.arc(330, 300, 120, 0, Math.PI * 2);
  ctx.clip();
  const sun = ctx.createLinearGradient(0, 180, 0, 420);
  sun.addColorStop(0, mixWithWhite(color, 0.25));
  sun.addColorStop(1, withAlpha(color, 0.15));
  ctx.fillStyle = sun;
  ctx.fillRect(200, 170, 260, 260);
  ctx.fillStyle = '#0d0c14';
  for (let i = 0; i < 7; i++) ctx.fillRect(200, 320 + i * 16, 260, 3 + i * 1.6);
  ctx.restore();
  // Diagonal speed stripes.
  const stripes = [[0, 1, 64], [1, 0.55, 30], [2, 0.3, 14]];
  for (const [i, alpha, width] of stripes) {
    ctx.fillStyle = withAlpha(color, alpha);
    ctx.beginPath();
    const y0 = 1000 - i * 92;
    ctx.moveTo(512, y0 - 300);
    ctx.lineTo(512, y0 - 300 + width);
    ctx.lineTo(0, y0 - 60 + width);
    ctx.lineTo(0, y0 - 60);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let y = 0; y < 1024; y += 8) ctx.fillRect(0, y, 512, 1);
  const texture = canvasTexture(canvas);
  // Extrude caps use profile coordinates as UVs.
  texture.repeat.set(1 / 0.92, 1 / 1.9);
  texture.offset.set(0.42 / 0.92, 0);
  return texture;
}

function marqueeTexture(text, color) {
  const { canvas, ctx } = makeCanvas(1024, 400);
  const g = ctx.createLinearGradient(0, 0, 0, 400);
  g.addColorStop(0, withAlpha(color, 0.28));
  g.addColorStop(0.5, '#08080d');
  g.addColorStop(1, withAlpha(color, 0.22));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 400);
  ctx.strokeStyle = withAlpha(color, 0.5);
  ctx.lineWidth = 6;
  ctx.strokeRect(14, 14, 996, 372);
  const size = Math.min(96, Math.floor(880 / (text.length * 0.95)));
  drawNeonText(ctx, text, 512, 196, { color, font: PIXEL_FONT, size });
  ctx.font = `34px ${CRT_FONT}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.fillText('GAWI.NO  ·  PORTFOLIO', 512, 340);
  return canvasTexture(canvas, { anisotropy: 8 });
}

function panelTexture(color) {
  const { canvas, ctx } = makeCanvas(512, 208);
  ctx.fillStyle = '#0d0d13';
  ctx.fillRect(0, 0, 512, 208);
  ctx.fillStyle = withAlpha(color, 0.85);
  ctx.fillRect(0, 0, 512, 10);
  ctx.fillRect(0, 198, 512, 10);
  ctx.fillStyle = withAlpha(color, 0.18);
  for (let i = 0; i < 12; i++) ctx.fillRect(i * 48 - 20, 10, 18, 188);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = `22px ${PIXEL_FONT}`;
  ctx.fillText('1P', 18, 52);
  ctx.font = `30px ${CRT_FONT}`;
  ctx.fillText('START', 412, 44);
  return canvasTexture(canvas);
}

function bezelTexture(color) {
  const { canvas, ctx } = makeCanvas(512, 372);
  ctx.fillStyle = '#060608';
  ctx.fillRect(0, 0, 512, 372);
  const g = ctx.createLinearGradient(0, 0, 0, 372);
  g.addColorStop(0, 'rgba(255,255,255,0.05)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 372);
  ctx.strokeStyle = withAlpha(color, 0.45);
  ctx.lineWidth = 3;
  ctx.strokeRect(36, 22, 440, 328);
  ctx.fillStyle = withAlpha(color, 0.7);
  ctx.font = `20px ${CRT_FONT}`;
  ctx.fillText('HIGH SCORE TO BEAT', 40, 368);
  return canvasTexture(canvas);
}

function coinDoorTexture() {
  const { canvas, ctx } = makeCanvas(256, 320);
  const g = ctx.createLinearGradient(0, 0, 256, 320);
  g.addColorStop(0, '#3a3d45');
  g.addColorStop(1, '#22242a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 320);
  ctx.strokeStyle = '#4d515b';
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, 240, 304);
  ctx.fillStyle = '#16171b';
  ctx.fillRect(56, 60, 40, 70);
  ctx.fillRect(160, 60, 40, 70);
  ctx.fillStyle = '#d9dbe0';
  ctx.font = `20px ${PIXEL_FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('25¢', 76, 170);
  ctx.fillText('25¢', 180, 170);
  ctx.font = `30px ${CRT_FONT}`;
  ctx.fillText('INSERT COIN', 128, 240);
  ctx.fillStyle = '#5c606b';
  for (const [x, y] of [[22, 22], [234, 22], [22, 298], [234, 298]]) {
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvasTexture(canvas);
}

export class Cabinet {
  constructor({ id, label, marquee, color, screen, interactive = true, condition = 1 }) {
    const res = sharedResources();
    this.id = id;
    this.label = label;
    this.color = color;
    this.interactive = interactive;
    this.condition = condition;
    this.hover = 0;
    this.hoverTarget = 0;
    this.focus = 0;
    this.focusTarget = 0;
    this.dim = 0;
    this.dimTarget = 0;
    this.lit = 0;
    this.seed = Math.random() * 100;

    const group = new THREE.Group();
    group.name = `cabinet-${id}`;
    this.group = group;

    const body = new THREE.Mesh(res.body, res.bodyMat);
    group.add(body);

    const art = new THREE.MeshPhysicalMaterial({
      map: sideArtTexture(color),
      roughness: 0.42,
      metalness: 0.05,
      clearcoat: 1,
      clearcoatRoughness: 0.18,
    });
    for (const side of [-1, 1]) {
      const panel = new THREE.Mesh(res.side, [art, res.edgeMat]);
      panel.position.x = side * (BODY_W / 2 + SIDE_T / 2);
      group.add(panel);
    }

    // Neon T-molding along each side panel's edge.
    const path = new THREE.CurvePath();
    for (let i = 0; i < TRIM_PATH.length - 1; i++) {
      const a = P[TRIM_PATH[i]];
      const b = P[TRIM_PATH[i + 1]];
      path.add(new THREE.LineCurve3(new THREE.Vector3(0, a[1], a[0]), new THREE.Vector3(0, b[1], b[0])));
    }
    const trimGeometry = new THREE.TubeGeometry(path, 260, 0.0125, 6, false);
    this.trimMat = glowMaterial(color, 0);
    for (const side of [-1, 1]) {
      const trim = new THREE.Mesh(trimGeometry, this.trimMat);
      trim.position.x = side * (BODY_W / 2 + SIDE_T / 2);
      group.add(trim);
    }

    // Screen bezel and tube.
    const screenFrame = segmentFrame('cpBack', 'screenTop');
    const bezel = new THREE.Mesh(
      new THREE.PlaneGeometry(BODY_W - 0.004, screenFrame.length),
      new THREE.MeshStandardMaterial({ map: bezelTexture(color), roughness: 0.25, metalness: 0.1 }),
    );
    group.add(placeOn(bezel, screenFrame, 0.002));

    this.screen = new ArcadeScreen({ type: screen, color, label });
    this.crtMat = createCrtMaterial(this.screen.texture, color);
    this.crtMat.uniforms.power.value = 0;
    this.crt = placeOn(new THREE.Mesh(res.crt, this.crtMat), screenFrame, 0.004);
    group.add(this.crt);

    // Marquee: back-lit sign over the screen.
    const marqueeFrame = segmentFrame('hoodFront', 'marqueeTop');
    this.marqueeMat = glowMaterial('#ffffff', 0, { map: marqueeTexture(marquee, color) });
    group.add(placeOn(new THREE.Mesh(new THREE.PlaneGeometry(BODY_W, marqueeFrame.length), this.marqueeMat), marqueeFrame, 0.003));

    // Control panel with joystick and buttons.
    const cpFrame = segmentFrame('cpFrontTop', 'cpBack');
    const deck = placeOn(new THREE.Group(), cpFrame, 0.002);
    group.add(deck);
    deck.add(new THREE.Mesh(new THREE.PlaneGeometry(BODY_W, cpFrame.length), new THREE.MeshStandardMaterial({ map: panelTexture(color), roughness: 0.38, metalness: 0.1 })));
    this.stick = new THREE.Group();
    this.stick.position.set(-0.19, -0.01, 0);
    const ballMat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.1 });
    this.stick.add(new THREE.Mesh(res.stickShaft, res.metal), new THREE.Mesh(res.stickBall, ballMat));
    deck.add(new THREE.Mesh(res.stickBase, res.black).translateX(-0.19).translateY(-0.01), this.stick);
    const buttonColors = [color, '#ffffff', color, '#ffffff', color, mixWithWhite(color, 0.5)];
    this.buttonMats = [];
    buttonColors.forEach((c, i) => {
      const mat = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.35, roughness: 0.3 });
      this.buttonMats.push(mat);
      const x = -0.03 + (i % 3) * 0.075;
      const y = i < 3 ? 0.035 : -0.04;
      const ring = new THREE.Mesh(res.buttonRing, res.black);
      ring.position.set(x, y, 0);
      const button = new THREE.Mesh(res.button, mat);
      button.position.set(x, y, 0);
      deck.add(ring, button);
    });
    const startMat = glowMaterial('#ffffff', 0.6);
    this.startMat = startMat;
    const start = new THREE.Mesh(res.button, startMat);
    start.scale.setScalar(0.6);
    start.position.set(0.3, 0.075, 0);
    deck.add(start);

    // Coin door with glowing slots.
    const coin = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.3), new THREE.MeshStandardMaterial({ map: coinDoorTexture(), metalness: 0.6, roughness: 0.38 }));
    coin.position.set(0, 0.5, P.kickTop[0] + 0.002);
    group.add(coin);
    this.slotMat = glowMaterial('#ff3b2f', 0);
    for (const x of [-0.051, 0.047]) {
      const slot = new THREE.Mesh(new THREE.PlaneGeometry(0.012, 0.042), this.slotMat);
      slot.position.set(x, 0.557, P.kickTop[0] + 0.004);
      group.add(slot);
    }

    // Coloured spill from the screen onto the floor and neighbours.
    this.light = new THREE.PointLight(color, 0, 4.2, 2);
    this.light.position.set(0, 1.3, 0.85);
    group.add(this.light);

    // Generous hit box so the whole cabinet is a target.
    this.hitbox = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.98, 1.05), new THREE.MeshBasicMaterial({ visible: false }));
    this.hitbox.position.set(0, 0.99, 0.04);
    this.hitbox.userData.cabinet = this;
    group.add(this.hitbox);

    this.group.traverse((o) => {
      o.updateMatrix();
      o.matrixAutoUpdate = o === this.group || o === this.stick;
    });
  }

  /** World-space centre, outward normal, up vector and size of the screen. */
  getScreenFrame() {
    this.group.updateMatrixWorld(true);
    const m = this.crt.matrixWorld;
    return {
      center: new THREE.Vector3(0, 0, 0.012).applyMatrix4(m),
      normal: new THREE.Vector3(0, 0, 1).transformDirection(m),
      up: new THREE.Vector3(0, 1, 0).transformDirection(m),
      width: SCREEN_W,
      height: SCREEN_H,
    };
  }

  /** Point above the marquee, for the floating label. */
  getLabelAnchor(target) {
    return target.set(0, 2.08, 0.25).applyMatrix4(this.group.matrixWorld);
  }

  update(time, dt, drawScreen) {
    const k = 1 - Math.exp(-dt * 7);
    this.hover += (this.hoverTarget - this.hover) * k;
    this.focus += (this.focusTarget - this.focus) * (1 - Math.exp(-dt * 3.5));
    this.dim += (this.dimTarget - this.dim) * (1 - Math.exp(-dt * 3));

    const lit = this.lit;
    // Worn cabinets misbehave now and then.
    let fault = 1;
    if (this.condition < 1) {
      const n = Math.sin(time * 13.1 + this.seed) * Math.sin(time * 7.3 + this.seed * 2);
      if (n > this.condition) fault = 0.25;
    }
    const dim = 1 - this.dim * 0.55;
    const trim = lit * fault * dim * (1.25 + this.hover * 1.1 + this.focus * 1.6);
    setGlow(this.trimMat, trim);
    const marqueeFlicker = this.hover > 0.05 ? 0.92 + 0.08 * Math.sin(time * 40) : 1;
    setGlow(this.marqueeMat, lit * fault * dim * (1.15 + this.hover * 0.45 + this.focus * 0.4) * marqueeFlicker);
    setGlow(this.slotMat, lit * (2 + Math.sin(time * 2 + this.seed) * 0.8));
    setGlow(this.startMat, lit * (this.hover > 0.3 && Math.sin(time * 9) > 0 ? 2.2 : 0.7));
    this.buttonMats.forEach((m) => (m.emissiveIntensity = lit * (0.35 + this.hover * 0.6)));
    this.crtMat.uniforms.time.value = time;
    this.crtMat.uniforms.brightness.value = 1.5 * (1 + this.hover * 0.22 + this.focus * 0.15) * (1 - this.dim * 0.5);
    this.light.intensity = lit * fault * dim * (1.3 + this.hover * 1.4 + this.focus * 1.4);

    // The joystick twitches as if someone is playing when hovered.
    const wiggle = this.hover;
    this.stick.rotation.x = Math.sin(time * 6.1 + this.seed) * 0.25 * wiggle;
    this.stick.rotation.y = Math.sin(time * 4.3 + this.seed * 3) * 0.25 * wiggle;
    this.stick.updateMatrix();

    if (drawScreen) this.screen.draw(time);
  }

  /** Emissive output for the floor's fake light pools. */
  get glowLevel() {
    return this.lit * (1 - this.dim * 0.55) * (1 + this.hover * 0.8 + this.focus * 0.8);
  }
}
