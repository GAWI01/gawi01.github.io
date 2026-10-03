import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { glowMaterial, setGlow, createBeamMaterial } from './materials.js';
import { makeCanvas, canvasTexture, drawNeonText, noiseCanvas, softDotTexture, withAlpha, PIXEL_FONT, CRT_FONT } from './textures.js';

export const ROOM = { minX: -6.5, maxX: 6.5, minZ: -5.5, maxZ: 6, height: 3.4, doorHalf: 1.1, doorHeight: 2.5 };
const POOLS = 20;

const floorShader = {
  name: 'ArcadeFloor',
  uniforms: THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      color: { value: null },
      tDiffuse: { value: null },
      textureMatrix: { value: null },
      reflectStrength: { value: 0.85 },
      pools: { value: Array.from({ length: POOLS }, () => new THREE.Vector4(0, 0, 0, 1)) },
      poolColors: { value: Array.from({ length: POOLS }, () => new THREE.Color()) },
    },
  ]),
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vReflUv;
    varying vec3 vWorld;
    #include <fog_pars_vertex>
    void main() {
      vReflUv = textureMatrix * vec4(position, 1.0);
      vec4 world = modelMatrix * vec4(position, 1.0);
      vWorld = world.xyz;
      vec4 mvPosition = viewMatrix * world;
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }
  `,
  fragmentShader: /* glsl */ `
    #define POOLS ${POOLS}
    uniform sampler2D tDiffuse;
    uniform float reflectStrength;
    uniform vec4 pools[POOLS];
    uniform vec3 poolColors[POOLS];
    varying vec4 vReflUv;
    varying vec3 vWorld;
    #include <fog_pars_fragment>

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p); vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
    }

    void main() {
      // Polished dark tiles with a faint checker and grout.
      vec2 tp = vWorld.xz / 0.6;
      vec2 f = fract(tp);
      vec2 id = floor(tp);
      float checker = mod(id.x + id.y, 2.0);
      float grout = smoothstep(0.0, 0.012, f.x) * smoothstep(0.0, 0.012, f.y) * smoothstep(1.0, 0.988, f.x) * smoothstep(1.0, 0.988, f.y);
      float n = noise(vWorld.xz * 4.0) * 0.6 + noise(vWorld.xz * 17.0) * 0.4;
      float tileTone = 0.85 + 0.3 * hash(id);
      vec3 base = mix(vec3(0.0045, 0.0045, 0.0065), vec3(0.0075, 0.007, 0.0095), checker) * tileTone * (0.8 + 0.4 * n);
      base *= mix(0.4, 1.0, grout);

      vec3 light = vec3(0.0);
      for (int i = 0; i < POOLS; i++) {
        vec2 d = vWorld.xz - pools[i].xy;
        light += poolColors[i] * pools[i].z / (1.0 + dot(d, d) * pools[i].w);
      }
      vec3 col = base + light * (0.05 + 0.03 * n) * mix(0.5, 1.0, grout);

      #ifdef USE_REFLECTION
        vec2 ruv = vReflUv.xy / vReflUv.w;
        ruv += (vec2(noise(vWorld.xz * 9.0), noise(vWorld.xz * 9.0 + 7.3)) - 0.5) * 0.008;
        float dist = length(cameraPosition - vWorld);
        float r = 0.0022 + 0.0012 * clamp(dist / 8.0, 0.0, 1.0);
        vec3 refl = texture2D(tDiffuse, ruv).rgb * 0.24;
        refl += texture2D(tDiffuse, ruv + vec2(r, 0.0)).rgb * 0.12;
        refl += texture2D(tDiffuse, ruv - vec2(r, 0.0)).rgb * 0.12;
        refl += texture2D(tDiffuse, ruv + vec2(0.0, r * 1.6)).rgb * 0.12;
        refl += texture2D(tDiffuse, ruv - vec2(0.0, r * 1.6)).rgb * 0.12;
        refl += texture2D(tDiffuse, ruv + vec2(r, r) * 1.5).rgb * 0.07;
        refl += texture2D(tDiffuse, ruv - vec2(r, r) * 1.5).rgb * 0.07;
        refl += texture2D(tDiffuse, ruv + vec2(r, -r) * 1.5).rgb * 0.07;
        refl += texture2D(tDiffuse, ruv - vec2(r, -r) * 1.5).rgb * 0.07;
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = 0.18 + 0.82 * pow(1.0 - max(V.y, 0.0), 4.0);
        col += refl * reflectStrength * fres * mix(0.25, 1.0, grout) * (0.75 + 0.25 * n);
      #endif

      gl_FragColor = vec4(col, 1.0);
      #include <fog_fragment>
    }
  `,
};

function createFloor(reflectionScale) {
  const geometry = new THREE.PlaneGeometry(15, 18);
  let floor;
  if (reflectionScale > 0) {
    floor = new Reflector(geometry, {
      shader: floorShader,
      textureWidth: Math.round(window.innerWidth * reflectionScale),
      textureHeight: Math.round(window.innerHeight * reflectionScale),
      clipBias: 0.003,
      multisample: 0,
    });
    floor.material.defines = { USE_REFLECTION: '' };
  } else {
    floor = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(floorShader.uniforms),
      vertexShader: floorShader.vertexShader,
      fragmentShader: floorShader.fragmentShader,
    }));
  }
  floor.material.fog = true;
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 2.5);
  floor.renderOrder = -1;
  return floor;
}

function neonSign(lines, { width, height, canvasWidth = 2048 }) {
  const canvasHeight = Math.round(canvasWidth * (height / width));
  const { canvas, ctx } = makeCanvas(canvasWidth, canvasHeight);
  for (const line of lines) drawNeonText(ctx, line.text, canvasWidth * line.x, canvasHeight * line.y, { color: line.color, font: line.font || PIXEL_FONT, size: line.size });
  const material = glowMaterial('#ffffff', 0, {
    map: canvasTexture(canvas, { anisotropy: 8 }),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  return { mesh, material, lit: 0, level: 1, broken: 0 };
}

function posterTexture(title, subtitle, color, accent) {
  const { canvas, ctx } = makeCanvas(512, 768);
  const g = ctx.createLinearGradient(0, 0, 0, 768);
  g.addColorStop(0, '#120a24');
  g.addColorStop(0.55, '#2a0f3a');
  g.addColorStop(1, '#05040a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 768);
  // Sun
  ctx.save();
  ctx.beginPath();
  ctx.arc(256, 380, 150, Math.PI, 0);
  ctx.clip();
  const sun = ctx.createLinearGradient(0, 230, 0, 380);
  sun.addColorStop(0, accent);
  sun.addColorStop(1, color);
  ctx.fillStyle = sun;
  ctx.fillRect(100, 220, 312, 170);
  ctx.fillStyle = '#2a0f3a';
  for (let i = 0; i < 6; i++) ctx.fillRect(100, 300 + i * 14, 312, 2 + i * 1.5);
  ctx.restore();
  // Perspective grid
  ctx.strokeStyle = withAlpha(color, 0.8);
  ctx.lineWidth = 2;
  for (let i = 0; i < 12; i++) {
    const y = 380 + Math.pow(i / 11, 2) * 300;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }
  for (let i = -8; i <= 8; i++) {
    ctx.beginPath();
    ctx.moveTo(256 + i * 10, 380);
    ctx.lineTo(256 + i * 70, 690);
    ctx.stroke();
  }
  ctx.fillStyle = '#05040a';
  ctx.fillRect(0, 690, 512, 78);
  drawNeonText(ctx, title, 256, 110, { color: accent, font: PIXEL_FONT, size: title.length > 9 ? 34 : 42 });
  ctx.fillStyle = '#ffffff';
  ctx.font = `34px ${CRT_FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(subtitle, 256, 735);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, 492, 748);
  return canvasTexture(canvas);
}

