// Tiny WebAudio sound kit (no asset files). Every sound has a visual equivalent in the UI.
let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean) { enabled = on; }

export function unlockAudio() {
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    tone(1, 0.01, 0.0001); // silent unlock for iOS
  } catch {}
}

function tone(freq: number, dur: number, vol = 0.25, type: OscillatorType = 'sine', at = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t); o.stop(t + dur + 0.05);
}

export const sfx = {
  ping() { if (enabled) { tone(880, 0.25, 0.2); tone(1320, 0.3, 0.15, 'sine', 0.12); } },
  alarm() { if (enabled) { for (let i = 0; i < 3; i++) { tone(520, 0.15, 0.3, 'square', i * 0.3); tone(380, 0.15, 0.3, 'square', i * 0.3 + 0.15); } } },
  clear() { if (enabled) { tone(660, 0.15, 0.2); tone(990, 0.25, 0.2, 'sine', 0.15); } },
  beat() { if (enabled) { tone(70, 0.14, 0.5); tone(60, 0.16, 0.4, 'sine', 0.18); } },
  catch() { if (enabled) { tone(300, 0.2, 0.3, 'sawtooth'); tone(200, 0.35, 0.3, 'sawtooth', 0.15); } },
  fanfare() { if (enabled) { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 0.25, 'triangle', i * 0.12)); } },
  /** Chasers just got revealed to runners: two rising sweeps, hard to miss. */
  reveal() { if (enabled) { [0, 0.45].forEach((at) => { tone(600, 0.18, 0.35, 'square', at); tone(900, 0.18, 0.35, 'square', at + 0.15); tone(1200, 0.25, 0.3, 'square', at + 0.3); }); } },
  /** Knocked out (zone). */
  out() { if (enabled) { tone(500, 0.25, 0.35, 'sawtooth'); tone(350, 0.3, 0.35, 'sawtooth', 0.25); tone(200, 0.5, 0.35, 'sawtooth', 0.55); } },
  /** Small blip for minor events. */
  blip() { if (enabled) tone(1000, 0.08, 0.12); },
  go() { if (enabled) { tone(440, 0.2, 0.3, 'square'); tone(880, 0.4, 0.3, 'square', 0.22); } },
};

/**
 * Vibrate. Android: real vibration patterns. iPhone: browsers can't vibrate, but on iOS 18+ toggling a
 * hidden "switch" checkbox gives a small haptic tap, so we tap once per pulse as a best effort.
 * Not tied to the sound setting (it's silent).
 */
export function buzz(pattern: number | number[]) {
  try {
    if (typeof navigator.vibrate === 'function') { navigator.vibrate(pattern); return; }
    const pulses = Array.isArray(pattern) ? pattern.filter((_, i) => i % 2 === 0) : [pattern];
    let t = 0;
    for (const len of pulses) { setTimeout(iosTap, t); t += len + 120; }
  } catch {}
}
let tapLabel: HTMLLabelElement | null = null;
function iosTap() {
  try {
    if (!tapLabel) {
      const input = document.createElement('input');
      input.type = 'checkbox'; input.setAttribute('switch', ''); input.id = '__haptic';
      input.style.cssText = 'position:fixed;opacity:0;pointer-events:none;width:1px;height:1px;left:-9px';
      tapLabel = document.createElement('label'); tapLabel.htmlFor = '__haptic'; tapLabel.style.display = 'none';
      document.body.append(input, tapLabel);
    }
    tapLabel.click();
  } catch {}
}

export function speak(text: string) {
  if (!enabled || typeof speechSynthesis === 'undefined') return;
  try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.rate = 1.05; speechSynthesis.speak(u); } catch {}
}
