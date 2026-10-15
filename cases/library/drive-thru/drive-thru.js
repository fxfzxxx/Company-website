/* Rainy Night Drive-Thru — a live, self-running 3D scene of a drive-thru
   restaurant on a wet night: cars queue through the order point, pay window
   and pickup window; people walk in from the car park and the street under
   umbrellas; rain, splashes, canopy drips and lightning. Every texture is
   painted on canvas at load and every shape is built from primitives, so the
   page downloads no models and no images.

   URL parameters (used for the library stills): ?lang=en|zh, ?view=<name>
   opens on a camera preset without the fly-in, ?hud=0 hides the panel. */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const lin = (r, g, b) => new THREE.Color().setRGB(r, g, b);
const PI = Math.PI;

// ================================================================ i18n
const UI = {
  zh: { title: '雨夜 · 得来速', loading: '正在搭建雨夜场景…',
    queue: '排队车辆', served: '已出餐', inside: '店内顾客', view: '视角', overview: '全景', door: '门口', insideV: '店内', window: '取餐窗',
    follow: '跟车', top: '俯视', street: '街角', order: '点餐屏', pylon: '招牌', rain: '下雨', amount: '雨量', flash: '闪电', bloom: '灯光辉光',
    rotate: '自动环绕', hint: '拖动旋转 · 滚轮缩放 · 右键平移', doc: '雨夜得来速 - 实时概念', lib: '案例库', study: '案例研究' },
  en: { title: 'Rainy Night Drive-Thru', loading: 'Building the rainy night…',
    queue: 'In queue', served: 'Served', inside: 'Inside', view: 'CAMERA', overview: 'Overview', door: 'Entrance', insideV: 'Dining', window: 'Window',
    follow: 'Follow car', top: 'Top', street: 'Street', order: 'Menu', pylon: 'Sign', rain: 'Rain', amount: 'Rain amount', flash: 'Lightning', bloom: 'Glow',
    rotate: 'Auto orbit', hint: 'Drag to orbit · scroll to zoom · right-drag to pan', doc: 'Rainy Night Drive-Thru - Live concept', lib: 'Case library', study: 'Case study' },
};
const CJK = "'PingFang SC','Microsoft YaHei','Noto Sans CJK SC','Source Han Sans SC',sans-serif";
const S = {   // in-scene signage
  zh: { sign: '麦当劳', signFont: `900 230px ${CJK}`,
    order: '欢迎光临 · 请在此点餐', drive: '得来速', drive2: '24小时', lane: '得来速', enter: '入口', exit: '出口', stop: '停',
    clear: '限高 3.1 米', pay: '① 付款', pick: '② 取餐', wet: ['小心地滑', '雨天路滑'], auto: '自动门', open: '营业中 · 24小时',
    pylon2: '24小时得来速', parking: '顾客专用车位', cur: '¥',
    items: [['巨无霸', 25], ['麦辣鸡腿堡', 22], ['麦乐鸡', 16], ['中薯条', 12], ['麦旋风', 14], ['可口可乐', 9]],
    board: ['超值套餐', '早餐', '甜品站'] },
  en: { sign: "McDonald's", signFont: "900 200px 'Arial Black','Helvetica Neue',Arial,sans-serif",
    order: 'WELCOME · ORDER HERE', drive: 'DRIVE THRU', drive2: 'OPEN 24/7', lane: 'DRIVE THRU', enter: 'ENTER', exit: 'EXIT', stop: 'STOP',
    clear: 'CLEARANCE 3.1 m', pay: '1  PAY HERE', pick: '2  PICK UP', wet: ['CAUTION', 'WET FLOOR'], auto: 'AUTOMATIC DOOR', open: 'OPEN 24 HOURS',
    pylon2: 'DRIVE THRU 24/7', parking: 'CUSTOMER PARKING', cur: '$',
    items: [['Big Mac', 5.69], ['McSpicy', 5.29], ['McNuggets', 4.49], ['Med Fries', 2.79], ['McFlurry', 3.69], ['Coca-Cola', 1.99]],
    board: ['VALUE MEALS', 'BREAKFAST', 'DESSERTS'] },
};
const params = new URLSearchParams(location.search);
let LANG = 'en';
try { const s = localStorage.getItem('drive-thru-lang'); if (s === 'en' || s === 'zh') LANG = s; } catch (e) {}
if (params.get('lang') === 'en' || params.get('lang') === 'zh') LANG = params.get('lang');
if (params.get('hud') === '0') document.body.classList.add('bare');
const t = k => UI[LANG][k];
function applyUI() {
  document.documentElement.lang = LANG === 'zh' ? 'zh-CN' : 'en';
  document.title = t('doc');
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('#lang span').forEach(s => s.classList.toggle('on', s.dataset.l === LANG));
}
applyUI();

// ================================================================ renderer
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
const DPR = Math.min(devicePixelRatio, 1.75);
renderer.setPixelRatio(DPR);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;

const scene = new THREE.Scene();
const fogCol = lin(.012, .014, .022);
scene.fog = new THREE.FogExp2(fogCol, .0098);
scene.background = fogCol;

const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, .1, 1200);
camera.position.set(34, 13, 42);
const controls = new OrbitControls(camera, canvas);
controls.target.set(-1, 2.6, 5);
controls.enableDamping = true;
controls.maxPolarAngle = PI * .485;
controls.minDistance = 1.5;
controls.maxDistance = 150;
controls.autoRotateSpeed = .35;

// ================================================================ procedural textures
const ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy());
const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function toTex(c, { srgb = true, wrap = true } = {}) {
  const tx = new THREE.CanvasTexture(c);
  if (srgb) tx.colorSpace = THREE.SRGBColorSpace;
  if (wrap) tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  tx.anisotropy = ANISO; return tx;
}
function draw(w, h, fn) { const c = mkCanvas(w, h); fn(c.getContext('2d', { willReadFrequently: true }), w, h); return c; }
function noise(g, w, h, amt) {
  const id = g.getImageData(0, 0, w, h), d = id.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - .5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(id, 0, 0);
}
function normalFrom(hc, strength = 2) {
  const w = hc.width, h = hc.height, src = hc.getContext('2d').getImageData(0, 0, w, h).data;
  const out = mkCanvas(w, h), g = out.getContext('2d'), id = g.createImageData(w, h), d = id.data;
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
    d[i] = (-dx / l * .5 + .5) * 255; d[i + 1] = (dy / l * .5 + .5) * 255; d[i + 2] = (1 / l) * 255; d[i + 3] = 255;
  }
  g.putImageData(id, 0, 0);
  return toTex(out, { srgb: false });
}
const seamless = (w, h, fn) => { for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) fn(ox, oy); };

// --- asphalt (aggregate, tar patches, cracks)
const asphalt = (() => {
  const W = 1024;
  const hgt = draw(W, W, (g) => { g.fillStyle = '#808080'; g.fillRect(0, 0, W, W); noise(g, W, W, 50); });
  const col = draw(W, W, (g) => {
    g.fillStyle = '#2f3135'; g.fillRect(0, 0, W, W); noise(g, W, W, 34);
    for (let i = 0; i < 60; i++) {
      g.fillStyle = `rgba(0,0,0,${rand(.04, .12)})`; const x = rand(0, W), y = rand(0, W), rx = rand(30, 140), ry = rand(15, 70), a = rand(0, 3);
      seamless(W, W, (ox, oy) => { g.beginPath(); g.ellipse(x + ox, y + oy, rx, ry, a, 0, 7); g.fill(); });
    }
  });
  const gc = col.getContext('2d'), gh = hgt.getContext('2d');
  for (let i = 0; i < 9000; i++) {
    const x = rand(0, W), y = rand(0, W), r = rand(.6, 2.2), v = rand(70, 140) | 0;
    gc.fillStyle = `rgba(${v},${v},${v + 4},${rand(.35, .8)})`; gc.beginPath(); gc.arc(x, y, r, 0, 7); gc.fill();
    gh.fillStyle = 'rgba(230,230,230,.8)'; gh.beginPath(); gh.arc(x, y, r, 0, 7); gh.fill();
  }
  for (let i = 0; i < 14; i++) {
    let x = rand(0, W), y = rand(0, W), a = rand(0, 6.3);
    const pts = [[x, y]];
    for (let k = 0; k < 40; k++) { a += rand(-.6, .6); x += Math.cos(a) * 6; y += Math.sin(a) * 6; pts.push([x, y]); }
    for (const [g, c, lw] of [[gc, 'rgba(8,8,10,.85)', 1.6], [gh, 'rgba(0,0,0,1)', 2.2]]) {
      g.strokeStyle = c; g.lineWidth = lw;
      seamless(W, W, (ox, oy) => { g.beginPath(); pts.forEach(([px, py], j) => j ? g.lineTo(px + ox, py + oy) : g.moveTo(px + ox, py + oy)); g.stroke(); });
    }
  }
  return { map: toTex(col), normal: normalFrom(hgt, 3) };
})();
const wetTex = toTex(draw(1024, 1024, (g, w, h) => {
  g.fillStyle = 'rgb(200,200,200)'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 95; i++) {
    const x = rand(0, w), y = rand(0, h), r = rand(25, 150), sx = rand(.5, 1.7);
    seamless(w, h, (ox, oy) => {
      g.save(); g.translate(x + ox, y + oy); g.scale(sx, 1);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
      gr.addColorStop(0, 'rgba(22,22,22,.95)'); gr.addColorStop(.6, 'rgba(45,45,45,.7)'); gr.addColorStop(1, 'rgba(200,200,200,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill(); g.restore();
    });
  }
}), { srgb: false });

