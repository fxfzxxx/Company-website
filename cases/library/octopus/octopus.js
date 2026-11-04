/* Benthos-8 — an interactive mechanical octopus you can take apart.

   Built the teardown way, without the teardown kit:
   1. MODEL     one jet-pump model in real units. Every pose, gauge, chart and
                label below reads from it; nothing is keyframed by hand.
   2. MACHINE   every part is built from three.js primitives at load: a lathed
                head with visor and turret optics, a mantle of 16 bolted panels
                whose upper course hinges open on actuators over a frame, pump,
                cell packs and harness, and 8 arms of 25 machined links (shell,
                knuckle, clevis, pin, tendon guide, sucker) drawn as instances.
   3. CONSOLE   live charts, a 2D section that redraws from the same model,
                subsystem buttons, camera views and callouts with leader lines.
   4. TOUR      with nobody at the controls a cursor walks the console and
                presses the buttons itself. Any input hands control over;
                25 s of quiet hands it back.
   5. SLIDERS   water current and nozzle diameter feed straight into the model,
                so you can push the machine past what it can hold.

   Stills: ?at=<s> fast-forwards the tour, ?cam=x,y,z,tx,ty,tz places the camera,
   ?hud=0 hides the panels, ?still renders one frame and stops.

   The numbers are a plausible design, not a real vehicle's data: each one is
   marked in the parameter block with where it comes from. */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const $ = (id) => document.getElementById(id);
const PI = Math.PI;
const TAU = PI * 2;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const damp = (cur, target, rate, dt) => lerp(cur, target, 1 - Math.exp(-rate * dt));

function rng(seed) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

// ================================================================== i18n
const I18N = {
	zh: {
		suckers: '吸盘', bHead: '打开头部', drivem: '主驱电机', eyebrow: '深海勘测章鱼 · 喷射推进', curl: '弯曲', power: '功耗', jet: '喷射泵', nozzle: '虹吸喷口', jetv: '射流速度',
		flow: '流量 Q', stroke: '单次排水 ΔV', period: '脉冲周期', pump: '叶轮转速', section: '外套膜剖面', live2d: '2D · 同一模型',
		arms: '手臂弯曲', links: '节', systems: '系统', elec: '电功率', endur: '续航', depth: '深度', current: '水流',
		drag: '机体阻力', hold: '定点保持', optics: '光学单元', mantle: '外套膜', armset: '手臂', beak: '喙', log: '操作日志',
		parts: '部件', bOptics: '光学', bMantle: '打开外套膜', bArm: '手臂 R2', bFlow: '射流透视', bBeak: '喙', bExplode: '爆炸图',
		views: '视角', vHero: '主视', vFront: '正面', vSide: '侧面', vTop: '顶部', vUnder: '底部', bTour: '巡览', bHud: '面板',
		slCur: '水流', slNoz: '喷口 Ø', hint: '拖动旋转 · 滚轮缩放 · H 隐藏面板 · 任意操作接管巡览，静置 25 秒后自动恢复',
		tour: '自动巡览 · 点任意处接管', user: '手动操作 · 静置 25 秒恢复巡览', loading: '正在组装 Benthos-8…',
	},
	en: {
		tour: 'AUTO TOUR · click anywhere to take over', user: 'YOU HAVE CONTROL · tour resumes after 25 s', loading: 'Assembling Benthos-8…',
	},
};
let lang = (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
const enText = new Map();
document.querySelectorAll('[data-i18n]').forEach((el) => enText.set(el, el.textContent));
function applyLang() {
	document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
	document.querySelectorAll('[data-i18n]').forEach((el) => {
		const k = el.dataset.i18n;
		el.textContent = lang === 'zh' && I18N.zh[k] ? I18N.zh[k] : enText.get(el);
	});
	setTourTag();
}
const tr = (k) => (I18N[lang] && I18N[lang][k]) || I18N.en[k] || k;

// ================================================================== 1. MODEL
// Parameter block. Change a number here and every part and panel follows.
const P = {
	rho: 1025,            // kg/m³   seawater, textbook value
	V0: 9.0e-3,           // m³      mantle cavity at rest (my design estimate)
	strokeRest: 0.18,     // –       fraction of V0 expelled per pulse when cruising (estimate)
	strokeMax: 0.28,      // –       hardest stroke the mantle actuators allow (estimate)
	periodRest: 1.6,      // s       pulse period when cruising (estimate)
	periodMin: 0.7,       // s       fastest pulse (estimate)
	contract: 0.35,       // –       share of each cycle spent contracting (estimate)
	intakeRatio: 6,       // –       mantle intake area ÷ nozzle area (estimate)
	Cd: 0.30,             // –       drag coefficient, arms trailing (estimate)
	R: 0.19,              // m       mantle radius = frontal radius for drag
	pumpMaxP: 80e3,       // Pa      impeller pressure limit (estimate)
	pumpDisp: 1.2e-4,     // m³/rev  impeller displacement (estimate)
	pumpEff: 0.35,        // –       wire-to-water efficiency (estimate)
	armW: 3.2,            // W       per arm, holding a pose (estimate)
	hotelW: 14,           // W       optics, compute, comms (estimate)
	battWh: 480,          // Wh      battery pack
	depth: 38.2,          // m       survey depth for the demo
	N: 25,                // links per arm
	armR0: 0.05,          // m       link radius at the root; each link is 1.15 radii long
	armR1: 0.013,         // m       link radius at the tip (taper 5.5 % per link)
	maxCurl: 3.4,         // rad     total bend of a fully curled arm
};

const area = (d) => (PI * d * d) / 4;
const drag = (u) => 0.5 * P.rho * P.Cd * PI * P.R * P.R * u * u;

// One pulse cycle at effort e ∈ [0,1] (0 = cruising, 1 = flat out).
function cycle(e, d) {
	const T = lerp(P.periodRest, P.periodMin, e);
	const s = lerp(P.strokeRest, P.strokeMax, e);
	const dV = s * P.V0;
	const A = area(d);
	const tc = P.contract * T;
	const Qp = (dV * PI) / (2 * tc);            // peak flow of a half-sine stroke
	const vp = Qp / A;
	// mean thrust over a whole cycle: F̄ = (1/T)∫ρQ²/A dt, and for a half-sine stroke
	// ∫sin² = tc/2, so F̄ = ρ·Qp²·tc/(2·A·T)
	const meanF = (P.rho * Qp * Qp * tc) / (2 * A * T);
	// hydraulic power ∫ΔP·Q dt / T with ΔP = ½ρv², ∫sin³ = 4tc/(3π)
	const hydW = (0.5 * P.rho * Qp * Qp * Qp * tc * (4 / (3 * PI))) / (A * A * T);
	return { e, T, s, dV, A, tc, Qp, vp, meanF, peakF: P.rho * Qp * vp, peakP: 0.5 * P.rho * vp * vp, hydW };
}

// How hard the pump must work to hold station in current u with nozzle d.
function effort(u, d) {
	const base = cycle(0, d);
	const need = Math.max(base.meanF, drag(u));
	const top = cycle(1, d);
	if (top.meanF < need) return { cyc: top, need, hold: false };
	let lo = 0, hi = 1;
	for (let i = 0; i < 28; i++) {
		const m = (lo + hi) / 2;
		if (cycle(m, d).meanF < need) lo = m; else hi = m;
	}
	return { cyc: cycle(hi, d), need, hold: true };
}

// The jet at phase ph ∈ [0,1) of a cycle.
function jetAt(ph, c) {
	if (ph < P.contract) {
		const x = ph / P.contract;
		const Q = c.Qp * Math.sin(PI * x);
		const v = Q / c.A;
		return { contracting: true, x, expelled: (c.dV * (1 - Math.cos(PI * x))) / 2, Q, v, F: P.rho * Q * v, dP: 0.5 * P.rho * v * v };
	}
	const y = (ph - P.contract) / (1 - P.contract);
	const tr_ = (1 - P.contract) * c.T;
	const Qin = ((c.dV * PI) / (2 * tr_)) * Math.sin(PI * y);
	const vin = Qin / (c.A * P.intakeRatio);
	return { contracting: false, x: y, expelled: (c.dV * (1 + Math.cos(PI * y))) / 2, Q: -Qin, v: 0, F: 0, dP: -0.5 * P.rho * vin * vin };
}

// Per-arm curl. Pure function of time, jet strength and current.
const ARM_NAMES = [];
const ARM_ANGLES = [];
for (let a = 0; a < 8; a++) {
	const ang = PI / 8 + (a * PI) / 4; // around the hub, from +x towards +z
	ARM_ANGLES.push(ang);
}
// name arms L1..L4 / R1..R4, front (+z) to back, machine's own left = +x
{
	const order = [...ARM_ANGLES.keys()];
	const left = order.filter((a) => Math.cos(ARM_ANGLES[a]) > 0).sort((p, q) => Math.sin(ARM_ANGLES[q]) - Math.sin(ARM_ANGLES[p]));
	const right = order.filter((a) => Math.cos(ARM_ANGLES[a]) <= 0).sort((p, q) => Math.sin(ARM_ANGLES[q]) - Math.sin(ARM_ANGLES[p]));
	left.forEach((a, i) => (ARM_NAMES[a] = 'L' + (i + 1)));
	right.forEach((a, i) => (ARM_NAMES[a] = 'R' + (i + 1)));
}
const ARM_R2 = ARM_NAMES.indexOf('R2');

function armCurl(a, t, jet, u) {
	const ph = a * 0.79;
	const idle = 0.52 + 0.22 * Math.sin(t * 0.41 + ph * 1.7) + 0.08 * Math.sin(t * 1.13 + ph);
	const streamline = 1 - 0.62 * jet;
	const pushed = 1 - 0.18 * clamp(u / 2, 0, 1);
	return clamp(idle * streamline * pushed, 0, 1); // 0..1 of maxCurl
}

// ================================================================== renderer & stage
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
{
	// a cyclorama: pale at the top, a little deeper where the floor meets the eye
	const c = document.createElement('canvas');
	c.width = 4; c.height = 512;
	const g = c.getContext('2d');
	const gr = g.createLinearGradient(0, 0, 0, 512);
	gr.addColorStop(0, '#e8eced');
	gr.addColorStop(1, '#cbd2d5');
	g.fillStyle = gr;
	g.fillRect(0, 0, 4, 512);
	const t = new THREE.CanvasTexture(c);
	t.colorSpace = THREE.SRGBColorSpace;
	scene.background = t;
}

const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 50);
camera.position.set(2.2, 1.6, 2.8);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.86, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.6;
controls.maxDistance = 8;
controls.maxPolarAngle = PI * 0.97;

// studio reflections from a hand-built light box: two soft boxes and a strip
{
	const pm = new THREE.PMREMGenerator(renderer);
	const env = new THREE.Scene();
	env.add(new THREE.Mesh(new THREE.SphereGeometry(10, 24, 12), new THREE.MeshBasicMaterial({ color: '#6f7a80', side: THREE.BackSide })));
	const panel = (w, h, pos, k) => {
		const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k), side: THREE.DoubleSide }));
		m.position.copy(pos);
		m.lookAt(0, 1, 0);
		env.add(m);
	};
	panel(7, 3, new THREE.Vector3(0, 8, 1), 4.0);
	panel(2.5, 7, new THREE.Vector3(7, 3, 3), 2.6);
	panel(1.2, 7, new THREE.Vector3(-6, 3, -5), 3.2);
	panel(9, 1.2, new THREE.Vector3(0, 0.6, -8), 1.2);
	const floorBounce = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshBasicMaterial({ color: '#9aa4a9' }));
	floorBounce.rotation.x = -PI / 2;
	floorBounce.position.y = -1.5;
	env.add(floorBounce);
	scene.environment = pm.fromScene(env, 0.02).texture;
	scene.environmentIntensity = 0.85;
	pm.dispose();
}

scene.add(new THREE.HemisphereLight('#ffffff', '#9ea9ae', 0.55));
const key = new THREE.DirectionalLight('#fffaf3', 2.6);
key.position.set(2.2, 5.5, 3.4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 1, far: 14 });
key.shadow.bias = -0.0003;
key.shadow.normalBias = 0.015;
scene.add(key);
const rim = new THREE.DirectionalLight('#e3f0ff', 1.6); // separates the silhouette from the cyc
rim.position.set(-3, 3.2, -4.5);
scene.add(rim);
const fill = new THREE.DirectionalLight('#eef2f4', 0.45);
fill.position.set(-3.5, 1.2, 3);
scene.add(fill);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.ShadowMaterial({ color: '#25343b', opacity: 0.24 }));
floor.rotation.x = -PI / 2;
floor.receiveShadow = true;
scene.add(floor);
{
	// a survey ring on the floor: 2.5 m across, ticks every 10°, majors every 30°
	const lm = new THREE.LineBasicMaterial({ color: '#8f9ba1', transparent: true, opacity: 0.55 });
	const ring = [];
	for (let i = 0; i <= 180; i++) {
		const a = (i / 180) * TAU;
		ring.push(new THREE.Vector3(Math.cos(a) * 1.25, 0.002, Math.sin(a) * 1.25));
	}
	scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ring), lm));
	const ticks = [];
	for (let i = 0; i < 36; i++) {
		const a = (i / 36) * TAU, l = i % 3 === 0 ? 0.1 : 0.04;
		ticks.push(new THREE.Vector3(Math.cos(a) * 1.25, 0.002, Math.sin(a) * 1.25), new THREE.Vector3(Math.cos(a) * (1.25 + l), 0.002, Math.sin(a) * (1.25 + l)));
	}
	scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(ticks), lm));
}

// ================================================================== materials
const M = {
	ceramic: new THREE.MeshPhysicalMaterial({ color: '#eef0ec', roughness: 0.34, clearcoat: 0.8, clearcoatRoughness: 0.16, side: THREE.DoubleSide }),
	white: new THREE.MeshPhysicalMaterial({ color: '#eceeea', roughness: 0.36, clearcoat: 0.7, clearcoatRoughness: 0.2 }),
	graphite: new THREE.MeshPhysicalMaterial({ color: '#23292d', roughness: 0.42, metalness: 0.35, clearcoat: 0.35, clearcoatRoughness: 0.3 }),
	rubber: new THREE.MeshStandardMaterial({ color: '#2b3034', roughness: 0.82 }),
	alu: new THREE.MeshStandardMaterial({ color: '#c3c9cc', roughness: 0.4, metalness: 1 }),
	steel: new THREE.MeshStandardMaterial({ color: '#8b9397', roughness: 0.36, metalness: 1 }),
	glass: new THREE.MeshPhysicalMaterial({ color: '#0f1a20', roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, metalness: 0.2 }),
	pupil: new THREE.MeshStandardMaterial({ color: '#000000', emissive: '#ffb27a', emissiveIntensity: 0.6 }),
	sucker: new THREE.MeshPhysicalMaterial({ color: '#ead3c2', roughness: 0.5, clearcoat: 0.5, clearcoatRoughness: 0.4, sheen: 0.4, sheenColor: '#ffd9c4', side: THREE.DoubleSide }),
	cell: new THREE.MeshStandardMaterial({ color: '#33414a', roughness: 0.5, metalness: 0.4 }),
	board: new THREE.MeshStandardMaterial({ color: '#1f3b33', roughness: 0.6 }),
	accJet: new THREE.MeshStandardMaterial({ color: '#e95a1a', roughness: 0.38, metalness: 0.45, emissive: '#e95a1a', emissiveIntensity: 0 }),
	accOpt: new THREE.MeshStandardMaterial({ color: '#e95a1a', roughness: 0.38, metalness: 0.45, emissive: '#e95a1a', emissiveIntensity: 0 }),
	accBody: new THREE.MeshStandardMaterial({ color: '#e95a1a', roughness: 0.38, metalness: 0.45, emissive: '#e95a1a', emissiveIntensity: 0 }),
	accArm: new THREE.MeshStandardMaterial({ color: '#e95a1a', roughness: 0.38, metalness: 0.45, emissive: '#e95a1a', emissiveIntensity: 0 }),
};

