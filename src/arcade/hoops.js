import * as THREE from 'three';
import { glowMaterial, setGlow } from './materials.js';
import { makeCanvas, canvasTexture, drawNeonText, withAlpha, PIXEL_FONT, CRT_FONT } from './textures.js';

/*
 * A pop-a-shot basketball machine: a sloped lane with nets, a backboard, a rim and
 * a scoreboard. Balls are simulated with a small hand-written physics step (gravity,
 * sloped floor, walls, rim torus, ball-to-ball), which is all this needs.
 * Everything is in the machine's local space: the player stands at +z, the hoop is at -z.
 */

const GRAVITY = 9.81;
const BALL_R = 0.115;
const BALLS = 5;
const GAME_TIME = 45;
const COLOR = '#ff8a3d';
const HI_KEY = 'gawi-hoops-hi';

const RIM = { center: new THREE.Vector3(0, 2.28, -2.27), radius: 0.215, tube: 0.013 };
const LANE = { halfW: 0.6, lip: -0.04, front: -0.55, back: -2.55, trayY: 0.9, frontY: 0.92, backY: 1.32, roof: 3.3 };
const LANE_SLOPE = (LANE.backY - LANE.frontY) / (LANE.front - LANE.back);
const HAND = new THREE.Vector3(0.08, 1.44, 0.5);
const LAUNCH_ANGLE = THREE.MathUtils.degToRad(61);
const SUBSTEP = 1 / 240;

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _q = new THREE.Vector3();

function readHi() {
  try {
    return Number(localStorage.getItem(HI_KEY)) || 0;
  } catch {
    return 0;
  }
}

function ballTexture() {
  const { canvas, ctx } = makeCanvas(256, 128);
  ctx.fillStyle = '#d4581c';
  ctx.fillRect(0, 0, 256, 128);
  // Pebbled leather.
  for (let i = 0; i < 1800; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,190,140,0.12)' : 'rgba(60,20,0,0.14)';
    ctx.fillRect(Math.random() * 256, Math.random() * 128, 1.5, 1.5);
  }
  ctx.strokeStyle = '#1a0d06';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 64);
  ctx.lineTo(256, 64);
  for (const x of [64, 192]) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 128);
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(128, 64, 40, 64, 0, 0, Math.PI * 2);
  ctx.stroke();
  return canvasTexture(canvas);
}

function netTexture() {
  const { canvas, ctx } = makeCanvas(128, 128);
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 3;
  for (let i = -128; i < 256; i += 16) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 128, 128);
    ctx.moveTo(i + 128, 0);
    ctx.lineTo(i, 128);
    ctx.stroke();
  }
  const t = canvasTexture(canvas, { srgb: false });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function cageTexture() {
  const { canvas, ctx } = makeCanvas(128, 128);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 128; i += 16) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 128);
    ctx.moveTo(0, i);
    ctx.lineTo(128, i);
    ctx.stroke();
  }
  const t = canvasTexture(canvas, { srgb: false });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function backboardTexture() {
  const { canvas, ctx } = makeCanvas(512, 340);
  ctx.fillStyle = 'rgba(8, 10, 16, 0.92)';
  ctx.fillRect(0, 0, 512, 340);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 10;
  ctx.strokeRect(10, 10, 492, 320);
  ctx.strokeStyle = COLOR;
  ctx.lineWidth = 8;
  ctx.strokeRect(176, 150, 160, 120);
  return canvasTexture(canvas);
}

function sidePanelTexture() {
  const { canvas, ctx } = makeCanvas(512, 256);
  const g = ctx.createLinearGradient(0, 0, 512, 0);
  g.addColorStop(0, '#120b08');
  g.addColorStop(1, '#0a0a10');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = withAlpha(COLOR, 0.65 - i * 0.12);
    ctx.beginPath();
    ctx.moveTo(i * 70, 256);
    ctx.lineTo(i * 70 + 26, 256);
    ctx.lineTo(i * 70 + 200, 0);
    ctx.lineTo(i * 70 + 174, 0);
    ctx.fill();
  }
  drawNeonText(ctx, 'HOOP FEVER', 330, 150, { color: '#ffd166', font: PIXEL_FONT, size: 36 });
  return canvasTexture(canvas);
}

