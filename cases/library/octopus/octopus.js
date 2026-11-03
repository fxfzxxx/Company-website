/* Benthos-8 — an interactive mechanical octopus you can take apart.

   Built the teardown way, without the teardown kit:
   1. MODEL     one jet-pump model in real units. Every pose, gauge, chart and
                label below reads from it; nothing is keyframed by hand.
   2. MACHINE   every part is built from three.js primitives at load. Eight
                arms of 25 links each are three instanced meshes in total.
   3. CONSOLE   live charts, a 2D section that redraws from the same model,
                subsystem buttons, camera views and callouts with leader lines.
   4. TOUR      with nobody at the controls a cursor walks the console and
                presses the buttons itself. Any input hands control over;
                25 s of quiet hands it back.
   5. SLIDERS   water current and nozzle diameter feed straight into the model,
                so you can push the machine past what it can hold.

   The numbers are a plausible design, not a real vehicle's data: each one is
   marked in the parameter block with where it comes from. */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

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
		eyebrow: '深海勘测章鱼 · 喷射推进', curl: '弯曲', power: '功耗', jet: '喷射泵', nozzle: '虹吸喷口', jetv: '射流速度',
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
	armLen: 0.95,         // m
	armR0: 0.052,         // m       link radius at the root
	armR1: 0.012,         // m       link radius at the tip
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
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const STUDIO = new THREE.Color('#d6dde0');
scene.background = STUDIO;

const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 50);
camera.position.set(2.3, 1.55, 2.9);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.78, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 1.2;
controls.maxDistance = 8;
controls.maxPolarAngle = PI * 0.97;

// soft studio reflections from a hand-built light box
{
	const pm = new THREE.PMREMGenerator(renderer);
	const env = new THREE.Scene();
	const room = new THREE.Mesh(new THREE.SphereGeometry(10, 24, 12), new THREE.MeshBasicMaterial({ color: '#8f999e', side: THREE.BackSide }));
	env.add(room);
	const panel = (w, h, pos, look, k) => {
		const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k), side: THREE.DoubleSide }));
		m.position.copy(pos);
		m.lookAt(look);
		env.add(m);
	};
	panel(8, 4, new THREE.Vector3(0, 8, 0), new THREE.Vector3(0, 0, 0), 3.2);
	panel(4, 6, new THREE.Vector3(7, 3, 4), new THREE.Vector3(0, 1, 0), 2.2);
	panel(3, 5, new THREE.Vector3(-7, 2, -3), new THREE.Vector3(0, 1, 0), 1.4);
	const tex = pm.fromScene(env, 0.035).texture;
	scene.environment = tex;
	scene.environmentIntensity = 0.75;
	pm.dispose();
}

scene.add(new THREE.HemisphereLight('#ffffff', '#aab4b9', 1.1));
const key = new THREE.DirectionalLight('#ffffff', 2.1);
key.position.set(2.5, 5.5, 3.2);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -2.2;
key.shadow.camera.right = 2.2;
key.shadow.camera.top = 2.2;
key.shadow.camera.bottom = -2.2;
key.shadow.camera.near = 1;
key.shadow.camera.far = 14;
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
key.shadow.radius = 5;
scene.add(key);
const fill = new THREE.DirectionalLight('#e6eef2', 0.7);
fill.position.set(-4, 2, -2.5);
scene.add(fill);

// an invisible floor that only catches the shadow, and a faint contact disc
const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.ShadowMaterial({ color: '#2b3a42', opacity: 0.2 }));
floor.rotation.x = -PI / 2;
floor.receiveShadow = true;
scene.add(floor);
{
	const c = document.createElement('canvas');
	c.width = c.height = 256;
	const g = c.getContext('2d');
	const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
	gr.addColorStop(0, 'rgba(40,55,62,0.16)');
	gr.addColorStop(1, 'rgba(40,55,62,0)');
	g.fillStyle = gr;
	g.fillRect(0, 0, 256, 256);
	const disc = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
	disc.rotation.x = -PI / 2;
	disc.position.y = 0.002;
	scene.add(disc);
	// a scale ring on the floor: 1 m diameter, ticks every 30°
	const ringPts = [];
	for (let i = 0; i <= 128; i++) {
		const a = (i / 128) * TAU;
		ringPts.push(new THREE.Vector3(Math.cos(a) * 1.25, 0.003, Math.sin(a) * 1.25));
	}
	const lm = new THREE.LineBasicMaterial({ color: '#9aa6ac', transparent: true, opacity: 0.6 });
	scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts), lm));
	const ticks = [];
	for (let i = 0; i < 12; i++) {
		const a = (i / 12) * TAU;
		ticks.push(new THREE.Vector3(Math.cos(a) * 1.25, 0.003, Math.sin(a) * 1.25), new THREE.Vector3(Math.cos(a) * 1.33, 0.003, Math.sin(a) * 1.33));
	}
	scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(ticks), lm));
}

