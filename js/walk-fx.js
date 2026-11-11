// Effects for the walk-through: 3D confetti, floating points, a field of
// Greek letters flying past in the background, card tilt and optional sound.
// Everything here is decoration: it is skipped when the reader asks for
// reduced motion, and nothing in the walk depends on it.

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let layer = null;
function fxLayer() {
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'wk-fx';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);
  }
  return layer;
}

const COLORS = ['#2b4c9b', '#d4af4e', '#2e7d4f', '#e37e6e', '#8da9ea', '#9a7620', '#6cc08e'];
const LETTERS = 'αβγδεζηθικλμνξοπρστυφχψωΩΣΛΔ';

/** A burst of spinning 3D confetti from a point (defaults to the screen's centre). */
export function confetti({ x = innerWidth / 2, y = innerHeight / 3, count = 40, spread = 1 } = {}) {
  if (reduced()) return;
  const host = fxLayer();
  for (let i = 0; i < count; i++) {
    const bit = document.createElement('i');
    const letter = Math.random() < 0.25;
    bit.className = letter ? 'wk-bit wk-bit-letter' : 'wk-bit';
    if (letter) bit.textContent = LETTERS[Math.floor(Math.random() * LETTERS.length)];
    bit.style.setProperty('--c', COLORS[i % COLORS.length]);
    bit.style.left = `${x}px`;
    bit.style.top = `${y}px`;
    host.appendChild(bit);
    const angle = Math.random() * Math.PI * 2;
    const power = (120 + Math.random() * 260) * spread;
    const dx = Math.cos(angle) * power;
    const dy = Math.sin(angle) * power * 0.7 - 160 * spread;
    const spin = `${Math.random() * 2 - 1}, ${Math.random() * 2 - 1}, ${Math.random()}`;
    const turns = 360 + Math.random() * 1080;
    bit.animate([
      { transform: 'translate3d(0,0,0) rotate3d(1,1,0,0deg) scale(1)', opacity: 1 },
      { transform: `translate3d(${dx}px, ${dy}px, ${Math.random() * 200}px) rotate3d(${spin}, ${turns / 2}deg) scale(1)`, opacity: 1, offset: 0.45 },
      { transform: `translate3d(${dx * 1.3}px, ${dy + 420}px, 0) rotate3d(${spin}, ${turns}deg) scale(0.6)`, opacity: 0 },
    ], { duration: 1400 + Math.random() * 900, easing: 'cubic-bezier(.2,.7,.4,1)' }).onfinish = () => bit.remove();
  }
}

/** Confetti from an element's centre. */
export function confettiFrom(el, opts = {}) {
  const r = el?.getBoundingClientRect();
  if (!r) return confetti(opts);
  confetti({ x: r.left + r.width / 2, y: r.top + r.height / 2, ...opts });
}

/** "+20" rising from an element. */
export function floatPoints(el, text, kind = 'good') {
  if (!el) return;
  const r = el.getBoundingClientRect();
  const tag = document.createElement('b');
  tag.className = `wk-float ${kind}`;
  tag.textContent = text;
  tag.style.left = `${r.left + r.width / 2}px`;
  tag.style.top = `${r.top}px`;
  fxLayer().appendChild(tag);
  if (reduced()) {
    setTimeout(() => tag.remove(), 900);
    return;
  }
  tag.animate([
    { transform: 'translate(-50%, 0) scale(0.6) rotateX(60deg)', opacity: 0 },
    { transform: 'translate(-50%, -30px) scale(1.25) rotateX(0deg)', opacity: 1, offset: 0.25 },
    { transform: 'translate(-50%, -90px) scale(1)', opacity: 0 },
  ], { duration: 1200, easing: 'ease-out' }).onfinish = () => tag.remove();
}

/** A banner that swings in on its hinge, then out. */
export function banner(text) {
  const el = document.createElement('div');
  el.className = 'wk-banner';
  el.textContent = text;
  fxLayer().appendChild(el);
  const ms = reduced() ? 1200 : 1800;
  if (!reduced()) {
    el.animate([
      { transform: 'translate(-50%, -50%) perspective(600px) rotateX(-90deg) scale(0.7)', opacity: 0 },
      { transform: 'translate(-50%, -50%) perspective(600px) rotateX(12deg) scale(1.08)', opacity: 1, offset: 0.2 },
      { transform: 'translate(-50%, -50%) perspective(600px) rotateX(0deg) scale(1)', opacity: 1, offset: 0.75 },
      { transform: 'translate(-50%, -50%) perspective(600px) rotateX(90deg) scale(0.9)', opacity: 0 },
    ], { duration: ms, easing: 'cubic-bezier(.3,1.4,.5,1)' });
  }
  setTimeout(() => el.remove(), ms);
}

/** Greek letters drifting towards the viewer, behind the page. */
export function startSky(host) {
  if (!host || host.childElementCount) return;
  const n = innerWidth < 600 ? 14 : 26;
  for (let i = 0; i < n; i++) {
    const s = document.createElement('span');
    s.textContent = LETTERS[i % LETTERS.length];
    s.style.left = `${Math.random() * 100}%`;
    s.style.top = `${Math.random() * 100}%`;
    s.style.setProperty('--d', `${14 + Math.random() * 16}s`);
    s.style.setProperty('--delay', `${-Math.random() * 30}s`);
    s.style.setProperty('--spin', `${Math.random() < 0.5 ? -1 : 1}`);
    host.appendChild(s);
  }
}

/** Cards marked .wk-tilt lean towards the pointer. */
export function bindTilt(root) {
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  root.addEventListener('pointermove', (e) => {
    if (reduced() || !fine.matches) return;
    const card = e.target.closest('.wk-tilt');
    if (!card) return;
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    card.style.setProperty('--ry', `${(px * 5).toFixed(2)}deg`);
    card.style.setProperty('--rx', `${(-py * 4).toFixed(2)}deg`);
  });
  root.addEventListener('pointerout', (e) => {
    const card = e.target.closest('.wk-tilt');
    if (card && !card.contains(e.relatedTarget)) {
      card.style.setProperty('--ry', '0deg');
      card.style.setProperty('--rx', '0deg');
    }
  });
}

// ---------------------------------------------------------------------------
// Sound (off unless switched on)

let audio = null;
function tone(freq, start, length, type = 'sine', gain = 0.12) {
  audio ??= new (window.AudioContext || window.webkitAudioContext)();
  const t = audio.currentTime + start;
  const osc = audio.createOscillator();
  const vol = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  vol.gain.setValueAtTime(0.0001, t);
  vol.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  vol.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(vol).connect(audio.destination);
  osc.start(t);
  osc.stop(t + length + 0.02);
}

export function sound(kind, enabled) {
  if (!enabled) return;
  try {
    if (kind === 'good') { tone(660, 0, 0.12); tone(990, 0.08, 0.18); }
    else if (kind === 'bad') { tone(180, 0, 0.22, 'triangle', 0.1); }
    else if (kind === 'tap') { tone(520, 0, 0.05, 'sine', 0.05); }
    else if (kind === 'win') { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.1, 0.25)); }
  } catch { /* no audio available */ }
}