// ================================================================== geometry kit
const mesh = (geo, mat, parent, pos, rot) => {
	const m = new THREE.Mesh(geo, mat);
	if (pos) m.position.set(...pos);
	if (rot) m.rotation.set(...rot);
	if (parent) parent.add(m);
	return m;
};
const anchor = (parent, pos) => {
	const o = new THREE.Object3D();
	o.position.set(...pos);
	parent.add(o);
	return o;
};

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _xm = new THREE.Matrix4(), _xq = new THREE.Quaternion(), _xe = new THREE.Euler();
// place a geometry: p position, r euler, s scale (number or [x,y,z])
function xf(geo, p = [0, 0, 0], r = [0, 0, 0], s = 1) {
	const sc = Array.isArray(s) ? V3(...s) : V3(s, s, s);
	_xm.compose(V3(...p), _xq.setFromEuler(_xe.set(...r)), sc);
	return geo.applyMatrix4(_xm);
}
// orient +Y of a geometry along dir, then move it to p
function along(geo, p, dir, s = 1) {
	_xq.setFromUnitVectors(V3(0, 1, 0), dir.clone().normalize());
	_xm.compose(p.clone ? p.clone() : V3(...p), _xq, Array.isArray(s) ? V3(...s) : V3(s, s, s));
	return geo.applyMatrix4(_xm);
}
// place with a full basis: x, y, z axes
function basis(geo, p, x, y, z, s = 1) {
	_xm.makeBasis(x, y, z);
	_xm.scale(Array.isArray(s) ? V3(...s) : V3(s, s, s));
	_xm.setPosition(p);
	return geo.applyMatrix4(_xm);
}
const clean = (g) => {
	// mergeGeometries needs matching attributes: keep position, normal, uv on indexed geometry
	if (!g.index) {
		const n = g.attributes.position.count, idx = [];
		for (let i = 0; i < n; i++) idx.push(i);
		g.setIndex(idx);
	}
	for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
	if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
	return g;
};
const merge = (list) => (list.length ? mergeGeometries(list.map(clean), false) : null);
const cyl = (rt, rb, h, seg = 24, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
const hex = () => new THREE.CylinderGeometry(1, 1, 1, 6);
const lathe = (pts, seg = 32, p0 = 0, pl = TAU) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg, p0, pl);

// a parametric grid: f(i/nu, j/nv) → Vector3
function grid(nu, nv, f) {
	const pos = [], uv = [], idx = [];
	for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
		const v = f(i / nu, j / nv);
		pos.push(v.x, v.y, v.z);
		uv.push(i / nu, j / nv);
	}
	for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
		const a = i * (nv + 1) + j, b = a + nv + 1;
		idx.push(a, b, a + 1, b, b + 1, a + 1);
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
	g.setIndex(idx);
	g.computeVertexNormals();
	return g;
}

// bucketed parts: add(materialKey, geometry) and build one mesh per material
class Kit {
	constructor() { this.parts = {}; }
	add(mat, geo) { (this.parts[mat] = this.parts[mat] || []).push(geo); return this; }
	build(parent, cast = true) {
		const out = {};
		for (const [k, list] of Object.entries(this.parts)) {
			const m = new THREE.Mesh(merge(list), M[k]);
			m.castShadow = cast;
			m.receiveShadow = true;
			parent.add(m);
			out[k] = m;
		}
		return out;
	}
}

// ================================================================== 2. MACHINE
const root = new THREE.Group(); // turntable + hover
root.position.y = 0.08;
scene.add(root);

// --- head: a lathed ceramic skull on a graphite hub ---------------------------------
const head = new THREE.Group();
head.position.z = 0.02;
root.add(head);
const HEAD_PROFILE = [[0.15, 0.645], [0.188, 0.672], [0.21, 0.72], [0.217, 0.79], [0.21, 0.86], [0.19, 0.915], [0.155, 0.958], [0.11, 0.988], [0.05, 1.004], [0, 1.008]];
const headR = (y) => {
	for (let i = 1; i < HEAD_PROFILE.length; i++) {
		const [r0, y0] = HEAD_PROFILE[i - 1], [r1, y1] = HEAD_PROFILE[i];
		if (y <= y1) return lerp(r0, r1, (y - y0) / (y1 - y0));
	}
	return 0;
};
// The head shell splits down the middle into two halves that slide apart, each
// carrying its optic turret and that turret's worm drive.
M.headShell = new THREE.MeshPhysicalMaterial({ color: '#eceeea', roughness: 0.36, clearcoat: 0.7, clearcoatRoughness: 0.2, side: THREE.DoubleSide });
M.headIn = new THREE.MeshStandardMaterial({ color: '#b5bdc1', roughness: 0.75, side: THREE.DoubleSide });
M.copper = new THREE.MeshStandardMaterial({ color: '#b86a3c', roughness: 0.32, metalness: 1 });
const headHalves = [];
for (const side of [1, -1]) {
	const grp = new THREE.Group();
	head.add(grp);
	const p0 = side > 0 ? 0 : PI;
	const k = new Kit();
	k.add('headShell', lathe(HEAD_PROFILE, 40, p0, PI));
	k.add('headIn', lathe(HEAD_PROFILE.map(([r, y]) => [Math.max(0, r - 0.007), y]), 40, p0, PI));
	const arc = (y, r, a0, a1, rad) => {
		const pts = [];
		for (let i = 0; i <= 24; i++) { const a = lerp(a0, a1, i / 24); pts.push(V3(Math.sin(a) * r, y, Math.cos(a) * r)); }
		return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, rad, 8);
	};
	const meridian = (a, y0, y1, rad, off = 0.0008) => {
		const pts = [];
		for (let i = 0; i <= 24; i++) { const y = lerp(y0, y1, i / 24), r = headR(y) + off; pts.push(V3(Math.sin(a) * r, y, Math.cos(a) * r)); }
		return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, rad, 6);
	};
	// seam bands, and a flange along both split edges
	for (const y of [0.7, 0.872]) k.add('graphite', arc(y, headR(y) + 0.001, p0 + 0.01, p0 + PI - 0.01, 0.0045));
	for (const a of [p0 + 0.004, p0 + PI - 0.004]) k.add('alu', meridian(a, 0.65, 1.0, 0.0042, 0));
	k.add('graphite', meridian(p0 + PI / 2, 0.875, 0.985, 0.0035));
	// visor half with its sensor ports
	const v0 = side > 0 ? 0.006 : -0.85;
	k.add('glass', new THREE.CylinderGeometry(0.2185, 0.2165, 0.07, 32, 1, true, v0, 0.844).translate(0, 0.79, 0));
	k.add('alu', xf(new THREE.BoxGeometry(0.006, 0.078, 0.014), [Math.sin(0.86 * side) * 0.218, 0.79, Math.cos(0.86 * side) * 0.218], [0, 0.86 * side, 0]));
	for (const a of [0.24 * side, 0.58 * side]) {
		const n = V3(Math.sin(a), 0, Math.cos(a));
		const p = n.clone().multiplyScalar(0.219).add(V3(0, 0.79, 0));
		k.add('accOpt', along(new THREE.TorusGeometry(0.014, 0.0028, 8, 24).rotateX(PI / 2), p, n));
		k.add('glass', along(new THREE.SphereGeometry(0.012, 16, 8, 0, TAU, 0, PI / 2), p, n, [1, 0.6, 1]));
	}
	for (const y of [0.7, 0.872]) for (let i = 0; i < 8; i++) {
		const a = p0 + ((i + 0.5) / 8) * PI;
		if (y < 0.8 && Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.9) continue; // not across the visor
		const n = V3(Math.sin(a), 0, Math.cos(a));
		k.add('steel', along(hex(), n.clone().multiplyScalar(headR(y) + 0.002).add(V3(0, y + 0.012, 0)), n, [0.0055, 0.003, 0.0055]));
	}
	// the optic worm drive lives in this half: micro-motor, worm, bracket
	{
		const mp = V3(side * 0.118, 0.875, 0.02);
		k.add('graphite', xf(cyl(0.014, 0.014, 0.044, 20), [mp.x, mp.y, mp.z], [PI / 2, 0, 0]));
		k.add('copper', xf(cyl(0.0145, 0.0145, 0.008, 20), [mp.x, mp.y, mp.z - 0.024], [PI / 2, 0, 0]));
		k.add('accOpt', xf(cyl(0.0148, 0.0148, 0.004, 20), [mp.x, mp.y, mp.z + 0.012], [PI / 2, 0, 0]));
		k.add('alu', new THREE.BoxGeometry(0.03, 0.004, 0.05).translate(mp.x, mp.y - 0.016, mp.z));
		k.add('steel', xf(cyl(0.003, 0.003, 0.06, 8), [mp.x, mp.y, mp.z + 0.05], [PI / 2, 0, 0]));
	}
	const parts = k.build(grp);
	parts.headIn.castShadow = false;
	const worm = new THREE.Group();
	worm.position.set(side * 0.118, 0.875, 0.068);
	grp.add(worm);
	{
		const pts = [];
		for (let i = 0; i <= 80; i++) { const t = i / 80, a = t * TAU * 5; pts.push(V3(Math.cos(a) * 0.0065, Math.sin(a) * 0.0065, (t - 0.5) * 0.03)); }
		const wm = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.0022, 6), M.steel, worm);
		wm.castShadow = true;
		mesh(cyl(0.0045, 0.0045, 0.032, 10), M.alu, worm, [0, 0, 0], [PI / 2, 0, 0]);
	}
	headHalves.push({ grp, side, worm });
}

// fixed: the top hatch (a bearing cap on the drive column) and the hub
{
	const k = new Kit();
	k.add('alu', cyl(0.06, 0.066, 0.012, 48).translate(0, 1.0, 0));
	k.add('graphite', cyl(0.045, 0.045, 0.008, 40).translate(0, 1.009, 0));
	k.add('accBody', xf(new THREE.TorusGeometry(0.03, 0.003, 8, 32), [0, 1.014, 0], [PI / 2, 0, 0]));
	for (let i = 0; i < 6; i++) {
		const a = (i / 6) * TAU;
		k.add('steel', xf(hex(), [Math.cos(a) * 0.054, 1.007, Math.sin(a) * 0.054], [0, 0, 0], [0.0045, 0.003, 0.0045]));
	}
	k.add('graphite', cyl(0.168, 0.152, 0.07, 48).translate(0, 0.632, 0));
	k.add('graphite', cyl(0.11, 0.12, 0.024, 40).translate(0, 0.586, 0));
	for (let i = 0; i < 48; i++) {
		const a = (i / 48) * TAU;
		k.add('steel', xf(new THREE.BoxGeometry(0.012, 0.018, 0.014), [Math.cos(a) * 0.171, 0.66, Math.sin(a) * 0.171], [0, -a, 0]));
	}
	k.add('accBody', xf(new THREE.TorusGeometry(0.16, 0.007, 10, 64), [0, 0.6, 0], [PI / 2, 0, 0]));
	k.add('steel', xf(new THREE.TorusGeometry(0.17, 0.004, 8, 64), [0, 0.669, 0], [PI / 2, 0, 0]));
	// siphon gimbal servo with its linkage
	k.add('graphite', new THREE.BoxGeometry(0.036, 0.022, 0.03).translate(0.06, 0.705, 0.135));
	k.add('accJet', cyl(0.009, 0.009, 0.006, 16).translate(0.06, 0.719, 0.135));
	k.add('steel', along(cyl(0.0025, 0.0025, 1, 8), V3(0.042, 0.717, 0.16), V3(-0.036, -0.004, 0.05).normalize(), [1, 0.062, 1]));
	k.build(head);
}

// --- drivetrain inside the head -------------------------------------------------------
// Main motor → 4:1 planetary → crown gear (48 t) → eight bevel pinions (12 t), one per arm,
// each driving a tendon spool through a clutch. A timing belt (22 t → 32 t) takes the
// motor up to the jet pump. Every gear turns at its real ratio.
const DRV = { Zs: 12, Zp: 12, Zr: 36, Zc: 48, Zpin: 12, Zm: 22, Zpump: 32 };
DRV.planet = DRV.Zs / (DRV.Zs + DRV.Zr); // carrier turns per sun turn
function teeth(k, mat, r, h, t, n, y, inward = false, w = 0.5) {
	for (let i = 0; i < n; i++) {
		const a = (i / n) * TAU, rr = inward ? r - h / 2 : r + h / 2;
		k.add(mat, xf(new THREE.BoxGeometry(h, t, ((TAU * r) / n) * w), [Math.cos(a) * rr, y, Math.sin(a) * rr], [0, -a, 0]));
	}
}
const ringLathe = (rIn, rOut, y, h, seg = 64) => lathe([[rIn, y], [rOut, y], [rOut, y + h], [rIn, y + h], [rIn, y]], seg);
const drive = new THREE.Group();
head.add(drive);
const stages = { deck: new THREE.Group(), planet: new THREE.Group(), motor: new THREE.Group(), top: new THREE.Group() };
for (const g of Object.values(stages)) drive.add(g);
const spin = {}; // rotating parts

