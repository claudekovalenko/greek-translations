// Hodos: the walk-through as a game. A traveller walks a road through the
// countryside. Every Greek word of the passage is a stone standing on the
// road: name the kind of word, parse it, and the stone moves to the roadside
// with its meaning carved on it. Each verse ends at a gate that opens once
// you write the verse in English. The road ends at a city, and the
// translation you wrote is waiting in the walk-through page.
//
// Progress is the same saved session the walk-through uses (walk-store.js).

import { store, save, current, touch, openPassage, select } from './walk-store.js';
import { FIELDS, checkParse, describeParse } from './parsing.js';
import { loadLexicon, entryFor, shortGloss, frequencyBand } from './lexicon.js';
import {
  CLASSES, wordClass, classLabel, walkFields, renderingHints, answerKey, answerFor, wordStage,
  progress, nextPosition, verseLabel, score, level, recordStreak, POINTS, formatDate,
} from './walk-core.js';
import { confetti, floatPoints, banner, sound } from './walk-fx.js';
import { helpHtml, patternHtml, chartHtml, HELP_STEPS } from './walk-help.js';

// three.js r160 (MIT), shipped with the site so the game works offline.
const THREE_URL = '../vendor/three/three.module.min.js';
let THREE;

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const els = {
  canvas: $('#q-canvas'),
  hud: $('#q-hud'),
  menuBtn: $('#q-menu-btn'),
  controls: $('#q-controls'),
  walkHint: $('#q-walk-hint'),
  panel: $('#q-panel'),
  overlay: $('#q-overlay'),
  loading: $('#q-loading'),
};

const ui = {
  overlay: null,        // 'title' | 'menu' | 'translation' | null
  panelFor: null,       // index of the station whose panel is open
  panelKey: null,       // to animate the panel in only when it changes
  fx: null,             // one-shot panel animation
  goal: true,           // walking on towards the next stone by itself
  hold: 0,              // -1 / +1 while a walk key or pad is held
  status: '',
  busy: false,
};

// ---------------------------------------------------------------------------
// Boot

boot();

async function boot() {
  try {
    THREE = await import(THREE_URL);
  } catch {
    return fallback('The 3D engine could not be loaded (are you offline?).');
  }
  const ref = new URLSearchParams(location.search).get('ref');
  if (ref) {
    history.replaceState(null, '', location.pathname);
    try {
      els.loading.textContent = `Loading ${ref}…`;
      await openPassage(ref, { onStatus: (m) => { els.loading.textContent = m; } });
    } catch (err) {
      ui.status = err.message;
    }
  }
  await Promise.all([
    loadLexicon(),
    document.fonts?.load('700 80px "Gentium Plus"').catch(() => {}),
    document.fonts?.load('500 40px "Alegreya Sans"').catch(() => {}),
  ]);
  const s = current();
  try {
    buildWorld(s);
  } catch (err) {
    console.error(err);
    return fallback('Your browser could not start the 3D view.');
  }
  els.loading.hidden = true;
  bindInput();
  if (!s) showOverlay('title');
  else startPlay();
  requestAnimationFrame(loop);
}

function fallback(message) {
  els.loading.hidden = true;
  document.body.innerHTML = `<div class="q-fallback"><h1>Hodos</h1><p>${esc(message)}</p>
    <p><a class="btn btn-primary" href="walk.html">Use the walk-through instead</a></p></div>`;
}

// ---------------------------------------------------------------------------
// Seeded randomness, so a passage always has the same landscape