function tiled(size, colorFn, heightFn, strength = 3) {
  return { map: toTex(draw(size, size, colorFn)), normal: normalFrom(draw(size, size, heightFn), strength) };
}
const flatFill = (g, w, h, c = '#808080') => { g.fillStyle = c; g.fillRect(0, 0, w, h); };
// corrugated dark cladding (2 m tile, 20 ribs)
const slat = tiled(256, (g, w, h) => {
  for (let y = 0; y < h; y++) { const s = Math.sin(y / h * PI * 2 * 20); const v = 26 + s * 9; g.fillStyle = `rgb(${v},${v + 1},${v + 4})`; g.fillRect(0, y, w, 1); }
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(120,130,140,${rand(.02, .06)})`; g.fillRect(rand(0, w), 0, rand(1, 4), h); }
  noise(g, w, h, 8);
}, (g, w, h) => { for (let y = 0; y < h; y++) { const v = 128 + Math.sin(y / h * PI * 2 * 20) * 110; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(0, y, w, 1); } }, 6);
// timber boards (2 m tile, 13 boards)
const wood = (() => {
  const W = 512, n = 13, pw = W / n, cols = ['#a35a28', '#b86c34', '#9b5023', '#c07a3e', '#ad6230', '#8f4a20', '#b5682f'];
  const boards = Array.from({ length: n }, () => pick(cols));
  return tiled(W, (g) => {
    boards.forEach((c, i) => {
      g.fillStyle = c; g.fillRect(i * pw, 0, pw, W);
      for (let k = 0; k < 16; k++) {
        g.strokeStyle = `rgba(60,25,8,${rand(.08, .28)})`; g.lineWidth = rand(.5, 1.8);
        g.beginPath(); let x = i * pw + rand(2, pw - 2); g.moveTo(x, 0);
        for (let y = 0; y <= W; y += 24) { x += rand(-1.2, 1.2); g.lineTo(Math.min(i * pw + pw - 1, Math.max(i * pw + 1, x)), y); } g.stroke();
      }
      if (Math.random() < .5) { g.fillStyle = 'rgba(70,30,10,.5)'; g.beginPath(); g.ellipse(i * pw + pw / 2, rand(0, W), 4, 7, 0, 0, 7); g.fill(); }
      g.fillStyle = 'rgba(25,10,4,.9)'; g.fillRect(i * pw, 0, 3, W);
    });
    noise(g, W, W, 10);
  }, (g) => {
    flatFill(g, W, W, '#909090');
    for (let i = 0; i < n; i++) { g.fillStyle = '#000'; g.fillRect(i * pw, 0, 4, W); for (let k = 0; k < 10; k++) { g.fillStyle = 'rgba(60,60,60,.4)'; g.fillRect(i * pw + rand(4, pw), 0, 1, W); } }
  }, 4);
})();
// stacked ledgestone (1.5 m tile)
const stone = (() => {
  const W = 256, rects = [];
  let y = 0; while (y < W) { const rh = rand(9, 20); let x = -rand(0, 30); while (x < W) { const rw = rand(25, 75); rects.push([x, y, rw, rh, rand(60, 125) | 0]); x += rw; } y += rh; }
  return tiled(W, (g) => { flatFill(g, W, W, '#222'); rects.forEach(([x, y, w, h, v]) => { g.fillStyle = `rgb(${v},${v - 4},${v - 10})`; g.fillRect(x + 1, y + 1, w - 2, h - 2); }); noise(g, W, W, 30); },
    (g) => { flatFill(g, W, W, '#000'); rects.forEach(([x, y, w, h]) => { const v = rand(150, 255) | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x + 1, y + 1, w - 2, h - 2); }); noise(g, W, W, 50); }, 5);
})();
// concrete paving (3 m tile, 2x2 slabs)
const concrete = tiled(512, (g, w, h) => {
  flatFill(g, w, h, '#76787b'); noise(g, w, h, 26);
  for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(30,30,30,${rand(.03, .08)})`; g.beginPath(); g.ellipse(rand(0, w), rand(0, h), rand(20, 80), rand(10, 50), 0, 0, 7); g.fill(); }
  g.fillStyle = '#3a3b3d'; g.fillRect(0, 0, w, 3); g.fillRect(0, h / 2, w, 3); g.fillRect(0, 0, 3, h); g.fillRect(w / 2, 0, 3, h);
}, (g, w, h) => { flatFill(g, w, h); noise(g, w, h, 30); g.fillStyle = '#000'; g.fillRect(0, 0, w, 4); g.fillRect(0, h / 2, w, 4); g.fillRect(0, 0, 4, h); g.fillRect(w / 2, 0, 4, h); }, 3);
// white aluminium composite panels (2.4 m tile)
const acm = tiled(256, (g, w, h) => {
  flatFill(g, w, h, '#e4e4df'); noise(g, w, h, 6);
  for (let i = 0; i < 18; i++) { const x = rand(0, w); const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(90,90,80,.12)'); gr.addColorStop(1, 'rgba(90,90,80,0)'); g.fillStyle = gr; g.fillRect(x, 0, rand(2, 8), h * rand(.2, .6)); }
  g.fillStyle = '#9a9a95'; g.fillRect(0, 0, w, 2); g.fillRect(0, 0, 2, h); g.fillRect(w / 2, 0, 2, h);
}, (g, w, h) => { flatFill(g, w, h); g.fillStyle = '#000'; g.fillRect(0, 0, w, 3); g.fillRect(0, 0, 3, h); g.fillRect(w / 2, 0, 3, h); }, 3);
const redPanel = tiled(256, (g, w, h) => { flatFill(g, w, h, '#b3121c'); noise(g, w, h, 10); g.fillStyle = '#6a0a10'; g.fillRect(0, 0, 2, h); g.fillRect(w / 2, 0, 2, h); },
  (g, w, h) => { flatFill(g, w, h); g.fillStyle = '#000'; g.fillRect(0, 0, 3, h); g.fillRect(w / 2, 0, 3, h); }, 3);
const grass = tiled(512, (g, w, h) => {
  flatFill(g, w, h, '#1b2d1d'); noise(g, w, h, 30);
  for (let i = 0; i < 6000; i++) { g.strokeStyle = pick(['#2b4a2a', '#1a3319', '#355a30', '#0f1f10']); g.lineWidth = 1; const x = rand(0, w), y = rand(0, h); g.beginPath(); g.moveTo(x, y); g.lineTo(x + rand(-2, 2), y - rand(3, 7)); g.stroke(); }
}, (g, w, h) => { flatFill(g, w, h); noise(g, w, h, 120); }, 2);
const leaves = (() => {
  const L = Array.from({ length: 1400 }, () => [rand(0, 256), rand(0, 256), rand(0, 6.3), pick(['#1e3a20', '#284a26', '#173018', '#335a2c']), rand(80, 255) | 0]);
  const leafFn = (g, colFn) => L.forEach(l => { g.fillStyle = colFn(l); g.save(); g.translate(l[0], l[1]); g.rotate(l[2]); g.beginPath(); g.ellipse(0, 0, 5, 2.4, 0, 0, 7); g.fill(); g.restore(); });
  return tiled(256, (g, w, h) => { flatFill(g, w, h, '#0d1a10'); leafFn(g, l => l[3]); }, (g, w, h) => { flatFill(g, w, h, '#000'); leafFn(g, l => `rgb(${l[4]},${l[4]},${l[4]})`); }, 4);
})();
const roofT = tiled(256, (g, w, h) => { flatFill(g, w, h, '#3d3f43'); noise(g, w, h, 18); g.fillStyle = '#2a2b2e'; g.fillRect(0, 0, w, 3); },
  (g, w, h) => { flatFill(g, w, h); noise(g, w, h, 20); g.fillStyle = '#fff'; g.fillRect(0, 0, w, 4); }, 2);
const tiles = tiled(256, (g, w, h) => {
  flatFill(g, w, h, '#b9b2a6');
  for (let i = 0; i < 900; i++) { g.fillStyle = pick(['#8d857a', '#d7d1c6', '#6e675e', '#c9a46a']); g.fillRect(rand(0, w), rand(0, h), rand(1, 3), rand(1, 3)); }
  g.fillStyle = '#6a655d'; g.fillRect(0, 0, w, 2); g.fillRect(0, h / 2, w, 2); g.fillRect(0, 0, 2, h); g.fillRect(w / 2, 0, 2, h);
}, (g, w, h) => { flatFill(g, w, h); g.fillStyle = '#000'; g.fillRect(0, 0, w, 3); g.fillRect(0, h / 2, w, 3); g.fillRect(0, 0, 3, h); g.fillRect(w / 2, 0, 3, h); }, 2);
const ceilT = tiled(128, (g, w, h) => { flatFill(g, w, h, '#1a120c'); for (let i = 0; i < 8; i++) { g.fillStyle = pick(['#7a4a26', '#8a5530', '#6d4020']); g.fillRect(i * 16 + 3, 0, 10, h); } },
  (g, w, h) => { flatFill(g, w, h, '#000'); for (let i = 0; i < 8; i++) { g.fillStyle = '#fff'; g.fillRect(i * 16 + 3, 0, 10, h); } }, 4);
const bark = (() => {
  const st = Array.from({ length: 60 }, () => [rand(0, 128), rand(1, 3), rand(.2, .5)]);
  return tiled(128, (g, w, h) => { flatFill(g, w, h, '#2b2018'); st.forEach(([x, sw, a]) => { g.fillStyle = `rgba(0,0,0,${a})`; g.fillRect(x, 0, sw, h); }); noise(g, w, h, 20); },
    (g, w, h) => { flatFill(g, w, h); st.forEach(([x, sw]) => { g.fillStyle = '#000'; g.fillRect(x, 0, sw, h); }); }, 4);
})();

// raindrops on glass (RGBA) + droplet normal for car clear-coat
const glassDropTex = toTex(draw(512, 512, (g, w, h) => {
  g.fillStyle = 'rgba(150,170,190,.13)'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 700; i++) {
    const x = rand(0, w), y = rand(0, h), r = rand(1, 4.5);
    const gr = g.createRadialGradient(x - r * .3, y - r * .3, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,.65)'); gr.addColorStop(.6, 'rgba(200,215,230,.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    if (Math.random() < .12) { g.fillStyle = 'rgba(220,230,240,.18)'; g.fillRect(x - .8, y, 1.6, rand(10, 60)); }
  }
}));
glassDropTex.repeat.set(6, 2);
const dropNormal = normalFrom(draw(256, 256, (g, w, h) => {
  flatFill(g, w, h, '#000');
  for (let i = 0; i < 500; i++) { const x = rand(0, w), y = rand(0, h), r = rand(1, 3.5); const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#000'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
}), 4);
const poolTex = toTex(draw(128, 128, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, '#fff'); gr.addColorStop(.5, '#555'); gr.addColorStop(1, '#000'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }), { wrap: false });

// ---- language-dependent canvas textures (re-drawn on language switch)
const dyn = [];
function dtex(w, h, fn) {
  const c = mkCanvas(w, h), tex = toTex(c, { wrap: false });
  const e = { render() { const g = c.getContext('2d'); g.clearRect(0, 0, w, h); g.save(); fn(g, w, h, S[LANG]); g.restore(); tex.needsUpdate = true; } };
  e.render(); dyn.push(e); return tex;
}
function fitText(g, text, font, x, y, maxW, color) {
  g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = color;
  const m = g.measureText(text).width, s = Math.min(1, maxW / m);
  g.save(); g.translate(x, y); g.scale(s, 1); g.fillText(text, 0, 0); g.restore();
}
function drawArches(g, cx, cy, w, h, col = '#ffc72c', lw = .115) {
  g.lineWidth = w * lw; g.strokeStyle = col; g.lineCap = 'butt';
  for (const ax of [cx - w * .17, cx + w * .17]) { g.beginPath(); g.ellipse(ax, cy + h * .5, w * .17, h, 0, PI, 0); g.stroke(); }
}
function food(g, k, x, y, s) {
  g.save(); g.translate(x, y); g.scale(s, s);
  if (k === 0 || k === 1) {
    g.fillStyle = '#d99a45'; g.beginPath(); g.ellipse(0, -14, 40, 22, 0, PI, 0); g.fill();
    g.fillStyle = '#f2e6c9'; for (let i = 0; i < 7; i++) g.fillRect(-28 + i * 9, -26 + (i % 2) * 4, 2, 2);
    g.fillStyle = '#7cc34a'; g.fillRect(-42, -14, 84, 5); g.fillStyle = '#f6c544'; g.fillRect(-40, -9, 80, 4);
    g.fillStyle = k === 0 ? '#5a2e16' : '#c87c3a'; g.fillRect(-40, -5, 80, 11);
    if (k === 0) { g.fillStyle = '#d99a45'; g.fillRect(-38, 6, 76, 5); g.fillStyle = '#5a2e16'; g.fillRect(-40, 11, 80, 9); }
    g.fillStyle = '#c8873e'; g.fillRect(-40, k === 0 ? 20 : 6, 80, 12);
  } else if (k === 2) {
    for (let i = 0; i < 5; i++) { g.fillStyle = '#d9a14c'; g.beginPath(); g.ellipse(-30 + i * 15, (i % 2) * 8, 13, 10, i, 0, 7); g.fill(); }
  } else if (k === 3) {
    g.fillStyle = '#f2c84a'; for (let i = 0; i < 9; i++) g.fillRect(-26 + i * 6, -34 + (i % 3) * 5, 5, 34);
    g.fillStyle = '#d0151f'; g.beginPath(); g.moveTo(-30, -6); g.lineTo(30, -6); g.lineTo(24, 30); g.lineTo(-24, 30); g.fill();
    drawArches(g, 0, 8, 26, 10, '#ffc72c', .14);
  } else if (k === 4) {
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(-24, -10); g.lineTo(24, -10); g.lineTo(18, 30); g.lineTo(-18, 30); g.fill();
    g.fillStyle = '#f5efe6'; g.beginPath(); g.ellipse(0, -12, 24, 12, 0, PI, 0); g.fill(); g.fillStyle = '#5a2e16'; g.fillRect(-12, -22, 24, 4);
  } else {
    g.fillStyle = '#c8102e'; g.beginPath(); g.moveTo(-20, -24); g.lineTo(20, -24); g.lineTo(15, 30); g.lineTo(-15, 30); g.fill();
    g.fillStyle = '#fff'; g.fillRect(-20, -28, 40, 5); g.fillStyle = '#ffc72c'; g.fillRect(4, -46, 4, 20); g.fillStyle = '#fff'; g.fillRect(-12, 0, 24, 3);
  }
  g.restore();
}
const price = (L, p) => L.cur + (L.cur === '$' ? p.toFixed(2) : p);
const F_UI = `Arial,${CJK}`;

const signTex = dtex(1600, 300, (g, w, h, L) => fitText(g, L.sign, L.signFont, w / 2, h / 2 + 8, w * .96, '#fff'));
const cafeTex = dtex(512, 160, (g, w, h) => fitText(g, 'McCafé', 'italic 700 110px Georgia,serif', w / 2, h / 2, w * .9, '#fff'));
const archesTex = dtex(512, 640, (g, w, h) => {
  flatFill(g, w, h, '#a10f19');
  const gr = g.createRadialGradient(w / 2, h * .45, 20, w / 2, h * .45, w * .8); gr.addColorStop(0, 'rgba(255,90,60,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.shadowColor = '#ffd54a'; g.shadowBlur = 26; drawArches(g, w / 2, h * .24, w, h * .6);
});
const pylonCafeTex = dtex(512, 200, (g, w, h) => { flatFill(g, w, h, '#a10f19'); fitText(g, 'McCafé', 'italic 700 120px Georgia,serif', w / 2, h / 2, w * .9, '#fff'); });
const pylon2Tex = dtex(512, 140, (g, w, h, L) => { flatFill(g, w, h, '#1b1b1d'); fitText(g, L.pylon2, `800 80px ${F_UI}`, w / 2, h / 2, w * .88, '#ffc72c'); });
const menuTex = dtex(1024, 600, (g, w, h, L) => {
  flatFill(g, w, h, '#101114');
  g.fillStyle = '#c8102e'; g.fillRect(0, 0, w, 90);
  drawArches(g, 70, 18, 80, 30);
  fitText(g, L.order, `800 48px ${F_UI}`, w / 2 + 40, 47, w - 220, '#ffc72c');
  L.items.forEach(([name, p], i) => {
    const x = 18 + (i % 3) * 336, y = 108 + ((i / 3) | 0) * 246;
    const gr = g.createLinearGradient(0, y, 0, y + 230); gr.addColorStop(0, '#26282e'); gr.addColorStop(1, '#17181c');
    g.fillStyle = gr; g.fillRect(x, y, 320, 230);
    food(g, i, x + 160, y + 92, 1.5);
    fitText(g, name, `700 34px ${F_UI}`, x + 160, y + 176, 290, '#fff');
    fitText(g, price(L, p), '800 30px Arial', x + 160, y + 210, 290, '#ffc72c');
  });
});
const backWallTex = dtex(2048, 640, (g, w, h, L) => {
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2a1d15'); gr.addColorStop(.5, '#3a2a1f'); gr.addColorStop(1, '#2a1f18');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) { g.fillStyle = i % 2 ? '#4a321f' : '#3c2818'; g.fillRect(i * w / 40, h * .62, w / 40 - 3, h * .38); }
  L.board.forEach((title, b) => {
    const x = 120 + b * 620, y = 40, W = 520, H = 250;
    g.fillStyle = '#0a0a0c'; g.fillRect(x - 8, y - 8, W + 16, H + 16);
    g.fillStyle = b === 1 ? '#ffc72c' : '#c8102e'; g.fillRect(x, y, W, 50);
    fitText(g, title, `800 34px ${F_UI}`, x + W / 2, y + 26, W - 30, b === 1 ? '#c8102e' : '#fff');
    g.fillStyle = '#1b1c20'; g.fillRect(x, y + 50, W, H - 50);
    for (let k = 0; k < 3; k++) {
      const it = L.items[(b * 2 + k) % 6];
      food(g, (b * 2 + k) % 6, x + 90 + k * 170, y + 130, .9);
      fitText(g, it[0], `700 22px ${F_UI}`, x + 90 + k * 170, y + 200, 150, '#fff');
      fitText(g, price(L, it[1]), '700 20px Arial', x + 90 + k * 170, y + 228, 150, '#ffc72c');
    }
  });
  g.fillStyle = '#c8102e'; g.fillRect(0, h * .6, w, 8);
  fitText(g, L.open, `800 40px ${F_UI}`, w * .5, h * .55, 900, '#ffc72c');
});
const kioskTex = toTex(draw(128, 256, (g, w, h) => {
  flatFill(g, w, h, '#fafafa'); g.fillStyle = '#c8102e'; g.fillRect(0, 0, w, 40); drawArches(g, w / 2, 8, 40, 14);
  for (let i = 0; i < 6; i++) { g.fillStyle = pick(['#f2c14e', '#e8863a', '#d9a14c', '#c8102e']); g.fillRect(10 + (i % 2) * 58, 54 + ((i / 2) | 0) * 58, 50, 50); }
  g.fillStyle = '#2b8a3e'; g.fillRect(14, h - 34, w - 28, 22);
}), { wrap: false });
const kitchenTex = toTex(draw(256, 240, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#fff3dc'); gr.addColorStop(1, '#9a9ea4'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 6; i++) { g.fillStyle = '#c9ccd1'; g.fillRect(i * 44, h * .12, 40, h * .3); }
  g.fillStyle = '#b8bcc2'; g.fillRect(0, h * .62, w, h * .38);
  g.fillStyle = '#20232a'; g.beginPath(); g.arc(w * .55, h * .32, 22, 0, 7); g.fill();
  g.fillStyle = '#c8102e'; g.fillRect(w * .55 - 26, h * .22, 52, 10);
  g.fillStyle = '#1b1d22'; g.fillRect(w * .55 - 34, h * .42, 68, h * .3); g.fillStyle = '#ffc72c'; g.fillRect(w * .55 - 5, h * .45, 10, 10);
}), { wrap: false });
const corridorTex = toTex(draw(128, 256, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#bfc3c8'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(0,0,0,.08)'; for (let y = 0; y < h; y += 22) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
}), { wrap: false });
const driveSignTex = dtex(512, 256, (g, w, h, L) => {
  flatFill(g, w, h, '#b5121b'); drawArches(g, 70, 40, 90, 40);
  fitText(g, L.drive, `italic 900 76px ${F_UI}`, w / 2 + 40, 92, w - 160, '#ffc72c');
  fitText(g, L.drive2 + '  ➜', `700 50px ${F_UI}`, w / 2, 190, w - 40, '#fff');
});
const clearTex = dtex(1024, 64, (g, w, h, L) => {
  for (let i = -2; i < 40; i++) { g.fillStyle = i % 2 ? '#111' : '#f2c21b'; g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32 + 32, 0); g.lineTo(i * 32 + 8, h); g.lineTo(i * 32 - 24, h); g.fill(); }
  g.fillStyle = '#fff'; g.fillRect(w * .28, 6, w * .44, h - 12);
  fitText(g, L.clear, `900 42px ${F_UI}`, w / 2, h / 2 + 2, w * .4, '#111');
});
const winSignTex = [0, 1].map(k => dtex(512, 128, (g, w, h, L) => { flatFill(g, w, h, '#ffc72c'); fitText(g, k ? L.pick : L.pay, `900 70px ${F_UI}`, w / 2, h / 2 + 3, w * .9, '#1a1a1a'); }));
const wetSignTex = dtex(256, 320, (g, w, h, L) => {
  flatFill(g, w, h, '#f5c400');
  g.fillStyle = '#111'; g.beginPath(); g.moveTo(w / 2, 20); g.lineTo(w - 40, 150); g.lineTo(40, 150); g.closePath(); g.fill();
  g.fillStyle = '#f5c400'; g.beginPath(); g.moveTo(w / 2, 46); g.lineTo(w - 62, 136); g.lineTo(62, 136); g.closePath(); g.fill();
  g.fillStyle = '#111'; g.beginPath(); g.arc(w / 2 + 6, 72, 7, 0, 7); g.fill(); g.lineWidth = 6; g.strokeStyle = '#111';
  g.beginPath(); g.moveTo(w / 2 + 4, 80); g.lineTo(w / 2 - 6, 106); g.lineTo(w / 2 + 14, 126); g.moveTo(w / 2 - 6, 106); g.lineTo(w / 2 - 26, 118); g.stroke();
  fitText(g, L.wet[0], `900 46px ${F_UI}`, w / 2, 200, w - 30, '#111');
  fitText(g, L.wet[1], `800 38px ${F_UI}`, w / 2, 258, w - 30, '#111');
});
const autoDoorTex = dtex(512, 96, (g, w, h, L) => fitText(g, L.auto, `800 52px ${F_UI}`, w / 2, h / 2, w * .9, '#fff'));
const laneTextTex = dtex(512, 160, (g, w, h, L) => fitText(g, L.lane, `900 120px ${F_UI}`, w / 2, h / 2, w * .95, '#e6e6e6'));
const enterTex = dtex(512, 160, (g, w, h, L) => fitText(g, L.enter, `900 120px ${F_UI}`, w / 2, h / 2, w * .9, '#e6e6e6'));
const exitTex = dtex(512, 160, (g, w, h, L) => fitText(g, L.exit, `900 120px ${F_UI}`, w / 2, h / 2, w * .9, '#e6e6e6'));
const stopTex = dtex(512, 160, (g, w, h, L) => fitText(g, L.stop, `900 120px ${F_UI}`, w / 2, h / 2, w * .9, '#e6e6e6'));
const parkTex = dtex(512, 128, (g, w, h, L) => { flatFill(g, w, h, '#1d4f9a'); g.fillStyle = '#fff'; g.font = '900 80px Arial'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('P', 20, h / 2 + 4); fitText(g, L.parking, `800 44px ${F_UI}`, w / 2 + 40, h / 2 + 2, w - 130, '#fff'); });
const arrowTex = toTex(draw(128, 256, (g, w, h) => { g.fillStyle = '#e6e6e6'; g.beginPath(); g.moveTo(w * .5, 0); g.lineTo(w, h * .38); g.lineTo(w * .66, h * .38); g.lineTo(w * .66, h); g.lineTo(w * .34, h); g.lineTo(w * .34, h * .38); g.lineTo(0, h * .38); g.closePath(); g.fill(); }), { wrap: false });
const accessTex = toTex(draw(256, 256, (g, w, h) => {
  flatFill(g, w, h, '#1d5fb0'); g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineWidth = 14;
  g.beginPath(); g.arc(128, 60, 18, 0, 7); g.fill(); g.beginPath(); g.moveTo(118, 82); g.lineTo(118, 150); g.lineTo(180, 150); g.lineTo(200, 200); g.stroke();
  g.beginPath(); g.arc(118, 160, 50, PI * .55, PI * 1.6); g.stroke();
}), { wrap: false });
const bagTex = toTex(draw(128, 160, (g, w, h) => { flatFill(g, w, h, '#9c6b3e'); noise(g, w, h, 16); drawArches(g, w / 2, 50, 60, 26, '#ffc72c', .13); }), { wrap: false });
const windowsTex = toTex(draw(256, 512, (g, w, h) => {
  flatFill(g, w, h, '#0b0d12');
  for (let y = 8; y < h; y += 22) for (let x = 6; x < w; x += 18) {
    const r = Math.random(); g.fillStyle = r < .3 ? pick(['#ffcf8a', '#ffe3b0', '#bcd4ff', '#ffb070']) : r < .4 ? '#3a3d45' : '#14171d'; g.fillRect(x, y, 11, 13);
  }
}));

