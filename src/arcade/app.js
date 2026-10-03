import * as THREE from 'three';
import gsap from 'gsap';
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  BloomEffect,
  VignetteEffect,
  ToneMappingEffect,
  ToneMappingMode,
  ChromaticAberrationEffect,
  NoiseEffect,
  BlendFunction,
} from 'postprocessing';
import { buildRoom, ROOM } from './room.js';
import { Cabinet } from './cabinet.js';
import { CameraDirector } from './director.js';
import { ArcadeAudio } from './audio.js';
import { screenBackground, mixWithWhite, radialShadowTexture } from './textures.js';
import { HoopsMachine } from './hoops.js';
import { createAirHockey } from './props.js';
import { mountSnake } from '../games/snake.js';

const TIERS = {
  high: { name: 'high', dpr: 1.75, msaa: 4, reflection: 0.5, particles: 700, screenFps: 30 },
  medium: { name: 'medium', dpr: 1.25, msaa: 0, reflection: 0.35, particles: 400, screenFps: 24 },
  low: { name: 'low', dpr: 1, msaa: 0, reflection: 0.25, particles: 220, screenFps: 15 },
};
const TIER_ORDER = ['high', 'medium', 'low'];

// Placement of everything that is not on the main arc (x, z, rotation about y).
// Hoops stands along the left wall, the air hockey table along the right.
const LAYOUT = {
  hoops: { pos: [-3.75, 0, 0.85], rot: Math.PI / 2 },
  hockey: { pos: [5.55, 0, 0.5], rot: 0 },
};

function pickQuality(renderer) {
  const forced = new URLSearchParams(location.search).get('quality');
  if (TIERS[forced]) return { ...TIERS[forced] };
  const gl = renderer.getContext();
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
  const software = /swiftshader|llvmpipe|software|basic render/i.test(gpu);
  const touch = matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency || 4;
  if (software) return { ...TIERS.low };
  if (touch || cores <= 4) return { ...TIERS.medium };
  return { ...TIERS.high };
}