function seeded(text) {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// The world

const W = {
  scene: null, camera: null, renderer: null, sun: null,
  curve: null, length: 0, zToX: [],
  stations: [], cur: 0,
  player: null, dist: 4, phase: 0,
  camPos: null, camLook: null,
  bursts: [],
  clock: null,
  built: new Set(),     // verse indexes whose stones exist
};

/** Distances along the road: a stone per word, a gate per verse, the city at the end. */
function layout(s) {
  const st = [];
  let d = 16;
  if (s) {
    s.verses.forEach((verse, vi) => {
      d += 4;
      verse.words.forEach((_, wi) => { st.push({ kind: 'word', v: vi, w: wi, dist: d }); d += 7.5; });
      d += 3;
      st.push({ kind: 'gate', v: vi, w: verse.words.length, dist: d });
      d += 10;
    });
  }
  d += 12;
  st.push({ kind: 'end', dist: d });
  return { stations: st, length: d + 60 };
}

function buildWorld(s) {
  const rand = seeded(s?.label ?? 'hodos');
  const { stations, length } = layout(s);
  W.stations = stations;

  const renderer = new THREE.WebGLRenderer({ canvas: els.canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  W.renderer = renderer;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#bfe3f5');
  scene.fog = new THREE.Fog('#cfe8f2', 45, 300);
  W.scene = scene;

  W.camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 700);
  W.clock = new THREE.Clock();

  scene.add(new THREE.HemisphereLight('#e6f4ff', '#6b8f4e', 1.05));
  const sun = new THREE.DirectionalLight('#fff1d0', 1.9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 });
  sun.shadow.bias = -0.0008;
  scene.add(sun, sun.target);
  W.sun = sun;

  // The road: a meandering curve, long enough for every station.
  const points = [];
  const segs = Math.ceil(length / 20) + 3;
  let x = 0;
  for (let i = 0; i < segs; i++) {
    x += (rand() - 0.5) * 16;
    x *= 0.85;
    points.push(new THREE.Vector3(i < 2 ? 0 : x + Math.sin(i * 0.6) * 9, 0, -i * 20 + 20));
  }
  const curve = new THREE.CatmullRomCurve3(points);
  curve.arcLengthDivisions = segs * 40;
  W.curve = curve;
  W.length = curve.getLength();

  // x of the road at each whole z, for keeping hills and trees off it.
  const samples = Math.ceil(W.length);
  for (let i = 0; i <= samples; i++) {
    const p = curve.getPointAt(i / samples);
    const zi = Math.round(20 - p.z);
    if (zi >= 0) W.zToX[zi] = p.x;
  }

  buildGround(rand, samples);
  buildRoad(samples);
  buildScenery(rand);
  W.player = buildTraveller();
  scene.add(W.player);

  // Stations: gates for every verse; stones only near where you are.
  if (s) {
    W.cur = currentIndex(s);
    for (const st of W.stations) {
      if (st.kind === 'gate') buildGate(st, s);
      if (st.kind === 'end') buildCity(st);
    }
    ensureStones(s);
    W.dist = Math.max(4, W.stations[W.cur].dist - stopGap(W.stations[W.cur]) - (W.cur === 0 ? 12 : 0));
  } else {
    buildCity(W.stations[W.stations.length - 1]);
    W.dist = 10;
  }

  addEventListener('resize', () => {
    W.camera.aspect = innerWidth / innerHeight;
    W.camera.updateProjectionMatrix();
    W.renderer.setSize(innerWidth, innerHeight, false);
  });
}

function roadX(z) {
  const zi = Math.round(20 - z);
  return W.zToX[Math.max(0, Math.min(W.zToX.length - 1, zi))] ?? 0;
}

function groundHeight(x, z) {
  const d = Math.abs(x - roadX(z));
  const k = smoothstep(12, 55, d);
  return k * (5 + 4 * Math.sin(x * 0.06 + 1.3) * Math.cos(z * 0.05) + 3 * Math.sin(x * 0.017 - z * 0.023));
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function buildGround(rand, samples) {
  const zLen = samples + 400;
  const zSegs = Math.min(1400, Math.ceil(zLen / 5));
  const geo = new THREE.PlaneGeometry(600, zLen, 110, zSegs);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, 20 + 150 - zLen / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const grass = new THREE.Color('#7fae5a');
  const dry = new THREE.Color('#b9b26a');
  const high = new THREE.Color('#8e9a62');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const off = x - roadX(z);
    pos.setX(i, x + roadX(z) * smoothstep(300, 0, Math.abs(x)) * 0); // keep grid regular
    const h = groundHeight(x, z);
    pos.setY(i, h);
    const n = Math.sin(x * 0.21 + z * 0.13) * 0.5 + Math.sin(x * 0.05 - z * 0.31) * 0.5;
    c.copy(grass).lerp(dry, 0.25 + n * 0.25).lerp(high, Math.min(1, h / 12));
    if (Math.abs(off) < 4.2) c.lerp(new THREE.Color('#c9b98d'), 0.5);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
  ground.receiveShadow = true;
  W.scene.add(ground);
}

function buildRoad(samples) {
  const half = 1.9;
  const verts = [];
  const cols = [];
  const idx = [];
  const sand = new THREE.Color('#dcc89c');
  const edge = new THREE.Color('#c7ae7c');
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    const p = W.curve.getPointAt(u);
    const t = W.curve.getTangentAt(u);
    const rx = -t.z, rz = t.x;
    const wob = Math.sin(i * 0.7) * 0.15;
    verts.push(p.x + rx * (half + wob), 0.04, p.z + rz * (half + wob));
    verts.push(p.x, 0.05, p.z);
    verts.push(p.x - rx * (half - wob), 0.04, p.z - rz * (half - wob));
    for (const col of [edge, sand, edge]) cols.push(col.r, col.g, col.b);
    if (i < samples) {
      const a = i * 3;
      idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const road = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  road.receiveShadow = true;
  W.scene.add(road);
}

function buildScenery(rand) {
  const trees = [];
  const cypress = [];
  const rocks = [];
  const mountains = [];
  for (let d = 0; d < W.length; d += 3.2) {
    const p = W.curve.getPointAt(d / W.length);
    const t = W.curve.getTangentAt(d / W.length);
    for (const side of [-1, 1]) {
      const r = rand();
      if (r < 0.42) {
        const lat = 6.5 + rand() * rand() * 48;
        const x = p.x + -t.z * lat * side + (rand() - 0.5) * 3;
        const z = p.z + t.x * lat * side + (rand() - 0.5) * 3;
        (rand() < 0.3 ? cypress : trees).push([x, groundHeight(x, z), z, 0.7 + rand() * 0.8, rand() * 6.28]);
      } else if (r < 0.5) {
        const lat = 3.4 + rand() * 4;
        const x = p.x + -t.z * lat * side;
        const z = p.z + t.x * lat * side;
        rocks.push([x, groundHeight(x, z), z, 0.25 + rand() * 0.5, rand() * 6.28]);
      }
    }
    if (Math.floor(d / 3.2) % 40 === 0) {
      for (const side of [-1, 1]) {
        const lat = 150 + rand() * 90;
        mountains.push([p.x + -t.z * lat * side, 0, p.z + t.x * lat * side, 40 + rand() * 50, rand() * 6.28, 50 + rand() * 70]);
      }
    }
  }
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const place = (mesh, list, fn) => {
    list.forEach((it, i) => { fn(it); mesh.setMatrixAt(i, m); });
    mesh.instanceMatrix.needsUpdate = true;
    W.scene.add(mesh);
  };
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, ...extra });

  // Round trees: trunk and a lumpy crown.
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.26, 1.6, 6), std('#7a5a3a'), trees.length + cypress.length);
  const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.5, 0), std('#5f8f45'), trees.length);
  const tall = new THREE.InstancedMesh(new THREE.ConeGeometry(0.8, 5, 7), std('#3f6e3a'), cypress.length);
  for (const mesh of [trunk, crown, tall]) { mesh.castShadow = true; mesh.receiveShadow = true; }
  let ti = 0;
  for (const [x, y, z, s] of [...trees, ...cypress]) {
    m.compose(new THREE.Vector3(x, y + 0.8 * s, z), q.identity(), new THREE.Vector3(s, s, s));
    trunk.setMatrixAt(ti++, m);
  }
  trunk.instanceMatrix.needsUpdate = true;
  W.scene.add(trunk);
  place(crown, trees, ([x, y, z, s, r]) => m.compose(new THREE.Vector3(x, y + 2.6 * s, z), q.setFromAxisAngle(up, r), new THREE.Vector3(s, s * 0.9, s)));
  place(tall, cypress, ([x, y, z, s, r]) => m.compose(new THREE.Vector3(x, y + 3.6 * s, z), q.setFromAxisAngle(up, r), new THREE.Vector3(s, s, s)));
  const rock = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), std('#a49d8f'), rocks.length);
  rock.castShadow = true;
  place(rock, rocks, ([x, y, z, s, r]) => m.compose(new THREE.Vector3(x, y + s * 0.4, z), q.setFromAxisAngle(up, r), new THREE.Vector3(s * 1.3, s, s)));
  const mount = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 6), std('#93a7b8'), mountains.length);
  place(mount, mountains, ([x, y, z, r, rot, h]) => m.compose(new THREE.Vector3(x, h / 2 - 2, z), q.setFromAxisAngle(up, rot), new THREE.Vector3(r, h, r)));
  const snow = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 6), std('#f2f5f8'), mountains.length);
  place(snow, mountains, ([x, y, z, r, rot, h]) => m.compose(new THREE.Vector3(x, h * 0.86 - 2, z), q.setFromAxisAngle(up, rot), new THREE.Vector3(r * 0.29, h * 0.29, r * 0.29)));

  // A few clouds.
  const cloudMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true, transparent: true, opacity: 0.92 });
  for (let i = 0; i < Math.ceil(W.length / 60); i++) {
    const g = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(3 + rand() * 3, 0), cloudMat);
      puff.position.set(k * 4 - 6, rand() * 2, rand() * 3);
      g.add(puff);
    }
    const p = W.curve.getPointAt(Math.min(1, (i * 60) / W.length));
    g.position.set(p.x + (rand() - 0.5) * 160, 38 + rand() * 20, p.z - 40);
    g.userData.drift = 0.5 + rand();
    W.scene.add(g);
    (W.clouds ??= []).push(g);
  }
}

function buildTraveller() {
  const g = new THREE.Group();
  const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true });
  const robe = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.5, 9), mat('#9a5b2e'));
  robe.position.y = 0.78;
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.36, 0.12, 9), mat('#e2b84f'));
  belt.position.y = 1.08;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), mat('#e0b48a'));
  head.position.y = 1.72;
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.33, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), mat('#6e3f1f'));
  hood.position.set(0, 1.76, -0.05);
  hood.rotation.x = -0.35;
  const eyes = new THREE.Group();
  for (const sx of [-0.09, 0.09]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), mat('#1b2230'));
    e.position.set(sx, 1.75, 0.24);
    eyes.add(e);
  }
  const staffPivot = new THREE.Group();
  staffPivot.position.set(0.55, 1.15, 0.1);
  const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.3, 6), mat('#7b5a34'));
  staff.position.y = -0.05;
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), new THREE.MeshStandardMaterial({ color: '#ffd76a', emissive: '#ffb627', emissiveIntensity: 0.9, flatShading: true }));
  orb.position.y = 1.15;
  staffPivot.add(staff, orb);
  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.4, 0.18), mat('#5b6f3a'));
  bag.position.set(-0.42, 1.0, -0.12);
  bag.rotation.z = 0.25;
  const body = new THREE.Group();
  body.add(robe, belt, head, hood, eyes, staffPivot, bag);
  body.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.add(body);
  g.userData = { body, staffPivot, robe, orb };
  return g;
}