// ================================================================ materials
const MS = (o) => new THREE.MeshStandardMaterial(o);
function texMat(set, tile, o = {}) { const m = MS({ map: set.map, normalMap: set.normal, ...o }); m.userData.tile = tile; return m; }
const M = {
  slat: texMat(slat, 2, { color: 0xb8bcc4, roughness: .32, metalness: .6, normalScale: new THREE.Vector2(1.2, 1.2) }),
  white: texMat(acm, 2.4, { roughness: .45 }),
  wood: texMat(wood, 2, { roughness: .55, color: 0xd8d8d8 }),
  red: texMat(redPanel, 2.4, { roughness: .35, emissive: 0x220003 }),
  stone: texMat(stone, 1.5, { roughness: .7 }),
  concrete: texMat(concrete, 3, { roughness: .32, metalness: .1, color: 0xbbbbbb }),
  curb: texMat(concrete, 1.5, { roughness: .35, color: 0x999999 }),
  grass: texMat(grass, 4, { roughness: .85 }),
  hedge: texMat(leaves, 1.5, { roughness: .7 }),
  roof: texMat(roofT, 3, { roughness: .6 }),
  tiles: texMat(tiles, 1.2, { roughness: .2, metalness: .05 }),
  ceil: texMat(ceilT, 1, { roughness: .6, color: 0xcccccc }),
  bark: texMat(bark, 1, { roughness: .9 }),
  black: MS({ color: 0x141518, roughness: .3, metalness: .6 }),
  dark: MS({ color: 0x0b0c0e, roughness: .6 }),
  steel: MS({ color: 0xb4b9c1, roughness: .22, metalness: .95 }),
  chrome: MS({ color: 0xe6e9ee, roughness: .08, metalness: 1 }),
  yellow: MS({ color: 0xf2c21b, roughness: .4 }),
  orange: MS({ color: 0xe0782a, roughness: .5 }),
  paintW: MS({ color: 0xcfd0d1, roughness: .35, transparent: true, opacity: .85, depthWrite: false }),
  paintY: MS({ color: 0xd8ae36, roughness: .35, transparent: true, opacity: .85, depthWrite: false }),
  led: new THREE.MeshBasicMaterial({ color: lin(2.6, 2.6, 2.45) }),
  down: new THREE.MeshBasicMaterial({ color: lin(3, 2.6, 2) }),
  bulb: new THREE.MeshBasicMaterial({ color: lin(4, 3, 1.6) }),
  glass: MS({ map: glassDropTex, color: 0xd6e2ee, transparent: true, roughness: .05, metalness: .2, depthWrite: false, side: THREE.DoubleSide }),
  leaf: MS({ color: 0x1a3020, roughness: .75, flatShading: true }),
  leaf2: MS({ color: 0x23402a, roughness: .75, flatShading: true }),
};

// world-scale UVs on boxes so textures tile physically
function boxGeo(w, h, d, tile) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (!tile) return g;
  const uv = g.attributes.uv, spans = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * spans[f][0] / tile, uv.getY(i) * spans[f][1] / tile); }
  return g;
}
function cleanGeo(geo, matrix) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  g.morphAttributes = {}; g.clearGroups();
  if (matrix) g.applyMatrix4(matrix);
  return g;
}
// merge static meshes under a root by material → few draw calls
function mergeGroup(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), buckets = new Map(), rm = [];
  root.traverse(o => {
    if (!o.isMesh || o.userData.keep || o === root) return;
    for (let p = o.parent; p && p !== root; p = p.parent) if (p.userData.keep) return;
    const g = cleanGeo(o.geometry, new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    if (!buckets.has(o.material)) buckets.set(o.material, { gs: [], ro: o.renderOrder });
    buckets.get(o.material).gs.push(g); rm.push(o);
  });
  rm.forEach(o => o.parent.remove(o));
  const out = [];
  for (const [mat, { gs, ro }] of buckets) { const m = new THREE.Mesh(mergeGeometries(gs, false), mat); m.renderOrder = ro; root.add(m); out.push(m); }
  return out;
}

let P = scene;   // current parent for builder helpers
function box(w, h, d, mat, x, y, z, parent = P) {
  const m = new THREE.Mesh(boxGeo(w, h, d, mat.userData.tile), mat); m.position.set(x, y, z); parent.add(m); return m;
}
function rbox(w, h, d, r, mat, x, y, z, parent = P) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat); m.position.set(x, y, z); parent.add(m); return m;
}
function cyl(rt, rb, h, mat, x, y, z, seg = 16, parent = P) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); m.position.set(x, y, z); parent.add(m); return m;
}
function plane(w, h, mat, x, y, z, ry = 0, parent = P) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, y, z); m.rotation.y = ry; parent.add(m); return m;
}
function flat(w, h, mat, x, z, y = .02, yaw = 0, parent = P) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.rotation.order = 'YXZ'; m.rotation.set(-PI / 2, yaw, 0); m.position.set(x, y, z); m.renderOrder = -9; parent.add(m); return m;
}
const _y = new THREE.Vector3(0, 1, 0), _z = new THREE.Vector3(0, 0, 1);
function strut(a, b, r, mat, parent = P, boxy = false) {   // cylinder / square bar between two points
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), len = A.distanceTo(B);
  const g = boxy ? new THREE.BoxGeometry(r, r, len) : new THREE.CylinderGeometry(r, r, len, 8).rotateX(PI / 2);
  const m = new THREE.Mesh(g, mat || undefined); m.position.copy(A).add(B).multiplyScalar(.5);
  m.quaternion.setFromUnitVectors(_z, B.clone().sub(A).normalize()); parent.add(m); return m;
}
function led(a, b, normal) {      // LED strip set in an aluminium channel
  const n = new THREE.Vector3(...normal);
  strut(a, b, .14, M.black, P, true);
  strut(new THREE.Vector3(...a).addScaledVector(n, .05).toArray(), new THREE.Vector3(...b).addScaledVector(n, .05).toArray(), .07, M.led, P, true);
}
function pointLight(color, intensity, dist, x, y, z) {
  const l = new THREE.PointLight(color, intensity, dist, 2); l.position.set(x, y, z); scene.add(l); return l;
}
const downGeo = new THREE.CylinderGeometry(.13, .13, .02, 18), downRim = new THREE.TorusGeometry(.16, .025, 6, 18);
function downlight(x, y, z) {
  const m = new THREE.Mesh(downGeo, M.down); m.position.set(x, y, z); P.add(m);
  const r = new THREE.Mesh(downRim, M.steel); r.rotation.x = PI / 2; r.position.set(x, y + .005, z); P.add(r);
}