// deck: base plate, standoffs, crown gear, pinions, clutches and tendon spools
{
	const k = new Kit();
	k.add('graphite', cyl(0.165, 0.165, 0.01, 64).translate(0, 0.676, 0));
	for (let i = 0; i < 4; i++) {
		const a = (i / 4) * TAU + PI / 4;
		k.add('alu', cyl(0.0048, 0.0048, 0.225, 10).translate(Math.cos(a) * 0.1, 0.793, Math.sin(a) * 0.1));
		k.add('steel', xf(hex(), [Math.cos(a) * 0.1, 0.684, Math.sin(a) * 0.1], [0, 0, 0], [0.008, 0.006, 0.008]));
	}
	k.add('alu', cyl(0.008, 0.008, 0.29, 12).translate(0, 0.82, 0)); // main shaft
	// two coolant lines and a harness down the side
	for (const s of [1, -1]) {
		const c = new THREE.CatmullRomCurve3([V3(s * 0.1, 0.845, 0.02), V3(s * 0.135, 0.8, 0.0), V3(s * 0.14, 0.72, -0.03), V3(s * 0.12, 0.684, -0.06)]);
		k.add('copper', new THREE.TubeGeometry(c, 30, 0.0035, 8));
	}
	const cols = ['accBody', 'graphite', 'graphite', 'white'];
	for (let i = 0; i < 4; i++) {
		const a = -PI / 2 - 0.25 + i * 0.16;
		const c = new THREE.CatmullRomCurve3([V3(Math.cos(a) * 0.09, 0.905, Math.sin(a) * 0.09), V3(Math.cos(a) * 0.125, 0.84, Math.sin(a) * 0.125), V3(Math.cos(a) * 0.13, 0.74, Math.sin(a) * 0.13), V3(Math.cos(a) * 0.15, 0.684, Math.sin(a) * 0.15)]);
		k.add(cols[i], new THREE.TubeGeometry(c, 30, 0.0028, 6));
	}
	k.build(stages.deck);
	const crown = new THREE.Group();
	stages.deck.add(crown);
	const kc = new Kit();
	kc.add('alu', cyl(0.118, 0.12, 0.014, 72).translate(0, 0.69, 0));
	kc.add('steel', ringLathe(0.096, 0.12, 0.697, 0.004, 72));
	for (let i = 0; i < DRV.Zc; i++) {
		const a = (i / DRV.Zc) * TAU;
		kc.add('steel', xf(new THREE.BoxGeometry(0.022, 0.008, 0.006), [Math.cos(a) * 0.108, 0.704, Math.sin(a) * 0.108], [0, -a, 0]));
	}
	for (let i = 0; i < 6; i++) {
		const a = (i / 6) * TAU;
		kc.add('graphite', xf(new THREE.BoxGeometry(0.05, 0.016, 0.012), [Math.cos(a) * 0.058, 0.69, Math.sin(a) * 0.058], [0, -a, 0]));
	}
	kc.add('accBody', cyl(0.028, 0.028, 0.02, 32).translate(0, 0.697, 0));
	kc.build(crown);
	spin.crown = crown;
	spin.pinions = [];
	spin.spools = [];
	for (let a = 0; a < 8; a++) {
		const ang = ARM_ANGLES[a];
		const dir = V3(Math.cos(ang), 0, Math.sin(ang));
		const holder = new THREE.Group();
		holder.position.set(0, 0.718, 0);
		holder.quaternion.setFromUnitVectors(V3(0, 1, 0), dir);
		stages.deck.add(holder);
		// in holder space +Y is radial
		const pin = new THREE.Group();
		pin.position.y = 0.108;
		holder.add(pin);
		const kp = new Kit();
		kp.add('steel', cyl(0.011, 0.017, 0.016, 24));
		teeth(kp, 'steel', 0.014, 0.006, 0.014, DRV.Zpin, 0, false, 0.5);
		kp.build(pin);
		spin.pinions.push(pin);
		const ks = new Kit();
		ks.add('alu', cyl(0.0042, 0.0042, 0.06, 10).translate(0, 0.14, 0));
		ks.add('alu', ringLathe(0.006, 0.012, 0.118, 0.008, 20)); // bearing block
		ks.add('graphite', new THREE.BoxGeometry(0.03, 0.012, 0.03).translate(0, 0.122, 0.0));
		ks.build(holder);
		const spool = new THREE.Group();
		spool.position.y = 0.152;
		holder.add(spool);
		const kq = new Kit();
		kq.add('accArm', cyl(0.015, 0.015, 0.005, 24).translate(0, -0.012, 0)); // clutch plate
		kq.add('graphite', cyl(0.009, 0.009, 0.018, 20));
		kq.add('alu', cyl(0.014, 0.014, 0.003, 20).translate(0, 0.0095, 0));
		kq.add('alu', cyl(0.014, 0.014, 0.003, 20).translate(0, -0.0085, 0));
		kq.add('white', xf(new THREE.TorusGeometry(0.0105, 0.0022, 6, 20), [0, 0.003, 0], [PI / 2, 0, 0]));
		kq.add('white', xf(new THREE.TorusGeometry(0.0105, 0.0022, 6, 20), [0, -0.003, 0], [PI / 2, 0, 0]));
		kq.add('accBody', new THREE.BoxGeometry(0.004, 0.016, 0.004).translate(0.0125, 0, 0)); // index mark
		kq.build(spool);
		spin.spools.push(spool);
	}
}
const aSpool = anchor(stages.deck, [0, 0.72, 0]);

// planetary: fixed ring gear, carrier with three planets, sun on the motor shaft
{
	const k = new Kit();
	k.add('steel', ringLathe(0.072, 0.088, 0.752, 0.028, 72));
	teeth(k, 'steel', 0.072, 0.008, 0.024, DRV.Zr, 0.766, true, 0.5);
	for (let i = 0; i < 6; i++) {
		const a = (i / 6) * TAU;
		k.add('steel', xf(hex(), [Math.cos(a) * 0.082, 0.782, Math.sin(a) * 0.082], [0, 0, 0], [0.0045, 0.003, 0.0045]));
	}
	k.build(stages.planet);
	const carrier = new THREE.Group();
	stages.planet.add(carrier);
	const kc = new Kit();
	kc.add('accJet', cyl(0.064, 0.064, 0.006, 48).translate(0, 0.748, 0));
	kc.add('accJet', cyl(0.02, 0.02, 0.04, 24).translate(0, 0.73, 0));
	kc.build(carrier);
	spin.carrier = carrier;
	spin.planets = [];
	for (let i = 0; i < 3; i++) {
		const a = (i / 3) * TAU;
		const p = new THREE.Group();
		p.position.set(Math.cos(a) * 0.046, 0.766, Math.sin(a) * 0.046);
		carrier.add(p);
		const kp = new Kit();
		kp.add('alu', cyl(0.016, 0.016, 0.02, 24));
		teeth(kp, 'alu', 0.016, 0.006, 0.02, DRV.Zp, 0, false, 0.5);
		kp.add('graphite', cyl(0.005, 0.005, 0.03, 10));
		kp.build(p);
		spin.planets.push(p);
	}
	const sun = new THREE.Group();
	stages.planet.add(sun);
	const ku = new Kit();
	ku.add('copper', cyl(0.018, 0.018, 0.022, 24).translate(0, 0.766, 0));
	teeth(ku, 'copper', 0.018, 0.006, 0.022, DRV.Zs, 0.766, false, 0.5);
	ku.build(sun);
	spin.sun = sun;
}
const aPlanet = anchor(stages.planet, [0.088, 0.766, 0]);

// motor: stator with twelve copper windings inside an outer-rotor bell with magnets
{
	const k = new Kit();
	k.add('graphite', cyl(0.046, 0.046, 0.066, 36).translate(0, 0.845, 0));
	for (let i = 0; i < 12; i++) {
		const a = (i / 12) * TAU;
		k.add('copper', xf(new THREE.BoxGeometry(0.02, 0.058, 0.019), [Math.cos(a) * 0.057, 0.845, Math.sin(a) * 0.057], [0, -a, 0]));
		k.add('graphite', xf(new THREE.BoxGeometry(0.006, 0.066, 0.023), [Math.cos(a) * 0.069, 0.845, Math.sin(a) * 0.069], [0, -a, 0]));
	}
	k.add('accJet', xf(new THREE.TorusGeometry(0.047, 0.0035, 8, 40), [0, 0.879, 0], [PI / 2, 0, 0]));
	k.add('copper', xf(new THREE.TorusGeometry(0.102, 0.0035, 8, 64), [0, 0.845, 0], [PI / 2, 0, 0])); // coolant loop
	for (const s of [1, -1]) k.add('alu', cyl(0.006, 0.006, 0.012, 10).translate(s * 0.102, 0.845, 0.0));
	k.build(stages.motor);
	const rotor = new THREE.Group();
	stages.motor.add(rotor);
	const kr = new Kit();
	kr.add('alu', ringLathe(0.077, 0.087, 0.81, 0.006, 64));
	kr.add('alu', ringLathe(0.03, 0.087, 0.878, 0.005, 64));
	for (let i = 0; i < 8; i++) {
		const a = (i / 8) * TAU;
		kr.add('alu', xf(new THREE.BoxGeometry(0.008, 0.068, 0.012), [Math.cos(a) * 0.083, 0.847, Math.sin(a) * 0.083], [0, -a, 0]));
	}
	for (let i = 0; i < 16; i++) {
		const a = ((i + 0.5) / 16) * TAU;
		kr.add(i % 2 ? 'graphite' : 'steel', xf(new THREE.BoxGeometry(0.005, 0.054, 0.013), [Math.cos(a) * 0.077, 0.847, Math.sin(a) * 0.077], [0, -a, 0]));
	}
	kr.build(rotor);
	spin.rotor = rotor;
}
const aMotor = anchor(stages.motor, [0.09, 0.86, 0]);

// top: plate, encoder disc and read head, timing belt to the pump pulley
const PULLEY_M = 0.022, PULLEY_P = 0.032, PUMP_C = V3(0, 0.936, -0.12);
{
	const k = new Kit();
	k.add('alu', ringLathe(0.012, 0.112, 0.903, 0.006, 64));
	k.add('graphite', new THREE.BoxGeometry(0.016, 0.012, 0.012).translate(0.044, 0.92, 0));
	k.add('accOpt', new THREE.BoxGeometry(0.004, 0.004, 0.004).translate(0.037, 0.926, 0));
	k.add('steel', cyl(0.006, 0.006, 0.06, 10).translate(PUMP_C.x, PUMP_C.y + 0.03, PUMP_C.z)); // pump shaft
	k.add('alu', new THREE.BoxGeometry(0.03, 0.006, 0.05).translate(0, 0.909, -0.1));
	// toothed belt: round the two pulleys
	const pts = [];
	for (let i = 0; i <= 24; i++) { const a = (i / 24) * PI; pts.push(V3(Math.cos(a) * (PULLEY_M + 0.003), 0.936, Math.sin(a) * (PULLEY_M + 0.003))); }
	for (let i = 0; i < 24; i++) { const a = PI + (i / 24) * PI; pts.push(V3(Math.cos(a) * (PULLEY_P + 0.003), 0.936, PUMP_C.z + Math.sin(a) * (PULLEY_P + 0.003))); }
	k.add('rubber', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 120, 0.0035, 6, true));
	k.build(stages.top);
	const enc = new THREE.Group();
	stages.top.add(enc);
	const ke = new Kit();
	ke.add('glass', cyl(0.04, 0.04, 0.002, 48).translate(0, 0.92, 0));
	for (let i = 0; i < 32; i++) {
		const a = (i / 32) * TAU;
		ke.add('alu', xf(new THREE.BoxGeometry(0.008, 0.0025, 0.003), [Math.cos(a) * 0.035, 0.92, Math.sin(a) * 0.035], [0, -a, 0]));
	}
	ke.build(enc);
	spin.encoder = enc;
	const pulley = (r, z, n) => {
		const g = new THREE.Group();
		g.position.set(0, 0, z);
		stages.top.add(g);
		const kp = new Kit();
		kp.add('steel', cyl(r, r, 0.012, 32).translate(0, 0.936, 0));
		teeth(kp, 'steel', r, 0.003, 0.01, n, 0.936, false, 0.45);
		kp.add('accBody', cyl(r + 0.003, r + 0.003, 0.002, 32).translate(0, 0.943, 0));
		kp.add('accBody', cyl(r + 0.003, r + 0.003, 0.002, 32).translate(0, 0.929, 0));
		kp.build(g);
		return g;
	};
	spin.pulleyM = pulley(PULLEY_M, 0, DRV.Zm);
	spin.pulleyP = pulley(PULLEY_P, PUMP_C.z, DRV.Zpump);
}
const driveAng = { m: 0 };

// --- optic turrets: mount, housing, knurled ring, focus ring, lens barrel, iris --------
const optics = [];
for (const side of [1, -1]) {
	const dir = V3(side * 0.82, 0.42, 0.4).normalize();
	const g = new THREE.Group();
	const base = V3(side * 0.163, 0.9, 0.07);
	g.position.copy(base);
	g.quaternion.setFromUnitVectors(V3(0, 1, 0), dir);
	headHalves[side > 0 ? 0 : 1].grp.add(g);
	const k = new Kit();
	k.add('graphite', cyl(0.064, 0.07, 0.035, 48).translate(0, 0.0, 0));
	k.add('white', cyl(0.058, 0.062, 0.05, 48).translate(0, 0.04, 0));
	for (let i = 0; i < 8; i++) {
		const a = (i / 8) * TAU;
		k.add('steel', xf(hex(), [Math.cos(a) * 0.05, 0.066, Math.sin(a) * 0.05], [0, 0, 0], [0.004, 0.003, 0.004]));
	}
	for (let i = 0; i < 56; i++) {
		const a = (i / 56) * TAU;
		k.add('alu', xf(new THREE.BoxGeometry(0.0045, 0.016, 0.006), [Math.cos(a) * 0.058, 0.077, Math.sin(a) * 0.058], [0, -a, 0]));
	}
	k.add('alu', cyl(0.0565, 0.0565, 0.016, 56).translate(0, 0.077, 0));
	k.build(g);
	const lens = new THREE.Group(); // the part that unscrews
	lens.position.y = 0.085;
	g.add(lens);
	const kl = new Kit();
	kl.add('accOpt', cyl(0.056, 0.056, 0.012, 48).translate(0, 0.006, 0));
	kl.add('graphite', cyl(0.048, 0.052, 0.034, 48).translate(0, 0.028, 0));
	for (let t = 0; t < 4; t++) kl.add('steel', xf(new THREE.TorusGeometry(0.05, 0.0018, 6, 48), [0, -0.012 - t * 0.007, 0], [PI / 2, 0, 0]));
	kl.add('steel', cyl(0.047, 0.047, 0.03, 32, true).translate(0, -0.024, 0));
	kl.add('alu', xf(new THREE.TorusGeometry(0.044, 0.004, 8, 48), [0, 0.045, 0], [PI / 2, 0, 0]));
	kl.add('glass', xf(new THREE.SphereGeometry(0.042, 40, 16, 0, TAU, 0, PI / 2), [0, 0.04, 0], [0, 0, 0], [1, 0.42, 1]));
	kl.build(lens);
	const pupil = mesh(new THREE.CircleGeometry(0.009, 24), M.pupil, lens, [0, 0.0395, 0], [-PI / 2, 0, 0]);
	pupil.castShadow = false;
	const iris = new THREE.Group();
	iris.position.y = 0.038;
	lens.add(iris);
	const blades = [];
	for (let b = 0; b < 9; b++) {
		const piv = new THREE.Group();
		piv.rotation.y = (b / 9) * TAU;
		iris.add(piv);
		const bl = mesh(new THREE.BoxGeometry(0.026, 0.0015, 0.014), M.steel, piv, [0.028, 0, 0]);
		blades.push(bl);
	}
	const tip = anchor(lens, [0, 0.06, 0]);
	optics.push({ g, base, dir, lens, iris, blades, side, tip });
}