// ================================================================== materials
const M = {
	shell: new THREE.MeshPhysicalMaterial({ color: '#f3f4f1', roughness: 0.36, clearcoat: 0.55, clearcoatRoughness: 0.3, side: THREE.DoubleSide }),
	shellIn: new THREE.MeshStandardMaterial({ color: '#c9cfd1', roughness: 0.7 }),
	white: new THREE.MeshPhysicalMaterial({ color: '#eff1ee', roughness: 0.4, clearcoat: 0.4, clearcoatRoughness: 0.35 }),
	dark: new THREE.MeshPhysicalMaterial({ color: '#262c30', roughness: 0.32, metalness: 0.1, clearcoat: 0.6 }),
	metal: new THREE.MeshStandardMaterial({ color: '#a3acb1', roughness: 0.45, metalness: 0.85 }),
	glass: new THREE.MeshPhysicalMaterial({ color: '#16232b', roughness: 0.06, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.04 }),
	bladder: new THREE.MeshStandardMaterial({ color: '#46525a', roughness: 0.55, transparent: true, opacity: 0.92 }),
	accJet: new THREE.MeshStandardMaterial({ color: '#ee5f1d', roughness: 0.45, emissive: '#ee5f1d', emissiveIntensity: 0 }),
	accOpt: new THREE.MeshStandardMaterial({ color: '#ee5f1d', roughness: 0.45, emissive: '#ee5f1d', emissiveIntensity: 0 }),
	accBody: new THREE.MeshStandardMaterial({ color: '#ee5f1d', roughness: 0.45, emissive: '#ee5f1d', emissiveIntensity: 0 }),
	sucker: new THREE.MeshStandardMaterial({ color: '#d9d0c6', roughness: 0.6 }),
};
const castAll = (o) => o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
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

// ================================================================== 2. MACHINE
const root = new THREE.Group();          // turntable + hover
scene.add(root);
const HEAD = new THREE.Vector3(0, 0.95, 0.02);

// --- head ---------------------------------------------------------------
const head = new THREE.Group();
root.add(head);
{
	const h = mesh(new THREE.SphereGeometry(1, 48, 32), M.white, head, [HEAD.x, HEAD.y, HEAD.z]);
	h.scale.set(0.205, 0.165, 0.215);
	// a seam band around the head
	mesh(new THREE.TorusGeometry(0.205, 0.006, 8, 64), M.dark, head, [HEAD.x, HEAD.y - 0.01, HEAD.z], [PI / 2, 0, 0]).scale.set(1, 1.05, 1);
	// arm hub under the head
	mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.06, 40), M.dark, head, [0, 0.8, 0.02]);
	mesh(new THREE.TorusGeometry(0.165, 0.012, 10, 48), M.accBody, head, [0, 0.826, 0.02], [PI / 2, 0, 0]);
}
const aHead = anchor(head, [0, 1.12, 0.1]);