// ---------------------------------------------------------------------------
// Stations

const SIDE = 3.6;

function frameAt(dist) {
  const u = Math.min(1, Math.max(0, dist / W.length));
  const p = W.curve.getPointAt(u);
  const t = W.curve.getTangentAt(u);
  const right = new THREE.Vector3(-t.z, 0, t.x);
  return { p, t, right };
}

function stopGap(st) {
  return st.kind === 'end' ? 6 : st.kind === 'gate' ? 3.2 : 2.7;
}

function currentIndex(s) {
  if (s.finished) return W.stations.length - 1;
  const i = W.stations.findIndex((st) => st.kind !== 'end' && st.v === s.at.v && st.w === s.at.w);
  return i < 0 ? 0 : i;
}

function stoneState(s, i) {
  const st = W.stations[i];
  if (i === W.cur) return 'active';
  if (i > W.cur) return 'locked';
  const a = answerFor(s, st.v, st.w);
  return a?.firstTry === false || a?.clsOk === false || a?.revealed ? 'miss' : 'ok';
}

const STONE_COLORS = {
  locked: ['#ece3cc', '#d3c5a2', '#8b7a55', '#3b3325'],
  active: ['#fff6d6', '#f2d27a', '#b8892a', '#2a2418'],
  ok: ['#eaf6ea', '#bfe0c3', '#3f8a59', '#1e3a28'],
  miss: ['#fbe9e4', '#efc2b8', '#b3402e', '#4a1d16'],
};

function stoneTexture(word, state, { gloss = '', parse = '' } = {}) {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 300;
  const g = cv.getContext('2d');
  const [top, bottom, border, ink] = STONE_COLORS[state];
  const grad = g.createLinearGradient(0, 0, 0, 300);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 300);
  g.lineWidth = 12;
  g.strokeStyle = border;
  g.strokeRect(10, 10, 492, 280);
  g.fillStyle = ink;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = 112;
  g.font = `700 ${size}px "Gentium Plus", "Times New Roman", serif`;
  while (g.measureText(word).width > 450 && size > 40) {
    size -= 6;
    g.font = `700 ${size}px "Gentium Plus", "Times New Roman", serif`;
  }
  g.fillText(word, 256, gloss ? 115 : 150);
  if (gloss) {
    g.font = '500 42px "Alegreya Sans", sans-serif';
    let text = gloss;
    while (g.measureText(text).width > 460 && text.length > 4) text = `${text.slice(0, -2)}…`;
    g.fillText(text, 256, 210);
  }
  if (parse) {
    g.font = '30px "IBM Plex Mono", monospace';
    g.globalAlpha = 0.7;
    g.fillText(parse, 256, 258);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const stoneMat = new Map();
function rockMaterial(color) {
  if (!stoneMat.has(color)) stoneMat.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.95, flatShading: true }));
  return stoneMat.get(color);
}

function buildStone(st, s) {
  const word = s.verses[st.v].words[st.w];
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.35, 1.0), rockMaterial('#9d968a'));
  base.position.y = 0.17;
  const face = new THREE.MeshStandardMaterial({ roughness: 0.75 });
  const side = rockMaterial('#cfc4a6');
  const tablet = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.52, 0.28), [side, side, side, side, face, side]);
  tablet.position.y = 1.2;
  base.castShadow = tablet.castShadow = true;
  group.add(base, tablet);
  st.mesh = group;
  st.face = face;
  st.tablet = tablet;
  paintStone(st, s);
  placeStone(st, true);
  W.scene.add(group);
}

function paintStone(st, s) {
  if (!st.face) return;
  const i = W.stations.indexOf(st);
  const state = stoneState(s, i);
  const word = s.verses[st.v].words[st.w];
  const a = answerFor(s, st.v, st.w);
  const known = state === 'ok' || state === 'miss' || (state === 'active' && a && wordStage(s, st.v, st.w) === 'summary');
  st.face.map?.dispose();
  st.face.map = stoneTexture(word.word, known && state === 'active' ? (a.firstTry === false || a.revealed || a.clsOk === false ? 'miss' : 'ok') : state, known ? {
    gloss: shortGloss(word.lemma) ?? '',
    parse: walkFields(word, { parseArticles: true }).length ? describeParse(word) : classLabel(word),
  } : {});
  st.face.emissive = new THREE.Color(state === 'active' ? '#5a4210' : '#000000');
  st.face.emissiveIntensity = state === 'active' ? 0.35 : 0;
  st.face.needsUpdate = true;
  st.state = state;
}

/** Stones stand across the road until solved, then step aside to line it. */
function stonePose(st) {
  const i = W.stations.indexOf(st);
  const { p, t, right } = frameAt(st.dist);
  const aside = i < W.cur;
  const sideSign = st.w % 2 === 0 ? 1 : -1;
  const pos = p.clone();
  if (aside) pos.addScaledVector(right, SIDE * sideSign);
  const facing = Math.atan2(-t.x, -t.z) + (aside ? -sideSign * 0.55 : 0);
  return { pos, rot: facing, scale: aside ? 0.8 : 1 };
}

function placeStone(st, instant) {
  const pose = stonePose(st);
  st.target = pose;
  if (instant) {
    st.mesh.position.copy(pose.pos);
    st.mesh.rotation.y = pose.rot;
    st.mesh.scale.setScalar(pose.scale);
  }
}

/** Keep stones built for the verses around you, and only those. */
function ensureStones(s) {
  const here = W.stations[W.cur];
  const v = here.kind === 'end' ? s.verses.length - 1 : here.v;
  const want = new Set([v - 1, v, v + 1, v + 2].filter((x) => x >= 0 && x < s.verses.length));
  for (const st of W.stations) {
    if (st.kind !== 'word') continue;
    if (want.has(st.v) && !st.mesh) buildStone(st, s);
    if (!want.has(st.v) && st.mesh) {
      W.scene.remove(st.mesh);
      st.mesh.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); } });
      st.face.map?.dispose();
      st.face.dispose();
      st.mesh = st.face = st.tablet = null;
    }
  }
}

function labelTexture(text, { w = 512, h = 160, bg = '#e9dcb8', ink = '#3b2d12', size = 84, border = '#9a7620' } = {}) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.lineWidth = 10;
  g.strokeStyle = border;
  g.strokeRect(8, 8, w - 16, h - 16);
  g.fillStyle = ink;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `800 ${size}px "Alegreya Sans", sans-serif`;
  while (g.measureText(text).width > w - 60 && size > 20) {
    size -= 4;
    g.font = `800 ${size}px "Alegreya Sans", sans-serif`;
  }
  g.fillText(text, w / 2, h / 2 + 4);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const gateStone = () => rockMaterial('#e6dcc4');