// ================================================================ sky & ground
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { uTop: { value: lin(.003, .005, .011) }, uHor: { value: lin(.05, .036, .055) }, uFlash: { value: 0 }, uTime: { value: 0 } },
  vertexShader: `varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `
    uniform vec3 uTop,uHor; uniform float uFlash,uTime; varying vec3 vP;
    float hash(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
    float noise(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
      return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                 mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
    float fbm(vec3 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*noise(p);p*=2.03;a*=.5;}return s;}
    void main(){
      vec3 d=normalize(vP); float h=clamp(d.y,0.,1.);
      vec3 c=mix(uHor,uTop,pow(h,.5));
      float cl=fbm(d*3.+vec3(uTime*.012,0.,uTime*.007));
      c+=(cl-.45)*.05*vec3(.55,.5,.65)*(1.-h*.6);
      c+=uFlash*(.25+cl*1.1)*vec3(.6,.66,.9)*smoothstep(-.05,.35,d.y);
      gl_FragColor=vec4(max(c,0.),1.);
    }`
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), skyMat);
scene.add(sky);

const mirror = new Reflector(new THREE.PlaneGeometry(240, 240), {
  textureWidth: innerWidth * DPR * .5, textureHeight: innerHeight * DPR * .5, color: 0x8794a6, clipBias: .003,
});
mirror.rotation.x = -PI / 2; scene.add(mirror);
asphalt.map.repeat.set(34, 34); asphalt.normal.repeat.set(34, 34); wetTex.repeat.set(4, 4);
const groundOverlay = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), MS({
  map: asphalt.map, normalMap: asphalt.normal, normalScale: new THREE.Vector2(.8, .8), alphaMap: wetTex, roughnessMap: wetTex,
  transparent: true, depthWrite: false, roughness: .65, metalness: .15,
}));
groundOverlay.rotation.x = -PI / 2; groundOverlay.position.y = .01; groundOverlay.renderOrder = -10; scene.add(groundOverlay);
const farGround = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), MS({ color: 0x0b0c0f, roughness: .6 }));
farGround.rotation.x = -PI / 2; farGround.position.y = -.05; scene.add(farGround);

// ================================================================ static world (merged at the end)
const world = new THREE.Group(); scene.add(world); P = world;
const decals = new THREE.Group(); scene.add(decals);

// sidewalk with curb + planted islands with curbs
box(260, .12, 2.6, M.concrete, 0, .06, 28.3);
box(260, .16, .22, M.curb, 0, .08, 29.6);
function island(x0, x1, z0, z1) {
  const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  box(w - .3, .16, d - .3, M.grass, cx, .08, cz);
  box(w, .18, .2, M.curb, cx, .09, z0 + .1); box(w, .18, .2, M.curb, cx, .09, z1 - .1);
  box(.2, .18, d, M.curb, x0 + .1, .09, cz); box(.2, .18, d, M.curb, x1 - .1, .09, cz);
}
island(-21.2, -13.6, -6, 21.5);
island(-30, 24, -24, -15);
island(19.8, 31.8, -20.5, 18.5);
island(-63, -33, 6, 14); island(33, 63, 6, 14);
box(26.6, .15, 5.6, M.concrete, .3, .075, 9.8);          // entrance footpath x:-13..13.6 z:7..12.6
box(26.6, .17, .2, M.curb, .3, .085, 12.6);

// road / parking markings
P = decals;
for (let x = -120; x < 120; x += 7) flat(3.2, .16, M.paintY, x, 35, .02);
flat(240, .14, M.paintW, 0, 30.4, .02); flat(240, .14, M.paintW, 0, 39.6, .02);
for (let x = -13.5; x <= 10.6; x += 3) flat(.12, 5.4, M.paintW, x, 16.75, .02);
flat(24, .12, M.paintW, -1.5, 19.45, .02);
for (let i = 0; i < 6; i++) flat(.45, 2.4, M.paintW, -5.6 + i * .8, 13.6, .02);
flat(2.4, 2.4, MS({ map: accessTex, roughness: .4, transparent: true, opacity: .9, depthWrite: false }), -6, 17.4, .022, PI);
const grateMat = MS({ color: 0x18191b, roughness: .5, metalness: .7, transparent: true, depthWrite: false });
for (const x of [-40, -10, 18, 48]) flat(.9, .45, grateMat, x, 30.0, .03);
for (const [x, z] of [[-3, 35.4], [-30, 22], [40, 34.8]]) { const m = new THREE.Mesh(new THREE.CircleGeometry(.35, 20), grateMat); m.rotation.x = -PI / 2; m.position.set(x, .03, z); m.renderOrder = -9; P.add(m); }
P = world;

// ---------------------------------------------------------------- building shell
box(24, 7.4, 14, M.slat, 0, 3.7, 0);                         // main block x:-12..12 z:-7..7
box(23.6, .05, 13.6, M.roof, 0, 7.42, 0);
for (const [w, d, x, z] of [[24.4, .35, 0, 7.05], [24.4, .35, 0, -7.05], [.35, 14.4, 12.05, 0], [.35, 14.4, -12.05, 0]]) box(w, .55, d, M.black, x, 7.55, z);
for (const [x, z, w, d] of [[-4, -2, 3, 2], [5, 1, 2.2, 1.6], [-8, 3, 1.6, 1.4]]) {   // rooftop plant
  box(w, 1.1, d, M.steel, x, 7.95, z); box(w + .1, .06, d + .1, M.black, x, 8.53, z);
  for (let i = 0; i < 2; i++) { cyl(.38, .38, .05, M.dark, x - w / 4 + i * w / 2, 8.57, z, 20); cyl(.06, .06, .08, M.steel, x - w / 4 + i * w / 2, 8.6, z); }
}
for (const x of [2, 8]) cyl(.12, .12, .9, M.steel, x, 7.85, -5);
for (const [x, z] of [[-11.85, -6.85], [11.85, -6.85]]) cyl(.07, .07, 7.3, M.black, x, 3.65, z, 10);   // downpipes

// ---- glazed dining room x:-12.4..-1  z:7..10.6
box(11.4, .02, 3.6, M.tiles, -6.7, .16, 8.8);
box(11.4, .04, 3.6, M.ceil, -6.7, 3.63, 8.8);
plane(11.4, 3.48, new THREE.MeshBasicMaterial({ map: backWallTex, color: lin(.9, .85, .8) }), -6.7, 1.89, 7.02);
box(12.6, .9, 4.9, M.white, -6.5, 4.1, 9.35);                 // fascia z:6.9..11.8
box(12.5, .03, 1.2, M.white, -6.5, 3.64, 11.2);               // soffit
box(12.6, .08, .1, M.black, -6.5, 4.57, 11.82);
box(.8, 3.5, 4.8, M.white, -.6, 1.9, 9.4);                    // white pier
box(1.7, 3.5, .25, M.wood, -8.6, 1.9, 10.76);                 // timber pier
plane(1.5, .48, new THREE.MeshBasicMaterial({ map: cafeTex, transparent: true, color: lin(2.2, 2.2, 2.2), alphaTest: .3 }), -8.6, 2.75, 10.9);
// fixed glazing (door bay is separate, see sliding doors below)
for (const m of [plane(8.15, 3.5, M.glass, -8.325, 1.9, 10.6), plane(1.75, 3.5, M.glass, -1.875, 1.9, 10.6),
  plane(1.5, 1.0, M.glass, -3.5, 3.1, 10.6), plane(3.6, 3.5, M.glass, -12.4, 1.9, 8.8, -PI / 2)]) m.renderOrder = 2;
for (const x of [-12.36, -10.2, -7.0, -5.4, -4.25, -2.75, -1.05]) box(.09, 3.5, .14, M.black, x, 1.9, 10.6);
for (const z of [7.2, 8.8, 10.55]) box(.14, 3.5, .09, M.black, -12.4, 1.9, z);
box(11.4, .1, .14, M.black, -6.7, 3.05, 10.6); box(11.4, .16, .16, M.black, -6.7, .23, 10.6); box(.14, .16, 3.6, M.black, -12.4, .23, 8.8);
box(1.5, .12, .2, M.black, -3.5, 2.62, 10.62); box(1.3, .14, .1, M.dark, -3.5, 2.8, 10.7);   // door head + operator
for (const x of [-11.3, -8.6, -5.9, -3.5, -1.8]) downlight(x, 3.62, 11.3);

// interior furniture
const tableTop = MS({ color: 0xd9c7a6, roughness: .35 }), chairMats = [M.orange, MS({ color: 0xf2c14e, roughness: .5 }), MS({ color: 0x3a3b40, roughness: .5 })];
const tables = [[-11.2, 9.6], [-8.6, 9.6], [-6.2, 9.6], [-10.2, 7.9], [-7.4, 7.9], [-1.8, 9.6]];
const shadeGeo = new THREE.LatheGeometry([[0, .02], [.05, .02], [.18, -.12], [.24, -.2], [.23, -.21]].map(([x, y]) => new THREE.Vector2(x, y)), 20);
const shadeMat = MS({ color: 0xffb52e, roughness: .4, side: THREE.DoubleSide, emissive: 0x4a2a00 });
const bulbGeo = new THREE.SphereGeometry(.07, 10, 8);
const seats = [];
tables.forEach(([tx, tz], ti) => {
  cyl(.42, .42, .04, tableTop, tx, .9, tz, 24); cyl(.045, .045, .72, M.black, tx, .53, tz); cyl(.25, .25, .03, M.black, tx, .18, tz, 16);
  for (const s of [-1, 1]) {
    const cx = tx + s * .68, cm = chairMats[ti % 3];
    box(.42, .05, .42, cm, cx, .62, tz); box(.05, .46, .42, cm, cx + s * .19, .86, tz);
    for (const [dx, dz] of [[-.17, -.17], [.17, -.17], [-.17, .17], [.17, .17]]) box(.03, .45, .03, M.black, cx + dx, .38, tz + dz);
    seats.push([cx, tz, s > 0 ? -PI / 2 : PI / 2]);
  }
  cyl(.004, .004, .95, M.black, tx, 3.15, tz, 4);
  const sh = new THREE.Mesh(shadeGeo, shadeMat); sh.position.set(tx, 2.7, tz); P.add(sh);
  const b = new THREE.Mesh(bulbGeo, M.bulb); b.position.set(tx, 2.55, tz); P.add(b);
});
for (const x of [-5.6, -2.6]) {        // self-order kiosks
  box(.56, 1.75, .22, M.black, x, 1.03, 7.15);
  plane(.48, .8, new THREE.MeshBasicMaterial({ map: kioskTex, color: lin(1.3, 1.3, 1.3) }), x, 1.4, 7.27);
}
box(.7, .9, .5, M.steel, -11.8, .6, 7.4); box(.72, .04, .52, M.black, -11.8, 1.07, 7.4);

// ---- timber box x:2.4..8.6 z:7..10.6 + canopy
box(6.2, 4.45, 3.6, M.wood, 5.5, 2.375, 8.8);
plane(1.3, 2.5, new THREE.MeshBasicMaterial({ map: corridorTex, color: lin(1.1, 1.1, 1.1) }), 4.2, 1.4, 10.61);
plane(1.3, 2.5, M.glass, 4.2, 1.4, 10.63).renderOrder = 2;
box(1.5, .1, .1, M.black, 4.2, 2.7, 10.65); box(.1, 2.55, .1, M.black, 3.5, 1.42, 10.65); box(.1, 2.55, .1, M.black, 4.9, 1.42, 10.65);
box(.04, 1.1, .04, M.chrome, 4.7, 1.35, 10.74);
plane(1.2, 1.4, new THREE.MeshBasicMaterial({ map: kitchenTex, color: lin(.6, .45, .45) }), 8.61, 2.3, 9.6, PI / 2);
box(.06, 1.52, .06, M.black, 8.63, 2.3, 8.97); box(.06, 1.52, .06, M.black, 8.63, 2.3, 10.23); box(.06, .06, 1.3, M.black, 8.63, 3.03, 9.6); box(.12, .06, 1.3, M.black, 8.66, 1.57, 9.6);
box(12.2, 1.0, 5.4, M.white, 7.6, 5.1, 9.7);                  // canopy z:7..12.4
box(12.2, .08, .1, M.black, 7.6, 5.62, 12.42);
for (const [x, z] of [[3, 11.7], [6.2, 11.7], [9.4, 11.7], [12.4, 11.7], [11, 8.5]]) downlight(x, 4.59, z);

// ---- drive-thru side
box(7.7, .6, 14.2, M.white, 15.85, 4.9, 3.5);
box(.1, .1, 14.2, M.black, 19.72, 5.22, 3.5);
for (const z of [-3.3, 3.5, 10.3]) { box(.25, 4.6, .25, M.white, 19.4, 2.3, z); box(.45, .06, .45, M.steel, 19.4, .03, z); }
for (const z of [-2, 2, 6, 9.5]) downlight(15.5, 4.59, z);
box(.3, 4.6, 10, M.red, 12.15, 2.3, 1.8);
const winMat = new THREE.MeshBasicMaterial({ map: kitchenTex, color: lin(1.2, 1.15, 1.05) });
[-1, 5.5].forEach((z, k) => {
  plane(1.6, 1.5, winMat, 12.31, 1.95, z, PI / 2);
  plane(1.6, 1.5, M.glass, 12.33, 1.95, z, PI / 2).renderOrder = 2;
  box(.55, .07, 1.9, M.steel, 12.58, 1.16, z);
  for (const dz of [-.82, .82]) box(.08, 1.6, .08, M.steel, 12.34, 1.95, z + dz);
  box(.08, .08, 1.72, M.steel, 12.34, 2.74, z);
  box(.6, .05, 2.1, M.black, 12.6, 3.15, z);
  plane(1.5, .38, new THREE.MeshBasicMaterial({ map: winSignTex[k], color: lin(1.7, 1.7, 1.7) }), 12.32, 3.45, z, PI / 2);
});
const capGeo = new THREE.SphereGeometry(.13, 12, 6, 0, PI * 2, 0, PI / 2);
for (const z of [-3.6, 2.25, 8.7]) {                            // bollards
  cyl(.13, .13, 1.1, M.yellow, 13.3, .55, z, 14);
  cyl(.135, .135, .08, M.steel, 13.3, .85, z, 14); cyl(.135, .135, .08, M.steel, 13.3, .65, z, 14);
  const cap = new THREE.Mesh(capGeo, M.yellow); cap.position.set(13.3, 1.1, z); P.add(cap);
}

// ---- LED X motif
const F = 7.06, FN = [0, 0, 1], RN = [1, 0, 0], LN = [-1, 0, 0], BN = [0, 0, -1];
led([-11.4, 4.75, F], [-6.6, 7.25, F], FN); led([-11.4, 7.25, F], [-6.6, 4.75, F], FN);
led([6, 5.75, F], [10.6, 7.22, F], FN); led([6, 7.22, F], [10.6, 5.75, F], FN); led([3.6, 7.22, F], [11.9, 7.22, F], FN);
led([0, .4, F], [2.25, 4.45, F], FN); led([0, 4.45, F], [2.25, .4, F], FN);
led([12.06, .3, -6.7], [12.06, 7.15, -3.8], RN); led([12.06, 7.15, -6.7], [12.06, .3, -3.8], RN);
led([12.06, 5.35, 0], [12.06, 7.15, 5], RN); led([12.06, 7.15, 0], [12.06, 5.35, 5], RN); led([12.06, 7.2, -3.4], [12.06, 7.2, 6.9], RN);
led([-12.06, .3, -6.5], [-12.06, 7.15, .5], LN); led([-12.06, 7.15, -6.5], [-12.06, .3, .5], LN);
led([-9, .3, -7.06], [-3, 7.15, -7.06], BN); led([-9, 7.15, -7.06], [-3, .3, -7.06], BN);
led([4, .3, -7.06], [10, 7.15, -7.06], BN); led([4, 7.15, -7.06], [10, .3, -7.06], BN);

// ---- main sign: layered channel letters (extruded look that works for any language)
for (let i = 0; i < 7; i++) {
  const front = i === 6, v = .05 + i * .012;
  const m = plane(9.6, 1.8, new THREE.MeshBasicMaterial({ map: signTex, alphaTest: .45, color: front ? lin(1.8, 1.8, 1.8) : lin(v, v, v + .01) }), -.4, 6.4, 7.08 + i * .022);
  m.userData.keep = true;
}

// ---- pylon
const pylon = new THREE.Group(); pylon.position.set(-17.3, .16, 11.8); pylon.rotation.y = .35; world.add(pylon);
box(3.1, 1.4, 1.9, M.stone, 0, .7, 0, pylon); box(3.2, .08, 2, M.black, 0, 1.42, 0, pylon);
rbox(2.5, 12, 1.2, .06, M.red, 0, 7.4, 0, pylon);
box(.14, 12, 1.24, M.black, 1.26, 7.4, 0, pylon); box(2.62, .14, 1.3, M.black, 0, 13.42, 0, pylon);
box(2.62, .1, 1.3, M.black, 0, 10.1, 0, pylon); box(2.62, .1, 1.3, M.black, 0, 8.95, 0, pylon);
const archMat = new THREE.MeshBasicMaterial({ map: archesTex, color: lin(2.3, 2.3, 2.3) });
const pcafeMat = new THREE.MeshBasicMaterial({ map: pylonCafeTex, color: lin(2.1, 2.1, 2.1) });
const p2Mat = new THREE.MeshBasicMaterial({ map: pylon2Tex, color: lin(1.6, 1.6, 1.6) });
for (const s of [1, -1]) {
  const ry = s > 0 ? 0 : PI;
  plane(2.3, 3.1, archMat, 0, 11.7, .615 * s, ry, pylon);
  plane(2.3, .9, pcafeMat, 0, 9.52, .615 * s, ry, pylon);
  plane(2.3, .62, p2Mat, 0, 8.3, .615 * s, ry, pylon);
}

// ---- props
const ringGeo = new THREE.TorusGeometry(.42, .03, 8, 28);
for (const x of [-.2, 1.6]) { const r = new THREE.Mesh(ringGeo, M.steel); r.position.set(x, .9, 12.0); P.add(r); box(.06, .5, .06, M.steel, x, .4, 12.0); }
{ // wet-floor A-frame
  const g = new THREE.Group(); g.position.set(-2.3, .15, 11.7); g.rotation.y = .5; world.add(g);
  const wm = MS({ map: wetSignTex, roughness: .4 });
  for (const s of [1, -1]) { const p = plane(.42, .6, wm, 0, .3, s * .12, s > 0 ? 0 : PI, g); p.rotation.x = -.2; }
  box(.44, .03, .06, M.yellow, 0, .6, 0, g);
}
box(1.8, .06, .45, M.wood, 10.8, .6, 11.6); box(1.8, .4, .06, M.wood, 10.8, .85, 11.82);
for (const x of [10.1, 11.5]) box(.06, .45, .45, M.black, x, .38, 11.6);
const binMat = MS({ color: 0x3b3d42, roughness: .4, metalness: .5 });
for (const [x, z] of [[12.8, 11.7], [-12.6, 12.1]]) { cyl(.28, .25, .95, binMat, x, .63, z, 18); cyl(.31, .31, .08, M.black, x, 1.14, z, 18); box(.16, .1, .03, M.dark, x, .95, z + .28); }
const shrubGeo = new THREE.IcosahedronGeometry(.35, 1);
for (const [x, z] of [[-12.6, 7.9], [9.2, 7.6]]) { box(.9, .55, .9, M.dark, x, .43, z); for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(shrubGeo, M.leaf2); m.position.set(x + rand(-.2, .2), .85 + i * .08, z + rand(-.2, .2)); P.add(m); } }
for (let x = -12; x <= 9; x += 3) box(1.6, .12, .2, M.yellow, x, .06, 14.6);   // wheel stops
cyl(.04, .04, 2.2, M.steel, -14.6, 1.1, 19.2, 8); plane(.9, .23, new THREE.MeshBasicMaterial({ map: parkTex, color: lin(.9, .9, .9) }), -14.6, 2.05, 19.24);

// ---- order point: menu board, canopy, speaker
const menu = new THREE.Group(); menu.position.set(0, .16, -14.3); world.add(menu);
P = menu;
box(.14, 1.4, .14, M.black, .2, .7, 0); box(.14, 1.4, .14, M.black, 3.0, .7, 0);
rbox(3.3, 2.1, .25, .04, M.black, 1.6, 2.35, 0);
plane(3.1, 1.82, new THREE.MeshBasicMaterial({ map: menuTex, color: lin(1.7, 1.7, 1.7) }), 1.6, 2.35, .13);
box(3.7, .08, 1.1, M.white, 1.6, 3.55, .35); box(.08, .1, 1.1, M.black, -.25, 3.5, .35); box(.08, .1, 1.1, M.black, 3.45, 3.5, .35);
rbox(.38, 1.35, .32, .05, M.black, -.9, .68, .75);
for (let i = 0; i < 5; i++) box(.24, .02, .02, M.steel, -.9, 1.0 + i * .045, .92);
const indMat = new THREE.MeshBasicMaterial({ color: lin(.05, .3, .05) });
box(.1, .1, .04, indMat, -.9, 1.26, .92).userData.keep = true;
const dome = new THREE.Mesh(new THREE.SphereGeometry(.09, 12, 8, 0, PI * 2, PI / 2, PI / 2), MS({ color: 0x111111, roughness: .1, metalness: .5 }));
dome.position.set(1.6, 3.49, .6); menu.add(dome);
P = world;
pointLight(0xdfe8ff, 10, 10, 1.6, 3.2, -13.2);

// ---- height-clearance bar at the lane entrance
for (const x of [-26.6, -21.4]) { cyl(.09, .09, 3.4, M.yellow, x, 1.7, 19.5, 10); box(.3, .04, .3, M.steel, x, .02, 19.5); box(.5, .06, .06, M.steel, x, 3.32, 19.5); }
box(5.4, .22, .2, M.yellow, -24, 3.3, 19.5);
const clearMat = MS({ map: clearTex, roughness: .4 });
plane(5.4, .22, clearMat, -24, 3.3, 19.61); plane(5.4, .22, clearMat, -24, 3.3, 19.39, PI);
for (const x of [-25.5, -24, -22.5]) { strut([x, 3.2, 19.5], [x, 2.85, 19.5], .006, M.black); box(.5, .12, .02, M.yellow, x, 2.8, 19.5); }  // hanging warning flaps
// drive-thru entrance sign
box(.14, 2.2, .14, M.black, -27.4, 1.1, 25.5);
rbox(2.5, 1.3, .25, .04, M.black, -27.4, 2.85, 25.5);
const dsm = new THREE.MeshBasicMaterial({ map: driveSignTex, color: lin(1.9, 1.9, 1.9) });
plane(2.3, 1.12, dsm, -27.4, 2.85, 25.635); plane(2.3, 1.12, dsm, -27.4, 2.85, 25.365, PI);

// ---- trees, hedges
const leafGeo = new THREE.IcosahedronGeometry(1, 1);
{
  const p = leafGeo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); v.multiplyScalar(1 + (Math.sin(v.x * 5.1) + Math.cos(v.y * 4.3 + v.z * 3.7)) * .09); p.setXYZ(i, v.x, v.y, v.z); }
  leafGeo.computeVertexNormals();
}
function tree(x, z, s = 1) {
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.12 * s, .2 * s, 3 * s, 8), M.bark); trunk.position.set(x, 1.5 * s, z); P.add(trunk);
  for (let i = 0; i < 3; i++) { const a = rand(0, 6.3); strut([x, 2 * s + i * .5 * s, z], [x + Math.cos(a) * 1.1 * s, 2.9 * s + i * .5 * s, z + Math.sin(a) * 1.1 * s], .06 * s, M.bark); }
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(leafGeo, i % 2 ? M.leaf : M.leaf2);
    m.position.set(x + rand(-1, 1) * s, (3.2 + rand(0, 1.8)) * s, z + rand(-1, 1) * s);
    m.scale.set(rand(.9, 1.4) * s, rand(.7, 1.1) * s, rand(.9, 1.4) * s); m.rotation.set(rand(0, 3), rand(0, 3), 0); P.add(m);
  }
}
for (const [x, z, s] of [[-30, -20, 1.3], [-36, 4, 1.1], [-38, 18, 1.4], [-18, -21, 1.0], [-6, -21.5, 1.2], [8, -21, 1.1],
  [24, -18, 1.3], [28, -4, 1.0], [29, 10, 1.4], [-17.5, -2, .85], [-46, -12, 1.6], [46, -10, 1.5], [-50, 10, 1.3], [52, 10, 1.2], [-58, -30, 1.7], [60, -28, 1.6]]) tree(x, z, s);
for (let x = -22; x < 16; x += 2.4) { const h = rand(1, 1.25); rbox(2.35, h, 1.3, .3, M.hedge, x, .16 + h / 2, -16.8); }

// light shafts in the rain: brightest near the lamp, fading along the cone and
// towards its silhouette, so the open cylinder never shows a hard edge
function shaftMat(color, opacity, edge = 2) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uEdge: { value: edge } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity, uEdge; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ float f = pow(abs(dot(normalize(vN), normalize(vV))), uEdge);
        float a = uOpacity * f * pow(vUv.y, 1.6); gl_FragColor = vec4(uColor * a, a); }`,
  });
}
// ---- street lamps
const coneMat = shaftMat(0xffdcae, .3, .8);
const lampHeadMat = new THREE.MeshBasicMaterial({ color: lin(4, 3.2, 2.2) });
const lampArc = new THREE.TorusGeometry(.8, .05, 6, 16, PI / 2);
for (const x of [-42, -8, 26, 60]) {
  const z = 29.0;
  cyl(.2, .22, .5, M.black, x, .25, z, 10); cyl(.08, .12, 7.8, M.black, x, 4.1, z, 10);
  const arc = new THREE.Mesh(lampArc, M.black); arc.rotation.y = PI / 2; arc.position.set(x, 8.0, z + .8); P.add(arc);
  strut([x, 8.8, z + .8], [x, 8.8, z + 2.2], .05, M.black);
  rbox(.5, .14, 1.0, .05, M.black, x, 8.75, z + 2.45);
  const head = new THREE.Mesh(new THREE.PlaneGeometry(.38, .82), lampHeadMat); head.rotation.x = PI / 2; head.position.set(x, 8.67, z + 2.45); P.add(head);
  pointLight(0xffc98f, 110, 30, x, 8.4, z + 2.45);
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(.25, 4.6, 8.5, 24, 1, true), coneMat); cone.position.set(x, 4.35, z + 2.45); P.add(cone);
}
// ---- distant city
const cityMat = new THREE.MeshBasicMaterial({ map: windowsTex, color: lin(.5, .5, .55) });
for (let i = 0; i < 60; i++) {
  const a = rand(0, PI * 2), r = rand(110, 170), x = Math.cos(a) * r, z = Math.sin(a) * r;
  if (Math.abs(z - 35) < 12) continue;
  const w = rand(8, 22), h = rand(6, 30), d = rand(8, 20);
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * w / 12, uv.getY(k) * h / 24);
  const m = new THREE.Mesh(g, cityMat); m.position.set(x, h / 2, z); m.rotation.y = rand(0, PI); P.add(m);
}