// --- optic units (two, on the sides of the head) ----------------------------
const optics = [];
for (const side of [1, -1]) {
	const g = new THREE.Group();
	g.position.set(side * 0.178, 0.99, 0.085);
	g.rotation.y = side * 0.32;
	head.add(g);
	const housing = mesh(new THREE.CylinderGeometry(0.064, 0.07, 0.07, 40), M.white, g, [side * 0.02, 0, 0], [0, 0, PI / 2]);
	housing.castShadow = true;
	mesh(new THREE.TorusGeometry(0.066, 0.008, 10, 48), M.accOpt, g, [side * 0.056, 0, 0], [0, PI / 2, 0]);
	const lens = new THREE.Group(); // the part that unscrews
	lens.position.x = side * 0.056;
	g.add(lens);
	mesh(new THREE.CylinderGeometry(0.056, 0.056, 0.02, 40), M.dark, lens, [side * 0.006, 0, 0], [0, 0, PI / 2]);
	const iris = new THREE.Group();
	iris.position.x = side * 0.017;
	lens.add(iris);
	const blades = [];
	for (let b = 0; b < 7; b++) {
		const pivot = new THREE.Group();
		pivot.rotation.x = (b / 7) * TAU;
		iris.add(pivot);
		const bl = mesh(new THREE.BoxGeometry(0.003, 0.034, 0.016), M.metal, pivot, [0, 0.03, 0]);
		blades.push(bl);
	}
	const glass = mesh(new THREE.SphereGeometry(0.05, 32, 16, 0, TAU, 0, PI / 2), M.glass, lens, [side * 0.016, 0, 0], [0, 0, -side * PI / 2]);
	glass.scale.set(1, 0.38, 1);
	// thread rings that show when the lens is out
	for (let k = 0; k < 3; k++) mesh(new THREE.TorusGeometry(0.052, 0.0025, 6, 40), M.metal, lens, [-side * (0.008 + k * 0.008), 0, 0], [0, PI / 2, 0]);
	const tip = anchor(lens, [side * 0.03, 0, 0]);
	optics.push({ g, lens, iris, blades, side, tip });
}

// --- siphon (the jet nozzle) ------------------------------------------------
const siphon = new THREE.Group();
siphon.position.set(0, 0.84, 0.17);
siphon.rotation.x = 1.2; // points forward and a little down
head.add(siphon);
mesh(new THREE.CylinderGeometry(0.036, 0.046, 0.15, 32, 1, true), M.white, siphon, [0, 0.06, 0]).material = M.white;
const nozzleRing = mesh(new THREE.TorusGeometry(1, 0.22, 10, 40), M.accJet, siphon, [0, 0.14, 0], [PI / 2, 0, 0]);
const nozzleBore = mesh(new THREE.CylinderGeometry(1, 1, 0.02, 32), M.dark, siphon, [0, 0.135, 0]);
const nozzleTip = anchor(siphon, [0, 0.15, 0]);

// --- beak (two jaws under the hub) --------------------------------------------
const beak = new THREE.Group();
beak.position.set(0, 0.765, 0.02);
head.add(beak);
const jaws = [];
for (const s of [1, -1]) {
	const p = new THREE.Group();
	beak.add(p);
	const j = mesh(new THREE.ConeGeometry(0.045, 0.09, 24, 1, false, s > 0 ? 0 : PI, PI), M.dark, p, [0, -0.04, 0], [PI, 0, 0]);
	j.castShadow = true;
	jaws.push({ p, s });
}
mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 24), M.metal, beak, [0, 0.005, 0]);
const beakTip = anchor(beak, [0, -0.09, 0]);

// --- mantle -------------------------------------------------------------------
const ML = 0.64;
const mantleRoot = new THREE.Group();
mantleRoot.position.set(0, 1.03, -0.055);
mantleRoot.rotation.x = -0.78;
root.add(mantleRoot);
const mantleBreath = new THREE.Group(); // scaled by the contraction
mantleRoot.add(mantleBreath);