export class HoopsMachine {
  constructor() {
    this.id = 'hoops';
    this.kind = 'hoops';
    this.label = 'Hoops';
    this.color = COLOR;
    this.interactive = true;
    this.lit = 0;
    this.hover = 0;
    this.hoverTarget = 0;
    this.focus = 0;
    this.focusTarget = 0;
    this.dim = 0;
    this.dimTarget = 0;
    this.mode = 'attract';
    this.score = 0;
    this.hi = readHi();
    this.timeLeft = GAME_TIME;
    this.running = false;
    this.flash = 0;
    this.netKick = 0;
    this.demoTimer = 2.5;
    this.aimX = 0;
    this.charging = false;
    this.chargeTime = 0;
    this.power = 0;
    this.held = null;
    this.events = {};
    this.boardDirty = true;
    this.boardClock = 0;
    this.overTime = 0;
    this.queuedShot = null;

    const group = new THREE.Group();
    group.name = 'hoops';
    this.group = group;

    const body = new THREE.MeshStandardMaterial({ color: '#0d0c12', roughness: 0.55, metalness: 0.25 });
    const dark = new THREE.MeshStandardMaterial({ color: '#07070a', roughness: 0.8 });
    const metal = new THREE.MeshStandardMaterial({ color: '#8b9099', roughness: 0.3, metalness: 0.9 });
    const laneMat = new THREE.MeshStandardMaterial({ color: '#2a1a12', roughness: 0.5, metalness: 0.1 });
    this.trimMat = glowMaterial(COLOR, 0);
    this.blueMat = glowMaterial('#4cc9ff', 0);

    // Front console with the ball tray.
    const consoleBox = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.86, 0.6), body);
    consoleBox.position.set(0, 0.43, -0.3);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.16, 0.05), body);
    lip.position.set(0, 0.94, -0.015);
    const tray = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.52), laneMat);
    tray.rotation.x = -Math.PI / 2 + Math.atan(0.06);
    tray.position.set(0, LANE.trayY - ((LANE.lip - LANE.front) / 2) * 0.06 - 0.004, (LANE.lip + LANE.front) / 2);
    group.add(consoleBox, lip, tray);

    // Front face: neon title strip and coin slot.
    const faceArt = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), new THREE.MeshStandardMaterial({ map: sidePanelTexture(), roughness: 0.4 }));
    faceArt.position.set(0, 0.48, 0.002);
    group.add(faceArt);
    const frontStrip = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.025, 0.025), this.trimMat);
    frontStrip.position.set(0, 1.02, 0.01);
    group.add(frontStrip);

    // Lane body and sloped playing surface.
    const laneLen = LANE.front - LANE.back;
    const under = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.9, laneLen), body);
    under.position.set(0, 0.45, (LANE.front + LANE.back) / 2);
    const lane = new THREE.Mesh(new THREE.PlaneGeometry(1.2, Math.hypot(laneLen, LANE.backY - LANE.frontY)), laneMat);
    lane.rotation.x = -Math.PI / 2 + Math.atan(LANE_SLOPE);
    lane.position.set(0, (LANE.frontY + LANE.backY) / 2 - 0.004, (LANE.front + LANE.back) / 2);
    group.add(under, lane);
    // Lane stripes glow faintly.
    for (const x of [-0.2, 0.2]) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.02, Math.hypot(laneLen, LANE.backY - LANE.frontY) - 0.1), this.blueMat);
      stripe.rotation.copy(lane.rotation);
      stripe.position.copy(lane.position).add(new THREE.Vector3(x, 0.003, 0));
      group.add(stripe);
    }

    // Side walls: solid lower panels with art, netting above.
    const sideShape = new THREE.Shape();
    sideShape.moveTo(0.02, 0);
    sideShape.lineTo(0.02, 1.08);
    sideShape.lineTo(-0.6, 1.2);
    sideShape.lineTo(-2.62, 1.75);
    sideShape.lineTo(-2.62, 0);
    sideShape.closePath();
    const sideGeometry = new THREE.ExtrudeGeometry(sideShape, { depth: 0.03, bevelEnabled: false });
    // Shape is in (z, y); turn it so it stands in the y/z plane.
    sideGeometry.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1));
    const cageTex = cageTexture();
    const cageMat = new THREE.MeshBasicMaterial({ map: cageTex, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, color: '#c9d2e0' });
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(sideGeometry, body);
      side.position.x = s * 0.66 - 0.015;
      group.add(side);
      // Neon along the top edge of the side panel.
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 2.1), this.trimMat);
      const angle = Math.atan2(1.75 - 1.2, 2.62 - 0.6);
      edge.position.set(s * 0.66, (1.2 + 1.75) / 2 + 0.02, (-0.6 - 2.62) / 2);
      edge.rotation.x = angle;
      group.add(edge);
      const net = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.8), cageMat);
      net.material.map.repeat.set(12, 9);
      net.rotation.y = Math.PI / 2;
      net.position.set(s * 0.66, 2.4, -1.6);
      group.add(net);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.3, 0.04), metal);
      post.position.set(s * 0.66, 2.15, -0.58);
      group.add(post);
    }
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(1.32, 2.1), cageMat);
    roof.rotation.x = Math.PI / 2;
    roof.position.set(0, LANE.roof, -1.6);
    group.add(roof);
    const roofBar = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.04, 0.04), metal);
    roofBar.position.set(0, LANE.roof, -0.58);
    group.add(roofBar);

    // Back tower, backboard, rim and net.
    const tower = new THREE.Mesh(new THREE.BoxGeometry(1.32, 3.3, 0.12), body);
    tower.position.set(0, 1.65, LANE.back - 0.1);
    group.add(tower);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.65), new THREE.MeshStandardMaterial({ map: backboardTexture(), roughness: 0.15, metalness: 0.1 }));
    board.position.set(0, 2.55, LANE.back + 0.002);
    this.boardMat = board.material;
    group.add(board);
    const boardEdge = glowMaterial('#ffffff', 0);
    this.boardEdge = boardEdge;
    for (const [w, h, x, y] of [[1.0, 0.02, 0, 2.885], [1.0, 0.02, 0, 2.215], [0.02, 0.69, -0.495, 2.55], [0.02, 0.69, 0.495, 2.55]]) {
      const e = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.02), boardEdge);
      e.position.set(x, y, LANE.back + 0.01);
      group.add(e);
    }
    const rimMat = new THREE.MeshStandardMaterial({ color: '#ff5a1f', emissive: '#ff4a10', emissiveIntensity: 0.25, roughness: 0.35, metalness: 0.6 });
    this.rimMat = rimMat;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(RIM.radius, RIM.tube, 10, 40), rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.copy(RIM.center);
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.03, RIM.center.z - LANE.back - RIM.radius + 0.01), rimMat);
    bracket.position.set(0, RIM.center.y, (LANE.back + RIM.center.z - RIM.radius) / 2);
    group.add(rim, bracket);
    const netGeometry = new THREE.CylinderGeometry(RIM.radius, RIM.radius * 0.62, 0.36, 20, 4, true);
    netGeometry.translate(0, -0.18, 0);
    this.netBase = netGeometry.attributes.position.array.slice();
    const netTex = netTexture();
    netTex.repeat.set(5, 2);
    this.net = new THREE.Mesh(netGeometry, new THREE.MeshBasicMaterial({ map: netTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, color: '#e8ecf5' }));
    this.net.position.copy(RIM.center);
    group.add(this.net);

    // Scoreboard on top.
    const { canvas, ctx } = makeCanvas(640, 256);
    this.board = { canvas, ctx, texture: canvasTexture(canvas, { anisotropy: 8 }) };
    this.boardGlow = glowMaterial('#ffffff', 0, { map: this.board.texture });
    const scoreboard = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.5, 0.14), body);
    scoreboard.position.set(0, 3.0, LANE.back - 0.04);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.26, 0.45), this.boardGlow);
    face.position.set(0, 3.0, LANE.back + 0.035);
    group.add(scoreboard, face);

    // Ticket dispenser on the console.
    const dispenser = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.08), metal);
    dispenser.position.set(0.5, 0.78, 0.04);
    group.add(dispenser);
    const ticketMat = new THREE.MeshStandardMaterial({ color: '#ffd166', emissive: '#ffb020', emissiveIntensity: 0.2, roughness: 0.8, side: THREE.DoubleSide });
    this.tickets = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 1).translate(0, -0.5, 0), ticketMat);
    this.tickets.position.set(0.5, 0.73, 0.085);
    this.tickets.scale.y = 0.02;
    this.ticketLen = 0.02;
    group.add(this.tickets);

    // Balls.
    const ballGeometry = new THREE.SphereGeometry(BALL_R, 24, 16);
    const ballMat = new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.75, metalness: 0 });
    this.balls = Array.from({ length: BALLS }, (_, i) => {
      const mesh = new THREE.Mesh(ballGeometry, ballMat);
      const ball = { mesh, p: new THREE.Vector3(), v: new THREE.Vector3(), state: 'loose', prevY: 0, scored: false, age: 0 };
      this.placeInTray(ball, i);
      group.add(mesh);
      return ball;
    });

    // Aim marker: a faint ring on the backboard that tracks the aim.
    this.aimMarker = new THREE.Mesh(new THREE.RingGeometry(0.035, 0.05, 24), glowMaterial('#ffffff', 0, { transparent: true, depthWrite: false }));
    this.aimMarker.position.set(0, RIM.center.y + 0.18, LANE.back + 0.02);
    this.aimMarker.visible = false;
    group.add(this.aimMarker);

    // Hit box for hover and click.
    this.hitbox = new THREE.Mesh(new THREE.BoxGeometry(1.45, 3.35, 2.75), new THREE.MeshBasicMaterial({ visible: false }));
    this.hitbox.position.set(0, 1.67, -1.3);
    this.hitbox.userData.cabinet = this;
    group.add(this.hitbox);

    this.drawBoard(0);
  }

  on(name, fn) {
    this.events[name] = fn;
  }

  emit(name, ...args) {
    this.events[name]?.(...args);
  }

  placeInTray(ball, i = Math.random() * BALLS) {
    ball.p.set(-0.46 + (i % BALLS) * 0.23, LANE.trayY + BALL_R + 0.02, -0.2 - Math.floor(i / BALLS) * 0.24);
    ball.v.set(0, 0, 0);
    ball.state = 'loose';
    ball.scored = false;
    ball.age = 0;
    ball.mesh.position.copy(ball.p);
  }

  /** World-space pose for the camera when playing. */
  shootPose() {
    this.group.updateMatrixWorld(true);
    const m = this.group.matrixWorld;
    return {
      position: new THREE.Vector3(0, 1.74, 1.45).applyMatrix4(m),
      target: new THREE.Vector3(0, 2.0, RIM.center.z).applyMatrix4(m),
      fov: 54,
      approach: new THREE.Vector3(0, 1.8, 2.6).applyMatrix4(m),
    };
  }

  getLabelAnchor(target) {
    return target.set(0, 3.45, -1.0).applyMatrix4(this.group.matrixWorld);
  }

  get glowLevel() {
    return this.lit * (1 + this.hover * 0.8 + this.flash * 0.8);
  }

  // ------------------------------------------------------------ Game control
  enter() {
    this.mode = 'play';
    this.running = false;
    this.score = 0;
    this.timeLeft = GAME_TIME;
    this.aimX = 0;
    this.boardDirty = true;
    this.aimMarker.visible = true;
    this.emitState();
  }

  exit() {
    this.mode = 'attract';
    this.running = false;
    this.charging = false;
    this.aimMarker.visible = false;
    if (this.held) {
      this.held.state = 'loose';
      this.held = null;
    }
    this.demoTimer = 3;
    this.boardDirty = true;
  }

  emitState() {
    this.emit('state', { score: this.score, time: Math.ceil(this.timeLeft), hi: this.hi, running: this.running, over: this.mode === 'over', power: this.power, charging: this.charging });
  }

  setAim(x) {
    this.aimX = THREE.MathUtils.clamp(x, -0.5, 0.5);
  }

  nudgeAim(dx) {
    this.setAim(this.aimX + dx);
  }

  beginCharge() {
    if (this.mode === 'over') {
      if (this.overTime > 1.2) this.enter();
      else return;
    }
    if (this.mode !== 'play' || this.charging) return;
    this.charging = true;
    this.chargeTime = 0;
  }

  release() {
    if (!this.charging) return;
    this.charging = false;
    if (!this.held || this.held.state !== 'held') {
      this.queuedShot = this.power;
      return;
    }
    if (!this.running) {
      this.running = true;
      this.score = 0;
      this.timeLeft = GAME_TIME;
      this.emit('start');
    }
    this.shoot(this.held, this.power, this.aimX);
    this.held = null;
  }

  /** Launch speed that drops the ball through the rim at the ideal power. */
  shoot(ball, power, aimX) {
    // Forgiving sweet spot around the middle of the meter, and a little aim assist.
    let factor = 0.84 + 0.32 * power;
    if (Math.abs(power - 0.5) < 0.08) factor = 1 + (factor - 1) * 0.25;
    const aim = Math.sign(aimX) * Math.max(0, Math.abs(aimX) - 0.06);
    const target = _q.set(aim, RIM.center.y, RIM.center.z - 0.03);
    const from = ball.p;
    const dx = target.x - from.x;
    const dz = target.z - from.z;
    const d = Math.hypot(dx, dz);
    const dy = target.y - from.y;
    const tan = Math.tan(LAUNCH_ANGLE);
    const cos = Math.cos(LAUNCH_ANGLE);
    const speed = Math.sqrt((GRAVITY * d * d) / (2 * cos * cos * (d * tan - dy))) * factor;
    ball.v.set((dx / d) * speed * cos, speed * Math.sin(LAUNCH_ANGLE), (dz / d) * speed * cos);
    ball.state = 'loose';
    ball.scored = false;
    ball.age = 0;
    this.emit('throw');
  }

  pickBall() {
    let best = null;
    for (const ball of this.balls) {
      if (ball.state !== 'loose' || ball.p.z < LANE.front - 0.05 || ball.p.z > 0.05 || ball.v.lengthSq() > 0.5) continue;
      if (!best || ball.p.z > best.p.z) best = ball;
    }
    if (!best) return;
    best.state = 'lifting';
    best.liftFrom = best.p.clone();
    best.lift = 0;
    this.held = best;
  }

  // ------------------------------------------------------------ Simulation
  step(dt) {
    const balls = this.balls;
    for (const ball of balls) {
      if (ball.state !== 'loose') continue;
      ball.age += dt;
      ball.prevY = ball.p.y;
      ball.v.y -= GRAVITY * dt;
      ball.p.addScaledVector(ball.v, dt);
      this.collide(ball, dt);
      // Score: dropping down through the ring.
      const horizontal = Math.hypot(ball.p.x - RIM.center.x, ball.p.z - RIM.center.z);
      if (!ball.scored && ball.prevY >= RIM.center.y && ball.p.y < RIM.center.y && ball.v.y < 0 && horizontal < RIM.radius - BALL_R * 0.25) {
        ball.scored = true;
        this.onScore();
      }
      // The net catches and slows the ball.
      if (horizontal < RIM.radius + 0.02 && ball.p.y < RIM.center.y && ball.p.y > RIM.center.y - 0.4) {
        const k = Math.exp(-dt * 5);
        ball.v.x *= k;
        ball.v.z *= k;
        ball.v.y *= Math.exp(-dt * 2.5);
        this.netKick = Math.min(1, this.netKick + dt * 6);
      }
      if (ball.p.y < 0.3 || ball.p.z > 1.6 || ball.p.z < -3 || Math.abs(ball.p.x) > 1.5 || ball.age > 12) this.placeInTray(ball);
    }
    // Ball against ball.
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      if (a.state !== 'loose') continue;
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j];
        if (b.state !== 'loose') continue;
        _n.subVectors(a.p, b.p);
        const dist = _n.length();
        if (dist >= BALL_R * 2 || dist < 1e-6) continue;
        _n.divideScalar(dist);
        const push = (BALL_R * 2 - dist) / 2;
        a.p.addScaledVector(_n, push);
        b.p.addScaledVector(_n, -push);
        const rel = _v.subVectors(a.v, b.v).dot(_n);
        if (rel < 0) {
          const impulse = -(1 + 0.6) * rel / 2;
          a.v.addScaledVector(_n, impulse);
          b.v.addScaledVector(_n, -impulse);
        }
      }
    }
  }

  bounce(ball, normal, restitution, friction, dt) {
    const vn = ball.v.dot(normal);
    if (vn < 0) {
      ball.v.addScaledVector(normal, -(1 + restitution) * vn);
      if (-vn > 1.2) this.emit('bounce', Math.min(1, -vn / 6));
    }
    // Rolling friction on the tangent.
    const tangent = _v.copy(ball.v).addScaledVector(normal, -ball.v.dot(normal));
    ball.v.addScaledVector(tangent, -Math.min(1, friction * dt));
  }

  collide(ball, dt) {
    const p = ball.p;
    // Sloped lane and tray (both descend towards the player).
    if (p.z < LANE.lip && Math.abs(p.x) < LANE.halfW + 0.05) {
      const inTray = p.z > LANE.front;
      const slope = inTray ? 0.06 : LANE_SLOPE;
      const y0 = inTray ? LANE.trayY : LANE.frontY + (LANE.front - p.z) * LANE_SLOPE;
      const surfaceY = inTray ? y0 - (p.z - LANE.front) * slope : y0;
      _n.set(0, 1, slope).normalize();
      const dist = (p.y - surfaceY) * _n.y;
      if (dist < BALL_R && dist > -0.3) {
        p.addScaledVector(_n, BALL_R - dist);
        this.bounce(ball, _n, 0.45, 1.6, dt);
      }
    }
    // Front lip of the tray.
    if (p.z > LANE.lip - BALL_R && p.z < LANE.lip + 0.06 && p.y < 1.02 + BALL_R * 0.5 && ball.v.z > 0) {
      p.z = LANE.lip - BALL_R;
      ball.v.z *= -0.3;
    }
    // Side walls and nets.
    if (p.z < 0) {
      for (const s of [-1, 1]) {
        if (s * p.x > LANE.halfW - BALL_R) {
          p.x = s * (LANE.halfW - BALL_R);
          _n.set(-s, 0, 0);
          this.bounce(ball, _n, 0.5, 0.5, dt);
        }
      }
    }
    // Back wall and backboard.
    if (p.z < LANE.back + BALL_R) {
      p.z = LANE.back + BALL_R;
      _n.set(0, 0, 1);
      this.bounce(ball, _n, 0.62, 0.4, dt);
    }
    // Roof net.
    if (p.y > LANE.roof - BALL_R && p.z < -0.55) {
      p.y = LANE.roof - BALL_R;
      _n.set(0, -1, 0);
      this.bounce(ball, _n, 0.3, 0.5, dt);
    }
    // Rim: a torus. Find the closest point on the ring's centre circle.
    const rx = p.x - RIM.center.x;
    const rz = p.z - RIM.center.z;
    const rl = Math.hypot(rx, rz) || 1e-6;
    _q.set(RIM.center.x + (rx / rl) * RIM.radius, RIM.center.y, RIM.center.z + (rz / rl) * RIM.radius);
    _n.subVectors(p, _q);
    const d = _n.length();
    if (d < BALL_R + RIM.tube && d > 1e-6) {
      _n.divideScalar(d);
      p.addScaledVector(_n, BALL_R + RIM.tube - d);
      const vn = ball.v.dot(_n);
      if (vn < 0) {
        ball.v.addScaledVector(_n, -(1 + 0.5) * vn);
        ball.v.multiplyScalar(0.92);
        if (-vn > 0.6) this.emit('rim', Math.min(1, -vn / 5));
      }
    }
    // Bracket between rim and backboard.
    if (Math.abs(p.x) < 0.04 + BALL_R && p.z < RIM.center.z - RIM.radius && Math.abs(p.y - RIM.center.y) < BALL_R + 0.015) {
      p.y = RIM.center.y + Math.sign(p.y - RIM.center.y || 1) * (BALL_R + 0.015);
      ball.v.y *= -0.4;
    }
  }

  onScore() {
    this.flash = 1;
    this.netKick = 1;
    this.ticketLen = Math.min(0.45, this.ticketLen + 0.04);
    if (this.mode === 'play' && this.running) {
      this.score += 2;
      this.boardDirty = true;
      this.emitState();
    }
    this.emit('score', this.mode === 'play');
  }

  endGame() {
    this.running = false;
    this.mode = 'over';
    this.overTime = 0;
    this.charging = false;
    const best = this.score > this.hi;
    if (best) {
      this.hi = this.score;
      try {
        localStorage.setItem(HI_KEY, String(this.hi));
      } catch {
        // Not remembered; fine.
      }
    }
    this.boardDirty = true;
    this.emit('over', { score: this.score, best });
    this.emitState();
  }

  // ------------------------------------------------------------ Scoreboard
  drawBoard(time) {
    const { canvas, ctx, texture } = this.board;
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = '#050407';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = withAlpha(COLOR, 0.6);
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    drawNeonText(ctx, 'HOOP FEVER', w / 2, 46, { color: COLOR, font: PIXEL_FONT, size: 34 });
    const digits = (value, x, label, color) => {
      ctx.font = `20px ${PIXEL_FONT}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText(label, x, 110);
      ctx.fillStyle = 'rgba(255,60,40,0.12)';
      ctx.font = `64px ${PIXEL_FONT}`;
      ctx.fillText('88', x, 200);
      drawNeonText(ctx, value, x, 175, { color, font: PIXEL_FONT, size: 64 });
    };
    if (this.mode === 'attract') {
      digits(String(this.hi).padStart(2, '0'), 140, 'BEST', '#4cc9ff');
      ctx.textAlign = 'center';
      if (Math.floor(time * 1.4) % 2 === 0) drawNeonText(ctx, 'PLAY!', 450, 160, { color: '#ffd166', font: PIXEL_FONT, size: 44 });
      else drawNeonText(ctx, '2 PTS', 450, 160, { color: '#ff4fa3', font: PIXEL_FONT, size: 44 });
    } else {
      digits(String(this.score).padStart(2, '0'), 140, 'SCORE', '#ffd166');
      const t = this.mode === 'over' ? (Math.floor(time * 2) % 2 ? '00' : '  ') : String(Math.ceil(this.timeLeft)).padStart(2, '0');
      digits(t, 320, 'TIME', '#ff3b2f');
      digits(String(this.hi).padStart(2, '0'), 500, 'BEST', '#4cc9ff');
    }
    texture.needsUpdate = true;
  }

  // ------------------------------------------------------------ Frame
  update(time, dt, { active = false } = {}) {
    const k = 1 - Math.exp(-dt * 7);
    this.hover += (this.hoverTarget - this.hover) * k;
    this.focus += (this.focusTarget - this.focus) * (1 - Math.exp(-dt * 3.5));
    this.dim += (this.dimTarget - this.dim) * (1 - Math.exp(-dt * 3));
    this.flash = Math.max(0, this.flash - dt * 1.6);

    // Game clock.
    if (this.mode === 'play' && this.running) {
      const before = Math.ceil(this.timeLeft);
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      if (Math.ceil(this.timeLeft) !== before) {
        this.boardDirty = true;
        this.emitState();
        if (this.timeLeft <= 5 && this.timeLeft > 0) this.emit('tick');
      }
      if (this.timeLeft <= 0) this.endGame();
    }
    if (this.mode === 'over') this.overTime += dt;

    // Pick up the next ball.
    if (this.mode !== 'attract' && !this.held) this.pickBall();
    if (this.held?.state === 'lifting') {
      const b = this.held;
      b.lift = Math.min(1, b.lift + dt * 3.2);
      const e = 1 - Math.pow(1 - b.lift, 3);
      b.p.lerpVectors(b.liftFrom, _q.set(HAND.x + this.aimX * 0.12, HAND.y, HAND.z), e);
      b.p.y += Math.sin(e * Math.PI) * 0.12;
      if (b.lift >= 1) b.state = 'held';
    }
    if (this.held?.state === 'held') {
      this.held.p.set(HAND.x + this.aimX * 0.12, HAND.y - (this.charging ? this.power * 0.06 : 0) + Math.sin(time * 2.4) * 0.006, HAND.z);
      if (this.mode === 'attract') {
        // Demo throw: mostly good, sometimes a brick.
        const power = 0.5 + (Math.random() - 0.5) * (Math.random() > 0.4 ? 0.12 : 0.45);
        this.shoot(this.held, power, (Math.random() - 0.5) * 0.14);
        this.held = null;
      } else if (this.queuedShot !== null) {
        this.charging = true;
        this.power = this.queuedShot;
        this.queuedShot = null;
        this.release();
      }
    }

    // Power meter ping-pongs while charging.
    if (this.charging) {
      this.chargeTime += dt;
      this.power = 0.5 - 0.5 * Math.cos((this.chargeTime / 1.25) * Math.PI * 2);
    } else if (!this.held) {
      this.power = 0;
    }

    // Demo shots while nobody is playing, so the machine looks alive.
    if (this.mode === 'attract' && this.lit > 0.5) {
      this.demoTimer -= dt;
      if (this.demoTimer <= 0 && !this.held) {
        this.demoTimer = 3.5 + Math.random() * 3;
        this.pickBall();
      }
    }

    let remaining = Math.min(dt, 0.05);
    while (remaining > 1e-6) {
      const h = Math.min(SUBSTEP, remaining);
      this.step(h);
      remaining -= h;
    }
    for (const ball of this.balls) {
      ball.mesh.position.copy(ball.p);
      if (ball.state === 'loose') {
        ball.mesh.rotation.x -= (ball.v.z * dt) / BALL_R;
        ball.mesh.rotation.z += (ball.v.x * dt) / BALL_R;
      }
    }

    // Net sway.
    this.netKick = Math.max(0, this.netKick - dt * 1.8);
    const pos = this.net.geometry.attributes.position;
    const base = this.netBase;
    for (let i = 0; i < pos.count; i++) {
      const y = base[i * 3 + 1];
      const depth = -y / 0.36;
      const squeeze = 1 - this.netKick * 0.25 * Math.sin(depth * Math.PI);
      const wave = Math.sin(time * 18 - depth * 6) * 0.012 * this.netKick * depth;
      pos.array[i * 3] = base[i * 3] * squeeze + wave;
      pos.array[i * 3 + 1] = y * (1 + this.netKick * 0.15);
      pos.array[i * 3 + 2] = base[i * 3 + 2] * squeeze;
    }
    pos.needsUpdate = true;

    // Tickets crawl out after each basket and get torn off slowly.
    this.tickets.scale.y += (this.ticketLen - this.tickets.scale.y) * (1 - Math.exp(-dt * 4));
    if (this.mode === 'attract') this.ticketLen = Math.max(0.02, this.ticketLen - dt * 0.01);

    // Lights.
    const lit = this.lit;
    const dim = 1 - this.dim * 0.55;
    const chase = 0.85 + 0.15 * Math.sin(time * 6);
    setGlow(this.trimMat, lit * dim * (1.3 + this.hover * 1.0 + this.flash * 2.5) * chase);
    setGlow(this.blueMat, lit * dim * (0.6 + this.flash * 1.5));
    setGlow(this.boardEdge, lit * dim * (1.1 + this.flash * 2.2 + this.hover * 0.5));
    setGlow(this.boardGlow, lit * dim * (1.15 + this.flash * 0.6));
    this.rimMat.emissiveIntensity = lit * (0.25 + this.flash * 2.5);
    this.aimMarker.position.x = Math.sign(this.aimX) * Math.max(0, Math.abs(this.aimX) - 0.06);
    setGlow(this.aimMarker.material, active && this.held ? 0.9 : 0);

    this.boardClock += dt;
    if (this.boardDirty || this.boardClock > 0.25) {
      this.boardClock = 0;
      this.boardDirty = false;
      this.drawBoard(time);
    }
  }
}