mergeGroup(world);
mergeGroup(decals).forEach(m => { m.renderOrder = -9; });
P = scene;

// sliding entrance doors
const doors = [-1, 1].map(s => {
  const g = new THREE.Group(); g.position.set(-3.5 + s * .375, 0, 10.55); scene.add(g);
  const gl = new THREE.Mesh(new THREE.PlaneGeometry(.74, 2.4), M.glass); gl.position.y = 1.37; gl.renderOrder = 2; g.add(gl);
  box(.75, .06, .05, M.black, 0, 2.57, 0, g); box(.75, .08, .05, M.black, 0, .2, 0, g);
  box(.05, 2.42, .05, M.black, -.35, 1.37, 0, g); box(.05, 2.42, .05, M.black, .35, 1.37, 0, g);
  box(.03, .9, .03, M.chrome, -s * .26, 1.2, .05, g);
  plane(.6, .11, new THREE.MeshBasicMaterial({ map: autoDoorTex, transparent: true, alphaTest: .3 }), 0, 1.6, .03, 0, g);
  return { g, s };
});
let doorOpen = 0;
const bagMat = MS({ map: bagTex, roughness: .9 });
const bag = new THREE.Mesh(new THREE.BoxGeometry(.3, .38, .2), bagMat); bag.position.set(12.8, 1.45, 5.5); bag.visible = false; scene.add(bag);

// ---------------------------------------------------------------- lights
const hemi = new THREE.HemisphereLight(0x3a4a72, 0x0c0c12, .55); scene.add(hemi);
const moon = new THREE.DirectionalLight(0x7088c0, .25); moon.position.set(-30, 50, -20); scene.add(moon);
const bolt = new THREE.DirectionalLight(0xc6d6ff, 0); bolt.position.set(30, 80, -60); scene.add(bolt);
const warm = 0xffc98a;
pointLight(warm, 22, 13, -10, 3.4, 11.4); pointLight(warm, 22, 13, -4.5, 3.4, 11.4);
pointLight(0xffc27a, 16, 9, -9.5, 3.0, 8.8); pointLight(0xffc27a, 16, 9, -4, 3.0, 8.8);
pointLight(warm, 22, 13, 4.5, 4.3, 11.7); pointLight(warm, 22, 13, 10.5, 4.3, 11.2);
pointLight(warm, 20, 12, 15.5, 4.3, -1); pointLight(warm, 20, 12, 15.5, 4.3, 6);
pointLight(0xfff0d8, 10, 8, 13.4, 1.8, 2.3);
pointLight(0xff2a20, 70, 30, -16.2, 10, 13.8);
pointLight(0xffc040, 26, 16, -16.4, 11.8, 13.6);
pointLight(0xffffff, 18, 16, -.4, 6.3, 9.5);

// ================================================================ drive-thru path
const curve = new THREE.CatmullRomCurve3([
  [-100, 33], [-60, 33], [-32, 33], [-25.5, 30.5], [-24, 24], [-24, -6], [-22.5, -10.3], [-17, -11.5], [9, -11.5],
  [14, -10.2], [15.5, -6], [15.5, 14], [17, 21], [21, 27], [27, 32], [34, 33], [70, 33], [110, 33],
].map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
curve.arcLengthDivisions = 3000;
const L = curve.getLength();
function sAt(x, z) {
  let best = 0, bd = 1e9;
  for (let i = 0; i <= 3000; i++) { const p = curve.getPointAt(i / 3000); const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; best = i / 3000; } }
  return best * L;
}
const stops = [sAt(-1.2, -11.5), sAt(15.5, -1), sAt(15.5, 5.5)];
const waits = [[4, 7], [2, 3.5], [3.5, 6]];
const sLotIn = sAt(-24, 26), sLotOut = sAt(21, 27);