const shellProfile = (rScale) => {
	const pts = [];
	for (let k = 0; k <= 30; k++) {
		const u = k / 30;
		const r = P.R * rScale * Math.pow(Math.sin(PI * (0.14 + 0.86 * u)), 0.72);
		pts.push(new THREE.Vector2(Math.max(r, 0.0008), u * ML));
	}
	return pts;
};
const HINGE = 0.165;
const shellHalves = [];
for (const s of [1, -1]) {
	const pivot = new THREE.Group();
	pivot.position.z = -HINGE;
	mantleBreath.add(pivot);
	const geo = new THREE.LatheGeometry(shellProfile(1), 40, s > 0 ? 0 : PI, PI);
	const half = mesh(geo, M.shell, pivot, [0, 0, HINGE]);
	half.castShadow = true;
	half.receiveShadow = true;
	// orange collar and seam bead on each half
	const collar = mesh(new THREE.TorusGeometry(P.R * 0.6, 0.009, 8, 40, PI), M.accBody, pivot, [0, 0.03, HINGE], [PI / 2, 0, s > 0 ? -PI / 2 : PI / 2]);
	collar.rotation.set(PI / 2, 0, s > 0 ? 0 : PI);
	// segmentation ribs, the "one link at a time" look on the shell
	for (const u of [0.32, 0.55, 0.76]) {
		const r = P.R * Math.pow(Math.sin(PI * (0.14 + 0.86 * u)), 0.72);
		const rib = mesh(new THREE.TorusGeometry(r + 0.002, 0.0035, 6, 48, PI), M.dark, pivot, [0, u * ML, HINGE], [PI / 2, 0, s > 0 ? 0 : PI]);
		rib.castShadow = false;
	}
	shellHalves.push({ pivot, half, s });
}
const aMantle = anchor(mantleBreath, [0, ML * 0.62, P.R * 0.86]);
const aMantleTip = anchor(mantleRoot, [0, ML * 0.98, 0]);

// inner bladder (the actual pumping volume) and the electronics around it
const bladder = mesh(new THREE.LatheGeometry(shellProfile(0.74), 32), M.bladder, mantleRoot);
bladder.castShadow = true;
const pump = new THREE.Group();
pump.position.set(0, 0.2, 0.02);
mantleRoot.add(pump);
mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.13, 32, 1, true), M.metal, pump);
mesh(new THREE.TorusGeometry(0.061, 0.007, 8, 40), M.accJet, pump, [0, 0.066, 0], [PI / 2, 0, 0]);
mesh(new THREE.TorusGeometry(0.061, 0.007, 8, 40), M.accJet, pump, [0, -0.066, 0], [PI / 2, 0, 0]);
const impeller = new THREE.Group();
pump.add(impeller);
for (let b = 0; b < 6; b++) {
	const bl = mesh(new THREE.BoxGeometry(0.052, 0.1, 0.006), M.white, impeller, [0, 0, 0], [0, (b / 6) * PI, 0.35]);
	bl.position.set(0, 0, 0);
}
mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.15, 12), M.dark, impeller);
const aPump = anchor(pump, [0.06, 0.04, 0]);

const battery = mesh(new THREE.BoxGeometry(0.13, 0.17, 0.05), M.dark, mantleRoot, [0, 0.43, -0.03]);
mesh(new THREE.BoxGeometry(0.131, 0.02, 0.051), M.accBody, battery, [0, 0.05, 0]);

// cable runs from the head into the mantle
{
	const r = rng(8);
	const cols = [M.accBody, M.dark, M.metal, M.white, M.dark, M.metal, M.dark, M.white, M.accBody, M.dark];
	for (let i = 0; i < 10; i++) {
		const a = r() * TAU;
		const start = new THREE.Vector3(Math.cos(a) * 0.07, -0.02, Math.sin(a) * 0.07);
		const toPump = i % 2 === 0;
		const end = toPump ? new THREE.Vector3(Math.cos(a) * 0.055, 0.14 + r() * 0.04, 0.02 + Math.sin(a) * 0.055) : new THREE.Vector3((r() - 0.5) * 0.1, 0.36 + r() * 0.03, -0.03);
		const mid = start.clone().lerp(end, 0.5).add(new THREE.Vector3((r() - 0.5) * 0.12, 0, (r() - 0.5) * 0.12 + 0.03));
		const curve = new THREE.CatmullRomCurve3([start, mid, end]);
		const tube = mesh(new THREE.TubeGeometry(curve, 30, 0.0065 + r() * 0.003, 6), cols[i], mantleRoot);
		tube.castShadow = false;
	}
}

