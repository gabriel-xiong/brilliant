/**
 * Lightweight, code-only sound effects synthesized with the Web Audio API.
 *
 * No binary audio assets are shipped: every sound is generated on the fly from
 * oscillators + gain envelopes so the bundle stays small. Audio stays quiet and
 * very short by design — this is meant to read as polish, not a toy.
 *
 * Browsers block audio until a user gesture, so the AudioContext is created (and
 * resumed) lazily inside the play calls, which are only ever triggered from real
 * user interactions (clicks, lesson completion).
 */

const STORAGE_KEY = 'soundEnabled';

/** Master attenuation applied to every sound so nothing is ever loud. */
const MASTER_GAIN = 0.5;

let audioContext: AudioContext | null = null;
let enabled = readStoredPreference();
const listeners = new Set<(enabled: boolean) => void>();

function readStoredPreference(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    // Default ON (but quiet); only an explicit "false" mutes.
    return raw === null ? true : raw !== 'false';
  } catch {
    return true;
  }
}

function persistPreference(value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? 'true' : 'false');
  } catch {
    /* storage unavailable (private mode, etc.) — preference stays in-memory */
  }
}

/**
 * Lazily create the shared AudioContext and resume it if a previous gesture left
 * it suspended. Returns null when Web Audio is unavailable.
 */
function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioContext) {
    try {
      audioContext = new Ctor();
    } catch {
      return null;
    }
  }
  if (audioContext.state === 'suspended') {
    // Resume is safe to call from within a user-gesture-driven play call.
    void audioContext.resume().catch(() => {});
  }
  return audioContext;
}

/** A single gentle tone with a fast attack/decay envelope. */
function playTone(
  ctx: AudioContext,
  {
    frequency,
    type = 'sine',
    startTime,
    duration,
    peak,
  }: {
    frequency: number;
    type?: OscillatorType;
    startTime: number;
    duration: number;
    peak: number;
  }
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, startTime);

  const safePeak = peak * MASTER_GAIN;
  // Short attack then exponential-ish decay to silence — keeps it soft and tick-like.
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.linearRampToValueAtTime(safePeak, startTime + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}

/** A soft, short tick for UI button presses. */
export function playClick(): void {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  playTone(ctx, { frequency: 660, type: 'triangle', startTime: now, duration: 0.06, peak: 0.05 });
}

/** A brief, pleasant ascending chime for lesson completion. */
export function playLessonComplete(): void {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  // A small major arpeggio (C5 - E5 - G5 - C6) that resolves upward.
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((frequency, index) => {
    playTone(ctx, {
      frequency,
      type: 'sine',
      startTime: now + index * 0.09,
      duration: 0.32,
      peak: 0.09,
    });
  });
}

/** Whether sound effects are currently enabled. */
export function isSoundEnabled(): boolean {
  return enabled;
}

/** Enable or disable sound, persisting the choice and notifying subscribers. */
export function setSoundEnabled(value: boolean): void {
  if (enabled === value) return;
  enabled = value;
  persistPreference(value);
  // Touch the context on enable so the first real sound isn't delayed by setup.
  if (value) getAudioContext();
  listeners.forEach((listener) => listener(enabled));
}

/** Toggle sound on/off; returns the new state. */
export function toggleSound(): boolean {
  setSoundEnabled(!enabled);
  return enabled;
}

/** Subscribe to enabled-state changes. Returns an unsubscribe function. */
export function subscribeSound(listener: (enabled: boolean) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
