"use client";

import { getAudioGraph, subscribeSound } from "./soundManager";

// Every cue here is synthesized, not sampled — oscillators + filtered
// noise + gain envelopes only. Each function is a no-op (silently returns)
// when sound is off or the AudioContext isn't available, so call sites
// never need their own enabled-check.

const noiseBufferCache = new WeakMap<AudioContext, AudioBuffer>();

function getNoiseBuffer(context: AudioContext): AudioBuffer {
  const cached = noiseBufferCache.get(context);
  if (cached) return cached;
  const duration = 1;
  const buffer = context.createBuffer(1, context.sampleRate * duration, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  noiseBufferCache.set(context, buffer);
  return buffer;
}

function noiseSource(context: AudioContext): AudioBufferSourceNode {
  const src = context.createBufferSource();
  src.buffer = getNoiseBuffer(context);
  src.loop = true;
  return src;
}

// ---- TV "no signal" static loop ----
// Unlike every other cue in this file (one-shot, fire-and-forget), this
// one has a real duration tied to page state: it runs continuously from
// page load through the CRT boot sequence and the whole pre-shatter Hero
// scroll range, then stops the instant the screen actually breaks (see
// HeroScene.tsx's Orchestrator, which calls start/stop alongside its own
// existing SCREEN_BREAK_START crossing-detection). Needs real start/stop
// handles kept module-scope since (unlike a one-shot) it can be playing
// across many separate call sites/renders.
let staticSource: AudioBufferSourceNode | null = null;
let staticHum: OscillatorNode | null = null;
let staticGain: GainNode | null = null;

/** Idempotent — safe to call every frame while the pre-shatter state
 * holds; no-ops if already running or sound is disabled. */
export function startTvStatic() {
  if (staticSource) return;
  const graph = getAudioGraph();
  if (!graph) return;
  const { context, destination } = graph;
  const now = context.currentTime;

  // Cut roughly in half from the original pass (0.05 -> 0.02) and
  // rolled off brighter — a continuous, sustained hiss (this can run for
  // as long as the user lingers pre-shatter, unlike every other one-shot
  // cue in this file) is a very different loudness/fatigue budget than a
  // quick transient, and the original level read as genuinely irritating
  // over more than a few seconds.
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  // Nudged up ~6% (0.02 -> 0.0213) per direct feedback that the no-signal
  // loop read as a little too quiet on page load — still a small, deliberate
  // bump, not a return toward the original level this was already cut from.
  gain.gain.linearRampToValueAtTime(0.0213, now + 0.5);
  gain.connect(destination);

  const noise = noiseSource(context);
  const filter = context.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(1500, now);
  filter.Q.value = 0.3;
  // Second-stage lowpass shaves the harsh top end left by the bandpass
  // alone — softens the hiss from "bright/sharp" toward "muffled," a
  // gentler background texture rather than something that grabs
  // attention while it loops.
  const softener = context.createBiquadFilter();
  softener.type = "lowpass";
  softener.frequency.setValueAtTime(1400, now);
  noise.connect(filter).connect(softener).connect(gain);
  noise.start(now);

  // A faint 60Hz hum underneath the hiss — real old-CRT "no signal" is
  // never pure white noise, there's always a bit of mains hum riding
  // along with it. Lowered alongside the hiss so the whole loop scales
  // down together, not just the noise layer.
  const hum = context.createOscillator();
  hum.type = "sine";
  hum.frequency.setValueAtTime(60, now);
  const humGain = context.createGain();
  humGain.gain.setValueAtTime(0.1, now);
  hum.connect(humGain).connect(gain);
  hum.start(now);

  staticSource = noise;
  staticHum = hum;
  staticGain = gain;
}

/** Fades out and stops the loop; safe to call even if it isn't running. */
export function stopTvStatic() {
  if (!staticSource || !staticGain) return;
  const context = staticSource.context;
  const now = context.currentTime;
  staticGain.gain.cancelScheduledValues(now);
  staticGain.gain.setValueAtTime(staticGain.gain.value, now);
  staticGain.gain.linearRampToValueAtTime(0.0001, now + 0.2);
  staticSource.stop(now + 0.22);
  staticHum?.stop(now + 0.22);
  staticSource = null;
  staticHum = null;
  staticGain = null;
}

// If the user mutes mid-loop, the loop's own nodes would otherwise keep
// playing (they were already started against the real AudioContext,
// independent of the `enabled` flag one-shots check on each call) —
// stop it immediately rather than leaving static hissing under a "Sound
// Off" toggle.
subscribeSound((enabled) => {
  if (!enabled) stopTvStatic();
});

/** Hero shard explosion — a real breaking-glass read: a heavy impact
 * crack + thud up front, then a long shower of high-frequency shard
 * transients that starts dense and thins out as debris settles, not a
 * single quick chirp. ~1.2s total. */
export function playShatter() {
  const graph = getAudioGraph();
  if (!graph) return;
  const { context, destination } = graph;
  const now = context.currentTime;

  // The impact itself — a sharp broadband crack, plus a second, lower-
  // passed noise punch layered under it for weight. Both non-tonal
  // (filtered noise, not an oscillator) — a pitched sweep here read as a
  // kick-drum "boom," too musical/rhythmic for a breaking-glass impact.
  const crack = noiseSource(context);
  const crackFilter = context.createBiquadFilter();
  crackFilter.type = "highpass";
  crackFilter.frequency.setValueAtTime(900, now);
  const crackGain = context.createGain();
  crackGain.gain.setValueAtTime(0.001, now);
  crackGain.gain.exponentialRampToValueAtTime(0.6, now + 0.01);
  crackGain.gain.exponentialRampToValueAtTime(0.02, now + 0.16);
  crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
  crack.connect(crackFilter).connect(crackGain).connect(destination);
  crack.start(now);
  crack.stop(now + 0.42);

  const punch = noiseSource(context);
  const punchFilter = context.createBiquadFilter();
  punchFilter.type = "lowpass";
  punchFilter.frequency.setValueAtTime(500, now);
  const punchGain = context.createGain();
  punchGain.gain.setValueAtTime(0.001, now);
  punchGain.gain.exponentialRampToValueAtTime(0.5, now + 0.008);
  punchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
  punch.connect(punchFilter).connect(punchGain).connect(destination);
  punch.start(now);
  punch.stop(now + 0.15);

  // A sustained, low-level "glass dust" texture under the shard shower —
  // gives the debris settling some body instead of just isolated tinks
  // over silence.
  const dust = noiseSource(context);
  const dustFilter = context.createBiquadFilter();
  dustFilter.type = "bandpass";
  dustFilter.frequency.setValueAtTime(3500, now);
  dustFilter.Q.value = 0.6;
  const dustGain = context.createGain();
  dustGain.gain.setValueAtTime(0.001, now);
  dustGain.gain.linearRampToValueAtTime(0.05, now + 0.15);
  dustGain.gain.exponentialRampToValueAtTime(0.001, now + 1.1);
  dust.connect(dustFilter).connect(dustGain).connect(destination);
  dust.start(now);
  dust.stop(now + 1.12);

  // Shard shower — many small high-frequency tinks, biased toward the
  // start (Math.random()**1.8 skews low) so density thins out over the
  // full ~1.2s tail the same way real falling debris does, with later,
  // later-arriving shards quieter than early ones.
  const shardCount = 26;
  for (let i = 0; i < shardCount; i++) {
    const delay = Math.pow(Math.random(), 1.8) * 1.05;
    const t = now + 0.015 + delay;
    const loudness = 1 - delay / 1.05;
    const osc = context.createOscillator();
    osc.type = "sine";
    const freq = 1800 + Math.random() * 4200;
    osc.frequency.setValueAtTime(freq, t);
    const g = context.createGain();
    const peak = (0.05 + Math.random() * 0.07) * (0.4 + loudness * 0.6);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06 + Math.random() * 0.05);
    osc.connect(g).connect(destination);
    osc.start(t);
    osc.stop(t + 0.14);
  }
}