function buildGate(st, s) {
  const verse = s.verses[st.v];
  const { p, t } = frameAt(st.dist);
  const g = new THREE.Group();
  for (const sx of [-2.8, 2.8]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 6.4, 0.8), gateStone());
    pillar.position.set(sx, 3.2, 0);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.3, 1.1), rockMaterial('#cbbd98'));
    cap.position.set(sx, 6.45, 0);
    const flame = new THREE.Mesh(new THREE.IcosahedronGeometry(0.26, 0), new THREE.MeshStandardMaterial({ color: '#ffcf5a', emissive: '#ff9a1f', emissiveIntensity: 1.4, flatShading: true }));
    flame.position.set(sx, 6.85, 0);
    flame.visible = false;
    pillar.castShadow = cap.castShadow = true;
    g.add(pillar, cap, flame);
    (g.userData.flames ??= []).push(flame);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.8, 1.0), gateStone());
  lintel.position.y = 6.95;
  lintel.castShadow = true;
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.7), new THREE.MeshStandardMaterial({ map: labelTexture(`VERSE ${verse.v}`), roughness: 0.8 }));
  plaque.position.set(0, 6.95, 0.51);
  const barrier = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 6.3), new THREE.MeshBasicMaterial({ color: '#ffd76a', transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false }));
  barrier.position.y = 3.15;
  g.add(lintel, plaque, barrier);
  g.position.copy(p);
  g.rotation.y = Math.atan2(-t.x, -t.z);
  W.scene.add(g);
  st.mesh = g;
  st.barrier = barrier;
  st.flames = g.userData.flames;
  const i = W.stations.indexOf(st);
  if (i < W.cur) openGate(st, true);
}

function openGate(st, instant) {
  st.open = true;
  st.flames.forEach((f) => { f.visible = true; });
  if (instant) st.barrier.visible = false;
  else st.opening = 0;
}

function buildCity(st) {
  const { p, t, right } = frameAt(st.dist);
  const g = new THREE.Group();
  const wall = rockMaterial('#efe5cf');
  const roof = rockMaterial('#c9a46a');
  const rand = seeded('city');
  for (let k = 0; k < 16; k++) {
    const w = 3 + rand() * 4, h = 2.5 + rand() * 4, d = 3 + rand() * 4;
    const house = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wall);
    const side = k % 2 ? 1 : -1;
    const lat = 7 + rand() * 18;
    house.position.set(side * lat, h / 2, -8 - rand() * 30);
    const top = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.3, d + 0.3), roof);
    top.position.set(house.position.x, h + 0.15, house.position.z);
    house.castShadow = top.castShadow = true;
    g.add(house, top);
  }
  for (const sx of [-4, 4]) {
    const tower = new THREE.Mesh(new THREE.BoxGeometry(2.4, 9, 2.4), wall);
    tower.position.set(sx, 4.5, 0);
    tower.castShadow = true;
    g.add(tower);
  }
  const arch = new THREE.Mesh(new THREE.BoxGeometry(10.4, 2.2, 2.4), wall);
  arch.position.y = 8;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.3), new THREE.MeshStandardMaterial({ map: labelTexture('THE END OF THE ROAD', { w: 1024, h: 190, size: 96 }) }));
  sign.position.set(0, 8, 1.22);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(5, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#e8b53a', metalness: 0.6, roughness: 0.3, emissive: '#7a5200', emissiveIntensity: 0.25 }));
  dome.position.set(0, 7, -26);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 7, 18), wall);
  drum.position.set(0, 3.5, -26);
  g.add(arch, sign, dome, drum);
  g.position.copy(p);
  g.rotation.y = Math.atan2(-t.x, -t.z);
  W.scene.add(g);
  st.mesh = g;
}

// ---------------------------------------------------------------------------
// Effects in the world

function burst(position, color = '#ffd76a', count = 70) {
  if (reduced()) return;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const vel = [];
  for (let i = 0; i < count; i++) {
    pos.set([position.x, position.y, position.z], i * 3);
    vel.push(new THREE.Vector3((Math.random() - 0.5) * 9, 3 + Math.random() * 7, (Math.random() - 0.5) * 9));
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 0.28, transparent: true, depthWrite: false }));
  W.scene.add(pts);
  W.bursts.push({ pts, vel, age: 0 });
}

function updateBursts(dt) {
  for (const b of [...W.bursts]) {
    b.age += dt;
    const pos = b.pts.geometry.attributes.position;
    b.vel.forEach((v, i) => {
      v.y -= 14 * dt;
      pos.setXYZ(i, pos.getX(i) + v.x * dt, Math.max(0.05, pos.getY(i) + v.y * dt), pos.getZ(i) + v.z * dt);
    });
    pos.needsUpdate = true;
    b.pts.material.opacity = Math.max(0, 1 - b.age / 1.5);
    if (b.age > 1.5) {
      W.scene.remove(b.pts);
      b.pts.geometry.dispose();
      b.pts.material.dispose();
      W.bursts.splice(W.bursts.indexOf(b), 1);
    }
  }
}

// ---------------------------------------------------------------------------
// The loop

const tmp = { a: null, b: null };

