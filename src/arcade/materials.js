import * as THREE from 'three';

/** Curved CRT tube: barrel distortion, scanlines, aperture mask, rolling bar and power-on line. */
export function createCrtMaterial(map, tint) {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: map },
      time: { value: 0 },
      brightness: { value: 1.6 },
      power: { value: 1 },
      tint: { value: new THREE.Color(tint) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform float time;
      uniform float brightness;
      uniform float power;
      uniform vec3 tint;
      varying vec2 vUv;

      void main() {
        vec2 cc = vUv - 0.5;
        float r2 = dot(cc, cc);
        vec2 uv = 0.5 + cc * (1.0 + 0.11 * r2) * 0.975;
        vec2 inside2 = step(vec2(0.0), uv) * step(uv, vec2(1.0));
        float inside = inside2.x * inside2.y;

        float ca = 0.0016 * (0.5 + r2 * 4.0);
        vec3 col;
        col.r = texture2D(map, uv + vec2(ca, 0.0)).r;
        col.g = texture2D(map, uv).g;
        col.b = texture2D(map, uv - vec2(ca, 0.0)).b;

        float scan = 0.74 + 0.26 * sin(uv.y * 384.0 * 3.14159);
        float mask = 0.9 + 0.1 * sin(uv.x * 512.0 * 2.094);
        float roll = smoothstep(0.0, 0.12, abs(fract(uv.y * 0.6 - time * 0.07) - 0.5));
        col *= scan * mask;
        col *= 0.93 + 0.07 * roll;
        col += tint * 0.012;

        float vig = smoothstep(0.85, 0.2, length(cc * vec2(1.0, 1.15)) * 1.25);
        col *= mix(0.45, 1.0, vig);

        // Power: a bright horizontal line that opens into the picture.
        float open = smoothstep(0.25, 1.0, power);
        float lineW = smoothstep(0.0, 0.25, power);
        float shown = step(abs(cc.x), 0.5 * lineW) * step(abs(cc.y), max(0.006, 0.5 * open));
        float flash = (1.0 - open) * lineW * 3.0;
        col = col * shown * open + vec3(flash) * shown;

        col *= brightness * (0.985 + 0.015 * sin(time * 113.0));

        // Glass: faint highlight and edge falloff.
        float hl = smoothstep(0.42, 0.0, length((vUv - vec2(0.28, 0.8)) * vec2(1.0, 1.7)));
        col += vec3(0.035) * hl * brightness;

        gl_FragColor = vec4(col * inside, 1.0);
      }
    `,
    toneMapped: false,
  });
}

/** Emissive material for neon tubes and lit panels; brightness is driven per frame. */
export function glowMaterial(color, level = 1, options = {}) {
  const material = new THREE.MeshBasicMaterial({ color, toneMapped: false, ...options });
  material.userData.baseColor = new THREE.Color(color);
  setGlow(material, level);
  return material;
}

export function setGlow(material, level) {
  material.color.copy(material.userData.baseColor).multiplyScalar(level);
}

/** Additive, view-dependent light cone that reads as a beam through haze. */
export function createBeamMaterial(color, strength = 0.35) {
  return new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(color) },
      strength: { value: strength },
      time: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying float vAlong;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vAlong = clamp(-position.y / 2.6, 0.0, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      uniform float strength;
      uniform float time;
      varying float vAlong;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float facing = pow(abs(dot(normalize(vNormal), normalize(vView))), 1.6);
        float fall = pow(1.0 - vAlong, 1.3) * smoothstep(0.0, 0.06, vAlong);
        float shimmer = 0.9 + 0.1 * sin(time * 0.7 + vAlong * 9.0);
        gl_FragColor = vec4(color * facing * fall * strength * shimmer, 1.0);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}