// --- arms: 8 × 25 links, three instanced meshes for all of them -----------------
const NA = 8, N = P.N, SEG = P.armLen / N;
const linkGeo = new THREE.CylinderGeometry(0.94, 1, 1, 16, 1);
const jointGeo = new THREE.CylinderGeometry(1, 1, 1, 12, 1);
const suckGeo = new THREE.CylinderGeometry(1, 0.8, 1, 12, 1);
const links = new THREE.InstancedMesh(linkGeo, new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.4, clearcoat: 0.35, clearcoatRoughness: 0.35 }), NA * N);
const joints = new THREE.InstancedMesh(jointGeo, M.dark, NA * N);
const SUCK_FROM = 3;
const suckers = new THREE.InstancedMesh(suckGeo, M.sucker, NA * (N - SUCK_FROM));
for (const im of [links, joints, suckers]) {
	im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
	im.castShadow = true;
	im.receiveShadow = true;
	im.frustumCulled = false;
	root.add(im);
}
const LINK_WHITE = new THREE.Color('#f1f2ef');
const LINK_BAND = new THREE.Color('#ee5f1d');
const LINK_TIP = new THREE.Color('#c8ced1');
const LINK_GHOST = new THREE.Color('#b3bcc1');
const tmpC = new THREE.Color();
function paintLinks(iso) {
	for (let a = 0; a < NA; a++) {
		for (let i = 0; i < N; i++) {
			let c = i === 0 || i === 8 ? LINK_BAND : i > N - 4 ? LINK_TIP : LINK_WHITE;
			if (iso > 0.001 && a !== ARM_R2) c = tmpC.copy(c).lerp(LINK_GHOST, iso * 0.85);
			links.setColorAt(a * N + i, c);
		}
	}
	links.instanceColor.needsUpdate = true;
}
paintLinks(0);
const armTips = [];
for (let a = 0; a < NA; a++) armTips.push(new THREE.Vector3());

const UP = new THREE.Vector3(0, 1, 0);
const Y = new THREE.Vector3(0, 1, 0);
const FLOW = new THREE.Vector3(1, 0, 0.25).normalize(); // direction the water current runs
const _d = new THREE.Vector3(), _k = new THREE.Vector3(), _n = new THREE.Vector3(), _p = new THREE.Vector3(), _mid = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qs = new THREE.Quaternion(), _s = new THREE.Vector3(), _m = new THREE.Matrix4(), _rhat = new THREE.Vector3();

function poseArms(t, jet, u, explode, iso, curls) {
	let si = 0;
	for (let a = 0; a < NA; a++) {
		const ang = ARM_ANGLES[a];
		_rhat.set(Math.cos(ang), 0, Math.sin(ang));
		const curl = curls[a] * P.maxCurl;
		// root on the hub ring; explode and isolation push it outwards
		const out = 0.38 * explode + (a === ARM_R2 ? 0.34 * iso : 0);
		_p.set(_rhat.x * (0.15 + out), 0.79 - 0.06 * explode - (a === ARM_R2 ? 0.03 * iso : 0), 0.02 + _rhat.z * (0.15 + out));
		// arms leave the hub between 35° (relaxed) and 72° (streamlined) below horizontal
		const drop = lerp(0.62, 1.25, jet) + (a === ARM_R2 ? -0.35 * iso : 0);
		_d.copy(_rhat).multiplyScalar(Math.cos(drop)).addScaledVector(UP, -Math.sin(drop)).normalize();
		_k.crossVectors(_rhat, UP).normalize(); // bend axis: positive curls the tip up and out
		const ph = a * 0.79;
		for (let i = 0; i < N; i++) {
			const s = i / (N - 1);
			const w = (0.25 + 2.2 * s * s) / 1.0;
			const wave = 0.07 * Math.sin(t * 2.3 - s * 5.4 + ph) * (0.3 + s);
			const theta = (curl / N) * w + wave;
			_d.applyAxisAngle(_k, theta);
			if (u > 0.001) {
				const flutter = 1 + 0.35 * Math.sin(t * (3 + u) + s * 6 + ph);
				_d.addScaledVector(FLOW, 0.022 * u * flutter * (0.2 + s)).normalize();
			}
			const r = lerp(P.armR0, P.armR1, Math.pow(s, 0.9));
			// joint disc at the start of the link
			_q.setFromUnitVectors(Y, _d);
			_m.compose(_p, _q, _s.set(r * 0.82, SEG * 0.36, r * 0.82));
			joints.setMatrixAt(a * N + i, _m);
			// the link itself
			_mid.copy(_p).addScaledVector(_d, SEG * 0.5);
			_m.compose(_mid, _q, _s.set(r, SEG * 0.8, r));
			links.setMatrixAt(a * N + i, _m);
			// sucker on the inside of the curl
			if (i >= SUCK_FROM) {
				_n.crossVectors(_k, _d).normalize();
				_qs.setFromUnitVectors(Y, _n);
				const sr = r * 0.52;
				_m.compose(_mid.addScaledVector(_n, r * 0.92), _qs, _s.set(sr, r * 0.32, sr));
				suckers.setMatrixAt(si++, _m);
			}
			_p.addScaledVector(_d, SEG);
		}
		armTips[a].copy(_p);
	}
	links.instanceMatrix.needsUpdate = true;
	joints.instanceMatrix.needsUpdate = true;
	suckers.instanceMatrix.needsUpdate = true;
}