/** Attention word-flicker — a bad-fluorescent-tube buzz, sustained long
 * enough to actually read as "flickering" rather than a single blip:
 * ~1s of irregular on/off with a bit of frequency jitter per step. */
export function playFlicker() {
  const graph = getAudioGraph();
  if (!graph) return;
  const { context, destination } = graph;
  const now = context.currentTime;

  const osc = context.createOscillator();
  osc.type = "sawtooth";
  const filter = context.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(600, now);
  filter.Q.value = 1.2;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, now);

  const flickerSteps = 42;
  const stepDur = 0.026;
  for (let i = 0; i < flickerSteps; i++) {
    const t = now + i * stepDur;
    const level = Math.random() > 0.32 ? 0.09 + Math.random() * 0.08 : 0.0001;
    gain.gain.setValueAtTime(level, t);
    // Slight per-step frequency jitter — a dead-steady 90Hz buzz for a
    // full second reads as a tone, not electrical trouble; real bad
    // ballast flicker wavers in pitch as much as in level.
    osc.frequency.setValueAtTime(85 + Math.random() * 25, t);
  }
  const totalDur = flickerSteps * stepDur;
  gain.gain.exponentialRampToValueAtTime(0.0001, now + totalDur + 0.08);

  osc.connect(filter).connect(gain).connect(destination);
  osc.start(now);
  osc.stop(now + totalDur + 0.12);
}