function ribbon(u0, u1, off, width, mat, y = .022, seg = 260, tile = 0) {
  const pos = [], uv = [], idx = []; let dist = 0, prev = null;
  for (let i = 0; i <= seg; i++) {
    const u = u0 + (u1 - u0) * i / seg, p = curve.getPointAt(u), tg = curve.getTangentAt(u);
    if (prev) dist += p.distanceTo(prev); prev = p.clone();
    const nx = -tg.z, nz = tg.x, a = off - width / 2, b = off + width / 2;
    pos.push(p.x + nx * a, y, p.z + nz * a, p.x + nx * b, y, p.z + nz * b);
    const k = tile || 1; uv.push(0, dist / k, width / k, dist / k);
    if (i < seg) { const j = i * 2; idx.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.renderOrder = -9; scene.add(m); return m;
}
const laneConcrete = MS({ map: concrete.map, normalMap: concrete.normal, color: 0x8a8c90, roughness: .28, transparent: true, opacity: .8, depthWrite: false });
ribbon(sLotIn / L, sLotOut / L, 0, 3.9, laneConcrete, .015, 300, 3).renderOrder = -9.5;
ribbon((sLotIn + 3) / L, (sLotOut - 4) / L, -1.95, .13, M.paintY);
ribbon((sLotIn + 3) / L, (sLotOut - 4) / L, 1.95, .13, M.paintY);
const decalMat = (map) => MS({ map, transparent: true, roughness: .35, depthWrite: false });
function laneDecal(s, mat, w, h) {
  const u = s / L, p = curve.getPointAt(u), tg = curve.getTangentAt(u);
  flat(w, h, mat, p.x, p.z, .025, Math.atan2(-tg.x, -tg.z), scene);
}
const arrowMat = decalMat(arrowTex);
laneDecal(sLotIn + 10, decalMat(laneTextTex), 3.2, 1);
laneDecal(sLotIn + 4, decalMat(enterTex), 2.4, .75);
laneDecal(sLotOut - 6, decalMat(exitTex), 2.4, .75);
laneDecal(stops[0] - 3.2, decalMat(stopTex), 2.2, .7);
flat(3.6, .3, M.paintW, 1.25, -11.5, .025, PI / 2, scene);
for (const s of [sLotIn + 22, sLotIn + 40, stops[0] - 14, stops[0] + 10, stops[1] - 7, stops[2] + 7]) laneDecal(s, arrowMat, .9, 1.8);

// ================================================================ cars
const carCols = [0xb0182a, 0x1d3f8a, 0xd9d9d9, 0x141414, 0x5e636b, 0x2e6b4f, 0xe0b33a, 0x8a8f99, 0xf2f2f2, 0x6a2a6a, 0x2b5d8a, 0x8a3a1a];
const glassCar = new THREE.MeshPhysicalMaterial({ color: 0x0a0d12, roughness: .04, metalness: .3, clearcoat: 1, transparent: true, opacity: .82, clearcoatNormalMap: dropNormal, clearcoatNormalScale: new THREE.Vector2(.6, .6) });
const trimMat = MS({ color: 0x0e0f11, roughness: .5, metalness: .2 });
const tyreMat = MS({ color: 0x121212, roughness: .85 });
const rimMat = MS({ color: 0xc4c8ce, roughness: .18, metalness: 1 });
const rimDark = MS({ color: 0x1a1b1d, roughness: .4, metalness: .6 });
const headOn = new THREE.MeshBasicMaterial({ color: lin(4, 3.9, 3.5) });
const headOff = MS({ color: 0x8a8a8a, roughness: .05, metalness: .8 });
const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, color: lin(.55, .5, .42), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
const beamMat = shaftMat(0xfff1d6, .12);
const driverMat = MS({ color: 0x1a1512, roughness: .8 });

const TYPES = {
  sedan: { L: 4.65, W: 1.84, H: .96, hood: .86, front: 1.12, back: -1.28, roofF: .42, roofB: -.78, roof: 1.44, trunk: .94 },
  suv: { L: 4.75, W: 1.92, H: 1.12, hood: 1.04, front: 1.25, back: -1.98, roofF: .55, roofB: -1.9, roof: 1.8, trunk: 1.1 },
  hatch: { L: 4.15, W: 1.78, H: .96, hood: .86, front: 1.0, back: -1.72, roofF: .38, roofB: -1.55, roof: 1.5, trunk: .96 },
};
function extrudeX(shape, width, bevel) {   // side profile drawn in (forward, up), extruded across the car's width
  const g = new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 12 });
  g.rotateY(-PI / 2); g.translate((width - bevel * 2) / 2, 0, 0); return g;
}
function buildCarType(T) {
  const l = T.L / 2, wb = T.L * .3;
  const body = new THREE.Shape();
  body.moveTo(-l, .34); body.lineTo(-l - .04, .62); body.quadraticCurveTo(-l, T.trunk, -l + .3, T.trunk);
  body.lineTo(T.back, T.H); body.lineTo(T.front, T.H); body.lineTo(l - .3, T.hood);
  body.quadraticCurveTo(l + .04, T.hood - .02, l + .02, .62); body.lineTo(l - .02, .34);
  body.lineTo(wb + .48, .34); body.absarc(wb, .36, .48, 0, PI, false);
  body.lineTo(-wb + .48, .34); body.absarc(-wb, .36, .48, 0, PI, false); body.lineTo(-l, .34);
  const cab = new THREE.Shape();
  cab.moveTo(T.back - .02, T.H - .01); cab.lineTo(T.roofB, T.roof); cab.lineTo(T.roofF, T.roof); cab.lineTo(T.front + .02, T.H - .01); cab.closePath();
  const roofS = new THREE.Shape();
  roofS.moveTo(T.roofB - .03, T.roof - .05); roofS.lineTo(T.roofB + .04, T.roof + .03); roofS.lineTo(T.roofF - .04, T.roof + .03); roofS.lineTo(T.roofF + .04, T.roof - .05); roofS.closePath();
  const wc = T.W - .26, side = wc / 2 + .005, paint = [], trim = [], chrome = [];
  const add = (arr, geo, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo); m.position.set(x, y, z); arr.push(m); return m; };
  paint.push(new THREE.Mesh(extrudeX(body, T.W - .12, .07)), new THREE.Mesh(extrudeX(roofS, wc + .04, .02)));
  const tmp = new THREE.Group();
  for (const s of [-1, 1]) {
    paint.push(strut([s * side, T.H, T.front], [s * side, T.roof, T.roofF], .07, null, tmp, true));
    paint.push(strut([s * side, T.H, T.back], [s * side, T.roof, T.roofB], .09, null, tmp, true));
    const bz = (T.roofF + T.roofB) / 2 - .05;
    paint.push(strut([s * side, T.H, bz], [s * side, T.roof, bz], .08, null, tmp, true));
    add(paint, new RoundedBoxGeometry(.16, .12, .2, 2, .03), s * (T.W / 2 + .06), T.H + .08, T.front - .15);
    for (const z of [.15, -.65]) add(chrome, new THREE.BoxGeometry(.03, .03, .14), s * (T.W / 2), T.H - .14, z);
    add(trim, new THREE.BoxGeometry(.04, .08, T.L * .42), s * (T.W / 2 - .02), .38, 0);
  }
  for (const z of [l + .03, -l - .03]) add(trim, new THREE.BoxGeometry(T.W - .1, .2, .1), 0, .42, z);
  add(trim, new THREE.BoxGeometry(1.0, .2, .06), 0, .62, l + .02);
  add(chrome, new THREE.BoxGeometry(1.0, .025, .07), 0, .66, l + .025);
  const merged = (arr) => mergeGeometries(arr.map(m => { m.updateMatrix(); return cleanGeo(m.geometry, m.matrix); }));
  const ws = new THREE.Vector2(T.roofF - T.front, T.roof - T.H).normalize();
  return {
    T, wb, paint: merged(paint), trim: merged(trim), chrome: merged(chrome), cabin: extrudeX(cab, wc, .03),
    head: new RoundedBoxGeometry(.44, .13, .08, 2, .03), tail: new RoundedBoxGeometry(.5, .12, .06, 2, .02), ind: new THREE.BoxGeometry(.14, .07, .05),
    lights: { headY: T.hood - .14, headZ: l + .01, tailY: T.trunk - .14, tailZ: -l - .01 }, wsAngle: Math.atan2(ws.x, ws.y),
  };
}
const CT = Object.fromEntries(Object.entries(TYPES).map(([k, v]) => [k, buildCarType(v)]));
const wheelGeo = (() => {
  const parts = [], dark = [];
  for (const s of [-1, 1]) {
    parts.push(new THREE.CylinderGeometry(.235, .235, .02, 24).rotateZ(PI / 2).translate(s * .122, 0, 0));
    dark.push(new THREE.CylinderGeometry(.2, .2, .021, 24).rotateZ(PI / 2).translate(s * .124, 0, 0));
    for (let k = 0; k < 5; k++) parts.push(new THREE.BoxGeometry(.02, .2, .045).translate(0, .1, 0).rotateX(k / 5 * PI * 2).translate(s * .132, 0, 0));
    parts.push(new THREE.CylinderGeometry(.05, .05, .03, 12).rotateZ(PI / 2).translate(s * .135, 0, 0));
  }
  return { tyre: new THREE.CylinderGeometry(.36, .36, .24, 28).rotateZ(PI / 2), rim: mergeGeometries(parts.map(g => cleanGeo(g))), dark: mergeGeometries(dark.map(g => cleanGeo(g))) };
})();
const plateTexFor = (seed) => dtex(256, 64, (g, w, h, L) => {
  const r = (k) => { const x = Math.sin(seed * 91.7 + k * 13.3) * 43758.5; return x - Math.floor(x); };
  const AZ = 'ABCDEFGHJKLMNPRSTUVWXYZ';
  if (L === S.zh) {
    flatFill(g, w, h, '#1d4fb8'); g.strokeStyle = '#fff'; g.lineWidth = 4; g.strokeRect(4, 4, w - 8, h - 8);
    let s = '沪京粤苏浙川鲁'[(r(1) * 7) | 0] + AZ[(r(2) * AZ.length) | 0] + '·';
    for (let i = 0; i < 5; i++) s += r(3 + i) < .3 ? AZ[(r(9 + i) * AZ.length) | 0] : ((r(15 + i) * 10) | 0);
    fitText(g, s, `700 40px ${CJK}`, w / 2, h / 2 + 2, w - 20, '#fff');
  } else {
    flatFill(g, w, h, '#f4f4f0'); g.strokeStyle = '#222'; g.lineWidth = 3; g.strokeRect(3, 3, w - 6, h - 6);
    let s = ''; for (let i = 0; i < 3; i++) s += AZ[(r(2 + i) * AZ.length) | 0]; s += ' '; for (let i = 0; i < 3; i++) s += (r(6 + i) * 10) | 0;
    fitText(g, s, '800 42px Arial', w / 2, h / 2 + 2, w - 20, '#151515');
  }
});
const plateGeo = new THREE.PlaneGeometry(.52, .13);
const bladeGeo = new THREE.BoxGeometry(.6, .025, .02).translate(.3, 0, 0);
const driverGeo = new THREE.SphereGeometry(.12, 10, 8);

function makeCar(lit = true, type = pick(['sedan', 'sedan', 'suv', 'hatch'])) {
  const C = CT[type], T = C.T, g = new THREE.Group(), xs = T.W / 1.84;
  const paint = new THREE.MeshPhysicalMaterial({ color: pick(carCols), metalness: .55, roughness: .32, clearcoat: 1, clearcoatRoughness: .06, clearcoatNormalMap: dropNormal, clearcoatNormalScale: new THREE.Vector2(.35, .35) });
  g.add(new THREE.Mesh(C.paint, paint), new THREE.Mesh(C.trim, trimMat), new THREE.Mesh(C.chrome, M.chrome));
  const cab = new THREE.Mesh(C.cabin, glassCar); cab.renderOrder = 1; g.add(cab);
  const drv = new THREE.Mesh(driverGeo, driverMat); drv.position.set(.38, T.H + .3, (T.roofF + T.roofB) / 2 + .1); drv.visible = lit; g.add(drv);
  const wheels = [];
  for (const [x, z] of [[1, C.wb], [-1, C.wb], [1, -C.wb], [-1, -C.wb]]) {
    const w = new THREE.Group(); w.position.set(x * .79 * xs, .36, z);
    w.add(new THREE.Mesh(wheelGeo.tyre, tyreMat), new THREE.Mesh(wheelGeo.rim, rimMat), new THREE.Mesh(wheelGeo.dark, rimDark)); g.add(w); wheels.push(w);
  }
  const tail = new THREE.MeshBasicMaterial({ color: lit ? lin(1.6, .03, .03) : lin(.15, .01, .01) });
  const indL = new THREE.MeshBasicMaterial({ color: lin(.25, .1, 0) });
  const lt = C.lights;
  for (const x of [.6, -.6]) {
    const h = new THREE.Mesh(C.head, lit ? headOn : headOff); h.position.set(x * xs, lt.headY, lt.headZ); h.rotation.x = -.15; g.add(h);
    const tl = new THREE.Mesh(C.tail, tail); tl.position.set(x * xs, lt.tailY, lt.tailZ); g.add(tl);
    const iF = new THREE.Mesh(C.ind, x > 0 ? indL : trimMat); iF.position.set(x * xs * 1.32, lt.headY - .02, lt.headZ - .06); g.add(iF);
    const iB = new THREE.Mesh(C.ind, x > 0 ? indL : trimMat); iB.position.set(x * xs * 1.2, lt.tailY - .1, lt.tailZ); g.add(iB);
  }
  const pmat = MS({ map: plateTexFor(Math.random() * 1000), roughness: .4 });
  const pf = new THREE.Mesh(plateGeo, pmat); pf.position.set(0, .44, T.L / 2 + .085); g.add(pf);
  const pr = new THREE.Mesh(plateGeo, pmat); pr.position.set(0, .56, -T.L / 2 - .085); pr.rotation.y = PI; g.add(pr);
  const wipers = [];
  for (const x of [-.55, .05]) {
    const piv = new THREE.Group(); piv.position.set(x, T.H + .03, T.front - .05); piv.rotation.x = C.wsAngle; g.add(piv);
    const arm = new THREE.Group(); piv.add(arm);
    const blade = new THREE.Mesh(bladeGeo, trimMat); blade.position.z = .04; arm.add(blade);
    wipers.push(arm);
  }
  if (lit) {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 10), poolMat); pl.rotation.x = -PI / 2; pl.position.set(0, .1, T.L / 2 + 5); g.add(pl);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(.35, 2.4, 11, 18, 1, true).rotateX(-PI / 2), beamMat); beam.position.set(0, lt.headY, T.L / 2 + 5.5); g.add(beam);
  }
  scene.add(g);
  return { g, wheels, tail, indL, wipers, wph: rand(0, 6), paint, s: 0, v: 0, stop: 0, wait: null };
}
for (const x of [-12, -9, -3, 3, 9]) { const c = makeCar(false); c.g.position.set(x, 0, 16.9); c.g.rotation.y = PI + rand(-.04, .04); }

const carPool = [];
function getCar() { const c = carPool.pop() || makeCar(true); c.g.visible = true; c.paint.color.set(pick(carCols)); c.s = 0; c.v = 0; c.stop = 0; c.wait = null; return c; }
function freeCar(c) { c.g.visible = false; carPool.push(c); }
const cars = [];
function placeCar(c) {
  const u = Math.min(c.s / L, 1), p = curve.getPointAt(u), tg = curve.getTangentAt(u);
  c.g.position.set(p.x, 0, p.z); c.g.rotation.y = Math.atan2(tg.x, tg.z);
}
function addCar(s, stop, v = 0) { const c = getCar(); c.s = s; c.stop = stop; c.v = v; cars.push(c); placeCar(c); return c; }
addCar(stops[2], 2); addCar(stops[1], 1); addCar(stops[0], 0);
for (let k = 1; k <= 4; k++) addCar(stops[0] - k * 6.9, 0);

const traffic = [];
let trafficT = 1, spawnT = 3, served = 0;

function pedBlock(c) {
  const th = c.g.rotation.y, fx = Math.sin(th), fz = Math.cos(th);
  let best = Infinity;
  for (const p of people) {
    if (!p.g.visible || p.idle) continue;
    const dx = p.g.position.x - c.g.position.x, dz = p.g.position.z - c.g.position.z;
    const along = dx * fx + dz * fz, lat = Math.abs(dx * fz - dz * fx);
    if (along > 1.5 && along < 9 && lat < 1.7) best = Math.min(best, along - 3.3);
  }
  return best;
}
function animCar(c, dt) {
  for (const w of c.wheels) w.rotation.x += c.v * dt / .36;
  c.wph += dt * 2.6;
  const a = (1 - Math.cos(c.wph)) * .5 * 1.45;
  c.wipers[0].rotation.z = a; c.wipers[1].rotation.z = a;
}
function updateCars(dt) {
  spawnT -= dt;
  const inLot = cars.filter(c => c.s > sLotIn - 4 && c.stop < 3).length;
  if (spawnT <= 0) {
    const last = cars[cars.length - 1];
    if ((!last || last.s > 16) && inLot < 9) addCar(0, 0, 11);
    spawnT = rand(5, 10);
  }
  let pickupWait = null, orderWait = false;
  const blink = Math.sin(time * 9) > 0;
  for (let i = 0; i < cars.length; i++) {
    const c = cars[i], ahead = i > 0 ? cars[i - 1] : null;
    let target = (c.s > sLotIn - 8 && c.s < sLotOut + 6) ? 5.2 : 12;
    let limit = Infinity;
    if (ahead) limit = ahead.s - 6.9;
    if (c.stop < 3) limit = Math.min(limit, stops[c.stop]);
    const pb = pedBlock(c); if (pb < Infinity) limit = Math.min(limit, c.s + Math.max(0, pb));
    target = Math.min(target, Math.sqrt(Math.max(0, 10 * (limit - c.s))));
    const pv = c.v;
    c.v = c.v > target ? Math.max(target, c.v - 10 * dt) : Math.min(target, c.v + 3.2 * dt);
    c.s = Math.max(c.s, Math.min(c.s + c.v * dt, limit));
    if (c.stop < 3 && c.s >= stops[c.stop] - .25 && c.v < .4) {
      if (c.wait === null) c.wait = rand(...waits[c.stop]);
      c.wait -= dt;
      if (c.stop === 2) pickupWait = c.wait;
      if (c.stop === 0) orderWait = true;
      if (c.wait <= 0) { c.stop++; c.wait = null; if (c.stop === 3) served++; }
    }
    const braking = c.v < .25 || c.v < pv - .01;
    c.tail.color.setRGB(braking ? 6 : 1.6, braking ? .12 : .03, .03);
    const turning = (c.s > sLotIn - 26 && c.s < sLotIn + 2) || (c.s > sLotOut - 14 && c.s < sLotOut + 8);
    c.indL.color.setRGB(turning && blink ? 5 : .25, turning && blink ? 2 : .1, 0);
    placeCar(c); animCar(c, dt);
  }
  while (cars.length && cars[0].s >= L - .5) { const c = cars.shift(); freeCar(c); if (follow === c) follow = null; }
  bag.visible = pickupWait !== null && pickupWait < 2.2;
  if (bag.visible) bag.position.x = 12.8 + (2.2 - pickupWait) * .5;
  indMat.color.setRGB(.05, orderWait ? (Math.sin(time * 10) > 0 ? 4 : 1) : .3, .05);

  trafficT -= dt;
  if (trafficT <= 0) { const c = getCar(); c.g.position.set(110, 0, 37.2); c.g.rotation.y = -PI / 2; c.v = 13; traffic.push(c); trafficT = rand(3, 9); }
  for (let i = traffic.length - 1; i >= 0; i--) {
    const c = traffic[i]; c.g.position.x -= c.v * dt; animCar(c, dt);
    c.tail.color.setRGB(1.6, .03, .03); c.indL.color.setRGB(.25, .1, 0);
    if (c.g.position.x < -110) { freeCar(c); traffic.splice(i, 1); }
  }
  return cars.filter(c => c.s > sLotIn - 4 && c.stop < 3).length;
}