castAll(root);
links.castShadow = joints.castShadow = suckers.castShadow = true;

// --- jet flow particles (world space) --------------------------------------------
const NP = 320;
const flowGeo = new THREE.BufferGeometry();
const flowPos = new Float32Array(NP * 3);
const flowSeed = [];
{
	const r = rng(21);
	for (let i = 0; i < NP; i++) flowSeed.push([r(), r() * TAU, r()]);
}
flowGeo.setAttribute('position', new THREE.BufferAttribute(flowPos, 3));
const flowMat = new THREE.PointsMaterial({ color: '#2b7fa3', size: 0.012, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true });
const flow = new THREE.Points(flowGeo, flowMat);
flow.frustumCulled = false;
scene.add(flow);
const _np = new THREE.Vector3(), _nd = new THREE.Vector3(), _a1 = new THREE.Vector3(), _a2 = new THREE.Vector3();

// ================================================================== 3. CONSOLE
const ui = {
	optics: false, mantle: false, arm: false, flow: false, beak: false, explode: false,
	current: 0, nozzleD: 0.038,
};
const anim = { optics: 0, mantle: 0, arm: 0, flow: 0, beak: 0, explode: 0, turn: 0, turnTarget: 0 };
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
			const t1 = new THREE.Vector3(0, 0.92, 0);
			camTween = { t: 0, dur: 1.4, p0: camera.position.clone(), t0: controls.target.clone(), p1: t1.clone().addScaledVector(dir, 5.1), t1 };
		}
	}
	ACT[act](ui[act]);
	if (!fromTour) userInput();
}
document.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => toggle(b.dataset.act, false)));