function loop() {
  const dt = Math.min(0.05, W.clock.getDelta());
  const time = W.clock.elapsedTime;
  const s = current();
  const st = W.stations[W.cur];
  const panelOpen = ui.panelFor != null;
  const block = st ? st.dist - stopGap(st) : W.length;

  // Walking
  let dir = 0;
  if (ui.overlay !== 'title' && !panelOpen && s) {
    if (ui.hold) dir = ui.hold;
    else if (ui.goal && W.dist < block - 0.01) dir = 1;
  }
  const speed = ui.hold ? 7.5 : 6.5;
  const before = W.dist;
  W.dist = Math.min(block, Math.max(3, W.dist + dir * speed * dt));
  const moving = Math.abs(W.dist - before) > 0.001;
  if (s && !panelOpen && !ui.overlay && W.dist >= block - 0.01 && dir >= 0 && ui.goal !== false) openPanel(W.cur);

  // Traveller
  const { p, t, right } = frameAt(W.dist);
  const P = W.player;
  const aside = panelOpen && st?.kind === 'word' ? 1.5 : 0;
  W.aside = (W.aside ?? 0) + (aside - (W.aside ?? 0)) * Math.min(1, dt * 4);
  P.position.copy(p).addScaledVector(right, W.aside);
  const face = Math.atan2(t.x, t.z) + (dir < 0 ? Math.PI : 0);
  P.rotation.y += angleDelta(P.rotation.y, face) * Math.min(1, dt * 10);
  const ud = P.userData;
  if (moving) W.phase += dt * 11;
  const sw = moving ? Math.sin(W.phase) : 0;
  ud.body.position.y = moving ? Math.abs(Math.sin(W.phase)) * 0.1 : Math.sin(time * 2) * 0.015;
  ud.body.rotation.z = sw * 0.06;
  ud.staffPivot.rotation.x = moving ? sw * 0.35 : 0;
  ud.orb.rotation.y += dt * 2;

  // Camera
  tmp.a ??= new THREE.Vector3();
  tmp.b ??= new THREE.Vector3();
  if (ui.overlay === 'title' || !s) {
    const ang = time * 0.12;
    tmp.a.set(p.x + Math.sin(ang) * 11, 4.5, p.z + Math.cos(ang) * 11);
    tmp.b.copy(p).setY(1.5);
  } else if (panelOpen && st?.mesh) {
    // Desktop: the panel is on the right, so look from the left with the
    // stone left of centre. Phone: the panel covers the bottom, so look down
    // past the stone to put it in the top half of the screen.
    const wide = innerWidth > 700;
    if (st.kind === 'word') {
      tmp.a.copy(p).addScaledVector(t, wide ? -4 : -4.5).addScaledVector(right, wide ? -3.4 : -2.4).setY(wide ? 2.5 : 3.0);
      tmp.b.copy(st.mesh.position).addScaledVector(right, wide ? 1.9 : 0.5).setY(wide ? 1.25 : -1.6);
    } else {
      tmp.a.copy(p).addScaledVector(t, st.kind === 'end' ? -11 : -6).addScaledVector(right, wide ? -2.6 : 0).setY(st.kind === 'gate' ? 3.6 : 4.5);
      tmp.b.copy(st.mesh.position).addScaledVector(right, wide ? 2.6 : 0).setY(st.kind === 'gate' ? (wide ? 3.6 : 0.6) : (wide ? 5 : 1));
    }
  } else {
    tmp.a.copy(p).addScaledVector(t, -8.5).addScaledVector(right, 1.1).setY(4.8);
    tmp.b.copy(p).addScaledVector(t, 7).setY(1.3);
  }
  const k = 1 - Math.exp(-dt * 3.2);
  W.camPos ??= tmp.a.clone();
  W.camLook ??= tmp.b.clone();
  W.camPos.lerp(tmp.a, k);
  W.camLook.lerp(tmp.b, k);
  W.camera.position.copy(W.camPos);
  W.camera.lookAt(W.camLook);

  // Sun follows, so shadows stay sharp near the traveller.
  W.sun.position.set(p.x + 18, 40, p.z + 14);
  W.sun.target.position.copy(p);

  // Stations
  for (let i = Math.max(0, W.cur - 30); i < Math.min(W.stations.length, W.cur + 40); i++) {
    const x = W.stations[i];
    if (!x.mesh) continue;
    if (x.kind === 'word' && x.target) {
      const ease = 1 - Math.exp(-dt * 5);
      x.mesh.position.lerp(x.target.pos, ease);
      x.mesh.rotation.y += angleDelta(x.mesh.rotation.y, x.target.rot) * ease;
      x.mesh.scale.setScalar(x.mesh.scale.x + (x.target.scale - x.mesh.scale.x) * ease);
      if (i === W.cur && x.tablet) {
        x.tablet.position.y = 1.25 + Math.sin(time * 2.2) * 0.08;
        x.tablet.rotation.z = Math.sin(time * 1.3) * 0.03;
      } else if (x.tablet) {
        x.tablet.position.y = 1.2;
        x.tablet.rotation.z = 0;
      }
    }
    if (x.kind === 'gate') {
      if (x.opening != null) {
        x.opening += dt;
        x.barrier.material.opacity = Math.max(0, 0.38 * (1 - x.opening / 0.8));
        x.barrier.scale.y = Math.max(0.01, 1 - x.opening / 0.8);
        if (x.opening > 0.8) { x.barrier.visible = false; x.opening = null; }
      } else if (x.barrier.visible) {
        x.barrier.material.opacity = 0.3 + Math.sin(time * 3) * 0.08;
      }
      x.flames.forEach((f, n) => { f.scale.setScalar(1 + Math.sin(time * 9 + n) * 0.15); });
    }
  }
  for (const c of W.clouds ?? []) c.position.x += c.userData.drift * dt;
  updateBursts(dt);

  W.renderer.render(W.scene, W.camera);
  updateWalkHint(moving, dir);
  requestAnimationFrame(loop);
}

function angleDelta(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

let lastHint = '';
function updateWalkHint(moving, dir) {
  if (els.controls.hidden) return;
  const hint = ui.panelFor != null ? '' : dir < 0 ? 'Walking back…' : moving ? 'On the road…' : 'Press ▶ or ↑ to walk on';
  if (hint !== lastHint) {
    els.walkHint.textContent = hint;
    els.walkHint.hidden = !hint;
    lastHint = hint;
  }
}

// ---------------------------------------------------------------------------
// Input

function bindInput() {
  addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select, dialog')) return;
    const key = e.key;
    if (ui.panelFor == null && !ui.overlay) {
      if (['ArrowUp', 'w', 'W', 'ArrowRight', 'd', 'D'].includes(key)) { ui.hold = 1; ui.goal = true; e.preventDefault(); }
      if (['ArrowDown', 's', 'S', 'ArrowLeft', 'a', 'A'].includes(key)) { ui.hold = -1; ui.goal = false; e.preventDefault(); }
      if (key === 'Enter' || key === ' ') { ui.goal = true; e.preventDefault(); }
      return;
    }
    if (ui.panelFor != null && !ui.overlay) {
      if (/^[1-9]$/.test(key)) {
        const btn = els.panel.querySelectorAll('[data-cls]')[Number(key) - 1];
        if (btn) { btn.click(); e.preventDefault(); }
      } else if (key === 'Enter') {
        const primary = $('[data-primary]', els.panel);
        if (primary && !primary.disabled) { primary.click(); e.preventDefault(); }
      } else if (key === 'Escape') {
        stepBack();
      }
    } else if (ui.overlay && ui.overlay !== 'title' && key === 'Escape') {
      closeOverlay();
    }
  });
  addEventListener('keyup', (e) => {
    if (['ArrowUp', 'w', 'W', 'ArrowRight', 'd', 'D', 'ArrowDown', 's', 'S', 'ArrowLeft', 'a', 'A'].includes(e.key)) ui.hold = 0;
  });
  for (const pad of els.controls.querySelectorAll('[data-hold]')) {
    const dir = Number(pad.dataset.hold);
    const down = (e) => { e.preventDefault(); ui.hold = dir; ui.goal = dir > 0; pad.classList.add('down'); pad.setPointerCapture?.(e.pointerId); };
    const up = () => { ui.hold = 0; pad.classList.remove('down'); };
    pad.addEventListener('pointerdown', down);
    pad.addEventListener('pointerup', up);
    pad.addEventListener('pointercancel', up);
    pad.addEventListener('lostpointercapture', up);
  }
  els.menuBtn.addEventListener('click', () => showOverlay('menu'));
  els.panel.addEventListener('click', onPanelClick);
  els.panel.addEventListener('input', onPanelInput);
  els.overlay.addEventListener('click', onOverlayClick);
  els.overlay.addEventListener('submit', onOverlaySubmit);
  els.overlay.addEventListener('change', onOverlayChange);
}

// ---------------------------------------------------------------------------
// Play state

function startPlay() {
  els.hud.hidden = false;
  els.menuBtn.hidden = false;
  els.controls.hidden = false;
  ui.goal = true;
  renderHud();
  const s = current();
  if (s && W.cur === 0 && !Object.keys(s.answers).length) {
    setTimeout(() => banner(s.label), 400);
  }
}