/** Impact section word-shake — muffled low-passed noise with a slow
 * amplitude wobble, like vibration felt through a wall. */
export function playInterference() {
  const graph = getAudioGraph();
  if (!graph) return;
  const { context, destination } = graph;
  const now = context.currentTime;

  const noise = noiseSource(context);
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(320, now);
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.16, now + 0.05);

  const wobble = context.createOscillator();
  wobble.type = "sine";
  wobble.frequency.setValueAtTime(14, now);
  const wobbleGain = context.createGain();
  wobbleGain.gain.value = 0.08;
  wobble.connect(wobbleGain).connect(gain.gain);

  gain.gain.setValueAtTime(0.16, now + 0.35);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);

  noise.connect(filter).connect(gain).connect(destination);
  noise.start(now);
  wobble.start(now);
  noise.stop(now + 0.58);
  wobble.stop(now + 0.58);
}

/** Impact "the mark" hit — a punchy pitch-drop thump with a short
 * noise-click attack, the same two-part "hit" feel as the visual pop. */
export function playImpactHit() {
  const graph = getAudioGraph();
  if (!graph) return;
  const { context, destination } = graph;
  const now = context.currentTime;

  const thump = context.createOscillator();
  thump.type = "sine";
  thump.frequency.setValueAtTime(220, now);
  thump.frequency.exponentialRampToValueAtTime(45, now + 0.16);
  const thumpGain = context.createGain();
  thumpGain.gain.setValueAtTime(0.5, now);
  thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
  thump.connect(thumpGain).connect(destination);
  thump.start(now);
  thump.stop(now + 0.3);

  const click = noiseSource(context);
  const clickFilter = context.createBiquadFilter();
  clickFilter.type = "highpass";
  clickFilter.frequency.setValueAtTime(2000, now);
  const clickGain = context.createGain();
  clickGain.gain.setValueAtTime(0.3, now);
  clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
  click.connect(clickFilter).connect(clickGain).connect(destination);
  click.start(now);
  click.stop(now + 0.04);
}

/** Marble resting/bouncing on a glass card surface — a soft, muted
 * "tock," not a bright ping. Called on every contact (every idle-bounce
 * repeat AND every hop landing — this needs to sit comfortably under
 * frequent, even continuous, repetition, so it stays gentle rather than
 * something that can only work as a rare accent). */