// camera views
const VIEWS = {
	hero: { p: [2.3, 1.55, 2.9], t: [0, 0.78, 0] },
	front: { p: [0, 0.95, 3.4], t: [0, 0.78, 0] },
	side: { p: [3.4, 0.95, 0.1], t: [0, 0.78, 0] },
	top: { p: [0.05, 3.7, 0.55], t: [0, 0.6, 0] },
	under: { p: [0.9, 0.12, 1.6], t: [0, 0.82, 0] },
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
	{ key: 'mantle', name: 'MANTLE SHELL', obj: () => aMantle, dx: -1, dy: -0.7, val: (S) => 'r ×' + S.rScale.toFixed(3) + ' · ' + (anim.mantle > 0.5 ? 'OPEN' : 'SEALED') },
	{ key: 'pump', name: 'JET PUMP', obj: () => aPump, dx: -1.1, dy: 0.25, val: (S) => Math.round(S.rpm) + ' rpm', when: () => anim.mantle > 0.4 || anim.flow > 0.4 || anim.explode > 0.4 },
	{ key: 'flow', name: 'SIPHON', obj: () => nozzleTip, dx: 1, dy: 0.45, val: (S) => 'Ø' + Math.round(S.d * 1000) + ' · ' + S.jet.v.toFixed(1) + ' m/s' },
	{ key: 'arm', name: 'ARM R2', obj: () => ({ getWorldPosition: (v) => v.copy(armTips[ARM_R2]).applyMatrix4(root.matrixWorld) }), dx: -1, dy: 0.5, val: (S) => 'curl ' + Math.round(S.curls[ARM_R2] * 100) + ' %' },
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
		const vis = (!c.when || c.when()) && !(small && (c.key === 'pump' || c.key === 'beak'));
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
	{ t: 6.6, el: 'b-mantle', go: () => toggle('mantle', true) },
	{ t: 10.2, el: 'b-arm', go: () => toggle('arm', true) },
	{ t: 13.8, el: 'b-arm', go: () => toggle('arm', true) },
	{ t: 15.0, el: 'b-flow', go: () => toggle('flow', true) },
	{ t: 17.2, el: 'v-side', go: () => setView('side', true) },
	{ t: 19.4, el: 'slCur', slide: [slCur, 2.0], dur: 1.6 },
	{ t: 24.0, el: 'slCur', slide: [slCur, 0], dur: 1.0 },
	{ t: 25.6, el: 'b-flow', go: () => toggle('flow', true) },
	{ t: 26.6, el: 'b-optics', go: () => toggle('optics', true) },
	{ t: 27.8, el: 'v-hero', go: () => setView('hero', true) },
	{ t: 29.0, el: 'b-explode', go: () => toggle('explode', true) },
	{ t: 36.6, el: 'b-explode', go: () => toggle('explode', true) },
	{ t: 38.2, el: 'b-mantle', go: () => toggle('mantle', true) },
	{ t: 39.4, el: 'b-beak', go: () => toggle('beak', true) },
	{ t: 41.0, el: 'v-under', go: () => setView('under', true) },
	{ t: 44.0, el: 'b-beak', go: () => toggle('beak', true) },
	{ t: 45.2, el: 'v-top', go: () => setView('top', true) },
	{ t: 48.4, el: 'v-hero', go: () => setView('hero', true) },
];
const LOOP = 52;
const tour = { on: false, t: 0, i: 0, cx: 0, cy: 0, from: null, slide: null };
let lastInput = -1e9;
let clock = 0;