function renderHud() {
  const s = current();
  if (!s) return;
  const p = progress(s);
  const xp = score(s);
  const lv = level(xp);
  const streak = s.streak ?? 0;
  const st = W.stations[W.cur];
  const verse = st.kind === 'end' ? s.verses[s.verses.length - 1] : s.verses[st.v];
  els.hud.innerHTML = `
    <div class="wk-badge wk-lv" title="${xp} XP"><span class="wk-gem">${lv.level}</span><span class="wk-badge-text"><b>Level ${lv.level}</b><span class="wk-xpbar"><i style="width:${lv.into}%"></i></span><small>${xp} XP</small></span></div>
    <div class="wk-badge wk-streak${streak >= 3 ? ' hot' : ''}${streak >= 8 ? ' blazing' : ''}"><span class="wk-flame" aria-hidden="true">🔥</span><span class="wk-badge-text"><b>${streak}</b><small>streak</small></span></div>
    <div class="wk-badge q-where"><span class="wk-badge-text"><b>${esc(verseLabel(s, verse))}</b><small>${p.translated}/${p.verses} verses</small></span></div>
    <div class="wk-badge q-words"><span class="wk-badge-text"><b>${p.done}/${p.words}</b><small>stones</small></span></div>`;
}

function openPanel(i) {
  ui.panelFor = i;
  ui.hold = 0;
  els.controls.hidden = true;
  renderPanel();
}

function closePanel() {
  ui.panelFor = null;
  ui.panelKey = null;
  els.panel.hidden = true;
  els.controls.hidden = false;
}

function stepBack() {
  closePanel();
  ui.goal = false;
  // Walk back a few paces so the stone is in view again.
  const target = Math.max(3, W.dist - 6);
  const step = () => {
    if (ui.panelFor != null || W.dist <= target || ui.goal) return;
    W.dist = Math.max(target, W.dist - 0.25);
    requestAnimationFrame(step);
  };
  step();
}

/** Move on to the next station once the current one is done. */
function advance(s) {
  const st = W.stations[W.cur];
  const next = st.kind === 'end' ? null : nextPosition(s, s.at);
  if (next) s.at = next;
  W.cur = Math.min(W.stations.length - 1, W.cur + 1);
  touch(s);
  if (st.kind === 'word' && st.mesh) {
    paintStone(st, s);
    placeStone(st, false);
  }
  if (st.kind === 'gate') openGate(st, false);
  ensureStones(s);
  const now = W.stations[W.cur];
  if (now.kind === 'word' && now.mesh) paintStone(now, s);
  closePanel();
  ui.goal = true;
  renderHud();
}

// ---------------------------------------------------------------------------
// Panels

function renderPanel() {
  const s = current();
  const i = ui.panelFor;
  const st = W.stations[i];
  const key = `${i}:${st.kind}`;
  const enter = ui.panelKey !== key;
  ui.panelKey = key;
  let html = '';
  if (st.kind === 'word') html = wordPanel(s, st);
  else if (st.kind === 'gate') html = gatePanel(s, st);
  else html = endPanel(s);
  els.panel.className = `q-panel${enter ? ' enter' : ''}${ui.fx ? ` fx-${ui.fx}` : ''}`;
  ui.fx = null;
  els.panel.innerHTML = html;
  els.panel.hidden = false;
  const ta = $('textarea', els.panel);
  if (ta && enter) setTimeout(() => ta.focus({ preventScroll: true }), 350);
}

function wordPanel(s, st) {
  const verse = s.verses[st.v];
  const word = verse.words[st.w];
  const a = answerFor(s, st.v, st.w) ?? {};
  const stage = wordStage(s, st.v, st.w);
  const fields = walkFields(word, s.opts);
  const head = `<div class="q-panel-head"><span class="greek q-word">${esc(word.word)}</span>
    <span class="muted">${esc(verseLabel(s, verse))}<br>stone ${st.w + 1} of ${verse.words.length}</span></div>`;
  const back = '<button class="btn btn-quiet" type="button" data-act="back">◀ Step back</button>';

  if (stage === 'class') {
    const buttons = Object.entries(CLASSES).map(([k, label], n) =>
      `<button class="btn wk-choice" type="button" data-act="class" data-cls="${k}"><span class="q-key">${n + 1}</span>${label}</button>`).join('');
    return `${head}<h2>A stone blocks the road. What kind of word is it?</h2>
      <div class="wk-choices">${buttons}</div>
      <p class="hint">Verbs end in person endings (‑ω, ‑ει, ‑ουσιν, ‑εται…); nouns, adjectives, articles and pronouns in case endings (‑ος, ‑ου, ‑ῳ, ‑ον…). Words that never change are prepositions, conjunctions, adverbs or particles. <button class="linkish" type="button" data-act="cheat">Cheat sheet</button></p>
      <div class="wk-card-actions">${back}</div>`;
  }

  const classLine = s.opts.askClass && a.cls
    ? (a.clsOk
      ? `<p class="wk-fb ok">✓ ${esc(cap(classLabel(word)))}</p>`
      : `<p class="wk-fb bad">✗ You said ${esc(CLASSES[a.cls].toLowerCase())}. It is ${/^[aeiou]/.test(classLabel(word)) ? 'an' : 'a'} ${esc(classLabel(word))}.</p>`)
    : `<p class="wk-fb">${esc(cap(classLabel(word)))}</p>`;

  if (stage === 'parse') {
    const rows = fields.map((f) => {
      const mark = a.marks?.[f];
      const chosen = a.parse?.[f];
      const opts = Object.entries(FIELDS[f].options).map(([value, label]) =>
        `<button type="button" class="wk-seg${chosen === value ? ' on' : ''}" data-act="pick" data-field="${f}" data-value="${value}" aria-pressed="${chosen === value}">${label}</button>`).join('');
      const flag = mark === true ? '<span class="wk-mark ok">✓</span>' : mark === false ? '<span class="wk-mark bad">✗</span>' : '';
      return `<div class="wk-field${mark === false ? ' bad' : ''}"><span class="wk-flabel">${FIELDS[f].label}${flag}</span><div class="wk-segs">${opts}</div></div>`;
    }).join('');
    const help = a.help ?? 0;
    return `${head}${classLine}<h2>Parse it to move the stone</h2>${rows}
      ${a.notice ? `<p class="status error">${esc(a.notice)}</p>` : ''}
      ${helpHtml(word, help, { verseWords: verse.words, wi: st.w, headword: entryFor(word.lemma)?.headword ?? '' })}
      <div class="wk-card-actions">
        ${back}
        ${help < HELP_STEPS ? `<button class="btn wk-help-btn" type="button" data-act="help">💡 ${help ? 'Show the pattern' : 'Help me'}</button>` : ''}
        <button class="btn btn-quiet" type="button" data-act="reveal">Show me</button>
        <button class="btn btn-quiet" type="button" data-act="chart">Chart</button>
        <button class="btn btn-primary" type="button" data-act="check" data-primary>Check</button>
      </div>`;
  }

  const entry = entryFor(word.lemma);
  const band = entry ? frequencyBand(entry.frequency) : null;
  const parsed = fields.length
    ? `<p class="wk-parse">${a.revealed && !a.solved ? '<span class="wk-mark bad">Shown:</span> ' : a.solved ? '<span class="wk-mark ok">✓</span> ' : ''}<b>${esc(describeParse(word, { long: true }))}</b></p>`
    : '';
  const hints = renderingHints(word).map((h) => `<li>${esc(h)}</li>`).join('');
  const lastWord = st.w === verse.words.length - 1;
  return `${head}${classLine}${parsed}
    <h3>Dictionary form</h3>
    <div class="wk-lex"><span class="greek wk-lemma">${esc(entry?.headword ?? word.lemma)}</span><span>${esc(entry?.gloss ?? '(no gloss available)')}</span>${entry ? `<span class="muted">· ${entry.frequency}× in the NT, ${band.label}</span>` : ''}</div>
    ${hints ? `<details open><summary>How to translate it</summary><ul class="wk-hints">${hints}</ul></details>` : ''}
    ${fields.length ? `<details${a.help || a.firstTry === false ? ' open' : ''}><summary>See where it sits in the pattern</summary>${patternHtml(word, { reveal: true })}</details>` : ''}
    <div class="wk-card-actions">
      ${back}
      <button class="btn btn-primary" type="button" data-act="onward" data-primary>${lastWord ? 'On to the gate ▶' : 'Onward ▶'}</button>
    </div>`;
}