// --- siphon: gimbal, bellows, machined nozzle -------------------------------------
const siphon = new THREE.Group();
const SIPHON_BASE = V3(0, 0.705, 0.19);
const SIPHON_DIR = V3(0, -0.32, 1).normalize();
siphon.position.copy(SIPHON_BASE);
siphon.quaternion.setFromUnitVectors(V3(0, 1, 0), SIPHON_DIR);
head.add(siphon);
{
	const k = new Kit();
	k.add('graphite', cyl(0.05, 0.056, 0.02, 40).translate(0, 0, 0));
	k.add('steel', xf(new THREE.TorusGeometry(0.05, 0.005, 8, 48), [0, 0.014, 0], [PI / 2, 0, 0]));
	for (const s of [1, -1]) k.add('alu', xf(cyl(0.008, 0.008, 0.016, 12), [s * 0.054, 0.014, 0], [0, 0, PI / 2]));
	for (let i = 0; i < 7; i++) k.add('rubber', xf(new THREE.TorusGeometry(0.04 - i * 0.0012, 0.0062, 10, 36), [0, 0.03 + i * 0.0115, 0], [PI / 2, 0, 0]));
	k.add('rubber', cyl(0.034, 0.038, 0.08, 32).translate(0, 0.066, 0));
	k.add('alu', cyl(0.03, 0.037, 0.04, 40).translate(0, 0.122, 0));
	for (let i = 0; i < 4; i++) k.add('steel', xf(new THREE.BoxGeometry(0.006, 0.03, 0.004), [Math.cos(i * PI / 2) * 0.034, 0.122, Math.sin(i * PI / 2) * 0.034], [0, -i * PI / 2, 0]));
	k.build(siphon);
}
const nozzle = new THREE.Group(); // radius follows the slider
nozzle.position.y = 0.143;
siphon.add(nozzle);
const nozzleRing = mesh(new THREE.TorusGeometry(1, 0.18, 12, 48), M.accJet, nozzle, [0, 0, 0], [PI / 2, 0, 0]);
const nozzleBore = mesh(cyl(1, 1, 0.012, 40), M.graphite, nozzle, [0, -0.004, 0]);
const nozzleTip = anchor(siphon, [0, 0.15, 0]);

// --- beak: a three-claw gripper under the hub ----------------------------------------
const beak = new THREE.Group();
beak.position.set(0, 0.575, 0);
head.add(beak);
mesh(cyl(0.05, 0.042, 0.022, 32), M.steel, beak, [0, 0, 0]);
mesh(new THREE.TorusGeometry(0.045, 0.004, 8, 40), M.accBody, beak, [0, -0.008, 0], [PI / 2, 0, 0]);
const claws = [];
for (let i = 0; i < 3; i++) {
	const a = (i / 3) * TAU + PI / 6;
	const piv = new THREE.Group();
	piv.position.set(Math.cos(a) * 0.028, -0.012, Math.sin(a) * 0.028);
	piv.rotation.y = -a;
	beak.add(piv);
	const k = new Kit();
	// a claw: two machined segments that curve inwards, with a pin at the knuckle
	k.add('graphite', xf(new THREE.BoxGeometry(0.016, 0.05, 0.022), [0.004, -0.025, 0], [0, 0, 0.12]));
	k.add('graphite', xf(new THREE.BoxGeometry(0.013, 0.042, 0.018), [-0.004, -0.066, 0], [0, 0, -0.42]));
	k.add('steel', xf(cyl(0.006, 0.006, 0.026, 12), [0.001, -0.048, 0], [PI / 2, 0, 0]));
	k.add('accBody', xf(new THREE.ConeGeometry(0.008, 0.018, 12), [-0.015, -0.089, 0], [0, 0, -0.42 + PI]));
	k.build(piv);
	claws.push(piv);
}
const beakTip = anchor(beak, [0, -0.08, 0]);

// --- mantle: eight gores in two courses, the upper course hinges open like petals -----
const ML = 0.7, MR = 0.27;
// an egg: narrow where it meets the head, fullest two-thirds of the way back
const rM = (u) => MR * Math.pow(Math.sin(PI * (0.1 + 0.9 * Math.pow(u, 0.82))), 0.55) * (0.86 + 0.24 * u);
const SM = (u, phi, off = 0) => { const r = rM(u) + off; return V3(r * Math.sin(phi), u * ML, r * Math.cos(phi)); };
const mantleRoot = new THREE.Group();
const MANTLE_POS = V3(0, 0.93, -0.06);
mantleRoot.position.copy(MANTLE_POS);
mantleRoot.rotation.x = -1.0;
root.add(mantleRoot);
const mantleBreath = new THREE.Group(); // scaled radially by the contraction
mantleRoot.add(mantleBreath);

const GORES = 8, GAP = 0.024, U_SPLIT = 0.405, U_TOP = 0.935, T_SHELL = 0.011;
function shellPanel(kit, u0, u1, p0, p1) {
	const f = (fu, fv, off) => SM(lerp(u0, u1, fu), lerp(p0, p1, fv), off);
	kit.add('ceramic', grid(14, 10, (a, b) => f(a, b, 0)));
	kit.add('ceramic', grid(14, 10, (a, b) => f(a, b, -T_SHELL)));
	kit.add('ceramic', grid(1, 10, (a, b) => f(0, b, -T_SHELL * a)));
	kit.add('ceramic', grid(1, 10, (a, b) => f(1, b, -T_SHELL * a)));
	kit.add('ceramic', grid(14, 1, (a, b) => f(a, 0, -T_SHELL * b)));
	kit.add('ceramic', grid(14, 1, (a, b) => f(a, 1, -T_SHELL * b)));
	// a bolt in each corner
	for (const [fu, fv] of [[0.08, 0.12], [0.08, 0.88], [0.92, 0.12], [0.92, 0.88]]) {
		const u = lerp(u0, u1, fu), ph = lerp(p0, p1, fv);
		const n = V3(Math.sin(ph), 0.25 * (1 - 2 * u), Math.cos(ph)).normalize();
		kit.add('steel', along(hex(), SM(u, ph, 0.001), n, [0.0058, 0.0035, 0.0058]));
	}
}
const lowerPanels = [], petals = [];
for (let g = 0; g < GORES; g++) {
	const p0 = (g / GORES) * TAU + GAP, p1 = ((g + 1) / GORES) * TAU - GAP, pc = (p0 + p1) / 2;
	// lower course: fixed, with vents on the flanks
	{
		const grp = new THREE.Group();
		mantleBreath.add(grp);
		const k = new Kit();
		shellPanel(k, 0.035, U_SPLIT - 0.012, p0, p1);
		if (g === 2 || g === 5) {
			for (let j = 0; j < 6; j++) {
				const u = 0.14 + j * 0.032;
				const n = V3(Math.sin(pc), 0, Math.cos(pc)), t = V3(Math.cos(pc), 0, -Math.sin(pc));
				k.add('graphite', basis(new THREE.BoxGeometry(1, 1, 1), SM(u, pc, 0.0005), t, V3(0, 1, 0), n, [0.07, 0.008, 0.004]));
			}
		}
		k.build(grp);
		lowerPanels.push({ grp, n: V3(Math.sin(pc), 0, Math.cos(pc)) });
	}
	// upper course: a petal on a hinge with two knuckles and a linear actuator
	{
		const hinge = SM(U_SPLIT + 0.012, pc, -T_SHELL * 0.5);
		const axis = V3(Math.cos(pc), 0, -Math.sin(pc));
		const pivot = new THREE.Group();
		pivot.position.copy(hinge);
		mantleBreath.add(pivot);
		const k = new Kit();
		shellPanel(k, U_SPLIT + 0.012, U_TOP - 0.008, p0, p1);
		for (const fv of [0.25, 0.75]) {
			const ph = lerp(p0, p1, fv);
			k.add('alu', along(cyl(0.007, 0.007, 0.026, 16), SM(U_SPLIT + 0.012, ph, -T_SHELL * 0.5), V3(Math.cos(ph), 0, -Math.sin(ph))));
		}
		k.add('steel', along(cyl(0.006, 0.006, 0.012, 12), SM(0.56, pc, -T_SHELL - 0.006), V3(Math.cos(pc), 0, -Math.sin(pc))));
		const parts = Object.values(k.parts).flat();
		for (const geo of parts) geo.translate(-hinge.x, -hinge.y, -hinge.z);
		k.build(pivot);
		// actuator: barrel fixed on the frame, rod to a lug under the petal
		const barrel = mesh(cyl(0.008, 0.008, 1, 12), M.graphite, mantleBreath);
		const rod = mesh(cyl(0.0042, 0.0042, 1, 10), M.steel, mantleBreath);
		const collar = mesh(cyl(0.0095, 0.0095, 0.008, 12), M.accBody, mantleBreath);
		const base = SM(0.3, pc, -0.05);
		const lug = SM(0.56, pc, -T_SHELL - 0.006).sub(hinge);
		petals.push({ pivot, axis, base, lug, barrel, rod, collar, pc });
	}
}
// frame: ring frames and eight longerons that sit under the seams
{
	const k = new Kit();
	for (const u of [0.035, U_SPLIT, U_TOP]) k.add('steel', xf(new THREE.TorusGeometry(rM(u) - 0.014, 0.0075, 10, 80), [0, u * ML, 0], [PI / 2, 0, 0]));
	for (let g = 0; g < GORES; g++) {
		const ph = (g / GORES) * TAU;
		const pts = [];
		for (let i = 0; i <= 16; i++) pts.push(SM(lerp(0.035, U_TOP, i / 16), ph, -0.015));
		k.add('graphite', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.0085, 8));
	}
	// collar where the mantle meets the head
	k.add('accBody', xf(new THREE.TorusGeometry(rM(0.0) + 0.004, 0.009, 12, 64), [0, 0.004, 0], [PI / 2, 0, 0]));
	k.add('graphite', cyl(rM(0.03) + 0.002, rM(0) + 0.002, 0.026, 64, true).translate(0, 0.013, 0));
	k.build(mantleBreath);
}
// tip cap on a mast
const cap = new THREE.Group();
mantleBreath.add(cap);
{
	const k = new Kit();
	const pts = [];
	for (let i = 0; i <= 10; i++) { const u = lerp(U_TOP + 0.004, 1, i / 10); pts.push([rM(u) + 0.001, u * ML]); }
	pts.push([0, ML]);
	k.add('graphite', lathe(pts, 48));
	k.add('accBody', xf(new THREE.TorusGeometry(rM(U_TOP + 0.01) + 0.002, 0.004, 8, 48), [0, (U_TOP + 0.01) * ML, 0], [PI / 2, 0, 0]));
	k.add('glass', xf(new THREE.SphereGeometry(0.014, 16, 8, 0, TAU, 0, PI / 2), [0, ML - 0.002, 0], [0, 0, 0], [1, 0.7, 1]));
	k.build(cap);
}
const aMantle = anchor(mantleBreath, [0, ML * 0.66, MR * 0.92]);

// internals: pump column, two cell packs, a control board on a mast, the harness
const internals = new THREE.Group();
mantleRoot.add(internals);
const pump = new THREE.Group();
pump.position.y = 0.05;
internals.add(pump);
{
	const k = new Kit();
	k.add('alu', cyl(0.068, 0.072, 0.2, 48).translate(0, 0.1, 0));
	for (let i = 0; i < 9; i++) k.add('steel', cyl(0.086, 0.086, 0.005, 48).translate(0, 0.03 + i * 0.016, 0));
	k.add('accJet', cyl(0.074, 0.074, 0.014, 48).translate(0, 0.205, 0));
	for (let i = 0; i < 6; i++) {
		const a = (i / 6) * TAU;
		k.add('steel', xf(hex(), [Math.cos(a) * 0.062, 0.214, Math.sin(a) * 0.062], [0, 0, 0], [0.005, 0.004, 0.005]));
	}
	// impeller cage
	k.add('steel', xf(new THREE.TorusGeometry(0.062, 0.004, 8, 48), [0, 0.3, 0], [PI / 2, 0, 0]));
	for (let i = 0; i < 4; i++) {
		const a = (i / 4) * TAU + PI / 4;
		k.add('steel', cyl(0.0035, 0.0035, 0.09, 8).translate(Math.cos(a) * 0.062, 0.257, Math.sin(a) * 0.062));
	}
	k.add('graphite', cyl(0.014, 0.014, 0.1, 16).translate(0, 0.26, 0));
	k.build(pump);
}
const impeller = new THREE.Group();
impeller.position.y = 0.27;
pump.add(impeller);
for (let b = 0; b < 7; b++) {
	const bl = mesh(new THREE.BoxGeometry(0.05, 0.05, 0.004), M.white, impeller, [0, 0, 0], [0, (b / 7) * TAU, 0.5]);
	bl.position.set(Math.cos((b / 7) * TAU) * 0.0, 0, 0);
	bl.geometry.translate(0.03, 0, 0);
	bl.castShadow = true;
}
const aPump = anchor(pump, [0.075, 0.2, 0]);

const packs = [];
for (const s of [1, -1]) {
	const g = new THREE.Group();
	g.position.set(s * 0.1, 0.4, -0.01);
	internals.add(g);
	const k = new Kit();
	for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
		const x = (i - 1) * 0.034, z = (j - 1) * 0.034;
		k.add('cell', cyl(0.016, 0.016, 0.13, 20).translate(x, 0.065, z));
		k.add('steel', cyl(0.011, 0.011, 0.006, 16).translate(x, 0.133, z));
	}
	k.add('graphite', new THREE.BoxGeometry(0.11, 0.012, 0.11).translate(0, -0.004, 0));
	for (const y of [0.03, 0.1]) k.add('accBody', new THREE.BoxGeometry(0.108, 0.01, 0.108).translate(0, y, 0));
	k.add('alu', new THREE.BoxGeometry(0.106, 0.006, 0.106).translate(0, 0.138, 0));
	k.build(g);
	packs.push({ g, s });
}
const board = new THREE.Group();
board.position.y = 0.58;
internals.add(board);
{
	const k = new Kit();
	k.add('alu', cyl(0.007, 0.007, 0.5, 12).translate(0, -0.08, 0)); // mast
	k.add('board', new THREE.BoxGeometry(0.15, 0.004, 0.1));
	const r = rng(4);
	for (let i = 0; i < 9; i++) {
		const w = 0.01 + r() * 0.022, d = 0.01 + r() * 0.018;
		k.add(i % 4 === 0 ? 'alu' : 'graphite', new THREE.BoxGeometry(w, 0.004 + r() * 0.006, d).translate((r() - 0.5) * 0.12, 0.004, (r() - 0.5) * 0.07));
	}
	k.add('accBody', new THREE.BoxGeometry(0.02, 0.008, 0.012).translate(0.05, 0.006, 0.03));
	for (const [x, z] of [[-0.068, -0.043], [0.068, -0.043], [-0.068, 0.043], [0.068, 0.043]]) k.add('steel', cyl(0.004, 0.004, 0.012, 8).translate(x, -0.006, z));
	k.build(board);
}
{
	// harness: bundled cables along the frame, with clips
	const k = new Kit();
	const r = rng(11);
	const cols = ['accBody', 'graphite', 'steel', 'white', 'graphite', 'accBody', 'graphite', 'white', 'steel', 'graphite', 'graphite', 'accBody'];
	for (let i = 0; i < 9; i++) {
		const a = (i / 9) * TAU + r() * 0.15;
		const pts = [];
		const toBoard = i % 3 === 0;
		const uEnd = toBoard ? 0.78 : 0.55;
		for (let s = 0; s <= 6; s++) {
			const u = lerp(0.04, uEnd, s / 6);
			const inward = toBoard && s === 6 ? 0.06 : 0.026 + 0.004 * Math.sin(s + i);
			const p = SM(u, a, -inward);
			pts.push(p);
		}
		if (!toBoard) pts.push(V3(Math.sign(Math.sin(a) || 1) * 0.1, 0.46, -0.01));
		else pts.push(V3(0, 0.58, 0));
		const curve = new THREE.CatmullRomCurve3(pts);
		k.add(cols[i], new THREE.TubeGeometry(curve, 60, 0.0042 + r() * 0.0018, 6));
		for (const f of [0.25, 0.5]) {
			const p = curve.getPointAt(f), t = curve.getTangentAt(f);
			k.add('alu', along(cyl(0.0075, 0.0075, 0.006, 10), p, t));
		}
	}
	const parts = k.build(internals);
	for (const m of Object.values(parts)) m.castShadow = false;
}