// ================================================================ people
const skinCols = [0xe0b090, 0xc68a60, 0x8d5a3b, 0xf1c9a5, 0xd8a47a];
const coatCols = [0x2b3a55, 0x6b1f24, 0x3c3c3c, 0x1f4d3a, 0x8a6a3a, 0x4a2f5a, 0xb8b2a6, 0x223344, 0xa0522d, 0x2f2f35];
const rainCoatCols = [0xf2c21b, 0x1d6fd0, 0xd0402a, 0x2a8a5a];
const umbCols = [0x111111, 0xb81d24, 0x1d3b7a, 0xe8c547, 0x2c6e4f, 0xdddddd, 0x6a2a6a, 0x0f5f6a];
const V2 = (a) => a.map(([x, y]) => new THREE.Vector2(x, y));
const PG = {
  thigh: new THREE.CylinderGeometry(.085, .068, .45, 10).translate(0, -.225, 0),
  shin: new THREE.CylinderGeometry(.064, .05, .43, 10).translate(0, -.215, 0),
  shoe: new RoundedBoxGeometry(.11, .08, .27, 2, .03).translate(0, -.04, .05),
  torso: new THREE.LatheGeometry(V2([[0, 0], [.16, 0], [.18, .1], [.17, .25], [.2, .42], [.215, .52], [.17, .6], [.07, .64], [0, .65]]), 16),
  skirt: new THREE.LatheGeometry(V2([[.17, .02], [.2, -.2], [.24, -.48], [0, -.48]]), 16),
  neck: new THREE.CylinderGeometry(.045, .05, .1, 8),
  head: new THREE.SphereGeometry(.105, 16, 12).scale(.92, 1.1, 1),
  nose: new THREE.ConeGeometry(.018, .05, 6).rotateX(PI / 2),
  hair: new THREE.SphereGeometry(.112, 16, 8, 0, PI * 2, 0, PI * .55).scale(.95, 1.1, 1.05),
  hood: new THREE.SphereGeometry(.15, 16, 10, PI * .65, PI * 1.7, 0, PI * .72).scale(1, 1.1, 1.1),
  upper: new THREE.CylinderGeometry(.055, .047, .3, 8).translate(0, -.15, 0),
  fore: new THREE.CylinderGeometry(.045, .036, .27, 8).translate(0, -.135, 0),
  hand: new THREE.SphereGeometry(.042, 8, 6),
  pack: new RoundedBoxGeometry(.3, .38, .14, 2, .05),
  canopy: new THREE.ConeGeometry(.62, .26, 8, 1, true),
  rib: new THREE.CylinderGeometry(.006, .006, .672, 4),
  tip: new THREE.SphereGeometry(.014, 6, 4),
  shaft: new THREE.CylinderGeometry(.011, .011, .95, 6).translate(0, .475, 0),
  hook: new THREE.TorusGeometry(.05, .013, 6, 12, PI),
  bag: new THREE.BoxGeometry(.26, .32, .16),
};
function makePerson(opt = {}) {
  const g = new THREE.Group(), mats = [];
  const mm = (o) => { const m = MS(o); mats.push(m); return m; };
  const raincoat = opt.raincoat ?? Math.random() < .25;
  const coat = mm({ color: raincoat ? pick(rainCoatCols) : pick(coatCols), roughness: raincoat ? .25 : .65 });
  const pants = mm({ color: pick([0x1a1a1f, 0x23283a, 0x3a3328, 0x2c3e66]), roughness: .8 });
  const skin = mm({ color: pick(skinCols), roughness: .6 });
  const shoe = mm({ color: pick([0x101010, 0x3a2a1a, 0xdedede]), roughness: .4 });
  const hairM = mm({ color: pick([0x111111, 0x2a1a10, 0x5a4630, 0x8a7a5a]), roughness: .7 });
  const hip = new THREE.Group(); hip.position.y = .93; g.add(hip);
  const legs = [];
  for (const s of [-1, 1]) {
    const th = new THREE.Group(); th.position.x = s * .095; hip.add(th);
    th.add(new THREE.Mesh(PG.thigh, pants));
    const kn = new THREE.Group(); kn.position.y = -.45; th.add(kn);
    kn.add(new THREE.Mesh(PG.shin, pants));
    const ft = new THREE.Mesh(PG.shoe, shoe); ft.position.y = -.43; kn.add(ft);
    legs.push({ th, kn });
  }
  const torso = new THREE.Mesh(PG.torso, coat); torso.position.y = .9; torso.scale.set(1, 1, .7); g.add(torso);
  if (raincoat) { const sk = new THREE.Mesh(PG.skirt, coat); sk.position.y = .92; sk.scale.set(1, 1, .75); g.add(sk); }
  const neck = new THREE.Mesh(PG.neck, skin); neck.position.y = 1.58; g.add(neck);
  const head = new THREE.Mesh(PG.head, skin); head.position.y = 1.72; g.add(head);
  const nose = new THREE.Mesh(PG.nose, skin); nose.position.set(0, 1.71, .1); g.add(nose);
  if (raincoat) { const hd = new THREE.Mesh(PG.hood, coat); hd.position.set(0, 1.73, -.01); g.add(hd); }
  else { const h = new THREE.Mesh(PG.hair, hairM); h.position.set(0, 1.735, -.008); g.add(h); }
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * .225, 1.47, 0); g.add(sh);
    sh.add(new THREE.Mesh(PG.upper, coat));
    const el = new THREE.Group(); el.position.y = -.3; sh.add(el);
    el.add(new THREE.Mesh(PG.fore, coat));
    const hn = new THREE.Mesh(PG.hand, skin); hn.position.y = -.28; el.add(hn);
    arms.push({ sh, el, hn });
  }
  if (!raincoat && Math.random() < .3) { const bp = new THREE.Mesh(PG.pack, mm({ color: pick([0x222222, 0x5a3a2a, 0x2a3a5a]), roughness: .7 })); bp.position.set(0, 1.25, -.2); g.add(bp); }
  const umb = new THREE.Group(); umb.position.set(.22, 1.39, .4); umb.rotation.x = -.25; g.add(umb);
  const uc = pick(umbCols), clear = uc === 0xdddddd;
  const fabric = mm({ color: uc, roughness: .3, side: THREE.DoubleSide, transparent: clear, opacity: clear ? .45 : 1 });
  const can = new THREE.Mesh(PG.canopy, fabric); can.position.y = 1.08; umb.add(can);
  const apex = new THREE.Vector3(0, 1.21, 0);
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * PI * 2, rim = new THREE.Vector3(Math.sin(a) * .62, .95, Math.cos(a) * .62);
    const r = new THREE.Mesh(PG.rib, M.black); r.position.copy(rim).add(apex).multiplyScalar(.5); r.quaternion.setFromUnitVectors(_y, apex.clone().sub(rim).normalize()); umb.add(r);
    const tp = new THREE.Mesh(PG.tip, M.black); tp.position.copy(rim); umb.add(tp);
  }
  umb.add(new THREE.Mesh(PG.shaft, M.black));
  const hook = new THREE.Mesh(PG.hook, mm({ color: 0x3a2a1a, roughness: .5 })); hook.rotation.z = PI; hook.position.set(.05, 0, 0); umb.add(hook);
  const bag = new THREE.Mesh(PG.bag, bagMat); bag.position.y = -.2; arms[0].hn.add(bag); bag.visible = false;
  if (raincoat) umb.visible = false;
  scene.add(g);
  return { g, legs, arms, umb, bag, mats, ph: rand(0, 6), umbK: raincoat ? 0 : 1, hasUmb: !raincoat, fade: 1 };
}
function setFade(p, f) {
  p.fade = f; p.g.visible = f > .01;
  for (const m of p.mats) {
    if (m.userData.base === undefined) { m.userData.base = m.opacity; m.userData.clear = m.transparent; }
    m.transparent = f < .99 || m.userData.clear; m.opacity = m.userData.base * f;
  }
}
function pose(p, sw, walking) {
  const [Lg, Rg] = p.legs;
  Lg.th.rotation.x = sw * .5; Rg.th.rotation.x = -sw * .5;
  Lg.kn.rotation.x = walking ? Math.max(0, Math.sin(p.ph - 1.2)) * .75 : 0;
  Rg.kn.rotation.x = walking ? Math.max(0, Math.sin(p.ph - 1.2 + PI)) * .75 : 0;
  const [AL, AR] = p.arms;
  AL.sh.rotation.x = p.bag.visible ? -sw * .15 : -sw * .4; AL.el.rotation.x = p.bag.visible ? 0 : -.25;
  const k = p.umbK;
  AR.sh.rotation.x = THREE.MathUtils.lerp(sw * .4, -.6, k); AR.el.rotation.x = THREE.MathUtils.lerp(-.25, -1.6, k);
}
function underRoof(x, z) {
  return (x > -13 && x < 13.8 && z > -7.3 && z < 12.4) || (x > 11.8 && x < 19.8 && z > -3.7 && z < 10.7);
}
function groundY(x, z) {
  if (x > -13 && x < 13.6 && z > 7 && z < 12.6) return .15;
  if (z > 27 && z < 29.6) return .12;
  return 0;
}
const DOOR = [[-3.5, 11.4], [-3.5, 9.9], [-4.1, 7.75]];
const routes = [
  { pts: [[-10.4, 16.8], [-10.4, 13.4], [-6, 12.2], ...DOOR], door: true },
  { pts: [[4.6, 16.8], [4.6, 13.4], [-1.5, 12.2], ...DOOR], door: true },
  { pts: [[-70, 28.3], [-30, 28.3], [-19.5, 27.6], [-13.4, 22.5], [-7.5, 20.6], [-7.5, 13.4], [-5.2, 12.2], ...DOOR], door: true },
  { pts: [[60, 28.3], [24, 28.3], [12, 25], [1.5, 21], [1.5, 13.4], [-2, 12.2], ...DOOR], door: true },
  { pts: [[4.2, 11.2], [6.5, 13.2], [7.6, 16.8]] },
  { pts: [[-95, 28.6], [95, 28.6]] },
  { pts: [[95, 28.0], [-95, 28.0]] },
  { pts: [[-95, 28.9], [95, 28.9]] },
  { pts: [[95, 28.4], [-95, 28.4]] },
  { pts: [[-80, 28.2], [80, 28.2]] },
];
const people = [];
for (const r of routes) {
  const p = makePerson(); p.route = r; p.dir = 1; p.speed = rand(1.15, 1.5);
  p.idx = (Math.random() * (r.pts.length - 2)) | 0;
  const a = r.pts[p.idx], b = r.pts[p.idx + 1], k = Math.random();
  p.g.position.set(a[0] + (b[0] - a[0]) * k, 0, a[1] + (b[1] - a[1]) * k);
  p.state = 'walk'; p.hide = 0; people.push(p);
}
for (const [x, z, ry] of [[-6.4, 11.6, .4], [-1.6, 11.9, -.6]]) {   // waiting under the canopy, one on the phone
  const p = makePerson({ raincoat: false }); p.g.position.set(x, .15, z); p.g.rotation.y = ry; p.umb.visible = false; p.umbK = 0; p.idle = true;
  pose(p, 0, false); p.arms[1].sh.rotation.set(-.4, 0, -.25); p.arms[1].el.rotation.x = -2.2; people.push(p);
}
const diners = [];
for (const i of [0, 3, 5, 6, 9, 10]) {
  const [x, z, ry] = seats[i];
  const p = makePerson({ raincoat: false }); p.umb.visible = false; p.umbK = 0; p.idle = true;
  p.g.position.set(x, -.2, z); p.g.rotation.y = ry;
  p.legs.forEach(l => { l.th.rotation.x = -PI / 2; l.kn.rotation.x = PI / 2; });
  p.arms.forEach(a => { a.sh.rotation.x = -.5; a.el.rotation.x = -1.1; });
  diners.push(p);
}

function updatePeople(dt) {
  let inside = diners.length, nearDoor = false;
  for (const p of people) {
    if (p.idle) { p.g.rotation.y += Math.sin(time * .7 + p.ph) * .002; continue; }
    if (p.state === 'hidden') {
      if (p.atDoor) inside++;
      p.hide -= dt;
      if (p.hide <= 0) { p.state = 'walk'; p.bag.visible = p.atDoor && Math.random() < .8; }
      continue;
    }
    if (p.fade < 1) setFade(p, Math.min(1, p.fade + dt * 2));
    const pts = p.route.pts, ni = p.idx + p.dir;
    const tx = pts[ni][0], tz = pts[ni][1];
    const x = p.g.position.x, z = p.g.position.z;
    const dx = tx - x, dz = tz - z, d = Math.hypot(dx, dz) || 1e-6;
    if (Math.hypot(x + 3.5, z - 10.6) < 2.3) nearDoor = true;
    let wait = false;
    for (const c of cars) {
      const cx = x - c.g.position.x, cz = z - c.g.position.z;
      if (Math.hypot(cx, cz) > 7 || c.v < .6) continue;
      const th = c.g.rotation.y, al = cx * Math.sin(th) + cz * Math.cos(th), lat = Math.abs(cx * Math.cos(th) - cz * Math.sin(th));
      if (al > -2.6 && al < 9 && lat < 1.8) { wait = false; break; }
      const nx = x + dx / d * 1.2 - c.g.position.x, nz = z + dz / d * 1.2 - c.g.position.z;
      const al2 = nx * Math.sin(th) + nz * Math.cos(th), lat2 = Math.abs(nx * Math.cos(th) - nz * Math.sin(th));
      if (al2 > -2.6 && al2 < 9 && lat2 < 1.8) wait = true;
    }
    const step = wait ? 0 : p.speed * dt;
    const last = ni === 0 || ni === pts.length - 1;
    if (last && d < .6) setFade(p, Math.min(p.fade, d / .6));
    if (d <= step) {
      p.g.position.x = tx; p.g.position.z = tz; p.idx = ni;
      if (last) {
        p.state = 'hidden'; setFade(p, 0);
        p.atDoor = !!p.route.door && ni === pts.length - 1;
        p.hide = p.atDoor ? rand(8, 20) : rand(2, 10); p.dir = -p.dir;
        if (!p.atDoor) p.bag.visible = false;
      }
    } else {
      p.g.position.x += dx / d * step; p.g.position.z += dz / d * step;
      const yaw = Math.atan2(dx, dz); let dy = yaw - p.g.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy)); p.g.rotation.y += dy * Math.min(1, dt * 8);
    }
    const gx = p.g.position.x, gz = p.g.position.z;
    if (step > 0) p.ph += dt * p.speed * 4.2;
    const sw = step > 0 ? Math.sin(p.ph) : 0;
    p.g.position.y = groundY(gx, gz) + (step > 0 ? Math.abs(Math.cos(p.ph)) * .03 : 0);
    const want = p.hasUmb && !underRoof(gx, gz) ? 1 : 0;
    p.umbK += (want - p.umbK) * Math.min(1, dt * 4);
    p.umb.visible = p.umbK > .05; p.umb.scale.set(Math.max(p.umbK, .05), 1, Math.max(p.umbK, .05));
    pose(p, sw, step > 0);
  }
  for (const p of diners) p.arms[1].el.rotation.x = -1.1 - Math.max(0, Math.sin(time * 1.3 + p.ph)) * .7;
  doorOpen += ((nearDoor ? 1 : 0) - doorOpen) * Math.min(1, dt * 4);
  for (const d of doors) d.g.position.x = -3.5 + d.s * (.375 + doorOpen * .72);
  return inside;
}