function gatePanel(s, st) {
  const verse = s.verses[st.v];
  const words = verse.words.map((w) => `<span><b class="greek">${esc(w.word)}</b><small>${esc(shortGloss(w.lemma) ?? '')}</small><small>${esc(walkFields(w, { parseArticles: true }).length ? describeParse(w) : '')}</small></span>`).join('');
  const has = s.translations[st.v]?.trim();
  return `<div class="q-panel-head"><h2>The gate of verse ${verse.v}</h2><span class="muted">${esc(verseLabel(s, verse))}</span></div>
    <p>Every stone of this verse is parsed. Write the verse in your own English to open the gate. Find the main verb and its subject first.</p>
    <div class="q-interlinear">${words}</div>
    <textarea data-tr="${st.v}" lang="en" placeholder="Your translation of verse ${verse.v}">${esc(s.translations[st.v] ?? '')}</textarea>
    <div class="wk-card-actions">
      <button class="btn btn-quiet" type="button" data-act="back">◀ Step back</button>
      <button class="btn btn-primary" type="button" data-act="gate" data-primary>${has ? `Open the gate (+${POINTS.verse} XP)` : 'Open the gate'}</button>
    </div>`;
}

function endPanel(s) {
  const p = progress(s);
  const xp = score(s);
  const acc = p.parsed ? Math.round((p.parsedRight / p.parsed) * 100) : null;
  return `<section class="wk-trophy enter">
      <div class="wk-cup" aria-hidden="true"><span>🏆</span></div>
      <h2>You walked all of ${esc(s.label)}!</h2>
      <div class="wk-medals">
        <div class="wk-medal gold"><b>${xp}</b><small>XP · level ${level(xp).level}</small></div>
        <div class="wk-medal"><b>${s.best ?? 0}</b><small>best streak</small></div>
        <div class="wk-medal"><b>${acc == null ? '—' : `${acc}%`}</b><small>parsed first time</small></div>
      </div>
    </section>
    <p>${p.translated} of ${p.verses} verses translated. Your translation is ready to read, print or save.</p>
    <div class="wk-card-actions">
      <button class="btn" type="button" data-act="new">New journey</button>
      <a class="btn btn-primary" href="walk.html" data-primary>Read my translation 📜</a>
    </div>`;
}

function ensureAnswer(s, st) {
  const key = answerKey(st.v, st.w);
  s.answers[key] ??= {};
  return s.answers[key];
}

function onPanelInput(e) {
  const t = e.target;
  if (!t.matches('[data-tr]')) return;
  const s = current();
  s.translations[Number(t.dataset.tr)] = t.value;
  s.updated = Date.now();
  save({ soon: true });
  const btn = $('[data-act="gate"]', els.panel);
  if (btn) btn.textContent = t.value.trim() ? `Open the gate (+${POINTS.verse} XP)` : 'Open the gate';
}

function onPanelClick(e) {
  const btn = e.target.closest('button');
  if (!btn) return;
  const s = current();
  const st = W.stations[ui.panelFor];
  const d = btn.dataset;
  switch (d.act) {
    case 'back': return stepBack();
    case 'cheat': return $('#cheat').showModal();
    case 'chart': return openChart();
    case 'new': return newJourney();
    case 'help': {
      const a = ensureAnswer(s, st);
      a.help = Math.min(HELP_STEPS, (a.help ?? 0) + 1);
      touch(s);
      return renderPanel();
    }
    case 'class': {
      const word = s.verses[st.v].words[st.w];
      const a = ensureAnswer(s, st);
      a.cls = d.cls;
      a.clsOk = d.cls === wordClass(word);
      recordStreak(s, a.clsOk);
      reward(btn, a.clsOk, POINTS.cls, s);
      touch(s);
      afterAnswer(s, st);
      return;
    }
    case 'pick': {
      const a = ensureAnswer(s, st);
      a.parse = { ...a.parse, [d.field]: d.value };
      if (a.marks) delete a.marks[d.field];
      sound('tap', store.opts.sound);
      touch(s);
      return renderPanel();
    }
    case 'check': {
      const word = s.verses[st.v].words[st.w];
      const a = ensureAnswer(s, st);
      const fields = walkFields(word, s.opts);
      const missing = fields.filter((f) => !a.parse?.[f]);
      if (missing.length) {
        a.notice = `Choose a ${missing.map((f) => FIELDS[f].label.toLowerCase()).join(', ')} first.`;
        return renderPanel();
      }
      delete a.notice;
      const result = checkParse(word, a.parse);
      const ok = fields.every((f) => result.fields[f].ok);
      a.marks = Object.fromEntries(fields.map((f) => [f, result.fields[f].ok]));
      if (a.firstTry == null) {
        a.firstTry = ok;
        recordStreak(s, ok);
        reward(btn, ok, POINTS.parse, s);
      } else {
        ui.fx = ok ? 'good' : 'bad';
        sound(ok ? 'good' : 'bad', store.opts.sound);
      }
      if (ok) a.solved = true;
      touch(s);
      return afterAnswer(s, st);
    }
    case 'reveal': {
      const a = ensureAnswer(s, st);
      a.revealed = true;
      if (a.firstTry == null) {
        a.firstTry = false;
        recordStreak(s, false);
      }
      touch(s);
      return afterAnswer(s, st);
    }
    case 'onward': {
      ensureAnswer(s, st).done = true;
      const lastWord = st.w === s.verses[st.v].words.length - 1;
      advance(s);
      if (lastWord) {
        banner(`Verse ${s.verses[st.v].v}: all stones moved!`);
        sound('win', store.opts.sound);
      }
      return;
    }
    case 'gate': {
      const has = s.translations[st.v]?.trim();
      if (has) {
        floatPoints(btn, `+${POINTS.verse} XP`);
        sound('win', store.opts.sound);
      }
      burst(st.mesh.position.clone().setY(2.5), '#ffd76a', 120);
      confetti({ count: has ? 80 : 30 });
      const last = st.v === s.verses.length - 1;
      advance(s);
      banner(last ? 'The road is clear!' : `Gate ${s.verses[st.v].v} open!`);
      if (last) {
        s.finished = s.finished ?? Date.now();
        touch(s);
      }
      return;
    }
    default:
  }
}