// --- arms: 8 × 25 machined links. Every link is one module scaled down the arm --------
const NA = 8, N = P.N;
const LINK_LEN = 1.15; // link pitch in units of its own radius
function linkKit() {
	const k = new Kit();
	// ceramic shell with chamfered ends and a groove
	k.add('white', lathe([[0, 0.07], [0.76, 0.07], [0.92, 0.13], [1, 0.25], [1, 0.48], [0.97, 0.52], [0.97, 0.58], [1, 0.62], [1, 0.74], [0.9, 0.88], [0.7, 0.95], [0, 0.95]], 28));
	// knuckle and the pin through it, along the bend axis (x)
	k.add('rubber', cyl(0.7, 0.7, 0.36, 24).translate(0, 1.07, 0));
	k.add('steel', xf(cyl(0.17, 0.17, 1.86, 16), [0, 1.07, 0], [0, 0, PI / 2]));
	for (const s of [1, -1]) {
		// clevis cheeks
		k.add('alu', xf(cyl(0.33, 0.33, 0.1, 20), [s * 0.86, 1.07, 0], [0, 0, PI / 2]));
		k.add('alu', new THREE.BoxGeometry(0.1, 0.42, 0.66).translate(s * 0.86, 0.86, 0));
		k.add('accArm', xf(cyl(0.2, 0.2, 0.08, 6), [s * 0.95, 1.07, 0], [0, 0, PI / 2]));
	}
	// tendon guide on the back of each link
	k.add('graphite', new THREE.BoxGeometry(0.26, 0.6, 0.14).translate(0, 0.5, 0.98));
	k.add('steel', xf(cyl(0.06, 0.06, 0.62, 8), [0, 0.5, 1.06], [0, 0, 0]));
	// two rows of suction cups on the underside (−z), like a real arm: a stalk, a flared
	// silicone cup with a rolled rim, a dark hollow and a steel vacuum port in the middle
	const cup = [[0, 0], [0.19, 0], [0.19, 0.16], [0.26, 0.2], [0.34, 0.27], [0.39, 0.36], [0.4, 0.42], [0.37, 0.46], [0.32, 0.44], [0.27, 0.38], [0.2, 0.34], [0, 0.33]];
	for (const sx of [1, -1]) {
		const dir = V3(sx * 0.32, 0, -1).normalize();
		const base = V3(sx * 0.4, 0.5, -0.84);
		k.add('sucker', along(lathe(cup, 24), base, dir));
		k.add('graphite', along(new THREE.CircleGeometry(0.25, 24).rotateX(-PI / 2), base.clone().addScaledVector(dir, 0.335), dir));
		k.add('steel', along(cyl(0.07, 0.07, 0.03, 12), base.clone().addScaledVector(dir, 0.34), dir));
		k.add('steel', along(new THREE.TorusGeometry(0.385, 0.028, 6, 28).rotateX(PI / 2), base.clone().addScaledVector(dir, 0.43), dir));
	}
	return k;
}
const linkMeshes = [];
const sharedMatrix = new THREE.InstancedBufferAttribute(new Float32Array(NA * N * 16), 16);
sharedMatrix.setUsage(THREE.DynamicDrawUsage);
{
	const k = linkKit();
	for (const [mat, list] of Object.entries(k.parts)) {
		const im = new THREE.InstancedMesh(merge(list), M[mat], NA * N);
		im.instanceMatrix = sharedMatrix;
		im.castShadow = true;
		im.receiveShadow = true;
		im.frustumCulled = false;
		root.add(im);
		linkMeshes.push(im);
		if (mat === 'white') linkMeshes.white = im;
	}
}
// servo pod at each arm root: housing, fin stack, end cap, bracket
const podMatrix = new THREE.InstancedBufferAttribute(new Float32Array(NA * 16), 16);
podMatrix.setUsage(THREE.DynamicDrawUsage);
const POD_LEN = 0.085;
{
	const k = new Kit();
	k.add('white', cyl(0.05, 0.056, 0.05, 32).translate(0, 0.028, 0));
	for (let i = 0; i < 5; i++) k.add('alu', cyl(0.059, 0.059, 0.0035, 32).translate(0, 0.008 + i * 0.01, 0));
	k.add('accArm', cyl(0.052, 0.05, 0.012, 32).translate(0, 0.06, 0));
	k.add('graphite', cyl(0.042, 0.048, 0.03, 32).translate(0, 0.078, 0));
	k.add('graphite', new THREE.BoxGeometry(0.03, 0.04, 0.09).translate(0, -0.01, 0));
	for (let i = 0; i < 6; i++) {
		const a = (i / 6) * TAU;
		k.add('steel', xf(hex(), [Math.cos(a) * 0.044, 0.067, Math.sin(a) * 0.044], [0, 0, 0], [0.0045, 0.004, 0.0045]));
	}
	for (const [mat, list] of Object.entries(k.parts)) {
		const im = new THREE.InstancedMesh(merge(list), M[mat], NA);
		im.instanceMatrix = podMatrix;
		im.castShadow = true;
		im.receiveShadow = true;
		im.frustumCulled = false;
		root.add(im);
	}
}

const LINK_WHITE = new THREE.Color('#ffffff');
const LINK_GHOST = new THREE.Color('#9ea8ad');
const tmpC = new THREE.Color();
function paintLinks(iso) {
	const im = linkMeshes.white;
	for (let a = 0; a < NA; a++) for (let i = 0; i < N; i++) {
		const c = tmpC.copy(LINK_WHITE);
		if (iso > 0.001 && a !== ARM_R2) c.lerp(LINK_GHOST, iso * 0.8);
		im.setColorAt(a * N + i, c);
	}
	im.instanceColor.needsUpdate = true;
}
paintLinks(0);
const armTips = [];
for (let a = 0; a < NA; a++) armTips.push(new THREE.Vector3());

const UP = new THREE.Vector3(0, 1, 0);
const FLOW = new THREE.Vector3(1, 0, 0.25).normalize(); // direction the water current runs
const _d = V3(), _k = V3(), _z = V3(), _p = V3(), _rhat = V3(), _m = new THREE.Matrix4();
const suckAt = V3();
const SUCK_ARM = ARM_NAMES.indexOf('L1');
const VIS = 0.12; // rotating parts are drawn at 12 % of real speed so the teeth stay readable
const LINK_Q = Math.pow(P.armR1 / P.armR0, 1 / (N - 1));

function poseArms(t, jet, u, explode, iso, curls) {
	for (let a = 0; a < NA; a++) {
		const ang = ARM_ANGLES[a];
		_rhat.set(Math.cos(ang), 0, Math.sin(ang));
		const curl = curls[a] * P.maxCurl;
		const out = 0.34 * explode + (a === ARM_R2 ? 0.32 * iso : 0);
		_p.set(_rhat.x * (0.162 + out), 0.632 - 0.07 * explode - (a === ARM_R2 ? 0.02 * iso : 0), 0.02 + _rhat.z * (0.162 + out));
		// arms leave the hub between 14° (relaxed) and 66° (streamlined) below horizontal
		const drop = lerp(0.25, 0.85, jet) + (a === ARM_R2 ? -0.2 * iso : 0);
		_d.copy(_rhat).multiplyScalar(Math.cos(drop)).addScaledVector(UP, -Math.sin(drop)).normalize();
		_k.crossVectors(_rhat, UP).normalize(); // bend axis: positive curls the tip up and out
		// the servo pod
		_z.crossVectors(_k, _d);
		_m.makeBasis(_k, _d, _z).setPosition(_p);
		_m.toArray(podMatrix.array, a * 16);
		_p.addScaledVector(_d, POD_LEN);
		const ph = a * 0.79;
		let r = P.armR0;
		for (let i = 0; i < N; i++) {
			const s = i / (N - 1);
			// droop over the first half (bends down), curl over the outer half (bends up)
			const droop = -(1.05 - 0.6 * jet) * (1 - curls[a] * 0.4) * Math.max(0, 1 - s * 1.8) * 2.2 / N;
			const up = (curl / N) * (3.0 * Math.max(0, s - 0.3) ** 1.4 / 0.6);
			const wave = 0.06 * Math.sin(t * 2.3 - s * 5.4 + ph) * (0.3 + s);
			if (i > 0) _d.applyAxisAngle(_k, droop + up + wave);
			if (u > 0.001) {
				const flutter = 1 + 0.35 * Math.sin(t * (3 + u) + s * 6 + ph);
				_d.addScaledVector(FLOW, 0.022 * u * flutter * (0.2 + s)).normalize();
				_k.addScaledVector(_d, -_k.dot(_d)).normalize();
			}
			_z.crossVectors(_k, _d);
			_m.makeBasis(_k, _d, _z).scale(_z.set(r, r, r)).setPosition(_p);
			_m.toArray(sharedMatrix.array, (a * N + i) * 16);
			if (a === SUCK_ARM && i === 15) suckAt.set(0, 0.5, -1.2).applyMatrix4(_m);
			_p.addScaledVector(_d, r * LINK_LEN);
			r *= LINK_Q;
		}
		armTips[a].copy(_p);
	}
	sharedMatrix.needsUpdate = true;
	podMatrix.needsUpdate = true;
}

root.traverse((m) => { if (m.isMesh) { m.castShadow = m.castShadow !== false; m.receiveShadow = true; } });

// --- jet flow particles (world space) --------------------------------------------
const NP = 360;
const flowGeo = new THREE.BufferGeometry();
const flowPos = new Float32Array(NP * 3);
const flowSeed = [];
{
	const r = rng(21);
	for (let i = 0; i < NP; i++) flowSeed.push([r(), r() * TAU, r()]);
}
flowGeo.setAttribute('position', new THREE.BufferAttribute(flowPos, 3));
const flowMat = new THREE.PointsMaterial({ color: '#2b7fa3', size: 0.011, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true });
const flow = new THREE.Points(flowGeo, flowMat);
flow.frustumCulled = false;
scene.add(flow);
const _np = V3(), _nd = V3(), _a1 = V3(), _a2 = V3();

// ================================================================== post: ambient occlusion
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const gtao = new GTAOPass(scene, camera, 16, 16);
gtao.output = GTAOPass.OUTPUT.Default;
gtao.blendIntensity = 1.0;
gtao.updateGtaoMaterial({ radius: 0.09, distanceExponent: 1.6, thickness: 1.2, scale: 1.25, samples: 16, distanceFallOff: 1, screenSpaceRadius: false });
gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1, rings: 2, samples: 16 });
gtao.normalMaterial.side = THREE.DoubleSide; // thin shell panels need both faces in the depth/normal pass
composer.addPass(gtao);
composer.addPass(new OutputPass());

// ================================================================== 3. CONSOLE
const ui = {
	optics: false, head: false, mantle: false, arm: false, flow: true, beak: false, explode: false,
	current: 0, nozzleD: 0.038,
};
// jet x-ray is on when the page opens and whenever the tour resets
const DEFAULTS = { flow: true };
const anim = { optics: 0, head: 0, mantle: 0, arm: 0, flow: 1, beak: 0, explode: 0, turn: 0, turnTarget: 0 };
let phase = 0, simT = 0;
const hist = []; // [t, dP, F]

// arm bars
const barsEl = $('bars');
const barRefs = [];
{
	const order = ['L1', 'L2', 'L3', 'L4', 'R1', 'R2', 'R3', 'R4'];
	for (const name of order) {
		const a = ARM_NAMES.indexOf(name);
		const n = document.createElement('span'); n.className = 'n'; n.textContent = name;
		const t = document.createElement('span'); t.className = 't';
		const f = document.createElement('span'); f.className = 'f'; t.appendChild(f);
		const v = document.createElement('span'); v.className = 'v'; v.textContent = '0%';
		barsEl.append(n, t, v);
		barRefs.push({ a, f, v });
	}
}

// log
const logEl = $('log');
const fmtT = (t) => {
	const m = Math.floor(t / 60), s = t - m * 60;
	return 'T+' + String(m).padStart(2, '0') + ':' + s.toFixed(1).padStart(4, '0');
};
function log(msg) {
	const li = document.createElement('li');
	const em = document.createElement('em');
	em.textContent = fmtT(simT);
	li.append(em, document.createTextNode(msg));
	logEl.prepend(li);
	while (logEl.children.length > 14) logEl.lastChild.remove();
}

// actions shared by the visitor and the tour
const ACT = {
	optics: (on) => log(on ? 'OPTICS · lens unscrewed, iris cycling' : 'OPTICS · lens seated'),
	head: (on) => log(on ? 'HEAD OPEN · drivetrain exposed' : 'HEAD CLOSED'),
	mantle: (on) => log(on ? 'MANTLE OPEN · shell hinged, pump raised' : 'MANTLE SEALED'),
	arm: (on) => log(on ? 'ARM R2 APART · 25 links on the bench' : 'ARM R2 · re-seated on hub'),
	flow: (on) => log(on ? 'JET X-RAY · shell at 18 %, flow traced' : 'JET X-RAY off'),
	beak: (on) => log(on ? 'BEAK OPEN' : 'BEAK CLOSED'),
	explode: (on) => log(on ? 'EXPLODED · turntable 330°' : 'REASSEMBLED'),
};
function toggle(act, fromTour) {
	ui[act] = !ui[act];
	$('b-' + act).classList.toggle('on', ui[act]);
	if (act === 'explode') {
		anim.turnTarget = ui.explode ? 330 : 360;
		// dolly out so the exploded machine still fits the view
		const dist = camera.position.distanceTo(controls.target);
		if (ui.explode && dist < 5) {
			const dir = camera.position.clone().sub(controls.target).normalize();
			const t1 = new THREE.Vector3(0, 0.95, 0);
			camTween = { t: 0, dur: 1.4, p0: camera.position.clone(), t0: controls.target.clone(), p1: t1.clone().addScaledVector(dir, 5.1), t1 };
		}
	}
	ACT[act](ui[act]);
	if (!fromTour) userInput();
}
document.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => toggle(b.dataset.act, false)));

