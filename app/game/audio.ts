"use client";

import type { Cue } from "./audio-model";

/**
 * All game sound, synthesised with WebAudio: no audio files, nothing to license. Browsers only
 * allow sound after a user gesture, so the context is created on the first pointer or key
 * press after `start`.
 */
export class RunAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engine: { osc: OscillatorNode[]; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private siren: { osc: OscillatorNode; lfo: OscillatorNode; gain: GainNode } | null = null;
  private noise: AudioBuffer | null = null;
  private muted = false;
  private unlock = () => this.ensure();

  start(): void {
    window.addEventListener("pointerdown", this.unlock);
    window.addEventListener("keydown", this.unlock);
  }

  stop(): void {
    window.removeEventListener("pointerdown", this.unlock);
    window.removeEventListener("keydown", this.unlock);
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
    this.engine = null;
    this.siren = null;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    const ctx = this.ctx;
    if (ctx !== null && this.master !== null) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.8, ctx.currentTime, 0.05);
    }
  }

  /** Continuous layers, called every frame: engine pitch and level, siren level. */
  update(engineHz: number, engineLevel: number, sirenLevel: number): void {
    const ctx = this.ctx;
    if (ctx === null || this.engine === null || this.siren === null) return;
    const t = ctx.currentTime;
    this.engine.osc[0]?.frequency.setTargetAtTime(engineHz, t, 0.08);
    this.engine.osc[1]?.frequency.setTargetAtTime(engineHz * 2.01, t, 0.08);
    this.engine.filter.frequency.setTargetAtTime(300 + engineHz * 6, t, 0.1);
    this.engine.gain.gain.setTargetAtTime(engineLevel * 0.09, t, 0.15);
    this.siren.gain.gain.setTargetAtTime(sirenLevel * 0.05, t, 0.2);
  }

  play(cue: Cue): void {
    const ctx = this.ctx;
    if (ctx === null || this.master === null) return;
    const t = ctx.currentTime;
    if (cue === "hit") {
      this.burst(t, 0.35, 900, 0.5);
      this.tone(t, 70, 38, 0.3, 0.35, "sine");
    } else if (cue === "line") {
      this.tone(t, 880, 880, 0.18, 0.12, "triangle");
      this.tone(t + 0.12, 1320, 1320, 0.3, 0.12, "triangle");
    } else if (cue === "nitro") {
      this.burst(t, 0.7, 2400, 0.25);
    } else {
      this.tone(t, 220, 82, 0.9, 0.25, "sawtooth");
      this.burst(t, 0.5, 600, 0.3);
    }
  }

  private ensure(): void {
    if (this.ctx !== null) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : 0.8;
    master.connect(ctx.destination);

    // Engine: two detuned oscillators through a low-pass that opens with revs.
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 500;
    const engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    filter.connect(engineGain).connect(master);
    const osc = (["sawtooth", "square"] as const).map((type, i) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = 42 * (i + 1);
      o.connect(filter);
      o.start();
      return o;
    });

    // Siren: a wail swept by a slow LFO between about 650 and 1250 Hz.
    const sirenOsc = ctx.createOscillator();
    sirenOsc.type = "triangle";
    sirenOsc.frequency.value = 950;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.8;
    const depth = ctx.createGain();
    depth.gain.value = 300;
    lfo.connect(depth).connect(sirenOsc.frequency);
    const sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain).connect(master);
    sirenOsc.start();
    lfo.start();

    const length = ctx.sampleRate;
    const noise = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;

    this.ctx = ctx;
    this.master = master;
    this.engine = { osc, filter, gain: engineGain };
    this.siren = { osc: sirenOsc, lfo, gain: sirenGain };
    this.noise = noise;
  }

  /** Filtered noise with a fast attack and an exponential tail. */
  private burst(at: number, seconds: number, cutoff: number, level: number): void {
    const ctx = this.ctx;
    if (ctx === null || this.master === null || this.noise === null) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + seconds);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(at);
    src.stop(at + seconds);
  }

  /** A pitched blip that glides from `from` to `to` Hz. */
  private tone(
    at: number,
    from: number,
    to: number,
    seconds: number,
    level: number,
    type: OscillatorType,
  ): void {
    const ctx = this.ctx;
    if (ctx === null || this.master === null) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(to, at + seconds);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + seconds);
    osc.connect(gain).connect(this.master);
    osc.start(at);
    osc.stop(at + seconds);
  }
}