/** Once a word is answered, carve its meaning on the stone and celebrate. */
function afterAnswer(s, st) {
  if (wordStage(s, st.v, st.w) === 'summary' && st.mesh) {
    const a = answerFor(s, st.v, st.w);
    const wasPainted = st.carved;
    paintStone(st, s);
    st.carved = true;
    if (!wasPainted) {
      const good = !(a.firstTry === false || a.revealed || a.clsOk === false);
      burst(st.mesh.position.clone().setY(1.5), good ? '#ffd76a' : '#e37e6e', good ? 90 : 40);
    }
  }
  renderPanel();
  renderHud();
}

function reward(el, right, points, s) {
  ui.fx = right ? 'good' : 'bad';
  sound(right ? 'good' : 'bad', store.opts.sound);
  if (!right) {
    if ((s.best ?? 0) >= 3 && s.streak === 0) floatPoints(el, 'streak lost', 'bad');
    return;
  }
  const before = level(score(s) - points).level;
  floatPoints(el, `+${points} XP`);
  if (level(score(s)).level > before) {
    banner(`Level ${level(score(s)).level}!`);
    confetti({ count: 80 });
  } else if (s.streak > 0 && s.streak % 5 === 0) {
    banner(`${s.streak} in a row!`);
    confetti({ count: 40 });
  }
}

// ---------------------------------------------------------------------------
// Overlays: title, menu, translation so far

function showOverlay(kind) {
  ui.overlay = kind;
  ui.hold = 0;
  els.overlay.hidden = false;
  if (kind === 'title') {
    els.hud.hidden = els.menuBtn.hidden = els.controls.hidden = true;
  }
  renderOverlay();
}

function closeOverlay() {
  ui.overlay = null;
  els.overlay.hidden = true;
  if (current()) startPlay();
}

function renderOverlay() {
  const s = current();
  if (ui.overlay === 'title') {
    const list = store.sessions.map((x) => {
      const p = progress(x);
      return `<li class="q-row"><span><b>${esc(x.label)}</b><br><span class="muted">${x.finished ? 'finished' : `${p.done}/${p.words} stones`} · ${esc(formatDate(new Date(x.updated)))}</span></span>
        <button class="btn btn-sm" type="button" data-go="${x.id}">${x.finished ? 'Walk again' : 'Continue ▶'}</button></li>`;
    }).join('');
    els.overlay.innerHTML = `<div class="q-sheet">
      <h1 class="q-logo">ὁδός<small>Hodos · the road</small></h1>
      <p class="q-tagline">Walk a passage of the Greek New Testament. Every word is a stone on the road: parse it to move it. Every verse ends at a gate: translate it to pass.</p>
      <form class="wk-start" id="q-start" autocomplete="off">
        <input type="text" id="q-ref" placeholder="e.g. John 11:30-44" aria-label="Scripture reference" required>
        <button class="btn btn-primary" type="submit"${ui.busy ? ' disabled' : ''}>Start the journey ▶</button>
      </form>
      <p class="status error" role="status">${esc(ui.status)}</p>
      ${list ? `<h2>Your journeys</h2><ul>${list}</ul>` : ''}
      <ul class="q-howto">
        <li><b>Walk</b>: the traveller walks on by itself. Hold ▶ / ◀ (or the arrow keys) to walk on or back.</li>
        <li><b>Stones</b>: number keys pick the kind of word, <b>Enter</b> checks and moves on.</li>
        <li><b>Gates</b>: write the verse in English to open them.</li>
      </ul>
      <div class="q-links"><a class="btn btn-quiet" href="walk.html">Classic walk-through</a><a class="btn btn-quiet" href="index.html">Full workbench</a></div>
    </div>`;
    setTimeout(() => $('#q-ref')?.focus(), 50);
  } else if (ui.overlay === 'menu') {
    els.overlay.innerHTML = `<div class="q-sheet">
      <h2 style="margin-top:0">${esc(s.label)}</h2>
      <label class="toggle"><input type="checkbox" data-opt="askClass"${s.opts.askClass ? ' checked' : ''}> Ask me what kind of word each one is</label>
      <label class="toggle"><input type="checkbox" data-opt="parseArticles"${s.opts.parseArticles ? ' checked' : ''}> Parse the article (ὁ, ἡ, τό) too</label>
      <label class="toggle"><input type="checkbox" data-opt="sound"${store.opts.sound ? ' checked' : ''}> Sound effects</label>
      <div class="q-links">
        <button class="btn btn-primary" type="button" data-close>Back to the road ▶</button>
        <button class="btn" type="button" data-show-tr>My translation so far</button>
        <button class="btn" type="button" data-chart>Conjugation chart</button>
        <button class="btn" type="button" data-cheat>Cheat sheet</button>
        <a class="btn" href="walk.html">Classic view</a>
        <button class="btn btn-quiet" type="button" data-new>Another passage</button>
      </div>
    </div>`;
  } else if (ui.overlay === 'translation') {
    const body = s.verses.map((v, i) => `<sup>${v.v}</sup>${s.translations[i]?.trim() ? esc(s.translations[i].trim()) : '<span class="muted">…</span>'} `).join('');
    els.overlay.innerHTML = `<div class="q-sheet">
      <h2 style="margin-top:0">${esc(s.label)}: my translation so far</h2>
      <p class="q-trans">${body}</p>
      <div class="q-links"><button class="btn btn-primary" type="button" data-close>Back to the road ▶</button><a class="btn" href="walk.html">Print or save it</a></div>
    </div>`;
  }
}

async function onOverlaySubmit(e) {
  if (e.target.id !== 'q-start') return;
  e.preventDefault();
  const text = $('#q-ref').value.trim();
  if (!text || ui.busy) return;
  ui.busy = true;
  ui.status = '';
  renderOverlay();
  try {
    await openPassage(text, { onStatus: (m) => { ui.status = m; const el = $('.q-sheet .status'); if (el) el.textContent = m; } });
    location.replace(location.pathname); // rebuild the world for this passage
  } catch (err) {
    ui.busy = false;
    ui.status = err.message;
    renderOverlay();
  }
}

function onOverlayClick(e) {
  const btn = e.target.closest('button');
  if (!btn) return;
  const d = btn.dataset;
  if (d.go) {
    const s = select(d.go);
    if (s?.finished && !confirm(`Walk ${s.label} again? Your answers and translation are kept.`)) return;
    location.replace(location.pathname);
  } else if (d.close != null) closeOverlay();
  else if (d.showTr != null) showOverlay('translation');
  else if (d.cheat != null) $('#cheat').showModal();
  else if (d.chart != null) openChart();
  else if (d.new != null) newJourney();
}

function onOverlayChange(e) {
  const t = e.target;
  if (!t.matches('[data-opt]')) return;
  const s = current();
  if (t.dataset.opt === 'sound') {
    store.opts.sound = t.checked;
    sound('good', t.checked);
  } else if (s) {
    s.opts[t.dataset.opt] = t.checked;
    store.opts[t.dataset.opt] = t.checked;
  }
  save();
}

function newJourney() {
  store.current = null;
  save();
  location.replace(location.pathname);
}

function openChart() {
  let dlg = $('#chart');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'chart';
    dlg.className = 'wk-cheat';
    dlg.innerHTML = `${chartHtml()}<form method="dialog"><button class="btn btn-primary" type="submit">Close</button></form>`;
    document.body.appendChild(dlg);
  }
  dlg.showModal();
}