// camera views
const VIEWS = {
	hero: { p: [2.2, 1.3, 2.8], t: [0, 0.8, 0] },
	front: { p: [0, 1.0, 3.3], t: [0, 0.84, 0] },
	side: { p: [3.3, 1.05, 0.15], t: [0, 0.86, 0] },
	top: { p: [0.05, 3.6, 0.6], t: [0, 0.7, 0] },
	under: { p: [1.35, 0.22, 1.85], t: [0, 0.66, 0] },
	suckers: { p: [0.75, 0.3, 1.15], t: [0.3, 0.5, 0.35] }, // tour only: close on the cups
	drive: { p: [0.55, 1.3, 1.55], t: [0, 0.8, 0.0] }, // tour only: into the open head
	rear: { p: [-1.95, 2.35, -2.2], t: [0, 0.98, -0.28] }, // tour only: looks into the open mantle
};
let camTween = null;
function setView(name, fromTour) {
	const v = VIEWS[name];
	camTween = { t: 0, dur: 1.6, p0: camera.position.clone(), t0: controls.target.clone(), p1: new THREE.Vector3(...v.p), t1: new THREE.Vector3(...v.t) };
	document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === name));
	log('VIEW · ' + name.toUpperCase());
	if (!fromTour) userInput();
}
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view, false)));

// sliders
const slCur = $('slCur'), slNoz = $('slNoz');
function readSliders() {
	ui.current = parseFloat(slCur.value);
	ui.nozzleD = parseFloat(slNoz.value) / 1000;
	$('oCur').textContent = ui.current.toFixed(2) + ' m/s';
	$('oNoz').textContent = Math.round(ui.nozzleD * 1000) + ' mm';
}
slCur.addEventListener('input', () => { readSliders(); userInput(); });
slNoz.addEventListener('input', () => { readSliders(); userInput(); });
slCur.addEventListener('change', () => log('CURRENT → ' + ui.current.toFixed(2) + ' m/s'));
slNoz.addEventListener('change', () => log('NOZZLE → Ø' + Math.round(ui.nozzleD * 1000) + ' mm'));
readSliders();

$('b-hud').addEventListener('click', () => { document.body.classList.toggle('hide-hud'); userInput(); });
$('lang').addEventListener('click', () => { lang = lang === 'zh' ? 'en' : 'zh'; applyLang(); userInput(); });

// canvases
function fitCanvas(cv) {
	const r = cv.getBoundingClientRect();
	const dpr = Math.min(window.devicePixelRatio || 1, 2);
	const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
	if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
	const g = cv.getContext('2d');
	g.setTransform(dpr, 0, 0, dpr, 0, 0);
	return { g, w: r.width, h: r.height };
}
const css = getComputedStyle(document.documentElement);
const COL = {
	ink: css.getPropertyValue('--ink').trim() || '#1b2226',
	muted: css.getPropertyValue('--muted').trim() || '#5f6b73',
	faint: css.getPropertyValue('--faint').trim() || '#8a959c',
	line: css.getPropertyValue('--line').trim() || '#c4cdd2',
	accent: css.getPropertyValue('--accent').trim() || '#ee5f1d',
	water: css.getPropertyValue('--water').trim() || '#2b7fa3',
	warn: css.getPropertyValue('--warn').trim() || '#b7322a',
};
const MONO = '10px "JetBrains Mono", ui-monospace, monospace';

const WIN = 3.0;
function drawJetChart(S) {
	const cv = $('chartJet');
	if (!cv.offsetParent) return;
	const { g, w, h } = fitCanvas(cv);
	g.clearRect(0, 0, w, h);
	const L = 30, R = w - 4, lanes = [{ y0: 4, y1: h * 0.54, key: 1, unit: 'kPa', max: Math.max(10, S.cyc.peakP / 1000 * 1.15), min: -2, col: COL.accent, k: 1 / 1000 },
		{ y0: h * 0.62, y1: h - 12, key: 2, unit: 'N', max: Math.max(20, S.cyc.peakF * 1.15), min: 0, col: COL.ink, k: 1 }];
	g.font = MONO;
	g.textBaseline = 'middle';
	for (const ln of lanes) {
		const Y = (v) => ln.y1 - ((v - ln.min) / (ln.max - ln.min)) * (ln.y1 - ln.y0);
		g.strokeStyle = COL.line;
		g.lineWidth = 1;
		g.beginPath();
		for (const f of [0, 0.5, 1]) {
			const v = ln.min + (ln.max - ln.min) * f;
			g.moveTo(L, Math.round(Y(v)) + 0.5); g.lineTo(R, Math.round(Y(v)) + 0.5);
		}
		g.stroke();
		g.fillStyle = COL.faint;
		g.textAlign = 'right';
		g.fillText(Math.round(ln.max) + '', L - 4, Y(ln.max));
		g.fillText(ln.unit, L - 4, Y(ln.min + (ln.max - ln.min) * 0.5));
		g.fillText(ln.min + '', L - 4, Y(ln.min));
		if (hist.length < 2) continue;
		const X = (t) => R - ((simT - t) / WIN) * (R - L);
		g.beginPath();
		let started = false;
		for (const s of hist) {
			if (simT - s[0] > WIN) continue;
			const x = X(s[0]), y = Y(clamp(s[ln.key] * ln.k, ln.min, ln.max));
			if (!started) { g.moveTo(x, Y(Math.max(0, ln.min))); g.lineTo(x, y); started = true; } else g.lineTo(x, y);
		}
		const last = hist[hist.length - 1];
		g.lineTo(X(last[0]), Y(Math.max(0, ln.min)));
		g.closePath();
		g.fillStyle = ln.key === 1 ? 'rgba(238,95,29,0.14)' : 'rgba(27,34,38,0.08)';
		g.fill();
		g.beginPath();
		started = false;
		for (const s of hist) {
			if (simT - s[0] > WIN) continue;
			const x = X(s[0]), y = Y(clamp(s[ln.key] * ln.k, ln.min, ln.max));
			if (!started) { g.moveTo(x, y); started = true; } else g.lineTo(x, y);
		}
		g.strokeStyle = ln.col;
		g.lineWidth = 1.5;
		g.stroke();
		const ly = Y(clamp(last[ln.key] * ln.k, ln.min, ln.max));
		g.fillStyle = ln.col;
		g.beginPath(); g.arc(X(last[0]), ly, 3, 0, TAU); g.fill();
		// pump limit line on the pressure lane
		if (ln.key === 1 && P.pumpMaxP / 1000 < ln.max) {
			g.setLineDash([3, 3]); g.strokeStyle = COL.warn; g.beginPath();
			g.moveTo(L, Y(P.pumpMaxP / 1000)); g.lineTo(R, Y(P.pumpMaxP / 1000)); g.stroke(); g.setLineDash([]);
		}
	}
	g.fillStyle = COL.faint;
	g.textAlign = 'left';
	g.fillText('ΔP', L + 4, 10);
	g.fillText('F', L + 4, h * 0.62 + 6);
	g.textAlign = 'right';
	g.fillText('−' + WIN.toFixed(0) + ' s', L + 26, h - 4);
	g.fillText('now', R, h - 4);
}

function drawSection(S) {
	const cv = $('schem');
	if (!cv.offsetParent) return;
	const { g, w, h } = fitCanvas(cv);
	g.clearRect(0, 0, w, h);
	const cx = w * 0.56, cy = h * 0.46, rx = w * 0.36, ry0 = h * 0.3;
	const k = S.rScale; // radius factor from the model
	const ry = ry0 * k;
	// shell outline (fixed), cavity (breathes)
	g.lineWidth = 1.2;
	g.strokeStyle = COL.line;
	g.beginPath(); g.ellipse(cx, cy, rx + 6, ry0 + 6, 0, 0, TAU); g.stroke();
	g.fillStyle = 'rgba(43,127,163,' + (0.1 + 0.18 * (1 - S.jet.expelled / S.cyc.dV)) + ')';
	g.strokeStyle = COL.ink;
	g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, TAU); g.fill(); g.stroke();
	// siphon tube to the left
	const sx = cx - rx, sy = cy + ry * 0.35;
	const noz = clamp(S.d * 260, 4, 16);
	g.fillStyle = COL.ink;
	g.beginPath();
	g.moveTo(sx + 4, sy - noz * 0.7); g.lineTo(sx - 34, sy - noz / 2); g.lineTo(sx - 34, sy + noz / 2); g.lineTo(sx + 4, sy + noz * 0.7); g.closePath(); g.fill();
	g.fillStyle = COL.accent;
	g.fillRect(sx - 38, sy - noz / 2 - 1, 4, noz + 2);
	// flow arrows
	g.strokeStyle = COL.water;
	g.fillStyle = COL.water;
	g.lineWidth = 1.5;
	if (S.jet.contracting) {
		const n = 4, sp = S.jet.v;
		for (let i = 0; i < n; i++) {
			const off = ((simT * sp * 18 + i * 14) % 56);
			const x = sx - 40 - off;
			if (x < 4) continue;
			g.globalAlpha = clamp(S.jet.Q / S.cyc.Qp, 0.15, 1);
			g.beginPath(); g.moveTo(x + 10, sy); g.lineTo(x, sy); g.stroke();
			g.beginPath(); g.moveTo(x - 4, sy); g.lineTo(x + 2, sy - 3); g.lineTo(x + 2, sy + 3); g.fill();
		}
		g.globalAlpha = 1;
	} else {
		for (let i = 0; i < 3; i++) {
			const off = ((simT * 20 + i * 9) % 26);
			const x = cx - rx * 0.55 + i * 22, y = cy - ry0 - 22 + off;
			g.globalAlpha = 0.6;
			g.beginPath(); g.moveTo(x, y - 8); g.lineTo(x, y); g.stroke();
			g.beginPath(); g.moveTo(x, y + 4); g.lineTo(x - 3, y - 2); g.lineTo(x + 3, y - 2); g.fill();
		}
		g.globalAlpha = 1;
	}
	// labels
	g.font = MONO;
	g.fillStyle = COL.ink;
	g.textAlign = 'center';
	g.textBaseline = 'middle';
	g.fillText('V ' + ((P.V0 - S.jet.expelled) * 1000).toFixed(2) + ' L', cx + rx * 0.15, cy - 6);
	g.fillStyle = COL.muted;
	g.fillText('r ×' + k.toFixed(3), cx + rx * 0.15, cy + 8);
	g.textAlign = 'left';
	g.fillText(S.jet.contracting ? 'JET  ' + S.jet.v.toFixed(1) + ' m/s' : 'REFILL', 4, h - 8);
	g.textAlign = 'right';
	g.fillText('Ø' + Math.round(S.d * 1000) + ' mm', w - 4, h - 8);
}

// callouts
const coLayer = $('callouts');
const coSvg = $('coLines');
const SVGNS = 'http://www.w3.org/2000/svg';
const CALLOUTS = [
	{ key: 'optics', name: 'OPTIC UNIT L', obj: () => optics[0].tip, dx: 1, dy: -0.9, val: (S) => 'iris f/' + S.fstop.toFixed(1) },
	{ key: 'mantle', name: 'MANTLE SHELL', when: () => anim.head < 0.4, obj: () => aMantle, dx: -1, dy: -0.7, val: (S) => 'r ×' + S.rScale.toFixed(3) + ' · ' + (anim.mantle > 0.5 ? 'OPEN' : 'SEALED') },
	{ key: 'pump', name: 'JET PUMP', obj: () => aPump, dx: -1.1, dy: 0.25, val: (S) => Math.round(S.rpm) + ' rpm', when: () => anim.mantle > 0.4 || anim.flow > 0.4 || anim.explode > 0.4 },
	{ key: 'flow', name: 'SIPHON', obj: () => nozzleTip, dx: 1, dy: 0.45, val: (S) => 'Ø' + Math.round(S.d * 1000) + ' · ' + S.jet.v.toFixed(1) + ' m/s' },
	{ key: 'arm', name: 'ARM R2', obj: () => ({ getWorldPosition: (v) => v.copy(armTips[ARM_R2]).applyMatrix4(root.matrixWorld) }), dx: -1, dy: 0.5, val: (S) => 'curl ' + Math.round(S.curls[ARM_R2] * 100) + ' %' },
	{ key: 'head', name: 'DRIVE MOTOR', obj: () => aMotor, dx: 1, dy: -0.75, val: (S) => Math.round(S.motorRpm) + ' rpm · 12 slots / 16 poles', when: () => anim.head > 0.4 || anim.explode > 0.4 },
	{ key: 'head', name: 'PLANETARY 4 : 1', obj: () => aPlanet, dx: 1, dy: 0.15, val: (S) => 'sun 12 · ring 36 · ' + Math.round(S.motorRpm * DRV.planet) + ' rpm', when: () => anim.head > 0.4 || anim.explode > 0.4 },
	{ key: 'head', name: 'TENDON SPOOLS ×8', obj: () => aSpool, dx: -1, dy: 0.55, val: (S) => 'crown 48 → pinion 12 · ' + Math.round(S.curls[0] * 100) + ' %', when: () => anim.head > 0.4 },
	{ key: 'suck', name: 'SUCKERS', obj: () => ({ getWorldPosition: (v) => v.copy(suckAt).applyMatrix4(root.matrixWorld) }), dx: -1, dy: -0.5, val: () => '2 × 25 per arm · 400' },
	{ key: 'beak', name: 'BEAK', obj: () => beakTip, dx: 0.9, dy: 0.9, val: () => (anim.beak > 0.5 ? 'OPEN' : 'CLOSED'), when: () => anim.beak > 0.3 || anim.explode > 0.3 },
];
for (const c of CALLOUTS) {
	c.line = document.createElementNS(SVGNS, 'line');
	c.dot = document.createElementNS(SVGNS, 'circle');
	c.dot.setAttribute('r', '3.5');
	coSvg.append(c.line, c.dot);
	c.el = document.createElement('div');
	c.el.className = 'co';
	c.el.innerHTML = '<b></b><span></span>';
	c.el.firstChild.textContent = c.name;
	coLayer.appendChild(c.el);
	c.sx = null; c.sy = null;
}
const _w = new THREE.Vector3();
let colL = 0, colR = 1e9, colT = 8, colB = 1e9;
function measureCols() {
	const l = document.querySelector('.col.left'), r = document.querySelector('.col.right');
	const hidden = document.body.classList.contains('hide-hud');
	colL = l && l.offsetParent && !hidden && window.innerWidth > 900 ? l.getBoundingClientRect().right + 10 : 8;
	colR = r && r.offsetParent && !hidden ? r.getBoundingClientRect().left - 10 : window.innerWidth - 8;
	const small = window.innerWidth <= 900;
	colT = small && l && !hidden ? l.getBoundingClientRect().bottom + 6 : 8;
	const dk = document.querySelector('.dock');
	colB = small && dk && !hidden ? dk.getBoundingClientRect().top - 6 : window.innerHeight - 8;
}
function drawCallouts(S, W, H, dt) {
	const small = W < 900;
	if (frameNo % 30 === 1) measureCols();
	const cxs = W / 2, cys = H * 0.45;
	for (const c of CALLOUTS) {
		const vis = (!c.when || c.when()) && !(small && (c.key === 'pump' || c.key === 'beak' || c.key === 'suck' || (c.key === 'head' && c.name !== 'DRIVE MOTOR')));
		c.obj().getWorldPosition(_w);
		_w.project(camera);
		const behind = _w.z > 1;
		const x = (_w.x * 0.5 + 0.5) * W, y = (-_w.y * 0.5 + 0.5) * H;
		const show = vis && !behind && x > 0 && x < W && y > 0 && y < H;
		c.el.style.opacity = show ? '1' : '0';
		c.line.style.opacity = c.dot.style.opacity = show ? '1' : '0';
		if (!show) continue;
		const reach = small ? 46 : 96;
		const lx = x + c.dx * reach, ly = y + c.dy * reach;
		// labels glide instead of jumping when the camera moves
		c.sx = c.sx == null ? lx : damp(c.sx, lx, 14, dt);
		c.sy = c.sy == null ? ly : damp(c.sy, ly, 14, dt);
		const bw = c.el.offsetWidth, bh = c.el.offsetHeight;
		let bx = c.dx > 0 ? c.sx : c.sx - bw;
		let by = c.sy - bh / 2;
		bx = clamp(bx, colL, colR - bw);
		by = clamp(by, colT, colB - bh);
		c.el.style.transform = `translate(${bx.toFixed(1)}px, ${by.toFixed(1)}px)`;
		c.el.lastChild.textContent = c.val(S);
		const hot = anim[c.key] > 0.5 || (c.key === 'flow' && S.jet.contracting) || (c.key === 'pump' && S.jet.contracting);
		c.el.classList.toggle('hot', hot);
		c.dot.classList.toggle('hot', hot);
		const ex = c.dx > 0 ? bx : bx + bw;
		c.line.setAttribute('x1', x.toFixed(1)); c.line.setAttribute('y1', y.toFixed(1));
		c.line.setAttribute('x2', ex.toFixed(1)); c.line.setAttribute('y2', (by + bh / 2).toFixed(1));
		c.dot.setAttribute('cx', x.toFixed(1)); c.dot.setAttribute('cy', y.toFixed(1));
	}
	void cxs; void cys;
}