// Keep flights on schedule even when frames are slow, instead of stretching them out.
gsap.ticker.lagSmoothing(0);
// ?slowmo=4 slows every animation down, for inspecting transitions.
const slowmo = Number(new URLSearchParams(location.search).get('slowmo'));
if (slowmo > 0) gsap.globalTimeline.timeScale(1 / slowmo);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function startArcade({ sectionIdFromHash }) {
  const $ = (id) => document.getElementById(id);
  const el = {
    arcade: $('arcade'),
    stage: $('stage'),
    loader: $('loader'),
    loaderBar: $('loader-bar'),
    loaderHint: $('loader-hint'),
    nav: $('machine-nav'),
    hint: $('hud-hint'),
    game: $('game-hud'),
    gameBack: $('game-back'),
    gameHint: $('hoops-hint'),
    gameScore: $('hoops-score'),
    gameTime: $('hoops-time'),
    gameBest: $('hoops-best'),
    gamePower: $('hoops-power'),
    tag: $('hover-tag'),
    crt: $('crt-ui'),
    crtContent: $('crt-content'),
    crtTitle: $('crt-title'),
    back: $('crt-back'),
    sound: $('sound-toggle'),
    huds: [...document.querySelectorAll('.hud')],
  };
  const setLoader = (p, hint) => {
    el.loaderBar.style.width = `${Math.round(p * 100)}%`;
    if (hint) el.loaderHint.textContent = hint;
  };
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const touch = matchMedia('(pointer: coarse)').matches;
  if (touch) {
    el.hint.textContent = 'Drag to look around · tap a machine to play';
    el.gameHint.textContent = 'Hold to charge, let go in the green · drag sideways to aim';
  }

  setLoader(0.1, 'Warming up the tubes…');
  await Promise.all([
    document.fonts.load('16px "Press Start 2P"'),
    document.fonts.load('16px "VT323"'),
  ]).catch(() => {});

  // Renderer
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
  const quality = pickQuality(renderer);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.dpr));
  renderer.setSize(window.innerWidth, window.innerHeight);
  el.stage.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  document.documentElement.dataset.quality = quality.name;
  setLoader(0.3, 'Wiring the neon…');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.02, 60);
  const room = buildRoom(scene, renderer, quality);
  setLoader(0.5, 'Plugging in the cabinets…');

  // Sections come straight from the page's HTML, so the 2D site and the arcade share one source of content.
  const sections = [...document.querySelectorAll('#site .sec')].map((sec) => ({
    id: sec.id,
    label: sec.dataset.label,
    marquee: sec.dataset.marquee,
    screen: sec.dataset.screen,
    color: sec.style.getPropertyValue('--c').trim(),
    el: sec,
  }));

  // All cabinets, Snake included, stand on one arc facing the player, evenly spaced.
  const arcCenter = new THREE.Vector3(0, 0, 0.4);
  const arcRadius = 4.6;
  const spread = THREE.MathUtils.degToRad(100);
  const cabinets = sections.map((section, i) => {
    const cab = new Cabinet(section);
    const angle = sections.length > 1 ? -spread / 2 + (spread * i) / (sections.length - 1) : 0;
    cab.group.position.set(arcCenter.x + Math.sin(angle) * arcRadius, 0, arcCenter.z - Math.cos(angle) * arcRadius);
    cab.group.rotation.y = -angle;
    cab.section = section;
    scene.add(cab.group);
    return cab;
  });

  const hoops = new HoopsMachine();
  hoops.group.position.set(...LAYOUT.hoops.pos);
  hoops.group.rotation.y = LAYOUT.hoops.rot;
  scene.add(hoops.group);

  const props = [
    [createAirHockey(), LAYOUT.hockey],
  ].map(([prop, spot]) => {
    prop.group.position.set(...spot.pos);
    prop.group.rotation.y = spot.rot;
    scene.add(prop.group);
    return prop;
  });

  // Everything the player can walk up to: screen cabinets and the hoops game.
  const machines = [...cabinets, hoops];
  const byId = Object.fromEntries(machines.map((c) => [c.id, c]));
  scene.updateMatrixWorld(true);

  // Contact shadows, beams and floor glow per cabinet.
  const shadowMat = new THREE.MeshBasicMaterial({ map: radialShadowTexture(), transparent: true, depthWrite: false, color: '#000000' });
  const forward = new THREE.Vector3();
  cabinets.forEach((cab, i) => {
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0, 0.004, 0.05);
    cab.group.add(shadow);
    shadow.updateMatrix();
    forward.set(0, 0, 1).applyQuaternion(cab.group.quaternion);
    const p = cab.group.position;
    cab.poolIndex = i;
    cab.poolX = p.x + forward.x * 0.95;
    cab.poolZ = p.z + forward.z * 0.95;
    room.setPoolWorld(i, cab.poolX, cab.poolZ, cab.color, 0, 2.2);
    if (cab.interactive) room.addBeam(p.x + forward.x * 0.55, p.z + forward.z * 0.55, mixWithWhite(cab.color, 0.55), 0.1);
  });
  // Floor glow and contact shadows for the hoops machine and props.
  const glowers = [hoops, ...props];
  glowers.forEach((item, i) => {
    item.poolIndex = cabinets.length + i;
    const local = item === hoops ? new THREE.Vector3(0, 0, 0.6) : item.poolAt;
    const world = local.clone().applyMatrix4(item.group.matrixWorld);
    room.setPoolWorld(item.poolIndex, world.x, world.z, item.color, 0, item === hoops ? 1.4 : 1.8);
  });
  const hoopsShadow = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 3.4), shadowMat);
  hoopsShadow.rotation.x = -Math.PI / 2;
  hoopsShadow.position.set(0, 0.004, -1.3);
  hoops.group.add(hoopsShadow);
  for (const prop of props) {
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.4), shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.004;
    prop.group.add(shadow);
  }
  room.addBeam(0, 0.9, '#ffe3c4', 0.07);
  const hoopsSpot = new THREE.Vector3(0, 0, -1.6).applyMatrix4(hoops.group.matrixWorld);
  room.addBeam(hoopsSpot.x, hoopsSpot.z, '#ffc58a', 0.06);
  room.addBeam(-2.6, 2.6, '#c9b8ff', 0.05);
  room.addBeam(2.6, 2.6, '#c9b8ff', 0.05);

  // Post-processing: bloom for the neon, filmic tone mapping, vignette, a touch of lens and grain.
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: quality.msaa });
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 0.55, luminanceSmoothing: 0.25, intensity: 1.25, radius: 0.72, levels: 7 });
  const vignette = new VignetteEffect({ offset: 0.3, darkness: 0.62 });
  const toneMapping = new ToneMappingEffect({ mode: ToneMappingMode.AGX });
  const aberration = new ChromaticAberrationEffect({ offset: new THREE.Vector2(0.0004, 0.0003), radialModulation: true, modulationOffset: 0.2 });
  const grain = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: false });
  grain.blendMode.opacity.value = 0.12;
  composer.addPass(new EffectPass(camera, bloom, vignette, toneMapping));
  composer.addPass(new EffectPass(camera, aberration, grain));
  const fx = { aberration: 1, bloom: 1, exposure: 1 };
  const applyFx = () => {
    aberration.offset.set(0.0004 * fx.aberration, 0.0003 * fx.aberration);
    bloom.intensity = 1.25 * fx.bloom;
  };

  const director = new CameraDirector(camera, { reducedMotion });
  const audio = new ArcadeAudio();

  function updateHomeFraming() {
    const aspect = window.innerWidth / window.innerHeight;
    // Keep the whole arc in frame: widen the lens and step back on narrow screens.
    // Stand back far enough to take in the corners: hoops on the left, air hockey on the right.
    const needHalf = THREE.MathUtils.degToRad(39.5);
    const fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(needHalf) / aspect));
    director.home.fov = THREE.MathUtils.clamp(fov, 48, 80);
    const back = aspect < 1 ? Math.min(1.4, (1 - aspect) * 3) : 0;
    director.home.position.set(0, 1.68 + back * 0.08, 4.2 + back);
    director.home.target.set(0, 1.18, -2.6);
  }
  updateHomeFraming();

  /** Camera pose where the cabinet's screen exactly fills the viewport. */
  function screenPose(cab) {
    const frame = cab.getScreenFrame();
    const fov = 40;
    const tan = Math.tan(THREE.MathUtils.degToRad(fov / 2));
    const aspect = camera.aspect;
    const distance = 0.9 * Math.min(frame.height / (2 * tan), frame.width / (2 * tan * aspect));
    const position = frame.center.clone().addScaledVector(frame.normal, distance);
    const approach = frame.center.clone().addScaledVector(frame.normal, 1.3).add(new THREE.Vector3(0, 0.08, 0));
    return { position, target: frame.center.clone(), fov, approach };
  }

  // HUD: one button per machine.
  const navButtons = {};
  for (const cab of machines) {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = cab.label;
    button.style.setProperty('--c', cab.color);
    button.addEventListener('mouseenter', () => (navHover = cab));
    button.addEventListener('mouseleave', () => (navHover = null));
    button.addEventListener('focus', () => (navHover = cab));
    button.addEventListener('blur', () => (navHover = null));
    button.addEventListener('click', () => navigateFromRoom(cab.id));
    li.append(button);
    el.nav.append(li);
    navButtons[cab.id] = button;
  }

  const syncSound = () => {
    el.sound.textContent = audio.enabled ? 'Sound on' : 'Sound off';
    el.sound.setAttribute('aria-pressed', String(audio.enabled));
  };
  el.sound.addEventListener('click', async () => {
    await audio.setEnabled(!audio.enabled);
    syncSound();
  });
  if (audio.wanted) {
    // Browsers only allow audio after a gesture; resume on the first one.
    const resume = async () => {
      await audio.setEnabled(true);
      syncSound();
    };
    window.addEventListener('pointerdown', resume, { once: true });
    window.addEventListener('keydown', resume, { once: true });
  }

  // Pointer: hover, drag-to-look, click-to-play.
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hitboxes = machines.map((c) => c.hitbox);
  let pointerInside = false;
  let pointerHover = null;
  let navHover = null;
  let keyHover = null;
  let hovered = null;
  let drag = null;
  const canvas = renderer.domElement;

  // Aim follows the pointer across the screen; touch aims relative to where the finger went down.
  let touchAim = null;
  function aimFromPointer(e) {
    if (e.pointerType === 'touch') {
      if (touchAim) hoops.setAim(touchAim.aim + ((e.clientX - touchAim.x) / window.innerWidth) * 1.4);
    } else {
      hoops.setAim(((e.clientX / window.innerWidth) * 2 - 1) * 0.6);
    }
  }

  canvas.addEventListener('pointermove', (e) => {
    pointerInside = true;
    ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    if (state === 'game') {
      aimFromPointer(e);
      return;
    }
    if (!touch) director.setPointer(ndc.x, ndc.y);
    if (drag) {
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 6) {
        drag.moved = true;
        canvas.classList.add('is-dragging');
      }
      if (drag.moved && state === 'room') director.addDrag(dx, dy);
      drag.x = e.clientX;
      drag.y = e.clientY;
    }
  });
  canvas.addEventListener('pointerleave', () => {
    pointerInside = false;
    director.setPointer(0, 0);
  });
  canvas.addEventListener('pointerdown', (e) => {
    if (state === 'game') {
      canvas.setPointerCapture(e.pointerId);
      if (e.pointerType === 'touch') touchAim = { x: e.clientX, aim: hoops.aimX };
      else aimFromPointer(e);
      hoops.beginCharge();
      return;
    }
    drag = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, moved: false };
    canvas.setPointerCapture(e.pointerId);
    ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    pointerInside = true;
  });
  canvas.addEventListener('pointerup', (e) => {
    if (state === 'game') {
      touchAim = null;
      hoops.release();
      return;
    }
    const wasDrag = drag?.moved;
    drag = null;
    canvas.classList.remove('is-dragging');
    if (wasDrag) return;
    if (state === 'intro') {
      skipIntro();
      return;
    }
    if (state !== 'room') return;
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(hitboxes, false)[0];
    if (hit) navigateFromRoom(hit.object.userData.cabinet.id);
    if (touch) pointerInside = false;
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && (state === 'screen' || state === 'opening' || state === 'game')) {
      e.preventDefault();
      goBack();
      return;
    }
    if (state === 'game') {
      if (e.code === 'Space' || e.code === 'Enter') {
        if (e.target.closest?.('button')) return;
        e.preventDefault();
        if (!e.repeat) hoops.beginCharge();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        hoops.nudgeAim(e.key === 'ArrowLeft' ? -0.04 : 0.04);
      }
      return;
    }
    if (state !== 'room') return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const i = keyHover ? machines.indexOf(keyHover) : e.key === 'ArrowRight' ? -1 : machines.length;
      keyHover = machines[(i + (e.key === 'ArrowRight' ? 1 : -1) + machines.length) % machines.length];
      navButtons[keyHover.id].focus();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (state === 'game' && (e.code === 'Space' || e.code === 'Enter')) {
      e.preventDefault();
      hoops.release();
    }
  });

  el.back.addEventListener('click', goBack);
  el.gameBack.addEventListener('click', goBack);
  // Links inside a screen to other machines just change the hash; the router does the rest.

  function updateHover() {
    let next = null;
    if (state === 'room') {
      if (navHover) next = navHover;
      else if (pointerInside && !drag?.moved) {
        raycaster.setFromCamera(ndc, camera);
        const hit = raycaster.intersectObjects(hitboxes, false)[0];
        next = hit ? hit.object.userData.cabinet : null;
      }
      if (!next && keyHover && document.activeElement === navButtons[keyHover.id]) next = keyHover;
    }
    if (next !== hovered) {
      hovered = next;
      canvas.classList.toggle('is-pointer', !!hovered && !navHover);
      for (const [id, button] of Object.entries(navButtons)) button.classList.toggle('is-hot', hovered?.id === id);
      if (hovered) {
        audio.hover(THREE.MathUtils.clamp(hovered.group.position.x / 5, -1, 1));
        el.tag.style.setProperty('--c', hovered.color);
        el.tag.querySelector('.hover-tag__label').textContent = hovered.label;
        el.tag.querySelector('.hover-tag__cta').textContent = touch ? 'Tap to play' : 'Click to play';
      }
      el.tag.classList.toggle('is-visible', !!hovered);
    }
    for (const cab of machines) cab.hoverTarget = cab === hovered ? 1 : 0;
    if (hovered) {
      const p = hovered.getLabelAnchor(new THREE.Vector3()).project(camera);
      el.tag.style.left = `${((p.x + 1) / 2) * window.innerWidth}px`;
      el.tag.style.top = `${((1 - p.y) / 2) * window.innerHeight}px`;
    }
  }

  // ---------------------------------------------------------------- States & routing
  let state = 'intro';
  let current = null;
  let paused = false;
  let pending = Promise.resolve();

  function setBusy(busy) {
    el.arcade.classList.toggle('is-busy', busy);
    for (const hud of el.huds) hud.inert = busy;
  }

  let screenGame = null;
  const snakeSounds = { eat: () => audio.chomp(), start: () => audio.start(), over: () => audio.gameOver() };

  function fillScreen(cab) {
    screenGame?.destroy();
    screenGame = null;
    const clone = cab.section.el.cloneNode(true);
    clone.removeAttribute('id');
    clone.removeAttribute('aria-labelledby');
    clone.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
    el.crtContent.replaceChildren(clone);
    const mount = clone.querySelector('[data-snake-mount]');
    if (mount) screenGame = mountSnake(mount, { color: cab.color, onSound: (name) => snakeSounds[name]?.() });
    el.crtContent.scrollTop = 0;
    el.crt.style.setProperty('--c', cab.color);
    el.crt.style.setProperty('--screen-bg', screenBackground(cab.color));
    el.crtTitle.textContent = `${cab.label} · gawi.no`;
  }

  async function openMachine(cab) {
    if (state === 'screen' && current === cab) return;
    if (current) await closeCurrent();
    state = 'opening';
    current = cab;
    paused = false;
    setBusy(true);
    el.tag.classList.remove('is-visible');
    hovered = null;
    highlight(cab);
    const pose = screenPose(cab);
    const duration = reducedMotion ? 0.9 : 2.5;
    audio.coin();
    audio.whoosh(duration);
    fillScreen(cab);
    let booted = false;
    await director.flyTo(pose, {
      duration,
      via: [director.camera.position.clone().lerp(pose.approach, 0.5).add(new THREE.Vector3(0, 0.12, 0)), pose.approach],
      ease: 'power3.inOut',
      onProgress: (t) => {
        if (!booted && t > 0.45) {
          booted = true;
          cab.screen.setMode('boot');
        }
        // Lens stress as the screen rushes in.
        const rush = THREE.MathUtils.smoothstep(t, 0.7, 1);
        fx.aberration = 1 + rush * 7;
        fx.bloom = 1 + rush * 0.5;
        applyFx();
      },
    });
    if (current !== cab) return;
    el.crt.hidden = false;
    el.crt.classList.remove('is-off');
    void el.crt.offsetWidth;
    el.crt.classList.add('is-on');
    await wait(reducedMotion ? 50 : 540);
    if (current !== cab || state !== 'opening') return;
    state = 'screen';
    paused = true;
    fx.aberration = 1;
    fx.bloom = 1;
    applyFx();
    if (screenGame) screenGame.focus();
    else el.back.focus({ preventScroll: true });
  }

  /** Spotlight one machine and dim the rest; null restores the room. */
  function highlight(target) {
    for (const c of [...cabinets, hoops]) {
      c.focusTarget = target && c === target ? 1 : 0;
      c.dimTarget = target && c !== target ? 1 : 0;
      c.hoverTarget = 0;
    }
  }

  async function openHoops() {
    if (state === 'game' && current === hoops) return;
    if (current) await closeCurrent();
    state = 'opening';
    current = hoops;
    paused = false;
    setBusy(true);
    el.tag.classList.remove('is-visible');
    hovered = null;
    highlight(hoops);
    const pose = hoops.shootPose();
    const duration = reducedMotion ? 0.9 : 2.3;
    audio.coin();
    audio.whoosh(duration);
    await director.flyTo(pose, {
      duration,
      via: [director.camera.position.clone().lerp(pose.approach, 0.5).add(new THREE.Vector3(0, 0.15, 0)), pose.approach],
      ease: 'power3.inOut',
    });
    if (current !== hoops || state !== 'opening') return;
    state = 'game';
    hoops.enter();
    el.game.hidden = false;
    el.game.focus({ preventScroll: true });
  }

  async function closeHoops() {
    if (current !== hoops || (state !== 'game' && state !== 'opening')) return;
    state = 'closing';
    director.finishFlight();
    audio.back();
    hoops.exit();
    el.game.hidden = true;
    highlight(null);
    updateHomeFraming();
    const pose = hoops.shootPose();
    director.resetLook();
    await director.flyTo(director.home, {
      duration: reducedMotion ? 0.8 : 2,
      via: [pose.approach, pose.approach.clone().lerp(director.home.position, 0.5).add(new THREE.Vector3(0, 0.12, 0))],
      ease: 'power2.inOut',
      lookLead: 1.1,
      then: 'free',
    });
    current = null;
    state = 'room';
    setBusy(false);
    navButtons[hoops.id]?.focus({ preventScroll: true });
  }

  function closeCurrent() {
    return current === hoops ? closeHoops() : closeMachine();
  }

  // The machine reports its game state; the HUD mirrors it.
  hoops.on('state', ({ score, time, hi, over }) => {
    el.gameScore.textContent = score;
    el.gameTime.textContent = time;
    el.gameBest.textContent = hi;
    el.game.classList.toggle('is-over', over);
  });
  hoops.on('throw', () => state === 'game' && audio.tone({ freq: 300, to: 520, duration: 0.12, type: 'triangle', gain: 0.03 }));
  hoops.on('bounce', (k) => state === 'game' && audio.thud(k));
  hoops.on('rim', (k) => state === 'game' && audio.rim(k));
  hoops.on('score', (live) => live && audio.swish());
  hoops.on('tick', () => audio.tick());
  hoops.on('start', () => audio.start());
  hoops.on('over', () => audio.buzzer());

  async function closeMachine() {
    if (!current || (state !== 'screen' && state !== 'opening')) return;
    const cab = current;
    state = 'closing';
    paused = false;
    director.finishFlight();
    audio.back();
    el.crt.classList.remove('is-on');
    void el.crt.offsetWidth;
    el.crt.classList.add('is-off');
    await wait(reducedMotion ? 50 : 360);
    el.crt.hidden = true;
    el.crt.classList.remove('is-off');
    screenGame?.destroy();
    screenGame = null;
    cab.screen.setMode('attract');
    highlight(null);
    fx.aberration = 1;
    fx.bloom = 1;
    applyFx();
    updateHomeFraming();
    const pose = screenPose(cab);
    director.resetLook();
    await director.flyTo(director.home, {
      duration: reducedMotion ? 0.8 : 2,
      via: [pose.approach, pose.approach.clone().lerp(director.home.position, 0.5).add(new THREE.Vector3(0, 0.12, 0))],
      ease: 'power2.inOut',
      lookLead: 1.1,
      then: 'free',
    });
    current = null;
    state = 'room';
    setBusy(false);
    navButtons[cab.id]?.focus({ preventScroll: true });
  }

  function route() {
    const id = sectionIdFromHash();
    const cab = byId[id];
    pending = pending.then(() => {
      if (state === 'intro') return undefined;
      if (cab === hoops) return openHoops();
      if (cab) return openMachine(cab);
      if (current) return closeCurrent();
      return undefined;
    });
    return pending;
  }

  function navigateFromRoom(id) {
    if (state !== 'room') return;
    history.pushState({ fromRoom: true }, '', `#/${id}`);
    route();
  }

  function goBack() {
    if (history.state?.fromRoom) history.back();
    else {
      history.replaceState(null, '', location.pathname + location.search);
      route();
    }
  }

  window.addEventListener('hashchange', route);

  // ---------------------------------------------------------------- Resize & quality
  function applySize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.dpr));
    renderer.setSize(w, h);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    room.setReflectionSize(w * quality.reflection, h * quality.reflection);
    updateHomeFraming();
  }
  window.addEventListener('resize', applySize);
  applySize();

  const perf = { frames: 0, elapsed: 0, strikes: 0 };
  function watchPerformance(dt) {
    if (state !== 'room') return;
    perf.frames++;
    perf.elapsed += dt;
    if (perf.elapsed < 3) return;
    const fps = perf.frames / perf.elapsed;
    perf.frames = perf.elapsed = 0;
    if (fps >= 45) return;
    const next = TIER_ORDER[TIER_ORDER.indexOf(quality.name) + 1];
    if (!next) return;
    Object.assign(quality, { ...TIERS[next], particles: quality.particles });
    composer.multisampling = quality.msaa;
    document.documentElement.dataset.quality = quality.name;
    applySize();
  }

  // ---------------------------------------------------------------- Loop
  let time = 0;
  let screenClock = 0;
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    if (paused) return;
    director.update(time, dt);
    updateHover();
    screenClock += dt;
    const drawScreens = screenClock >= 1 / quality.screenFps;
    if (drawScreens) screenClock = 0;
    const pools = room.floor.material.uniforms.pools.value;
    for (const cab of cabinets) {
      cab.update(time, dt, drawScreens);
      pools[cab.poolIndex].z = 0.85 * cab.glowLevel;
    }
    hoops.update(time, dt, { active: state === 'game' });
    pools[hoops.poolIndex].z = 0.7 * hoops.glowLevel;
    for (const prop of props) {
      prop.update(time, dt);
      pools[prop.poolIndex].z = 0.6 * prop.lit;
    }
    if (state === 'game') {
      el.gamePower.style.transform = `scaleY(${hoops.power.toFixed(3)})`;
      el.game.classList.toggle('is-charging', hoops.charging);
    }
    room.update(time, dt);
    composer.render(dt);
    watchPerformance(dt);
  }

  // Draw every screen once and compile shaders before the curtain lifts, so the intro does not stutter.
  for (const cab of cabinets) cab.update(0, 0.016, true);
  hoops.update(0, 0.016);
  for (const prop of props) prop.update(0, 0.016);
  camera.position.set(0, 1.6, ROOM.maxZ + 4.5);
  camera.lookAt(0, 1.35, 0);
  setLoader(0.8, 'Calibrating CRTs…');
  try {
    await renderer.compileAsync(scene, camera);
  } catch {
    // compileAsync is an optimisation only.
  }
  composer.render(0.016);
  setLoader(1, 'Ready, player one.');
  renderer.setAnimationLoop(frame);
  await wait(350);
  el.loader.classList.add('is-done');

  // ---------------------------------------------------------------- Intro
  const deepLink = byId[sectionIdFromHash()];
  let introTimeline = null;

  function powerEverything() {
    room.state.power = 1;
    for (const sign of room.signs) sign.lit = 1;
    for (const cab of cabinets) {
      cab.lit = 1;
      cab.crtMat.uniforms.power.value = 1;
    }
    hoops.lit = 1;
    for (const prop of props) prop.lit = 1;
  }

  function finishIntro() {
    if (state !== 'intro') return;
    state = 'room';
    el.arcade.classList.remove('is-intro');
    director.mode = 'free';
    director.resetLook();
    route();
  }

  function skipIntro() {
    if (state !== 'intro') return;
    introTimeline?.progress(1);
    director.finishFlight();
    powerEverything();
    finishIntro();
  }

  el.arcade.classList.add('is-intro');
  if (reducedMotion || deepLink) {
    powerEverything();
    director.mode = 'free';
    director.update(time, 0.016);
    finishIntro();
  } else {
    const flicker = (tl, target, key, at, to = 1) => {
      tl.set(target, { [key]: to }, at)
        .set(target, { [key]: 0 }, at + 0.07)
        .set(target, { [key]: to * 0.8 }, at + 0.14)
        .set(target, { [key]: 0.1 }, at + 0.22)
        .set(target, { [key]: to }, at + 0.34);
    };
    const tl = gsap.timeline();
    introTimeline = tl;
    const [mainSign, insertSign, highSign, overSign, exitSign, openSign] = room.signs;
    flicker(tl, openSign, 'lit', 0.15);
    flicker(tl, mainSign, 'lit', 1.1);
    tl.call(() => audio.powerOn(), [], 1.1);
    tl.to(room.state, { power: 1, duration: 1.6, ease: 'power1.inOut' }, 1.3);
    flicker(tl, insertSign, 'lit', 1.7);
    flicker(tl, highSign, 'lit', 1.95);
    flicker(tl, overSign, 'lit', 2.2);
    flicker(tl, exitSign, 'lit', 2.4);
    cabinets.forEach((cab, i) => {
      const at = 1.6 + i * 0.16;
      flicker(tl, cab, 'lit', at);
      tl.to(cab.crtMat.uniforms.power, { value: 1, duration: 0.7, ease: 'power2.out' }, at + 0.1);
    });
    [hoops, ...props].forEach((item, i) => flicker(tl, item, 'lit', 2.1 + i * 0.22));
    director.flyTo(director.home, {
      duration: 4.6,
      via: [new THREE.Vector3(0, 1.66, ROOM.maxZ + 0.6), new THREE.Vector3(0, 1.66, ROOM.maxZ - 0.7)],
      ease: 'power2.inOut',
      lookLead: 1,
      then: 'free',
    }).then(finishIntro);
  }
}