function tokenMachine() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.6, 0.42), new THREE.MeshStandardMaterial({ color: '#1a1b22', roughness: 0.35, metalness: 0.6 }));
  body.position.y = 0.8;
  group.add(body);
  const { canvas, ctx } = makeCanvas(256, 384);
  ctx.fillStyle = '#05060a';
  ctx.fillRect(0, 0, 256, 384);
  drawNeonText(ctx, 'TOKENS', 128, 70, { color: '#ffd166', font: PIXEL_FONT, size: 30 });
  ctx.fillStyle = '#ffd166';
  ctx.font = `34px ${CRT_FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('1 COIN = 1 PLAY', 128, 150);
  ctx.strokeStyle = '#ffd166';
  ctx.lineWidth = 4;
  ctx.strokeRect(60, 200, 136, 90);
  ctx.fillText('INSERT', 128, 252);
  const panelMat = glowMaterial('#ffffff', 0, { map: canvasTexture(canvas) });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.75), panelMat);
  panel.position.set(0, 1.12, 0.212);
  group.add(panel);
  const tray = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.12), new THREE.MeshStandardMaterial({ color: '#777b85', metalness: 0.9, roughness: 0.3 }));
  tray.position.set(0, 0.42, 0.25);
  group.add(tray);
  return { group, panelMat };
}

/** Low-cost environment map: a dark box with coloured strips, so glossy surfaces pick up neon highlights. */
function createEnvironment(renderer) {
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color('#030306');
  const strip = (color, intensity, w, h, position, rotY = 0) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
    mesh.position.set(...position);
    mesh.rotation.y = rotY;
    envScene.add(mesh);
  };
  strip('#8ce7bd', 3, 6, 0.8, [0, 2.6, -5]);
  strip('#ff4fa3', 2.5, 4, 0.5, [-5, 2.4, 0], Math.PI / 2);
  strip('#4cc9ff', 2.5, 4, 0.5, [5, 2.4, 0], -Math.PI / 2);
  strip('#7a5cff', 1.5, 12, 0.15, [0, 0.1, -5]);
  strip('#ffffff', 0.6, 1.5, 1.5, [0, 3.3, 0]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(envScene, 0.04).texture;
  pmrem.dispose();
  return env;
}

export function buildRoom(scene, renderer, quality) {
  scene.environment = createEnvironment(renderer);
  scene.environmentIntensity = 0.55;
  scene.fog = new THREE.FogExp2('#07060c', 0.05);
  scene.background = new THREE.Color('#020204');

  const floor = createFloor(quality.reflection);
  scene.add(floor);
  const uniforms = floor.material.uniforms;

  // Walls with a dark acoustic-panel texture.
  const wallTexture = canvasTexture(noiseCanvas(512, { base: '#0d0b14', amount: 14, lines: 8 }), { repeat: [6, 1.5] });
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTexture, roughness: 0.85, metalness: 0.05 });
  const { minX, maxX, minZ, maxZ, height, doorHalf, doorHeight } = ROOM;
  const width = maxX - minX;
  const depth = maxZ - minZ;
  const walls = new THREE.Group();
  const back = new THREE.Mesh(new THREE.PlaneGeometry(width, height), wallMat);
  back.position.set(0, height / 2, minZ);
  const left = new THREE.Mesh(new THREE.PlaneGeometry(depth, height), wallMat);
  left.rotation.y = Math.PI / 2;
  left.position.set(minX, height / 2, (minZ + maxZ) / 2);
  const right = left.clone();
  right.rotation.y = -Math.PI / 2;
  right.position.x = maxX;
  walls.add(back, left, right);
  // Front wall with a doorway, seen from inside when looking back and from the corridor at the start.
  const sideW = (width - doorHalf * 2) / 2;
  for (const s of [-1, 1]) {
    const part = new THREE.Mesh(new THREE.PlaneGeometry(sideW, height), wallMat);
    part.position.set(s * (doorHalf + sideW / 2), height / 2, maxZ);
    part.rotation.y = Math.PI;
    const outside = part.clone();
    outside.rotation.y = 0;
    outside.position.z = maxZ + 0.01;
    walls.add(part, outside);
  }
  const lintel = new THREE.Mesh(new THREE.PlaneGeometry(doorHalf * 2, height - doorHeight), wallMat);
  lintel.position.set(0, doorHeight + (height - doorHeight) / 2, maxZ);
  lintel.rotation.y = Math.PI;
  const lintelOut = lintel.clone();
  lintelOut.rotation.y = 0;
  lintelOut.position.z = maxZ + 0.01;
  walls.add(lintel, lintelOut);
  // Corridor outside the door.
  const corridorMat = new THREE.MeshStandardMaterial({ color: '#050508', roughness: 0.9 });
  for (const s of [-1, 1]) {
    const c = new THREE.Mesh(new THREE.PlaneGeometry(5.5, height), corridorMat);
    c.rotation.y = -s * Math.PI / 2;
    c.position.set(s * 1.6, height / 2, maxZ + 2.75);
    walls.add(c);
  }
  scene.add(walls);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(width, depth + 6), new THREE.MeshStandardMaterial({ color: '#060609', roughness: 0.95 }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, height, (minZ + maxZ) / 2 + 3);
  scene.add(ceiling);
  const beamMat = new THREE.MeshStandardMaterial({ color: '#0b0b10', roughness: 0.7, metalness: 0.4 });
  for (let z = minZ + 1.5; z < maxZ; z += 2.2) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(width, 0.22, 0.18), beamMat);
    beam.position.set(0, height - 0.11, z);
    scene.add(beam);
  }

  // LED cove along the foot of the walls.
  const coveFloor = glowMaterial('#7a5cff', 0);
  const coves = [
    [width, [0, 0.03, minZ + 0.02], 0],
    [depth, [minX + 0.02, 0.03, (minZ + maxZ) / 2], Math.PI / 2],
    [depth, [maxX - 0.02, 0.03, (minZ + maxZ) / 2], Math.PI / 2],
  ];
  for (const [len, pos, rot] of coves) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(len, 0.025, 0.025), coveFloor);
    strip.position.set(...pos);
    strip.rotation.y = rot;
    scene.add(strip);
  }

  // Neon signs.
  const signs = [];
  const main = neonSign(
    [
      { text: 'GAWI.NO', x: 0.5, y: 0.38, color: '#8ce7bd', size: 160 },
      { text: '★ PORTFOLIO ★', x: 0.5, y: 0.8, color: '#ff4fa3', size: 70 },
    ],
    { width: 4, height: 1.1 },
  );
  main.mesh.position.set(0, 2.72, minZ + 0.03);
  main.level = 0.85;
  signs.push(main);
  const insert = neonSign([{ text: 'INSERT COIN', x: 0.5, y: 0.5, color: '#ffad42', size: 120 }], { width: 3, height: 0.45 });
  insert.mesh.position.set(minX + 0.03, 2.6, -2.1);
  insert.mesh.rotation.y = Math.PI / 2;
  signs.push(insert);
  const high = neonSign([{ text: 'HIGH SCORE', x: 0.5, y: 0.5, color: '#4cc9ff', size: 120 }], { width: 2.8, height: 0.45 });
  high.mesh.position.set(maxX - 0.03, 2.6, -1.6);
  high.mesh.rotation.y = -Math.PI / 2;
  signs.push(high);
  const over = neonSign([{ text: 'GAME OVER', x: 0.5, y: 0.5, color: '#ff3b2f', size: 120 }], { width: 1.8, height: 0.3 });
  over.mesh.position.set(maxX - 0.03, 2.55, 3.6);
  over.mesh.rotation.y = -Math.PI / 2;
  over.broken = 1;
  signs.push(over);
  const exit = neonSign([{ text: 'EXIT', x: 0.5, y: 0.5, color: '#3dff7a', size: 200 }], { width: 0.7, height: 0.25, canvasWidth: 1024 });
  exit.mesh.position.set(0, doorHeight + 0.3, maxZ - 0.03);
  exit.mesh.rotation.y = Math.PI;
  signs.push(exit);
  const open = neonSign([{ text: 'OPEN', x: 0.5, y: 0.5, color: '#ff4fa3', size: 220 }], { width: 1.1, height: 0.38, canvasWidth: 1024 });
  open.mesh.position.set(0, doorHeight + 0.35, maxZ + 0.04);
  open.level = 1.4;
  signs.push(open);
  for (const sign of signs) scene.add(sign.mesh);

  // Wall-wash lights for the big signs.
  const signLights = [
    Object.assign(new THREE.PointLight('#8ce7bd', 0, 9, 2), { userData: { base: 28 } }),
    Object.assign(new THREE.PointLight('#ffad42', 0, 5, 2), { userData: { base: 7 } }),
    Object.assign(new THREE.PointLight('#4cc9ff', 0, 5, 2), { userData: { base: 7 } }),
  ];
  signLights[0].position.set(0, 2.4, minZ + 0.9);
  signLights[1].position.set(minX + 0.6, 2.5, -1.6);
  signLights[2].position.set(maxX - 0.6, 2.5, -1.6);
  scene.add(...signLights);

  const hemi = new THREE.HemisphereLight('#3b3566', '#060509', 0);
  scene.add(hemi);

  // Back-lit posters.
  const posters = [];
  const posterSpecs = [
    { title: 'ROOT ACCESS', sub: 'NOW PLAYING', color: '#ff4fa3', accent: '#ffd166', pos: [minX + 0.04, 1.65, 2.2], rot: Math.PI / 2 },
    { title: 'SECURE//SHELL', sub: 'INSERT KEY', color: '#4cc9ff', accent: '#8ce7bd', pos: [maxX - 0.04, 1.65, 1.6], rot: -Math.PI / 2 },
  ];
  for (const spec of posterSpecs) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.86, 1.24, 0.05), new THREE.MeshStandardMaterial({ color: '#0a0a0e', roughness: 0.4, metalness: 0.5 }));
    frame.position.set(...spec.pos);
    frame.rotation.y = spec.rot;
    const mat = glowMaterial('#ffffff', 0, { map: posterTexture(spec.title, spec.sub, spec.color, spec.accent) });
    const art = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 1.14), mat);
    art.position.set(0, 0, 0.027);
    frame.add(art);
    scene.add(frame);
    posters.push(mat);
  }

  const tokens = tokenMachine();
  tokens.group.position.set(maxX - 0.3, 0, 4.7);
  tokens.group.rotation.y = -Math.PI / 2;
  scene.add(tokens.group);
  posters.push(tokens.panelMat);

  // Haze beams from ceiling spots.
  const beamGeometry = new THREE.CylinderGeometry(0.07, 0.95, 2.6, 32, 1, true).translate(0, -1.3, 0);
  const fixtureGeometry = new THREE.CylinderGeometry(0.1, 0.13, 0.16, 16);
  const fixtureMat = new THREE.MeshStandardMaterial({ color: '#141418', roughness: 0.5, metalness: 0.6 });
  const lensMat = glowMaterial('#fff4e0', 0);
  const beams = [];
  function addBeam(x, z, color, strength, tilt = [0, 0]) {
    const group = new THREE.Group();
    group.position.set(x, height - 0.08, z);
    group.rotation.set(tilt[0], 0, tilt[1]);
    const fixture = new THREE.Mesh(fixtureGeometry, fixtureMat);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.095, 16), lensMat);
    lens.rotation.x = Math.PI / 2;
    lens.position.y = -0.081;
    const mat = createBeamMaterial(color, 0);
    mat.userData.base = strength;
    const cone = new THREE.Mesh(beamGeometry, mat);
    cone.position.y = -0.08;
    group.add(fixture, lens, cone);
    scene.add(group);
    beams.push(mat);
    return group;
  }

  // Floating dust in the beams.
  const dustCount = quality.particles;
  const positions = new Float32Array(dustCount * 3);
  const seeds = new Float32Array(dustCount);
  for (let i = 0; i < dustCount; i++) {
    positions[i * 3] = minX + 0.5 + Math.random() * (width - 1);
    positions[i * 3 + 1] = Math.random() * height;
    positions[i * 3 + 2] = minZ + 0.5 + Math.random() * (depth - 1);
    seeds[i] = Math.random();
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  dustGeometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
  const dustMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, map: { value: softDotTexture() }, pixelRatio: { value: renderer.getPixelRatio() }, level: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float seed;
      uniform float time;
      uniform float pixelRatio;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        p.x += sin(time * 0.11 + seed * 40.0) * 0.35;
        p.z += cos(time * 0.09 + seed * 25.0) * 0.35;
        p.y = mod(p.y + time * (0.015 + seed * 0.03), ${height.toFixed(2)});
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (1.2 + seed * 2.2) * pixelRatio * (3.0 / -mv.z);
        vAlpha = (0.25 + 0.75 * (0.5 + 0.5 * sin(time * (0.6 + seed) + seed * 50.0))) * smoothstep(0.0, 0.4, p.y);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform float level;
      varying float vAlpha;
      void main() {
        float a = texture2D(map, gl_PointCoord).r * vAlpha * level;
        gl_FragColor = vec4(vec3(1.0, 0.95, 0.9) * a * 0.55, 1.0);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const dust = new THREE.Points(dustGeometry, dustMat);
  dust.frustumCulled = false;
  scene.add(dust);

  const state = { power: 0 };

  // Pools are in world x/z; the floor shader works from world positions.
  function setPoolWorld(i, x, z, color, intensity, falloff) {
    uniforms.pools.value[i].set(x, z, intensity, falloff);
    if (color) uniforms.poolColors.value[i].set(color);
  }

  // Static pools under the signs and token machine.
  setPoolWorld(16, 0, minZ + 0.6, '#8ce7bd', 0, 1.2);
  setPoolWorld(17, minX + 0.4, -1.6, '#ffad42', 0, 1.6);
  setPoolWorld(18, maxX - 0.4, -1.6, '#4cc9ff', 0, 1.6);
  setPoolWorld(19, 0, maxZ + 0.6, '#ff4fa3', 0, 1.8);

  return {
    floor,
    signs,
    beams,
    addBeam,
    setPoolWorld,
    state,
    setReflectionSize(w, h) {
      if (floor.getRenderTarget) floor.getRenderTarget().setSize(Math.max(64, Math.round(w)), Math.max(64, Math.round(h)));
    },
    update(time, dt) {
      const p = state.power;
      dustMat.uniforms.time.value = time;
      dustMat.uniforms.level.value = p;
      dustMat.uniforms.pixelRatio.value = renderer.getPixelRatio();
      setGlow(coveFloor, 1.5 * p);
      setGlow(lensMat, 3 * p);
      hemi.intensity = 0.6 * p;
      for (const m of posters) setGlow(m, 0.95 * p);
      for (const m of beams) {
        m.uniforms.strength.value = m.userData.base * p;
        m.uniforms.time.value = time;
      }
      signs.forEach((sign, i) => {
        let flicker = 1;
        if (sign.broken) {
          const n = Math.sin(time * 3.1) + Math.sin(time * 7.7) * 0.6 + Math.sin(time * 17.3) * 0.3;
          flicker = n > 0.9 ? 0.15 : n > 0.75 ? 0.6 : 1;
        } else if (Math.sin(time * 0.37 + i * 11) > 0.995) {
          flicker = 0.4;
        }
        setGlow(sign.material, sign.lit * sign.level * flicker * 1.25);
      });
      const [mainSign, insertSign, highSign] = signs;
      signLights[0].intensity = signLights[0].userData.base * mainSign.lit;
      signLights[1].intensity = signLights[1].userData.base * insertSign.lit;
      signLights[2].intensity = signLights[2].userData.base * highSign.lit;
      uniforms.pools.value[16].z = 0.9 * mainSign.lit;
      uniforms.pools.value[17].z = 0.5 * insertSign.lit;
      uniforms.pools.value[18].z = 0.5 * highSign.lit;
      uniforms.pools.value[19].z = 0.5 * signs[5].lit;
    },
  };
}

