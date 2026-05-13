// ═══════════════════════════════════════
//  SOUND ENGINE (Web Audio API)
// ═══════════════════════════════════════
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx;
let soundOn = true;

function ensureAudio() { if (!audioCtx) try { audioCtx = new AudioCtx() } catch (e) {} }

export function toggleSound() {
  soundOn = !soundOn;
  return soundOn;
}

export function isSoundOn() { return soundOn; }

function playTone(freq, dur, vol, type, delay) {
  if (!soundOn) return; ensureAudio(); if (!audioCtx) return;
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.connect(g); g.connect(audioCtx.destination);
  o.frequency.value = freq; o.type = type || 'sine';
  const t = audioCtx.currentTime + (delay || 0);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol || .1, t + 0.01);
  g.gain.exponentialRampToValueAtTime(.001, t + (dur || .1));
  o.start(t); o.stop(t + (dur || .1));
}

export function sndChip() { playTone(1200, .06, .08) }
export function sndTick() { playTone(1500, .025, .05, 'square') }
export function sndBallDrop() { [0, .07, .12, .16, .19].forEach((d, i) => playTone(1200 - i * 100, .05, .08 - i * .012, 'sine', d)) }
export function sndWin() { [523, 659, 784, 1047].forEach((f, i) => playTone(f, .25, .15, 'sine', i * .12)) }
export function sndLose() { [400, 350, 300].forEach((f, i) => playTone(f, .25, .1, 'sine', i * .18)) }
export function sndBigWin() { [523, 659, 784, 1047, 1318].forEach((f, i) => playTone(f, .35, .18, 'sine', i * .1)) }