// ================================================================ rain
const RAIN_MAX = 30000, RANGE = 90, RH = 40;
const rainLights = [[-16.4, 10, 13.6], [-6, 3.4, 11.5], [7, 4.4, 11.6], [15.5, 4.4, 2], [-42, 8, 31.5], [-8, 8, 31.5], [26, 8, 31.5], [60, 8, 31.5]];
const rainLightCols = [[1, .12, .08], [1, .75, .45], [1, .75, .45], [1, .75, .45], [1, .8, .55], [1, .8, .55], [1, .8, .55], [1, .8, .55]];
const rainGeo = new THREE.BufferGeometry();
{
  const pos = new Float32Array(RAIN_MAX * 6), tip = new Float32Array(RAIN_MAX * 2), rnd = new Float32Array(RAIN_MAX * 2);
  for (let i = 0; i < RAIN_MAX; i++) {
    const x = Math.random() * RANGE, y = Math.random() * RH, z = Math.random() * RANGE, r = Math.random();
    pos.set([x, y, z, x, y, z], i * 6); tip.set([0, 1], i * 2); rnd.set([r, r], i * 2);
  }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  rainGeo.setAttribute('tip', new THREE.BufferAttribute(tip, 1));
  rainGeo.setAttribute('rnd', new THREE.BufferAttribute(rnd, 1));
}
const roofGLSL = `
  bool underRoof(vec3 p){
    return p.y < 5.7 && ((p.x>-13. && p.x<13.8 && p.z>-7.3 && p.z<12.4) || (p.x>11.8 && p.x<19.8 && p.z>-3.7 && p.z<10.7));
  }`;
const rainMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: {
    uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uOpacity: { value: 1 },
    uL: { value: rainLights.map(a => new THREE.Vector3(...a)) }, uC: { value: rainLightCols.map(a => new THREE.Vector3(...a)) }, uFlash: { value: 0 },
  },
  vertexShader: `
    attribute float tip; attribute float rnd;
    uniform float uTime; uniform vec3 uCenter;
    varying float vTip; varying vec3 vW; varying float vFade;
    void main(){
      vec3 p = position;
      float sp = 15.0*(0.85+0.3*rnd);
      p.y = mod(p.y - uTime*sp, ${RH.toFixed(1)});
      p.x += p.y*0.12;
      p.x = mod(p.x - uCenter.x + ${(RANGE / 2).toFixed(1)}, ${RANGE.toFixed(1)}) + uCenter.x - ${(RANGE / 2).toFixed(1)};
      p.z = mod(p.z - uCenter.z + ${(RANGE / 2).toFixed(1)}, ${RANGE.toFixed(1)}) + uCenter.z - ${(RANGE / 2).toFixed(1)};
      float len = 0.55 + 0.35*rnd;
      p.y += tip*len; p.x += tip*len*0.12;
      vTip = tip; vW = p;
      float d = distance(p, cameraPosition);
      vFade = smoothstep(55.0, 6.0, d) * smoothstep(0.6, 2.5, d);
      gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
    }`,
  fragmentShader: `
    uniform float uOpacity, uFlash; uniform vec3 uL[8]; uniform vec3 uC[8];
    varying float vTip; varying vec3 vW; varying float vFade;
    ${roofGLSL}
    void main(){
      if (underRoof(vW) || vW.y < 0.0) discard;
      vec3 c = vec3(0.10,0.12,0.16) + uFlash*vec3(0.5,0.55,0.7);
      for(int i=0;i<8;i++){ vec3 d = vW-uL[i]; c += uC[i]*1.6/(1.0+dot(d,d)*0.05); }
      float a = mix(1.0, 0.1, vTip) * vFade * uOpacity;
      gl_FragColor = vec4(c*a*0.55, a);
    }`,
});
const rain = new THREE.LineSegments(rainGeo, rainMat); rain.frustumCulled = false; scene.add(rain);

// water dripping off the canopy edges
const drips = (() => {
  const edges = [[[-12.8, 3.65, 11.85], [-.2, 3.65, 11.85]], [[1.5, 4.6, 12.45], [13.7, 4.6, 12.45]], [[19.75, 4.6, -3.6], [19.75, 4.6, 10.6]], [[13.7, 4.6, 7], [13.7, 4.6, 12.4]]];
  const pos = [], ph = [], tp = [];
  for (const [a, b] of edges) {
    const n = Math.round(new THREE.Vector3(...a).distanceTo(new THREE.Vector3(...b)) * 4);
    for (let i = 0; i < n; i++) {
      const k = (i + Math.random() * .5) / n, x = a[0] + (b[0] - a[0]) * k, z = a[2] + (b[2] - a[2]) * k, r = Math.random();
      pos.push(x, a[1], z, x, a[1], z); ph.push(r, r); tp.push(0, 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('ph', new THREE.Float32BufferAttribute(ph, 1)); g.setAttribute('tip', new THREE.Float32BufferAttribute(tp, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime: rainMat.uniforms.uTime, uOpacity: rainMat.uniforms.uOpacity },
    vertexShader: `attribute float ph; attribute float tip; uniform float uTime; varying float vA;
      void main(){ vec3 p=position; float t=fract(uTime*0.9+ph*7.0); float y0=p.y; p.y = y0 - t*t*y0*1.02 + tip*0.35; vA=(1.0-tip)*(0.5+0.5*ph);
        gl_Position=projectionMatrix*viewMatrix*vec4(p,1.0); }`,
    fragmentShader: `uniform float uOpacity; varying float vA; void main(){ float a=vA*uOpacity*0.6; gl_FragColor=vec4(vec3(1.0,0.85,0.65)*a,a); }`,
  });
  const l = new THREE.LineSegments(g, m); l.frustumCulled = false; scene.add(l); return l;
})();

// ground splashes
const SPL = 2600;
const splGeo = new THREE.InstancedBufferGeometry();
{
  const base = new THREE.PlaneGeometry(1, 1);
  splGeo.index = base.index; splGeo.setAttribute('position', base.getAttribute('position')); splGeo.setAttribute('uv', base.getAttribute('uv'));
  const off = new Float32Array(SPL * 2), ph = new Float32Array(SPL);
  for (let i = 0; i < SPL; i++) { off[i * 2] = Math.random() * 60; off[i * 2 + 1] = Math.random() * 60; ph[i] = Math.random(); }
  splGeo.setAttribute('offset', new THREE.InstancedBufferAttribute(off, 2));
  splGeo.setAttribute('phase', new THREE.InstancedBufferAttribute(ph, 1));
  splGeo.instanceCount = SPL;
}
const splMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uOpacity: { value: 1 } },
  vertexShader: `
    attribute vec2 offset; attribute float phase;
    uniform float uTime; uniform vec3 uCenter;
    varying vec2 vUv; varying float vP; varying vec3 vW;
    float h1(float n){ return fract(sin(n)*43758.5453); }
    void main(){
      float tt = uTime*1.7 + phase;
      float t = fract(tt), cyc = floor(tt);
      vec2 o = offset + vec2(h1(cyc*12.99+phase*78.2), h1(cyc*39.35+phase*11.1))*60.0;
      o = mod(o - uCenter.xz + 30.0, 60.0) + uCenter.xz - 30.0;
      float s = 0.06 + t*0.38;
      float y = (o.x>-13. && o.x<13.6 && o.y>7. && o.y<12.6) ? 0.17 : ((o.y>27. && o.y<29.7) ? 0.14 : 0.03);
      vec3 p = vec3(o.x + position.x*s, y, o.y - position.y*s);
      vUv = uv; vP = t; vW = p;
      gl_Position = projectionMatrix * viewMatrix * vec4(p,1.0);
    }`,
  fragmentShader: `
    uniform float uOpacity; varying vec2 vUv; varying float vP; varying vec3 vW;
    ${roofGLSL}
    void main(){
      if (underRoof(vW)) discard;
      float d = length(vUv-0.5)*2.0;
      float ring = smoothstep(0.55,0.85,d)*(1.0-smoothstep(0.85,1.0,d));
      float a = ring*(1.0-vP)*uOpacity*0.35;
      gl_FragColor = vec4(vec3(0.75,0.8,0.9)*a, a);
    }`,
});
const splashes = new THREE.Mesh(splGeo, splMat); splashes.frustumCulled = false; splashes.renderOrder = -8; scene.add(splashes);

// ================================================================ post
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .55, .45, .9);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ================================================================ UI / camera views
const $ = id => document.getElementById(id);
const views = {
  overview: [[34, 13, 42], [-1, 2.6, 5]],
  door: [[-7.4, 2.2, 15.2], [-3.8, 2.4, 9]],
  inside: [[-11.6, 1.6, 7.6], [-3, 1.3, 11.8]],
  window: [[25, 3.2, 13], [13.5, 1.8, 1]],
  top: [[2, 62, 22], [0, 0, 6]],
  street: [[-44, 3.5, 34], [-5, 4, 6]],
  order: [[-4.2, 1.6, -10.9], [1.6, 2.2, -14.3]],
  pylon: [[-11, 3, 24], [-17.3, 9.5, 11.8]],
};
let follow = null, tween = null, mode = 'overview';
function setView(v) {
  mode = v;
  document.querySelectorAll('.btns button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  if (v === 'follow') { controls.enabled = false; follow = null; return; }
  controls.enabled = true;
  const [p, tg] = views[v];
  tween = { t: 0, p0: camera.position.clone(), t0: controls.target.clone(), p1: new THREE.Vector3(...p), t1: new THREE.Vector3(...tg) };
}
document.querySelectorAll('.btns button').forEach(b => b.onclick = () => setView(b.dataset.v));
{
  const v = params.get('view');
  if (v && views[v]) { setView(v); camera.position.copy(tween.p1); controls.target.copy(tween.t1); tween = null; }
}
$('tg').onclick = () => { const b = $('body'); const h = b.style.display === 'none'; b.style.display = h ? '' : 'none'; $('tg').textContent = h ? '–' : '+'; };
$('lang').onclick = () => {
  LANG = LANG === 'zh' ? 'en' : 'zh';
  try { localStorage.setItem('drive-thru-lang', LANG); } catch (e) {}
  applyUI(); dyn.forEach(e => e.render());
};
const setRainAmount = () => rainGeo.setDrawRange(0, +$('rRain').value * 2);
$('rRain').oninput = setRainAmount; setRainAmount();
$('cRain').onchange = e => { rain.visible = splashes.visible = drips.visible = e.target.checked; };
$('cBloom').onchange = e => { bloom.enabled = e.target.checked; };
$('cRot').onchange = e => { controls.autoRotate = e.target.checked; };

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  mirror.getRenderTarget().setSize(innerWidth * DPR * .5, innerHeight * DPR * .5);
});

// ================================================================ loop
let time = 0, nextBolt = rand(6, 12), boltT = -1;
let last = performance.now(), frames = 0;
const camGoal = new THREE.Vector3(), lookGoal = new THREE.Vector3(), lookCur = new THREE.Vector3(0, 2, 0);
let uiT = 0, first = true;

renderer.setAnimationLoop(() => {
  const now = performance.now(), dt = Math.min((now - last) / 1000, .05); last = now; time += dt;
  const queue = updateCars(dt);
  const inside = updatePeople(dt);

  let fl = 0;
  if ($('cFlash').checked && !params.has('view')) { nextBolt -= dt; if (nextBolt <= 0) { boltT = 0; nextBolt = rand(9, 22); } }
  if (boltT >= 0) {
    boltT += dt; const tt = boltT;
    fl = tt < .07 ? 1 : tt < .14 ? .15 : tt < .24 ? .85 : tt < .9 ? .85 * Math.exp(-(tt - .24) * 7) : 0;
    if (tt > .9) boltT = -1;
  }
  bolt.intensity = fl * 3.5; hemi.intensity = .55 + fl * 1.6;
  skyMat.uniforms.uFlash.value = fl; skyMat.uniforms.uTime.value = time; rainMat.uniforms.uFlash.value = fl;

  if (mode === 'follow') {
    if (!follow || !cars.includes(follow)) follow = cars[cars.length - 1];
    if (follow) {
      const th = follow.g.rotation.y, fx = Math.sin(th), fz = Math.cos(th), Pp = follow.g.position;
      camGoal.set(Pp.x - fx * 10 + fz * 2.2, 4.6, Pp.z - fz * 10 - fx * 2.2);
      lookGoal.set(Pp.x + fx * 6, 1.2, Pp.z + fz * 6);
      camera.position.lerp(camGoal, Math.min(1, dt * 2.5)); lookCur.lerp(lookGoal, Math.min(1, dt * 4));
      camera.lookAt(lookCur); controls.target.copy(lookCur);
    }
  } else {
    if (tween) {
      tween.t = Math.min(1, tween.t + dt / 1.6);
      const k = tween.t < .5 ? 2 * tween.t * tween.t : 1 - (-2 * tween.t + 2) ** 2 / 2;
      camera.position.lerpVectors(tween.p0, tween.p1, k); controls.target.lerpVectors(tween.t0, tween.t1, k);
      if (tween.t >= 1) tween = null;
    }
    controls.update(); lookCur.copy(controls.target);
  }
  sky.position.copy(camera.position);

  rainMat.uniforms.uTime.value = time; rainMat.uniforms.uCenter.value.copy(camera.position);
  splMat.uniforms.uTime.value = time; splMat.uniforms.uCenter.value.set(camera.position.x * .5 + lookCur.x * .5, 0, camera.position.z * .5 + lookCur.z * .5);
  splMat.uniforms.uOpacity.value = Math.min(1.6, +$('rRain').value / 16000);

  composer.render();

  uiT -= dt;
  if (uiT <= 0) { uiT = .25; $('sq').textContent = queue; $('ss').textContent = served; $('sp').textContent = inside; }
  if (first) { first = false; const l = $('loading'); l.style.opacity = 0; setTimeout(() => l.remove(), 900); }
  if (++frames === 3) document.body.dataset.ready = '1';
});