export function playGlassBounce(velocity = 1) {
  const graph = getAudioGraph();
  if (!graph) return;
  const { context, destination } = graph;
  const now = context.currentTime;
  const level = Math.min(1, Math.max(0.15, velocity));

  // A shared lowpass on the whole ring rounds off exactly the harsh
  // upper content that made the previous version read as "extreme
  // sharp" — the partials still give it a glassy, slightly inharmonic
  // character, they just don't get to ring out above ~3.2kHz unfiltered.
  const bus = context.createBiquadFilter();
  bus.type = "lowpass";
  bus.frequency.setValueAtTime(3200, now);
  bus.connect(destination);

  const base = 950 + Math.random() * 150;
  const partials = [1, 2.76, 4.98];
  partials.forEach((ratio, i) => {
    const osc = context.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(base * ratio, now);
    const g = context.createGain();
    const peak = level * (0.1 / (i + 1));
    const decay = 0.32 - i * 0.06;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, now + decay);
    osc.connect(g).connect(bus);
    osc.start(now);
    osc.stop(now + decay + 0.02);
  });

  // A soft, low-passed contact tick at the onset instead of a bright
  // highpassed one — still marks the moment of contact, without the
  // harsh top end.
  const tick = noiseSource(context);
  const tickFilter = context.createBiquadFilter();
  tickFilter.type = "lowpass";
  tickFilter.frequency.setValueAtTime(1800, now);
  const tickGain = context.createGain();
  tickGain.gain.setValueAtTime(level * 0.06, now);
  tickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);
  tick.connect(tickFilter).connect(tickGain).connect(destination);
  tick.start(now);
  tick.stop(now + 0.035);
}

/** Marble bouncing on the Pitch CTA — same contact gesture as the glass
 * bounce, but heavily damped/low-passed: a soft, padded thud instead of
 * a bright ping. */
export function playSoftBounce(velocity = 1) {
  const graph = getAudioGraph();
  if (!graph) return;
  const { context, destination } = graph;
  const now = context.currentTime;
  const level = Math.min(1, Math.max(0.15, velocity)) * 0.4;

  const osc = context.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(180, now);
  osc.frequency.exponentialRampToValueAtTime(110, now + 0.1);
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(500, now);
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(level, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
  osc.connect(filter).connect(gain).connect(destination);
  osc.start(now);
  osc.stop(now + 0.2);
}

/** Pitch's ghost/orange liquid spread — a filtered-noise whoosh with the
 * bandpass sweeping upward, like liquid rushing outward across a surface. */
export function playLiquidSpread() {
  const graph = getAudioGraph();
  if (!graph) return;
  const { context, destination } = graph;
  const now = context.currentTime;
  const duration = 0.6;

  const noise = noiseSource(context);
  const filter = context.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 0.9;
  filter.frequency.setValueAtTime(220, now);
  filter.frequency.exponentialRampToValueAtTime(2600, now + duration * 0.7);
  filter.frequency.exponentialRampToValueAtTime(900, now + duration);
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.22, now + duration * 0.3);
  gain.gain.linearRampToValueAtTime(0.0001, now + duration);

  noise.connect(filter).connect(gain).connect(destination);
  noise.start(now);
  noise.stop(now + duration + 0.05);
}

/** Resolution section reveal — a clean two-note chime, slow attack/decay,
 * no noise at all: the "resolved" sound after everything before it. */
export function playPristine() {
  const graph = getAudioGraph();
  if (!graph) return;
  const { context, destination } = graph;
  const now = context.currentTime;

  [660, 990].forEach((freq, i) => {
    const t = now + i * 0.09;
    const osc = context.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t);
    const g = context.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    osc.connect(g).connect(destination);
    osc.start(t);
    osc.stop(t + 1.15);
  });
}