// ================================================================== 4. TOUR
const cursor = $('cursor');
const BEATS = [
	{ t: 1.2, el: 'v-hero', go: () => setView('hero', true) },
	{ t: 3.4, el: 'b-optics', go: () => toggle('optics', true) },
	{ t: 5.0, el: 'b-head', go: () => toggle('head', true) },
	{ t: 5.8, el: null, go: () => setView('drive', true) },
	{ t: 10.6, el: 'b-head', go: () => toggle('head', true) },
	{ t: 11.6, el: 'v-hero', go: () => setView('hero', true) },
	{ t: 13.2, el: 'b-mantle', go: () => toggle('mantle', true) },
	{ t: 14.2, el: null, go: () => setView('rear', true) },
	{ t: 16.2, el: 'v-hero', go: () => setView('hero', true) },
	{ t: 16.8, el: 'b-arm', go: () => toggle('arm', true) },
	{ t: 20.4, el: 'b-arm', go: () => toggle('arm', true) },
	{ t: 23.8, el: 'v-side', go: () => setView('side', true) },
	{ t: 26.0, el: 'slCur', slide: [slCur, 2.0], dur: 1.6 },
	{ t: 30.6, el: 'slCur', slide: [slCur, 0], dur: 1.0 },
	{ t: 33.2, el: 'b-optics', go: () => toggle('optics', true) },
	{ t: 34.4, el: 'v-hero', go: () => setView('hero', true) },
	{ t: 35.6, el: 'b-explode', go: () => toggle('explode', true) },
	{ t: 43.2, el: 'b-explode', go: () => toggle('explode', true) },
	{ t: 44.8, el: 'b-mantle', go: () => toggle('mantle', true) },
	{ t: 46.0, el: 'b-beak', go: () => toggle('beak', true) },
	{ t: 47.6, el: 'v-under', go: () => setView('under', true) },
	{ t: 49.2, el: null, go: () => setView('suckers', true) },
	{ t: 50.6, el: 'b-beak', go: () => toggle('beak', true) },
	{ t: 51.8, el: 'v-top', go: () => setView('top', true) },
	{ t: 55.0, el: 'v-hero', go: () => setView('hero', true) },
];
const LOOP = 58.6;
const tour = { on: false, t: 0, i: 0, cx: 0, cy: 0, from: null, slide: null };
let lastInput = -1e9;
let clock = 0;

function setTourTag() {
	$('tourtxt').textContent = tour.on ? tr('tour') : tr('user');
	$('tourtag').classList.toggle('user', !tour.on);
}
function resetMachine() {
	for (const k of ['optics', 'head', 'mantle', 'arm', 'flow', 'beak', 'explode']) {
		ui[k] = !!DEFAULTS[k];
		$('b-' + k).classList.toggle('on', ui[k]);
	}
	anim.turnTarget = anim.turn > 0 ? 360 : 0;
	slCur.value = '0';
	readSliders();
}
function startTour() {
	resetMachine();
	tour.on = true;
	tour.t = 0;
	tour.i = 0;
	tour.cx = window.innerWidth * 0.5;
	tour.cy = window.innerHeight * 0.55;
	cursor.classList.add('on');
	log('AUTO TOUR · start');
	setTourTag();
}
function stopTour() {
	if (!tour.on) return;
	tour.on = false;
	tour.from = null;
	tour.slide = null;
	cursor.classList.remove('on');
	log('OPERATOR · control taken');
	setTourTag();
}
function userInput() {
	lastInput = clock;
	stopTour();
}
for (const ev of ['pointerdown', 'wheel', 'keydown', 'touchstart']) {
	window.addEventListener(ev, (e) => { if (e.isTrusted) userInput(); }, { capture: true, passive: true });
}
window.addEventListener('keydown', (e) => {
	if (e.target instanceof HTMLInputElement) return;
	const k = e.key.toLowerCase();
	if (k === 'h') document.body.classList.toggle('hide-hud');
	else if (k === 'e') toggle('explode', false);
	else if (k === 'm') toggle('mantle', false);
	else if (k === 'q') setTier((tier + 1) % TIERS.length, true);
	else if ('12345'.includes(k)) setView(['hero', 'front', 'side', 'top', 'under'][+k - 1], false);
});

function elCenter(id) {
	const el = $(id);
	if (!el || !el.offsetParent) return null;
	const r = el.getBoundingClientRect();
	return { x: r.left + r.width * 0.55, y: r.top + r.height * 0.6, r, el };
}
function updateTour(dt) {
	if (!tour.on) return;
	tour.t += dt;
	if (tour.t >= LOOP) { tour.t = 0; tour.i = 0; resetMachine(); }
	const b = BEATS[tour.i];
	if (b) {
		// travel to the control during the 0.9 s before its beat
		if (tour.t >= b.t - 0.9 && !tour.from) {
			const c = b.el ? elCenter(b.el) : null;
			tour.from = { x: tour.cx, y: tour.cy, to: c, t0: tour.t };
		}
		if (tour.from && tour.from.to) {
			const k = ease((tour.t - tour.from.t0) / 0.8);
			tour.cx = lerp(tour.from.x, tour.from.to.x, k);
			tour.cy = lerp(tour.from.y, tour.from.to.y, k);
		}
		if (tour.t >= b.t) {
			const c = tour.from && tour.from.to;
			if (b.slide) {
				const [input, to] = b.slide;
				tour.slide = { input, v0: parseFloat(input.value), v1: to, t0: tour.t, dur: b.dur, rect: c && c.r };
			} else if (b.go) b.go();
			if (c && c.el.tagName === 'BUTTON') {
				c.el.classList.add('press');
				setTimeout(() => c.el.classList.remove('press'), 180);
			}
			cursor.classList.remove('click');
			void cursor.offsetWidth;
			cursor.classList.add('click');
			tour.from = null;
			tour.i++;
		}
	}
	// a slider drag: the cursor rides the thumb
	if (tour.slide) {
		const s = tour.slide;
		const k = ease((tour.t - s.t0) / s.dur);
		const v = lerp(s.v0, s.v1, k);
		s.input.value = String(v);
		readSliders();
		if (s.rect) {
			const min = parseFloat(s.input.min), max = parseFloat(s.input.max);
			tour.cx = s.rect.left + ((v - min) / (max - min)) * s.rect.width;
			tour.cy = s.rect.top + s.rect.height * 0.6;
		}
		if (k >= 1) { log((s.input === slCur ? 'CURRENT → ' + ui.current.toFixed(2) + ' m/s' : 'NOZZLE')); tour.slide = null; }
	}
	cursor.style.transform = `translate(${tour.cx.toFixed(1)}px, ${tour.cy.toFixed(1)}px)`;
}

// ================================================================== quality tiers
const TIERS = [
	{ name: 'Q1', pr: 1.75, shadow: 2048, every: 1, ao: true },
	{ name: 'Q2', pr: 1.25, shadow: 1024, every: 1, ao: true },
	{ name: 'Q3', pr: 1, shadow: 1024, every: 2, ao: false },
];
let tier = 0;
function setTier(i, manual) {
	tier = i;
	const T = TIERS[i];
	renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, T.pr));
	composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, T.pr));
	gtao.enabled = T.ao;
	key.shadow.mapSize.set(T.shadow, T.shadow);
	if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; }
	$('sQ').textContent = 'render ' + T.name + (manual ? '' : ' auto');
	resize();
	if (manual) log('RENDER → ' + T.name);
}
const perf = { acc: 0, n: 0, since: 0 };
function watchPerf(dt) {
	perf.since += dt;
	if (perf.since < 2.5) return; // let shaders and caches settle first
	perf.acc += dt; perf.n++;
	if (perf.acc >= 2) {
		const fps = perf.n / perf.acc;
		perf.acc = 0; perf.n = 0;
		if (fps < 42 && tier < TIERS.length - 1) { setTier(tier + 1, false); log('RENDER → ' + TIERS[tier].name + ' (' + Math.round(fps) + ' fps)'); perf.since = 0; }
	}
}

