// Sound effects via Web Audio API.
//
// We synthesise tones rather than shipping WAV/MP3 files — keeps the
// bundle small and avoids licensing questions. Each cue is a short
// envelope around one or two oscillators. Pure-function calls;
// callers don't need to hold the AudioContext.
//
// Real chess apps eventually replace these with recorded samples
// (lichess uses ~12 WAV files). The interface is intentionally
// minimal so swapping the implementation later is a one-file change.

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ctx) return ctx;
  try {
    const C = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    return ctx;
  } catch {
    return null;
  }
}

type ToneSpec = {
  freq: number;        // base frequency in Hz
  duration: number;    // total length in seconds
  attack?: number;     // ramp-up time in seconds (default 0.01)
  decay?: number;      // ramp-down time in seconds (default whole tail)
  type?: OscillatorType; // 'sine' | 'square' | 'triangle' | 'sawtooth'
  detune?: number;     // cents
};

function play(volume: number, ...tones: ToneSpec[]): void {
  const c = getContext();
  if (!c || volume <= 0) return;
  // Resume context on first user gesture (browser autoplay policy).
  if (c.state === 'suspended') void c.resume();
  const now = c.currentTime;
  for (const t of tones) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = t.type ?? 'sine';
    osc.frequency.value = t.freq;
    if (t.detune) osc.detune.value = t.detune;
    osc.connect(gain);
    gain.connect(c.destination);
    const attack = t.attack ?? 0.01;
    const decay = t.decay ?? t.duration - attack;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);
    osc.start(now);
    osc.stop(now + t.duration + 0.05);
  }
}

/** Soft wood-ish "tock" for a regular move. */
export function playMove(volume = 0.5): void {
  play(volume, { freq: 220, duration: 0.08, type: 'triangle' });
}

/** Sharper double-pop for a capture. */
export function playCapture(volume = 0.5): void {
  play(
    volume,
    { freq: 300, duration: 0.06, type: 'square' },
    { freq: 180, duration: 0.10, type: 'triangle', attack: 0.04 },
  );
}

/** Rising chime for check — players should NOTICE this. */
export function playCheck(volume = 0.5): void {
  play(
    volume,
    { freq: 660, duration: 0.20, type: 'sine' },
    { freq: 880, duration: 0.20, type: 'sine', attack: 0.10 },
  );
}

/** Two-tone fanfare for win. */
export function playWin(volume = 0.5): void {
  play(
    volume,
    { freq: 523, duration: 0.15, type: 'triangle' },
    { freq: 784, duration: 0.30, type: 'triangle', attack: 0.15 },
  );
}

/** Descending "ouch" for loss. */
export function playLoss(volume = 0.5): void {
  play(
    volume,
    { freq: 392, duration: 0.20, type: 'triangle' },
    { freq: 220, duration: 0.40, type: 'triangle', attack: 0.20 },
  );
}

/** Flat single note for draw. */
export function playDraw(volume = 0.5): void {
  play(volume, { freq: 440, duration: 0.40, type: 'sine' });
}

/** Tick for clock low-time warning. */
export function playTick(volume = 0.5): void {
  play(volume, { freq: 1500, duration: 0.05, type: 'square' });
}
