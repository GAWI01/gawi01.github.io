/**
 * Synthesised arcade soundscape: no audio files, just Web Audio.
 * Off by default; the choice is remembered.
 */
export class ArcadeAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = false;
    this.lastBlip = 0;
    this.ambientTimer = null;
  }

  get wanted() {
    try {
      return localStorage.getItem('gawi-sound') === 'on';
    } catch {
      return false;
    }
  }

  async setEnabled(on) {
    this.enabled = on;
    try {
      localStorage.setItem('gawi-sound', on ? 'on' : 'off');
    } catch {
      // Not remembered; fine.
    }
    if (on && !this.ctx) this.init();
    if (!this.ctx) return;
    if (on) await this.ctx.resume();
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(on ? 0.55 : 0, now, 0.15);
    if (on) this.scheduleAmbientBleep();
    else clearTimeout(this.ambientTimer);
  }

  init() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    // Room tone: brown noise through a low-pass, plus mains hum from the cabinets.
    const length = ctx.sampleRate * 4;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.5;
    }
    this.noiseBuffer = buffer;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    const roomGain = ctx.createGain();
    roomGain.gain.value = 0.16;
    noise.connect(lp).connect(roomGain).connect(this.master);
    noise.start();
    for (const [freq, gain] of [[50, 0.018], [100, 0.008]]) {
      const osc = ctx.createOscillator();
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = gain;
      osc.connect(g).connect(this.master);
      osc.start();
    }
  }

  tone({ freq = 880, to, duration = 0.08, type = 'square', gain = 0.05, delay = 0, pan = 0 }) {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    osc.connect(g).connect(panner).connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  hover(pan = 0) {
    const now = performance.now();
    if (now - this.lastBlip < 90) return;
    this.lastBlip = now;
    this.tone({ freq: 1320, duration: 0.045, gain: 0.025, pan });
  }

  coin() {
    this.tone({ freq: 988, duration: 0.09, gain: 0.06 });
    this.tone({ freq: 1319, duration: 0.35, gain: 0.06, delay: 0.085 });
  }

  back() {
    this.tone({ freq: 880, to: 330, duration: 0.22, gain: 0.04, type: 'triangle' });
  }

  whoosh(duration = 2.4) {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(220, t);
    bp.frequency.exponentialRampToValueAtTime(1800, t + duration * 0.85);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + duration * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + duration + 0.05);
    this.tone({ freq: 60, to: 40, duration: 0.4, type: 'sine', gain: 0.2, delay: duration - 0.2 });
  }

  powerOn() {
    this.tone({ freq: 55, to: 110, duration: 0.6, type: 'sawtooth', gain: 0.03 });
    this.tone({ freq: 15734, duration: 0.8, type: 'sine', gain: 0.004, delay: 0.1 });
  }

  /** Distant games playing somewhere in the room. */
  scheduleAmbientBleep() {
    clearTimeout(this.ambientTimer);
    this.ambientTimer = setTimeout(() => {
      if (!this.enabled) return;
      const pan = Math.random() * 1.6 - 0.8;
      const base = [262, 330, 392, 523][Math.floor(Math.random() * 4)];
      const notes = Math.random() > 0.5 ? [1, 1.25, 1.5, 2] : [2, 1.5, 1.25, 1];
      notes.forEach((m, i) => this.tone({ freq: base * m, duration: 0.07, gain: 0.008, delay: i * 0.075, pan }));
      this.scheduleAmbientBleep();
    }, 2500 + Math.random() * 5000);
  }
}
