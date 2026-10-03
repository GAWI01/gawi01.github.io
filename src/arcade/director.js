import * as THREE from 'three';
import gsap from 'gsap';

const UP = new THREE.Vector3(0, 1, 0);
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

/**
 * Owns the camera. In "free" mode it idles at the home pose with pointer parallax,
 * drag-to-look and a slow handheld sway; flights move it along spline paths.
 */
export class CameraDirector {
  constructor(camera, { reducedMotion }) {
    this.camera = camera;
    this.reducedMotion = reducedMotion;
    this.home = { position: new THREE.Vector3(0, 1.6, 3), target: new THREE.Vector3(0, 1.12, -2.6), fov: 48 };
    this.mode = 'locked';
    this.pointer = new THREE.Vector2();
    this.drag = { yaw: 0, pitch: 0 };
    this.look = { yaw: 0, pitch: 0 };
    this.freeBlend = 0;
    this.tween = null;
    this._dir = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._pos = new THREE.Vector3();
    this._target = new THREE.Vector3();
  }

  setPointer(x, y) {
    this.pointer.set(x, y);
  }

  addDrag(dx, dy) {
    this.drag.yaw = THREE.MathUtils.clamp(this.drag.yaw - dx * 0.0035, -0.85, 0.85);
    this.drag.pitch = THREE.MathUtils.clamp(this.drag.pitch - dy * 0.0025, -0.28, 0.3);
  }

  resetLook() {
    this.drag.yaw = this.drag.pitch = 0;
    this.look.yaw = this.look.pitch = 0;
    this.freeBlend = 0;
  }

  /** Where the free camera is (or would be) at a given moment. */
  freePose(time, outPos, outTarget) {
    const b = this.freeBlend;
    const sway = this.reducedMotion ? 0 : 1;
    outPos.copy(this.home.position);
    outPos.x += (this.pointer.x * 0.16 + Math.sin(time * 0.31) * 0.03 * sway) * b;
    outPos.y += (this.pointer.y * 0.06 + Math.sin(time * 0.47) * 0.012 * sway) * b;
    const dir = this._dir.subVectors(this.home.target, this.home.position);
    dir.applyAxisAngle(UP, this.look.yaw);
    this._right.crossVectors(dir, UP).normalize();
    dir.applyAxisAngle(this._right, this.look.pitch);
    outTarget.copy(outPos).add(dir);
  }

  update(time, dt) {
    if (this.mode !== 'free') return;
    this.freeBlend = Math.min(1, this.freeBlend + dt * 0.7);
    const k = 1 - Math.exp(-dt * 3.5);
    const yaw = this.drag.yaw - this.pointer.x * 0.09;
    const pitch = this.drag.pitch + this.pointer.y * 0.045;
    this.look.yaw += (yaw * this.freeBlend - this.look.yaw) * k;
    this.look.pitch += (pitch * this.freeBlend - this.look.pitch) * k;
    this.freePose(time, this._pos, this._target);
    this.camera.position.copy(this._pos);
    this.camera.lookAt(this._target);
    if (Math.abs(this.camera.fov - this.home.fov) > 0.01) {
      this.camera.fov += (this.home.fov - this.camera.fov) * k;
      this.camera.updateProjectionMatrix();
    }
  }

  /**
   * Flies along a Catmull-Rom path through `via` to `dest`, while the gaze sweeps
   * to `dest.target` slightly ahead of the body so it reads as a deliberate move.
   */
  flyTo(dest, { duration = 2.4, via = [], ease = 'power2.inOut', lookLead = 1.35, then = 'locked', onProgress } = {}) {
    this.tween?.kill();
    this.mode = 'flying';
    const camera = this.camera;
    const startPos = camera.position.clone();
    const startFov = camera.fov;
    const reach = startPos.distanceTo(dest.target);
    const startTarget = camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(reach).add(startPos);
    const curve = new THREE.CatmullRomCurve3([startPos, ...via, dest.position], false, 'centripetal');
    const target = new THREE.Vector3();
    const state = { t: 0 };
    return new Promise((resolve) => {
      this.tween = gsap.to(state, {
        t: 1,
        duration,
        ease,
        onUpdate: () => {
          const t = state.t;
          curve.getPointAt(t, camera.position);
          target.lerpVectors(startTarget, dest.target, easeOutCubic(Math.min(1, t * lookLead)));
          camera.fov = THREE.MathUtils.lerp(startFov, dest.fov, t);
          camera.updateProjectionMatrix();
          camera.lookAt(target);
          onProgress?.(t);
        },
        onComplete: () => {
          this.tween = null;
          this.mode = then;
          resolve();
        },
      });
    });
  }

  finishFlight() {
    this.tween?.progress(1);
  }
}