function setTourTag() {
	$('tourtxt').textContent = tour.on ? tr('tour') : tr('user');
	$('tourtag').classList.toggle('user', !tour.on);
}
function resetMachine() {
	for (const k of ['optics', 'mantle', 'arm', 'flow', 'beak', 'explode']) {
		if (ui[k]) { ui[k] = false; $('b-' + k).classList.remove('on'); }
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
			const c = elCenter(b.el);
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
	{ name: 'Q1', pr: 2, shadow: 2048, every: 1 },
	{ name: 'Q2', pr: 1.25, shadow: 1024, every: 1 },
	{ name: 'Q3', pr: 1, shadow: 512, every: 2 },
];
let tier = 0;
function setTier(i, manual) {
	tier = i;
	const T = TIERS[i];
	renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, T.pr));
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
	const armsW = P.armW * (8 - (ui.arm ? 1 : 0)) * (1 + 0.6 * clamp(ui.current / 2, 0, 1));
	const elecW = c.hydW / P.pumpEff + armsW + P.hotelW;
	const fstop = lerp(2.8, 11, 0.5 + 0.5 * Math.sin(simT * (ui.optics ? 1.6 : 0.35)));
	Object.assign(S, { cyc: c, eff, jet, rScale, rpm, elecW, d: ui.nozzleD, curls, fstop });
	hist.push([simT, jet.dP, jet.F]);
	while (hist.length && simT - hist[0][0] > WIN + 0.2) hist.shift();
	const over = c.peakP > P.pumpMaxP;
	if (eff.hold !== lastHold) { log(eff.hold ? 'STATION HELD' : 'DRIFTING · drag exceeds jet'); lastHold = eff.hold; }
	if (over !== lastOver) { log(over ? 'OVERPRESSURE · ' + (c.peakP / 1000).toFixed(0) + ' kPa' : 'PRESSURE NOMINAL'); lastOver = over; }

	// --- animate toward the switches ---
	for (const k of ['optics', 'mantle', 'arm', 'flow', 'beak', 'explode']) anim[k] = damp(anim[k], ui[k] ? 1 : 0, k === 'explode' ? 2.2 : 3.2, dt);
	if (anim.turn !== anim.turnTarget) {
		const sp = 52 * dt;
		anim.turn = anim.turn < anim.turnTarget ? Math.min(anim.turnTarget, anim.turn + sp) : Math.max(anim.turnTarget, anim.turn - sp);
		if (anim.turn >= 360) { anim.turn = 0; anim.turnTarget = 0; }
	}

	// --- pose the machine from the model ---
	root.rotation.y = (anim.turn * PI) / 180;
	root.position.y = 0.018 * Math.sin(simT * 0.8) + 0.008 * jetEase;
	const e = anim.explode;
	head.position.set(0, 0, 0.0);
	mantleRoot.position.set(0, 1.03 + 0.2 * e, -0.055 - 0.3 * e);
	mantleBreath.scale.set(rScale, 1, rScale);
	bladder.scale.set(Math.pow(rScale, 1.6), 1, Math.pow(rScale, 1.6));
	const open = Math.max(anim.mantle, e * 0.85);
	for (const h of shellHalves) h.pivot.rotation.y = h.s * open * 1.12;
	const xr = anim.flow;
	M.shell.opacity = 1 - 0.82 * xr;
	M.shell.transparent = xr > 0.01;
	M.shell.depthWrite = xr < 0.5;
	const lift = Math.max(anim.mantle, e);
	pump.position.y = 0.2 + 0.1 * lift;
	pump.position.z = 0.02 + 0.07 * lift;
	pump.rotation.y = lift * PI * 0.5;
	impeller.rotation.y += (rpm / 60) * TAU * dt * 0.25; // shown at quarter speed so the blades read
	battery.position.set(0, 0.43 + 0.08 * e, -0.03 - 0.1 * e);

	for (const o of optics) {
		const out = Math.max(anim.optics, e);
		o.lens.position.x = o.side * (0.056 + 0.11 * out);
		o.lens.rotation.x = out * 2.6 * o.side;
		const ap = (S.fstop - 2.8) / (11 - 2.8); // 0 = wide open
		for (const b of o.blades) b.rotation.z = 0.25 + ap * 0.9;
		o.iris.scale.setScalar(1);
		o.g.position.x = o.side * (0.178 + 0.2 * e);
	}
	siphon.position.set(0, 0.84 - 0.04 * e, 0.17 + 0.28 * e);
	const nr = ui.nozzleD / 2;
	nozzleRing.scale.set(nr + 0.004, nr + 0.004, nr + 0.004);
	nozzleBore.scale.set(nr, 1, nr);
	beak.position.set(0, 0.765 - 0.26 * e, 0.02);
	const bo = Math.max(anim.beak, e * 0.6);
	for (const j of jaws) j.p.rotation.z = j.s * bo * 0.55;

	if (Math.abs(anim.arm - (paintLinks.last || 0)) > 0.01) { paintLinks(anim.arm); paintLinks.last = anim.arm; }
	poseArms(simT, jetEase, ui.current, e, anim.arm, curls);

	// the part doing the work glows: the jet while contracting, optics while out
	M.accJet.emissiveIntensity = 0.55 * (jet.contracting ? Math.sin(PI * jet.x) : 0);
	M.accOpt.emissiveIntensity = 0.45 * anim.optics;
	M.accBody.emissiveIntensity = 0.3 * Math.max(anim.mantle, anim.arm) * (0.6 + 0.4 * Math.sin(simT * 4));

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
if (QS.has('at')) {
	const n = Math.round(parseFloat(QS.get('at')) * 30);
	for (let i = 0; i < n; i++) { step(1 / 30); if (i % 30 === 0) readouts(1); }
	lastInput = clock - 1; // keep the tour state without restarting it
}

let last = performance.now();
function frame(now) {
	const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
	last = now;
	frameNo++;
	step(dt);
	readouts(dt);
	renderer.render(scene, camera);
	watchPerf(dt);
	requestAnimationFrame(frame);
}
renderer.render(scene, camera);
const loading = $('loading');
loading.style.opacity = '0';
setTimeout(() => loading.remove(), 700);
requestAnimationFrame((t) => { last = t; requestAnimationFrame(frame); });
