/**
 * Web Audio API Sound Synthesis Utilities
 * 
 * Following userinterface-wiki rules:
 * - context-reuse-single: Reuse single AudioContext
 * - context-resume-suspended: Resume suspended AudioContext before playing
 * - context-cleanup-nodes: Disconnect audio nodes after playback
 * - envelope-exponential-decay: Exponential ramps for natural decay
 * - envelope-no-zero-target: Target 0.001, not 0
 * - envelope-set-initial-value: Set initial value before ramping
 * - design-noise-for-percussion: Filtered noise for clicks/taps
 * - design-oscillator-for-tonal: Oscillators with pitch sweep for tonal sounds
 * - design-filter-for-character: Bandpass filter to shape percussive sounds
 * - param-click-duration: Click sounds: 5-15ms duration
 * - param-filter-frequency-range: Click filter: 3000-6000Hz
 * - param-reasonable-gain: Gain under 1.0 to prevent clipping
 * - param-q-value-range: Filter Q: 2-5 for focused but natural
 * - impl-default-subtle: Default volume subtle (0.15-0.3)
 * - a11y-reduced-motion-check: Respect prefers-reduced-motion
 */

// Singleton AudioContext (context-reuse-single)
let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

/**
 * Check if sound should be played based on user preferences
 */
function shouldPlaySound(): boolean {
  // a11y-reduced-motion-check: Respect prefers-reduced-motion for sound
  if (typeof window === "undefined") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Subtle click sound for focus events
 * Uses filtered noise burst (design-noise-for-percussion)
 * Duration: 8ms (param-click-duration: 5-15ms)
 * Filter: 4000Hz (param-filter-frequency-range: 3000-6000Hz)
 * Q: 3 (param-q-value-range: 2-5)
 * Gain: 0.15 (impl-default-subtle)
 */
export function playFocusSound(): void {
  if (!shouldPlaySound()) return;

  const ctx = getAudioContext();
  
  // context-resume-suspended: Resume if suspended
  if (ctx.state === "suspended") {
    ctx.resume();
  }

  const t = ctx.currentTime;
  const duration = 0.008; // 8ms (param-click-duration)

  // Create noise buffer (design-noise-for-percussion)
  const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    // Exponential decay applied to noise
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / 50);
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  // Bandpass filter (design-filter-for-character)
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 4000; // param-filter-frequency-range
  filter.Q.value = 3; // param-q-value-range

  // Gain envelope (envelope-set-initial-value, envelope-exponential-decay)
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.15, t); // impl-default-subtle
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration); // envelope-no-zero-target

  // Connect and play
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start(t);

  // context-cleanup-nodes: Clean up after playback
  source.onended = () => {
    source.disconnect();
    filter.disconnect();
    gain.disconnect();
  };
}

/**
 * Subtle morph sound for search bar state change
 * Slightly softer than focus sound
 * Gain: 0.12 (even more subtle)
 */
export function playMorphSound(): void {
  if (!shouldPlaySound()) return;

  const ctx = getAudioContext();
  
  if (ctx.state === "suspended") {
    ctx.resume();
  }

  const t = ctx.currentTime;
  const duration = 0.01; // 10ms

  const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / 60);
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 3500; // Slightly lower for softer feel
  filter.Q.value = 2.5;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.12, t); // More subtle
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start(t);

  source.onended = () => {
    source.disconnect();
    filter.disconnect();
    gain.disconnect();
  };
}

/**
 * Confirmation sound for search submit
 * Uses oscillator with ascending pitch (design-oscillator-for-tonal)
 * Ascending = positive/confirmation
 * Duration: 50ms (weight-duration-matches-action)
 * Gain: 0.25 (slightly fuller for significant action - weight-match-action)
 */
export function playSubmitSound(): void {
  if (!shouldPlaySound()) return;

  const ctx = getAudioContext();
  
  if (ctx.state === "suspended") {
    ctx.resume();
  }

  const t = ctx.currentTime;
  const duration = 0.05; // 50ms

  // Oscillator with pitch sweep (design-oscillator-for-tonal)
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(280, t);
  osc.frequency.exponentialRampToValueAtTime(420, t + duration); // Ascending = positive

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.2, t); // weight-match-action: slightly fuller
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + duration);

  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
}

/**
 * Dismissal sound for clearing input
 * Uses oscillator with descending pitch
 * Descending = dismissal/removal
 * Duration: 30ms
 * Gain: 0.18
 */
export function playClearSound(): void {
  if (!shouldPlaySound()) return;

  const ctx = getAudioContext();
  
  if (ctx.state === "suspended") {
    ctx.resume();
  }

  const t = ctx.currentTime;
  const duration = 0.03; // 30ms

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(380, t);
  osc.frequency.exponentialRampToValueAtTime(220, t + duration); // Descending = dismissal

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.18, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + duration);

  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
}