function resize() {
	const w = window.innerWidth, h = window.innerHeight;
	renderer.setSize(w, h, false);
	composer.setSize(w, h);
	camera.aspect = w / h;
	// keep the machine at 60–70 % of the view on narrow screens too
	camera.fov = w / h < 0.8 ? 50 : w / h < 1.3 ? 40 : 32;
	camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ================================================================== frame
const curls = new Float32Array(8);
let frameNo = 0;
let jetEase = 0;
const S = {};
let lastHold = true, lastOver = false;

function step(dt) {
	simT += dt;
	clock += dt;

	// --- model ---
	const eff = effort(ui.current, ui.nozzleD);
	const c = eff.cyc;
	phase = (phase + dt / c.T) % 1;
	const jet = jetAt(phase, c);
	jetEase = damp(jetEase, jet.contracting ? Math.sin(PI * jet.x) : 0, 6, dt);
	for (let a = 0; a < 8; a++) curls[a] = armCurl(a, simT, jetEase, ui.current);
	const rScale = Math.sqrt(1 - jet.expelled / P.V0);
	const rpm = (Math.abs(jet.Q) / P.pumpDisp) * 60;
	const motorRpm = (rpm * DRV.Zpump) / DRV.Zm; // the belt steps the pump down from the motor
	const armsW = P.armW * (8 - (ui.arm ? 1 : 0)) * (1 + 0.6 * clamp(ui.current / 2, 0, 1));
	const elecW = c.hydW / P.pumpEff + armsW + P.hotelW;
	const fstop = lerp(2.8, 11, 0.5 + 0.5 * Math.sin(simT * (ui.optics ? 1.6 : 0.35)));
	Object.assign(S, { cyc: c, eff, jet, rScale, rpm, motorRpm, elecW, d: ui.nozzleD, curls, fstop });
	hist.push([simT, jet.dP, jet.F]);
	while (hist.length && simT - hist[0][0] > WIN + 0.2) hist.shift();
	const over = c.peakP > P.pumpMaxP;
	if (eff.hold !== lastHold) { log(eff.hold ? 'STATION HELD' : 'DRIFTING · drag exceeds jet'); lastHold = eff.hold; }
	if (over !== lastOver) { log(over ? 'OVERPRESSURE · ' + (c.peakP / 1000).toFixed(0) + ' kPa' : 'PRESSURE NOMINAL'); lastOver = over; }

	// --- animate toward the switches ---
	for (const k of ['optics', 'head', 'mantle', 'arm', 'flow', 'beak', 'explode']) anim[k] = damp(anim[k], ui[k] ? 1 : 0, k === 'explode' ? 2.2 : 3.2, dt);
	if (anim.turn !== anim.turnTarget) {
		const sp = 52 * dt;
		anim.turn = anim.turn < anim.turnTarget ? Math.min(anim.turnTarget, anim.turn + sp) : Math.max(anim.turnTarget, anim.turn - sp);
		if (anim.turn >= 360) { anim.turn = 0; anim.turnTarget = 0; }
	}

	// --- pose the machine from the model ---
	root.rotation.y = (anim.turn * PI) / 180;
	root.position.y = 0.08 + 0.016 * Math.sin(simT * 0.8) + 0.008 * jetEase;
	const e = anim.explode;
	// mantle: breathe with the model, petals hinge open, the course below steps out when exploded
	mantleRoot.position.set(MANTLE_POS.x, MANTLE_POS.y + 0.16 * e, MANTLE_POS.z - 0.26 * e);
	mantleBreath.scale.set(rScale, 1, rScale);
	const open = Math.max(anim.mantle, e * 0.9);
	for (const pt of petals) {
		pt.pivot.quaternion.setFromAxisAngle(pt.axis, ease(open) * 1.08);
		// actuator from the frame to the lug under the petal
		_a1.copy(pt.lug).applyQuaternion(pt.pivot.quaternion).add(SM(U_SPLIT + 0.012, pt.pc, -T_SHELL * 0.5));
		_a2.subVectors(_a1, pt.base);
		const len = _a2.length();
		_a2.normalize();
		const bl = Math.min(0.09, len * 0.6);
		pt.barrel.position.copy(pt.base).addScaledVector(_a2, bl / 2);
		pt.barrel.quaternion.setFromUnitVectors(UP, _a2);
		pt.barrel.scale.set(1, bl, 1);
		pt.rod.position.copy(pt.base).addScaledVector(_a2, bl + (len - bl) / 2);
		pt.rod.quaternion.copy(pt.barrel.quaternion);
		pt.rod.scale.set(1, Math.max(0.001, len - bl), 1);
		pt.collar.position.copy(pt.base).addScaledVector(_a2, bl);
		pt.collar.quaternion.copy(pt.barrel.quaternion);
	}
	for (const pt of petals) pt.pivot.position.copy(SM(U_SPLIT + 0.012, pt.pc, -T_SHELL * 0.5)).addScaledVector(V3(Math.sin(pt.pc), 0, Math.cos(pt.pc)), 0.05 * e);
	for (const lp of lowerPanels) lp.grp.position.copy(lp.n).multiplyScalar(0.075 * e);
	cap.position.y = 0.12 * Math.max(e, anim.mantle * 0.5);
	const xr = anim.flow;
	M.ceramic.opacity = 1 - 0.84 * xr;
	M.ceramic.transparent = xr > 0.01;
	M.ceramic.depthWrite = xr < 0.5;
	// internals rise out of the open mantle
	const lift = ease(Math.max(anim.mantle * 0.6, e));
	internals.position.y = 0.06 * lift + 0.14 * e;
	pump.rotation.y = lift * PI * 0.25;
	impeller.rotation.y += (rpm / 60) * TAU * dt * VIS;

	// head: halves slide apart, the drive stages lift apart when exploded
	const ho = ease(Math.max(anim.head, e * 0.9));
	for (const h of headHalves) {
		h.grp.position.set(h.side * (0.17 * ho + 0.12 * e), 0, -0.05 * ho);
		h.grp.rotation.set(0, h.side * 0.62 * ho, -h.side * 0.05 * ho); // swing open like doors
		h.worm.rotation.z += dt * (ui.optics ? 9 : 2.5) * h.side; // worm turns the turret iris
	}
	stages.planet.position.y = 0.05 * e;
	stages.motor.position.y = 0.1 * e;
	stages.top.position.y = 0.16 * e;
	M.headShell.opacity = 1 - 0.84 * xr;
	M.headShell.transparent = xr > 0.01;
	M.headShell.depthWrite = xr < 0.5;
	M.headIn.opacity = M.headShell.opacity;
	M.headIn.transparent = M.headShell.transparent;
	// the gear train: motor → sun; carrier = sun × 12/48; crown on the carrier; pinions × 48/12
	driveAng.m += (S.motorRpm / 60) * TAU * dt * VIS;
	const m = driveAng.m, cAng = m * DRV.planet;
	spin.rotor.rotation.y = m;
	spin.sun.rotation.y = m;
	spin.encoder.rotation.y = m;
	spin.pulleyM.rotation.y = m;
	spin.pulleyP.rotation.y = (m * DRV.Zm) / DRV.Zpump;
	spin.carrier.rotation.y = cAng;
	for (const p of spin.planets) p.rotation.y = -(m - cAng) * (DRV.Zs / DRV.Zp);
	spin.crown.rotation.y = cAng;
	for (let a = 0; a < 8; a++) {
		spin.pinions[a].rotation.y = (-cAng * DRV.Zc) / DRV.Zpin;
		spin.spools[a].rotation.y = curls[a] * TAU * 1.2; // the clutch winds the tendon to the arm's curl
	}
	for (const pk of packs) pk.g.position.set(pk.s * (0.1 + 0.13 * e), 0.4 + 0.05 * e, -0.01);
	board.position.y = 0.58 + 0.16 * e;

	for (const o of optics) {
		const out = Math.max(anim.optics, e);
		o.g.position.copy(o.base).addScaledVector(o.dir, 0.16 * e);
		o.lens.position.y = 0.085 + 0.075 * ease(out);
		o.lens.rotation.y = ease(out) * 4.2 * o.side; // unscrews on its thread
		const ap = (S.fstop - 2.8) / (11 - 2.8); // 0 = wide open
		for (const b of o.blades) b.rotation.y = 0.15 + ap * 0.75;
	}
	siphon.position.copy(SIPHON_BASE).addScaledVector(SIPHON_DIR, 0.24 * e);
	const nr = ui.nozzleD / 2;
	nozzle.scale.setScalar(nr);
	beak.position.set(0, 0.575 - 0.24 * e, 0);
	const bo = ease(Math.max(anim.beak, e * 0.7));
	for (const c of claws) c.rotation.z = -bo * 0.7;

	if (Math.abs(anim.arm - (paintLinks.last || 0)) > 0.01) { paintLinks(anim.arm); paintLinks.last = anim.arm; }
	poseArms(simT, jetEase, ui.current, e, anim.arm, curls);

	// the part doing the work glows: the jet while contracting, optics while out, R2 while apart
	M.accJet.emissiveIntensity = 0.6 * (jet.contracting ? Math.sin(PI * jet.x) : 0);
	M.accOpt.emissiveIntensity = 0.45 * anim.optics;
	M.accArm.emissiveIntensity = 0.25 * anim.arm;
	M.accBody.emissiveIntensity = 0.28 * anim.mantle * (0.6 + 0.4 * Math.sin(simT * 4));
	M.pupil.emissiveIntensity = 0.35 + 0.5 * (1 - (S.fstop - 2.8) / 8.2);

	// jet flow particles
	root.updateMatrixWorld(true);
	nozzleTip.getWorldPosition(_np);
	_a1.set(0, 0.14, 0); _a2.set(0, 0.16, 0);
	siphon.localToWorld(_a1); siphon.localToWorld(_a2);
	_nd.subVectors(_a2, _a1).normalize();
	flowMat.opacity = damp(flowMat.opacity, (0.18 + 0.75 * xr) * (jet.contracting ? Math.sin(PI * jet.x) : 0.15), 8, dt);
	const sp = Math.max(jet.v, 0.6);
	const side1 = _a1.set(0, 1, 0).cross(_nd).normalize(), side2 = _a2.crossVectors(_nd, side1).normalize();
	for (let i = 0; i < NP; i++) {
		const [f, ang, rr] = flowSeed[i];
		const age = (f + simT * sp * 0.35) % 1;
		const dist = age * 0.9;
		const spread = nr * 0.8 + dist * 0.18 * rr;
		const px = _np.x + _nd.x * dist + (side1.x * Math.cos(ang) + side2.x * Math.sin(ang)) * spread;
		const py = _np.y + _nd.y * dist + (side1.y * Math.cos(ang) + side2.y * Math.sin(ang)) * spread;
		const pz = _np.z + _nd.z * dist + (side1.z * Math.cos(ang) + side2.z * Math.sin(ang)) * spread;
		flowPos[i * 3] = px; flowPos[i * 3 + 1] = Math.max(0.01, py); flowPos[i * 3 + 2] = pz;
	}
	flowGeo.attributes.position.needsUpdate = true;

	// camera tween
	if (camTween) {
		camTween.t += dt;
		const k = ease(camTween.t / camTween.dur);
		camera.position.lerpVectors(camTween.p0, camTween.p1, k);
		controls.target.lerpVectors(camTween.t0, camTween.t1, k);
		if (k >= 1) camTween = null;
	}
	controls.update();

	if (!tour.on && clock - lastInput > 25) startTour();
	updateTour(dt);
}

// --- readouts ---------------------------------------------------------------
let textClock = 0;
function readouts(dt) {
	textClock += dt;
	const c = S.cyc, jet = S.jet;
	const W = window.innerWidth, H = window.innerHeight;
	const every = TIERS[tier].every;
	if (frameNo % every === 0) {
		drawJetChart(S);
		drawSection(S);
	}
	drawCallouts(S, W, H, dt);
	if (textClock < 1 / 15) return;
	textClock = 0;

	let state = 'CRUISE', cls = '';
	if (!S.eff.hold) { state = 'DRIFTING'; cls = 'bad'; }
	else if (c.peakP > P.pumpMaxP) { state = 'OVERPRESSURE'; cls = 'bad'; }
	else if (anim.explode > 0.5) { state = 'EXPLODED'; cls = 'hot'; }
	else if (anim.arm > 0.5) { state = 'ARM R2 APART'; cls = 'hot'; }
	else if (anim.mantle > 0.5) { state = 'MANTLE OPEN'; cls = 'hot'; }
	else if (anim.head > 0.5) { state = 'HEAD OPEN'; cls = 'hot'; }
	else if (anim.optics > 0.5) { state = 'OPTICS OUT'; cls = 'hot'; }
	else if (anim.beak > 0.5) { state = 'BEAK OPEN'; cls = 'hot'; }
	else if (jet.contracting) { state = 'JETTING'; cls = 'hot'; }
	else state = 'REFILL';
	const st = $('state');
	st.textContent = state;
	st.className = 'chip ' + cls;
	$('clock').textContent = fmtT(simT);

	$('thrust').textContent = jet.F.toFixed(1);
	$('thrustSub').textContent = `jet thrust · mean ${c.meanF.toFixed(1)} N · peak ${c.peakF.toFixed(1)} N`;
	$('mP').textContent = (jet.dP / 1000).toFixed(1) + ' kPa';
	let avg = 0;
	for (let a = 0; a < 8; a++) avg += S.curls[a];
	$('mC').textContent = Math.round((avg / 8) * 100) + '%';
	$('mW').textContent = Math.round(S.elecW) + ' W';

	$('rNoz').textContent = 'Ø' + Math.round(S.d * 1000) + ' mm · ' + (c.A * 1e4).toFixed(2) + ' cm²';
	$('rV').textContent = jet.v.toFixed(2) + ' m/s (peak ' + c.vp.toFixed(1) + ')';
	$('rQ').textContent = (jet.Q * 1000).toFixed(2) + ' L/s';
	$('rDV').textContent = (c.dV * 1000).toFixed(2) + ' L · ' + Math.round(c.s * 100) + ' % of ' + (P.V0 * 1000).toFixed(1);
	$('rT').textContent = c.T.toFixed(2) + ' s · effort ' + Math.round(c.e * 100) + ' %';
	const rp = $('rPump');
	rp.textContent = Math.round(S.rpm) + ' rpm';
	rp.className = jet.contracting ? 'hot' : '';
	// the hand check, live: the mean thrust from first principles
	const A = c.A, Qp = c.Qp;
	$('check').innerHTML =
		`<b>check</b> Qp = ΔV·π/2tc = ${(c.dV * 1000).toFixed(2)}·π/${(2 * c.tc).toFixed(2)} = <b>${(Qp * 1000).toFixed(2)} L/s</b><br>` +
		`F̄ = ρQp²tc/2AT = <b>${c.meanF.toFixed(2)} N</b> · ΔP̂ = ½ρv̂² = <b style="color:${c.peakP > P.pumpMaxP ? COL.warn : 'inherit'}">${(c.peakP / 1000).toFixed(1)} kPa</b>`;

	for (const b of barRefs) {
		const v = S.curls[b.a];
		b.f.style.width = (v * 100).toFixed(1) + '%';
		b.f.classList.toggle('hot', b.a === ARM_R2 && anim.arm > 0.5);
		b.v.textContent = Math.round(v * 100) + '%';
	}

	$('sPow').textContent = Math.round(S.elecW) + ' W · jet ' + Math.round(c.hydW / P.pumpEff) + ' W';
	$('sEnd').textContent = (P.battWh / S.elecW).toFixed(1) + ' h';
	$('sDepth').textContent = (P.depth + root.position.y * 0.5).toFixed(2) + ' m';
	$('sCur').textContent = ui.current.toFixed(2) + ' m/s';
	$('sDrag').textContent = drag(ui.current).toFixed(1) + ' N vs ' + c.meanF.toFixed(1) + ' N';
	const hold = $('sHold');
	// the strongest current the jet can stand against at full effort
	const uHold = Math.sqrt(cycle(1, S.d).meanF / (0.5 * P.rho * P.Cd * PI * P.R * P.R));
	if (S.eff.hold) { hold.textContent = 'HOLDING · up to ' + uHold.toFixed(2) + ' m/s'; hold.className = 'ok'; }
	else {
		hold.textContent = 'DRIFT ' + (ui.current - uHold).toFixed(2) + ' m/s';
		hold.className = 'warn';
	}
	const yes = (k, a, b) => (anim[k] > 0.5 ? a : b);
	$('sOpt').textContent = yes('optics', 'LENS OUT · f/' + S.fstop.toFixed(1), 'TRACKING · f/' + S.fstop.toFixed(1));
	$('sOpt').className = anim.optics > 0.5 ? 'hot' : '';
	$('sMan').textContent = yes('mantle', 'OPEN', 'SEALED') + ' · r ×' + S.rScale.toFixed(3);
	$('sMan').className = anim.mantle > 0.5 ? 'hot' : '';
	$('sArm').textContent = yes('arm', '7 / 8 · R2 OFF', '8 / 8 ON HUB');
	$('sArm').className = anim.arm > 0.5 ? 'hot' : '';
	$('sBeak').textContent = yes('beak', 'OPEN', 'CLOSED');
	$('sDrive').textContent = Math.round(S.motorRpm) + ' rpm · 4:1 · 48/12';
	$('sDrive').className = anim.head > 0.5 ? 'hot' : '';
}

// ================================================================== boot
applyLang();
setTier(0, false);
resize();
// first pose, then compile every shader before the first visible frame
step(1 / 60);
renderer.compile(scene, camera);
log('POWER ON · ' + (P.battWh) + ' Wh pack');
log('MODEL · ' + NA + ' arms × ' + N + ' links, ' + (P.V0 * 1000).toFixed(1) + ' L mantle');
startTour();
// ?at=<s> fast-forwards the tour (for stills); ?hud=0 hides the panels
const QS = new URLSearchParams(location.search);
if (QS.get('hud') === '0') document.body.classList.add('hide-hud');
if (QS.get('ao') === '0') { TIERS[0].ao = false; setTier(0, false); }

if (QS.has('at')) {
	const n = Math.round(parseFloat(QS.get('at')) * 30);
	for (let i = 0; i < n; i++) { step(1 / 30); if (i % 30 === 0) readouts(1); }
	lastInput = clock - 1; // keep the tour state without restarting it
}

if (QS.has('cam')) {
	const c = QS.get('cam').split(',').map(Number);
	camera.position.set(c[0], c[1], c[2]);
	controls.target.set(c[3], c[4], c[5]);
	camTween = null;
	controls.update();
}

let last = performance.now();
function frame(now) {
	const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
	last = now;
	frameNo++;
	step(dt);
	readouts(dt);
	composer.render(dt);
	watchPerf(dt);
	requestAnimationFrame(frame);
}
composer.render(1 / 60);
const loading = $('loading');
loading.style.opacity = '0';
setTimeout(() => loading.remove(), 700);
if (QS.has('still')) { readouts(1); composer.render(1 / 60); document.body.dataset.ready = '1'; }
else requestAnimationFrame((t) => { last = t; requestAnimationFrame(frame); });
