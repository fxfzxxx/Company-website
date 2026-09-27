/* Level 26 — a first-person walkthrough of a two-bedroom apartment on the
   26th floor of a residential tower. Units are metres and every dimension is
   the one a real unit would be built to: 2.8 m clear ceiling, 2.1 m door
   heads, 0.9 m sills, 1.6 m eye height, 1.4 m/s walking pace.

   Everything is generated at load — no model files, no image textures. */

import * as THREE from "three";

// Unit outline 10 × 8 m on wall centrelines; exterior walls 240 mm, interior 120 mm.
const H = 2.8;          // clear ceiling height
const EYE = 1.6;        // eye height
const WALK = 1.4;       // walking speed, m/s
const RADIUS = 0.22;    // body collision radius
const ELEVATION = 75;   // 26th floor, height above street
const EXT = 0.24, INT = 0.12;
const LOOK = 0.0016;    // radians per pixel of mouse movement

export function createTour(stage, { spawn = [4.3, 3.4], lookAt = [8.6, 1.3, 7.6] } = {}) {
	// ---------------------------------------------------------------------------
	// Renderer / scene
	// ---------------------------------------------------------------------------
	const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
	renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
	renderer.setSize(innerWidth, innerHeight);
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFSoftShadowMap;
	renderer.shadowMap.autoUpdate = false;
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.05;
	stage.append(renderer.domElement);
	const maxAniso = renderer.capabilities.getMaxAnisotropy();

	const scene = new THREE.Scene();
	const SKY_TOP = new THREE.Color(0x3f7fcf), SKY_HOR = new THREE.Color(0xdbe6ef), SKY_BOT = new THREE.Color(0xc4ced6);
	scene.fog = new THREE.Fog(SKY_HOR, 260, 2800);
	const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.05, 6000);

	// ---------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------
	const rng = (s) => () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
	const std = (o) => new THREE.MeshStandardMaterial(o);
	const canvas = (w, h) => Object.assign(document.createElement("canvas"), { width: w, height: h });
	function toTex(c, size) {
		const t = new THREE.CanvasTexture(c);
		t.colorSpace = THREE.SRGBColorSpace;
		t.wrapS = t.wrapT = THREE.RepeatWrapping;
		t.repeat.set(1 / size, 1 / size);   // all geometry UVs are in metres
		t.anisotropy = maxAniso;
		return t;
	}
	// Rescale BoxGeometry UVs to metres
	function boxUV(geo, w, h, d, ox = 0, oy = 0) {
		const uv = geo.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
		for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
			const k = f * 4 + i;
			uv.setXY(k, uv.getX(k) * dims[f][0] + (f >= 4 ? ox : 0), uv.getY(k) * dims[f][1] + (f < 2 || f >= 4 ? oy : 0));
		}
		return geo;
	}
	// Merge indexed geometries that share position / normal / uv
	function merge(geos) {
		let nv = 0, ni = 0;
		for (const g of geos) { nv += g.attributes.position.count; ni += g.index.count; }
		const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint32Array(ni);
		let v = 0, i = 0;
		for (const g of geos) {
			pos.set(g.attributes.position.array, v * 3); nor.set(g.attributes.normal.array, v * 3); uv.set(g.attributes.uv.array, v * 2);
			for (const k of g.index.array) idx[i++] = k + v;
			v += g.attributes.position.count; g.dispose();
		}
		const out = new THREE.BufferGeometry();
		out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
		out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
		out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
		out.setIndex(new THREE.BufferAttribute(idx, 1));
		return out;
	}

	// ---------------------------------------------------------------------------
	// Procedural textures
	// ---------------------------------------------------------------------------
	function woodTexture() {            // 1.2 m square: eight 150 mm floorboards
		const S = 1024, c = canvas(S, S), g = c.getContext("2d"), r = rng(11), pw = S / 8;
		for (let i = 0; i < 8; i++) {
			const off = -r() * S;
			for (let k = 0; k < 3; k++) {
				const x = i * pw, y = off + k * S;
				const hue = 29 + r() * 7, sat = 36 + r() * 12, lig = 52 + r() * 10;
				g.save(); g.beginPath(); g.rect(x, y, pw, S); g.clip();
				g.fillStyle = `hsl(${hue},${sat}%,${lig}%)`; g.fillRect(x, y, pw, S);
				for (let j = 0; j < 50; j++) {
					let gx = x + r() * pw;
					g.strokeStyle = `hsla(${hue - 5},${sat + 6}%,${lig - 20}%,${0.04 + r() * 0.12})`;
					g.lineWidth = 0.6 + r() * 1.8; g.beginPath(); g.moveTo(gx, y);
					for (let yy = y; yy <= y + S; yy += S / 10) { gx += (r() - 0.5) * 5; g.lineTo(gx, yy); }
					g.stroke();
				}
				g.restore();
				g.fillStyle = "rgba(50,30,15,.45)"; g.fillRect(x, y, 2, S); g.fillRect(x, y, pw, 2);
			}
		}
		return toTex(c, 1.2);
	}
	function tileTexture({ S, nx, ny, base, vary, grout, gw, size, seed }) {
		const c = canvas(S, S), g = c.getContext("2d"), r = rng(seed), tw = S / nx, th = S / ny;
		g.fillStyle = grout; g.fillRect(0, 0, S, S);
		for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
			const v = (r() - 0.5) * vary;
			g.fillStyle = `rgb(${base[0] + v},${base[1] + v},${base[2] + v})`;
			g.fillRect(i * tw + gw / 2, j * th + gw / 2, tw - gw, th - gw);
			for (let k = 0; k < 900; k++) {
				g.fillStyle = `rgba(${r() > 0.5 ? "255,255,255" : "120,110,100"},${r() * 0.07})`;
				g.fillRect(i * tw + r() * tw, j * th + r() * th, 2 + r() * 5, 2 + r() * 5);
			}
		}
		return toTex(c, size);
	}
	function facadeTexture() {          // 3 m × 3 m: one storey, one bay
		const S = 256, c = canvas(S, S), g = c.getContext("2d"), y = (m) => S * (1 - m / 3);
		g.fillStyle = "#d2cfc8"; g.fillRect(0, 0, S, S);
		const gr = g.createLinearGradient(0, y(2.4), 0, y(0.9));
		gr.addColorStop(0, "#50667e"); gr.addColorStop(1, "#8aa2b7");
		g.fillStyle = gr; g.fillRect(0, y(2.4), S, y(0.9) - y(2.4));
		g.fillStyle = "#6f737a";
		for (const x of [0, S / 2]) g.fillRect(x, y(2.4), 5, y(0.9) - y(2.4));
		g.fillRect(0, y(0.9) - 3, S, 3); g.fillRect(0, y(2.4), S, 3);
		g.fillStyle = "rgba(0,0,0,.08)"; g.fillRect(0, y(3), S, 6);
		return toTex(c, 3);
	}
	function groundTexture() {          // 240 m square: city blocks + roads
		const S = 512, c = canvas(S, S), g = c.getContext("2d"), r = rng(5);
		g.fillStyle = "#7d8479"; g.fillRect(0, 0, S, S);
		for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
			const v = (r() - 0.5) * 24;
			g.fillStyle = `rgb(${128 + v},${138 + v},${122 + v})`;
			g.fillRect(i * 128 + 10, j * 128 + 10, 108, 108);
			g.fillStyle = `rgba(70,110,60,${0.2 + r() * 0.3})`;
			g.fillRect(i * 128 + 20 + r() * 40, j * 128 + 20 + r() * 40, 30 + r() * 40, 30 + r() * 40);
		}
		return toTex(c, 240);
	}
	function artTexture() {
		const c = canvas(512, 360), g = c.getContext("2d"), r = rng(21);
		g.fillStyle = "#efe8dc"; g.fillRect(0, 0, 512, 360);
		const cols = ["#c9794f", "#2f4858", "#d9b27c", "#86a397", "#e6cfae"];
		for (let i = 0; i < 7; i++) {
			g.fillStyle = cols[i % cols.length]; g.globalAlpha = 0.85;
			g.beginPath(); g.arc(80 + r() * 360, 60 + r() * 240, 30 + r() * 90, 0, Math.PI * 2); g.fill();
		}
		const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
	}

	// ---------------------------------------------------------------------------
	// Sky, and an environment map made from it
	// ---------------------------------------------------------------------------
	const skyMaterial = new THREE.ShaderMaterial({
		side: THREE.BackSide, depthWrite: false, fog: false,
		uniforms: { top: { value: SKY_TOP }, hor: { value: SKY_HOR }, bot: { value: SKY_BOT } },
		vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
		fragmentShader: `uniform vec3 top, hor, bot; varying vec3 vP;
			void main(){ float h = vP.y; vec3 c = h > 0. ? mix(hor, top, pow(h, .5)) : mix(hor, bot, pow(-h, .4)); gl_FragColor = vec4(c, 1.);
			#include <tonemapping_fragment>
			#include <colorspace_fragment>
			}`,
	});
	const sky = new THREE.Mesh(new THREE.SphereGeometry(4000, 32, 16), skyMaterial);
	sky.renderOrder = -1; scene.add(sky);
	{
		const envScene = new THREE.Scene();
		envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMaterial));
		const warm = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshBasicMaterial({ color: 0xb8a58c }));
		warm.rotation.x = -Math.PI / 2; warm.position.y = -2; envScene.add(warm);
		const pmrem = new THREE.PMREMGenerator(renderer);
		scene.environment = pmrem.fromScene(envScene, 0.04).texture;
		scene.environmentIntensity = 0.45;
		pmrem.dispose();
	}

	// ---------------------------------------------------------------------------
	// Materials
	// ---------------------------------------------------------------------------
	const M = {
		paint: std({ color: 0xf1eee8, roughness: 0.95 }),
		ceiling: std({ color: 0xf8f8f6, roughness: 0.95 }),
		trim: std({ color: 0xf3f0e9, roughness: 0.45 }),
		skirt: std({ color: 0xe9e5dd, roughness: 0.5 }),
		door: std({ color: 0xe6dfd2, roughness: 0.55 }),
		entry: std({ color: 0x51565c, roughness: 0.45, metalness: 0.35 }),
		entryTrim: std({ color: 0x3e4146, roughness: 0.5, metalness: 0.3 }),
		handle: std({ color: 0xcfd2d6, roughness: 0.25, metalness: 1 }),
		frame: std({ color: 0x3a3d42, roughness: 0.45, metalness: 0.5 }),
		glass: new THREE.MeshPhysicalMaterial({ color: 0xe2eef2, transparent: true, opacity: 0.12, roughness: 0.03, side: THREE.DoubleSide, depthWrite: false }),
		frosted: std({ color: 0xf2f5f5, transparent: true, opacity: 0.88, roughness: 0.9, side: THREE.DoubleSide }),
		showerGlass: new THREE.MeshPhysicalMaterial({ color: 0xdfeff0, transparent: true, opacity: 0.2, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false }),
		stone: std({ color: 0xe6e2da, roughness: 0.3 }),
		basin: std({ color: 0xdcdcdc, roughness: 0.1 }),
		wood: std({ map: woodTexture(), roughness: 0.6 }),
		floorTile: std({ map: tileTexture({ S: 1024, nx: 2, ny: 2, base: [214, 210, 202], vary: 8, grout: "#aaa59c", gw: 4, size: 1.2, seed: 3 }), roughness: 0.25 }),
		wallTile: std({ map: tileTexture({ S: 512, nx: 1, ny: 2, base: [238, 238, 235], vary: 4, grout: "#c8c8c2", gw: 3, size: 0.6, seed: 4 }), roughness: 0.2 }),
		fabric: std({ color: 0x858b92, roughness: 1 }),
		cushion: std({ color: 0x969ca3, roughness: 1 }),
		accent: std({ color: 0x5f7589, roughness: 1 }),
		accent2: std({ color: 0xc58c5c, roughness: 1 }),
		woodLight: std({ color: 0xc7a47b, roughness: 0.6 }),
		woodDark: std({ color: 0x5e4838, roughness: 0.55 }),
		white: std({ color: 0xf2f1ee, roughness: 0.4 }),
		panel: std({ color: 0xebe7df, roughness: 0.45 }),
		black: std({ color: 0x151618, roughness: 0.35 }),
		screen: std({ color: 0x06070a, roughness: 0.06, metalness: 0.3 }),
		metal: std({ color: 0xb9bec4, roughness: 0.28, metalness: 0.9 }),
		metalDark: std({ color: 0x2c2e31, roughness: 0.5, metalness: 0.6 }),
		pendant: std({ color: 0x2c2e31, roughness: 0.5, metalness: 0.6, side: THREE.DoubleSide }),
		ceramic: std({ color: 0xfafafa, roughness: 0.12 }),
		mirror: std({ color: 0xe6eef0, roughness: 0.03, metalness: 1 }),
		bedding: std({ color: 0xf0ede6, roughness: 1 }),
		duvet: std({ color: 0x8698a6, roughness: 1 }),
		duvet2: std({ color: 0xd6c1a3, roughness: 1 }),
		headboard: std({ color: 0xb9ada0, roughness: 1 }),
		rug: std({ color: 0xbdb2a2, roughness: 1 }),
		curtain: std({ color: 0xdcd5c9, roughness: 1, side: THREE.DoubleSide }),
		leaf: std({ color: 0x4d7a45, roughness: 0.8, flatShading: true }),
		pot: std({ color: 0xd8d2c8, roughness: 0.7 }),
		plinth: std({ color: 0x2b2b2b, roughness: 0.8 }),
		light: new THREE.MeshBasicMaterial({ color: 0xfff3dc }),
		shade: std({ color: 0xf1e8d8, emissive: 0xffd49a, emissiveIntensity: 0.55, roughness: 1, side: THREE.DoubleSide }),
		art: std({ map: artTexture(), roughness: 0.8 }),
	};

	// ---------------------------------------------------------------------------
	// Collision & minimap data
	// ---------------------------------------------------------------------------
	const colliders = [], wallRects = [], furnRects = [], winLines = [], doorLines = [];
	function addRect(x0, x1, z0, z1, list) {
		const r = { x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1) };
		colliders.push(r); if (list) list.push(r);
	}
	// Wall-local coords (lx along wall, lz across it) → world (x, z)
	const toWorld = (axis, at, lx, lz) => axis === "x" ? [lx, at + lz] : [at - lz, lx];
	function frame(axis, at) {
		const g = new THREE.Group();
		if (axis === "x") g.position.z = at; else { g.position.x = at; g.rotation.y = -Math.PI / 2; }
		scene.add(g); return g;
	}
	function P(g, w, h, d, mat, x, y, z, shadow = true) {         // box, y = bottom
		const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
		m.position.set(x, y + h / 2, z); m.castShadow = shadow; m.receiveShadow = true; g.add(m); return m;
	}
	function C(g, rt, rb, h, mat, x, y, z, seg = 24) {           // cylinder, y = bottom
		const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
		m.position.set(x, y + h / 2, z); m.castShadow = m.receiveShadow = true; g.add(m); return m;
	}
	function wbox(x0, x1, y0, y1, z0, z1, mat, col = false, shadow = true) {
		const m = P(scene, x1 - x0, y1 - y0, z1 - z0, mat, (x0 + x1) / 2, y0, (z0 + z1) / 2, shadow);
		if (col) addRect(x0, x1, z0, z1, furnRects);
		return m;
	}
	function place(g, x, z, ry, w, d, col = true) {               // furniture group; origin = footprint centre
		g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g);
		if (col) { const s = Math.abs(Math.sin(ry)) > 0.5, hw = (s ? d : w) / 2, hd = (s ? w : d) / 2; addRect(x - hw, x + hw, z - hd, z + hd, furnRects); }
		return g;
	}

	// ---------------------------------------------------------------------------
	// Walls (door/window openings, casings, door leaves, window frames, skirting)
	// ---------------------------------------------------------------------------
	function wall({ axis, at, from, to, t, openings = [], mat = M.paint, inside = 0, collide = true, decorate = true, skirt = [] }) {
		const g = frame(axis, at), ops = [...openings].sort((p, q) => p.a - q.a);
		const piece = (x0, x1, y0, y1) => {
			if (x1 - x0 < 1e-4 || y1 - y0 < 1e-4) return;
			const w = x1 - x0, h = y1 - y0, m = new THREE.Mesh(boxUV(new THREE.BoxGeometry(w, h, t), w, h, t, x0, y0), mat);
			m.position.set(x0 + w / 2, y0 + h / 2, 0); m.castShadow = m.receiveShadow = true; g.add(m);
		};
		let cur = from;
		for (const p of ops) {
			piece(cur, p.a, 0, H);
			if (p.bottom > 0) piece(p.a, p.b, 0, p.bottom);
			if (p.top < H) piece(p.a, p.b, p.top, H);
			cur = p.b;
			if (decorate) (p.kind === "window" ? addWindow : addDoor)(g, p, t, inside, axis, at);
		}
		piece(cur, to, 0, H);

		if (collide) {
			let c = from;
			for (const p of ops) if (p.kind === "door") {
				if (p.a > c) { const [x0, z0] = toWorld(axis, at, c, -t / 2), [x1, z1] = toWorld(axis, at, p.a, t / 2); addRect(x0, x1, z0, z1, wallRects); }
				c = p.b;
			}
			if (to > c) { const [x0, z0] = toWorld(axis, at, c, -t / 2), [x1, z1] = toWorld(axis, at, to, t / 2); addRect(x0, x1, z0, z1, wallRects); }
			for (const p of ops) if (p.kind !== "door") (p.kind === "window" ? winLines : doorLines).push([...toWorld(axis, at, p.a, 0), ...toWorld(axis, at, p.b, 0)]);
		}

		for (const [s0, s1, side] of skirt) {                       // 80 mm skirting
			let c = s0; const segs = [];
			for (const p of ops) if (p.bottom < 0.05 && p.b > s0 && p.a < s1) { if (p.a > c) segs.push([c, p.a]); c = Math.max(c, p.b); }
			if (s1 > c) segs.push([c, s1]);
			for (const [a, b] of segs) P(g, b - a, 0.08, 0.012, M.skirt, (a + b) / 2, 0, side * (t / 2 + 0.006), false);
		}
	}
	function addWindow(g, p, t, inside) {
		const w = p.b - p.a, h = p.top - p.bottom, cx = (p.a + p.b) / 2, y0 = p.bottom, fw = 0.05, fd = 0.07;
		const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), p.frosted ? M.frosted : M.glass);
		glass.position.set(cx, y0 + h / 2, 0); g.add(glass);
		P(g, w, fw, fd, M.frame, cx, y0, 0); P(g, w, fw, fd, M.frame, cx, p.top - fw, 0);
		P(g, fw, h, fd, M.frame, p.a + fw / 2, y0, 0); P(g, fw, h, fd, M.frame, p.b - fw / 2, y0, 0);
		const n = Math.max(1, Math.round(w / 1.2));
		for (let i = 1; i < n; i++) P(g, 0.045, h, fd, M.frame, p.a + w * i / n, y0, 0);
		if (h > 1.9) P(g, w, 0.045, fd, M.frame, cx, p.top - 0.55, 0);            // transom
		if (inside && p.bottom > 0.05) { const dep = t / 2 + 0.05; P(g, w + 0.12, 0.03, dep, M.stone, cx, p.bottom - 0.028, inside * dep / 2); }
	}
	function addDoor(g, p, t, inside, axis, at) {
		const cw = 0.07, d = t + 0.03, tm = p.kind === "entry" ? M.entryTrim : M.trim;
		P(g, cw, p.top + 0.05, d, tm, p.a - cw / 2 + 0.02, 0, 0);
		P(g, cw, p.top + 0.05, d, tm, p.b + cw / 2 - 0.02, 0, 0);
		P(g, p.b - p.a + 2 * cw - 0.04, cw, d, tm, (p.a + p.b) / 2, p.top - 0.02, 0);
		const L = p.leaf; if (!L) return;
		const hs = L.hinge === "a" ? 1 : -1, lw = p.b - p.a - 0.05, lh = p.top - 0.03, lt = p.kind === "entry" ? 0.07 : 0.04;
		const hx = hs === 1 ? p.a + 0.025 : p.b - 0.025, hz = L.side * (t / 2 - lt / 2 - 0.005), phi = -L.side * hs * THREE.MathUtils.degToRad(L.angle);
		const pivot = new THREE.Group(); pivot.position.set(hx, 0.01, hz); pivot.rotation.y = phi; g.add(pivot);
		const geo = new THREE.BoxGeometry(lw, lh, lt); geo.translate(hs * lw / 2, lh / 2, 0);
		const leaf = new THREE.Mesh(geo, p.kind === "entry" ? M.entry : M.door); leaf.castShadow = leaf.receiveShadow = true; pivot.add(leaf);
		const hxL = hs * (lw - 0.08);
		P(pivot, 0.05, 0.05, lt + 0.07, M.handle, hxL, 1.0 - 0.025, 0);                // handle rose
		for (const s of [-1, 1]) P(pivot, 0.13, 0.02, 0.02, M.handle, hxL - hs * 0.055, 0.99, s * (lt / 2 + 0.035));
		if (L.angle > 0) {                                                               // open door leaves collide too
			const ex = hx + lw * hs * Math.cos(phi), ez = hz - lw * hs * Math.sin(phi);
			const [x0, z0] = toWorld(axis, at, hx, hz), [x1, z1] = toWorld(axis, at, ex, ez);
			addRect(Math.min(x0, x1) - 0.03, Math.max(x0, x1) + 0.03, Math.min(z0, z1) - 0.03, Math.max(z0, z1) + 0.03, furnRects);
		}
	}
	function curtains(axis, at, wa, wb, inside, t, lo, hi) {
		const g = frame(axis, at), z = inside * (t / 2 + 0.13), h = H - 0.08;
		const r0 = Math.max(lo, wa - 0.5), r1 = Math.min(hi, wb + 0.5);
		P(g, r1 - r0, 0.03, 0.04, M.metalDark, (r0 + r1) / 2, H - 0.06, z, false);
		for (const [a, b] of [[Math.max(lo, wa - 0.45), wa + 0.05], [wb - 0.05, Math.min(hi, wb + 0.45)]]) {
			const w = b - a, geo = new THREE.PlaneGeometry(w, h, Math.round(w * 40), 1), pos = geo.attributes.position;
			for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * Math.PI * 2 / 0.13) * 0.03);
			geo.computeVertexNormals();
			const m = new THREE.Mesh(geo, M.curtain); m.position.set((a + b) / 2, 0.02 + h / 2, z); m.castShadow = m.receiveShadow = true; g.add(m);
		}
	}

	// ---------------------------------------------------------------------------
	// Floor plan. +z is north: the living room and main bedroom face the sun,
	// as they would in New Zealand.
	//   z=0 (south): bedroom 2 | bathroom | kitchen | entry
	//   z=8 (north): main bedroom | living room glazing
	// ---------------------------------------------------------------------------
	const door = (a, b, leaf, w = 2.1) => ({ a, b, bottom: 0, top: w, kind: "door", leaf });
	const win = (a, b, bottom, top, extra = {}) => ({ a, b, bottom, top, kind: "window", ...extra });

	// Exterior walls
	wall({ axis: "x", at: 0, from: -0.12, to: 10.12, t: EXT, inside: 1, skirt: [[0, 3.4, 1], [8, 10, 1]], openings: [
		win(0.9, 2.5, 0.9, 2.4), win(4.1, 4.9, 1.5, 2.2, { frosted: true }), win(6.2, 7.4, 1.0, 2.3),
		{ a: 8.6, b: 9.6, bottom: 0, top: 2.1, kind: "entry", leaf: { hinge: "a", side: 1, angle: 0 } },
	] });
	wall({ axis: "x", at: 8, from: -0.12, to: 10.12, t: EXT, inside: -1, skirt: [[0, 10, -1]], openings: [win(0.8, 3.0, 0.9, 2.4), win(4.4, 9.4, 0.15, 2.5)] });
	wall({ axis: "z", at: 0, from: 0, to: 8, t: EXT, inside: -1, skirt: [[0, 8, -1]] });
	wall({ axis: "z", at: 10, from: 0, to: 8, t: EXT, inside: 1, skirt: [[0, 8, 1]], openings: [win(3.6, 6.4, 0.9, 2.4)] });
	// Interior walls
	wall({ axis: "z", at: 3.4, from: 0, to: 3.2, t: INT, skirt: [[0, 3.2, 1], [2.8, 3.2, -1]] });
	wall({ axis: "x", at: 3.2, from: 0, to: 3.4, t: INT, skirt: [[0, 3.4, -1], [0, 3.4, 1]], openings: [door(2.2, 3.1, { hinge: "b", side: -1, angle: 88 })] });
	wall({ axis: "z", at: 5.6, from: 0, to: 2.8, t: INT });
	wall({ axis: "x", at: 2.8, from: 3.4, to: 5.6, t: INT, skirt: [[3.4, 5.6, 1]], openings: [door(4.1, 4.9, { hinge: "a", side: -1, angle: 88 })] });
	wall({ axis: "x", at: 2.8, from: 5.6, to: 8.0, t: INT, skirt: [[5.6, 8, 1]] });
	wall({ axis: "z", at: 8.0, from: 0, to: 2.8, t: INT, skirt: [[0, 2.8, -1]], openings: [door(1.6, 2.5, { hinge: "b", side: 1, angle: 88 })] });
	wall({ axis: "x", at: 4.3, from: 0, to: 3.8, t: INT, skirt: [[0, 3.8, -1], [0, 3.8, 1]], openings: [door(2.7, 3.6, { hinge: "b", side: 1, angle: 88 })] });
	wall({ axis: "z", at: 3.8, from: 4.3, to: 8, t: INT, skirt: [[4.3, 8, 1], [4.3, 8, -1]] });
	// Full-height wall tiles in bathroom and kitchen
	const tiles = { t: 0.01, mat: M.wallTile, collide: false, decorate: false };
	wall({ ...tiles, axis: "x", at: 0.125, from: 3.46, to: 5.54, openings: [win(4.1, 4.9, 1.5, 2.2)] });
	wall({ ...tiles, axis: "x", at: 2.735, from: 3.46, to: 5.54, openings: [door(4.1, 4.9)] });
	wall({ ...tiles, axis: "z", at: 3.465, from: 0.12, to: 2.74 });
	wall({ ...tiles, axis: "z", at: 5.535, from: 0.12, to: 2.74 });
	wall({ ...tiles, axis: "x", at: 0.125, from: 5.66, to: 7.94, openings: [win(6.2, 7.4, 1.0, 2.3)] });
	wall({ ...tiles, axis: "x", at: 2.735, from: 5.66, to: 7.94 });
	wall({ ...tiles, axis: "z", at: 5.665, from: 0.12, to: 2.74 });
	wall({ ...tiles, axis: "z", at: 7.935, from: 0.12, to: 2.74, openings: [door(1.6, 2.5)] });

	// Floors / ceiling
	function floor(x0, x1, z0, z1, mat, y = 0) {
		const w = x1 - x0, d = z1 - z0, geo = new THREE.PlaneGeometry(w, d), uv = geo.attributes.uv;
		for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w + x0, uv.getY(i) * d - z1);
		geo.rotateX(-Math.PI / 2);
		const m = new THREE.Mesh(geo, mat); m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); m.receiveShadow = true; scene.add(m);
	}
	floor(0, 10, 0, 8, M.wood);
	floor(3.4, 5.6, 0, 2.8, M.floorTile, 0.003);
	floor(5.6, 10, 0, 2.8, M.floorTile, 0.003);
	floor(4.08, 4.92, 2.74, 2.86, M.stone, 0.004);               // stone thresholds
	floor(7.94, 8.06, 1.58, 2.52, M.stone, 0.004);
	wbox(-0.12, 10.12, H, H + 0.12, -0.12, 8.12, M.ceiling);

	// ---------------------------------------------------------------------------
	// Lighting
	// ---------------------------------------------------------------------------
	scene.add(new THREE.HemisphereLight(0xe3ecff, 0x9c9384, 0.55));
	const sun = new THREE.DirectionalLight(0xfff1dd, 3.2);
	sun.position.set(5 - 22, 30, 4 + 30); sun.target.position.set(5, 1, 4);
	sun.castShadow = true;
	Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 1, far: 90 });
	sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
	scene.add(sun, sun.target);
	for (const [x, y, z, i] of [[6.8, 2.55, 6.5, 7], [1.9, 2.55, 6.1, 5], [1.7, 2.55, 1.6, 4], [6.8, 2.55, 1.4, 4], [4.5, 2.55, 1.4, 3], [9.0, 2.55, 1.4, 3], [2.0, 2.55, 3.75, 2.5], [6.9, 1.35, 4.0, 3]]) {
		const l = new THREE.PointLight(0xffe7c4, i, 0, 2); l.position.set(x, y, z); scene.add(l);
	}
	function downlight(x, z) { const m = new THREE.Mesh(new THREE.CircleGeometry(0.05, 20), M.light); m.rotation.x = Math.PI / 2; m.position.set(x, H - 0.002, z); scene.add(m); }
	[[5.3, 5.6], [8.3, 5.6], [5.3, 7.3], [8.3, 7.3], [1.9, 3.75], [0.8, 3.75], [3.0, 3.75], [4.6, 3.6], [9.0, 0.9], [9.0, 2.1],
		[6.3, 1.4], [7.3, 1.4], [4.5, 1.8], [1.0, 5.2], [2.8, 7.2], [1.0, 1.6], [2.4, 1.6]].forEach(([x, z]) => downlight(x, z));

	// ---------------------------------------------------------------------------
	// Furniture
	// ---------------------------------------------------------------------------
	function sofa() {
		const g = new THREE.Group(), W = 2.2, D = 0.9;
		for (const sx of [-1, 1]) for (const sz of [-1, 1]) C(g, 0.02, 0.02, 0.1, M.metalDark, sx * (W / 2 - 0.08), 0, sz * (D / 2 - 0.08));
		P(g, W, 0.3, D, M.fabric, 0, 0.1, 0);
		for (const s of [-1, 1]) P(g, 0.18, 0.52, D, M.fabric, s * (W / 2 - 0.09), 0.1, 0);
		P(g, W, 0.48, 0.2, M.fabric, 0, 0.4, -D / 2 + 0.1);
		const cw = (W - 0.36) / 3;
		for (let i = 0; i < 3; i++) {
			const x = -W / 2 + 0.18 + cw * (i + 0.5);
			P(g, cw - 0.012, 0.12, D - 0.22, M.cushion, x, 0.4, 0.11);
			P(g, cw - 0.012, 0.4, 0.14, M.cushion, x, 0.5, -D / 2 + 0.27).rotation.x = -0.12;
		}
		P(g, 0.42, 0.4, 0.12, M.accent, -0.72, 0.52, -0.12).rotation.set(-0.2, 0.3, 0);
		P(g, 0.42, 0.4, 0.12, M.accent2, 0.72, 0.52, -0.12).rotation.set(-0.2, -0.3, 0);
		return g;
	}
	function coffeeTable() {
		const g = new THREE.Group();
		P(g, 1.2, 0.04, 0.6, M.woodLight, 0, 0.38, 0);
		P(g, 1.1, 0.02, 0.5, M.woodLight, 0, 0.12, 0);
		for (const sx of [-1, 1]) for (const sz of [-1, 1]) P(g, 0.035, 0.38, 0.035, M.metalDark, sx * 0.56, 0, sz * 0.26);
		P(g, 0.28, 0.04, 0.2, M.accent, 0.3, 0.42, 0.05); P(g, 0.24, 0.03, 0.17, M.white, 0.3, 0.46, 0.05);
		return g;
	}
	function tvUnit() {
		const g = new THREE.Group(), W = 2.0, D = 0.4;
		P(g, W - 0.1, 0.1, D - 0.08, M.plinth, 0, 0, -0.02);
		P(g, W, 0.36, D, M.panel, 0, 0.1, 0);
		for (let i = 0; i < 4; i++) P(g, 0.485, 0.33, 0.012, M.woodLight, -W / 2 + 0.25 + i * 0.5, 0.115, D / 2);
		P(g, 1.45, 0.84, 0.035, M.black, 0, 0.8, -D / 2 + 0.02);                         // wall-mounted 65" TV
		P(g, 1.43, 0.81, 0.002, M.screen, 0, 0.815, -D / 2 + 0.038);
		C(g, 0.06, 0.05, 0.28, M.pot, 0.75, 0.46, 0.02); P(g, 0.3, 0.05, 0.22, M.woodDark, -0.7, 0.46, 0.02);
		return g;
	}
	function chair() {
		const g = new THREE.Group();
		for (const sx of [-1, 1]) for (const sz of [-1, 1]) P(g, 0.03, 0.43, 0.03, M.woodDark, sx * 0.19, 0, sz * 0.18);
		P(g, 0.44, 0.04, 0.42, M.woodLight, 0, 0.43, 0);
		for (const sx of [-1, 1]) P(g, 0.03, 0.45, 0.03, M.woodDark, sx * 0.19, 0.47, -0.195);
		P(g, 0.44, 0.2, 0.025, M.woodLight, 0, 0.7, -0.2);
		return g;
	}
	function diningTable() {
		const g = new THREE.Group();
		P(g, 1.4, 0.035, 0.8, M.woodLight, 0, 0.715, 0);
		for (const sx of [-1, 1]) for (const sz of [-1, 1]) P(g, 0.05, 0.715, 0.05, M.woodDark, sx * 0.62, 0, sz * 0.32);
		C(g, 0.05, 0.04, 0.18, M.pot, 0, 0.75, 0); for (let i = 0; i < 5; i++) C(g, 0.004, 0.004, 0.25, M.leaf, (i - 2) * 0.012, 0.9, 0, 6);
		return g;
	}
	function bed(w, l, duvet) {
		const g = new THREE.Group(), L = l + 0.08, zc = -L / 2 + 0.08 + l / 2;
		P(g, w + 0.12, 1.05, 0.08, M.headboard, 0, 0, -L / 2 + 0.04);
		P(g, w + 0.08, 0.28, l, M.woodLight, 0, 0.06, zc);
		P(g, w, 0.22, l - 0.04, M.bedding, 0, 0.32, zc);
		P(g, w + 0.1, 0.2, l * 0.72 + 0.03, duvet, 0, 0.36, zc + l * 0.14);
		for (const s of [-1, 1]) P(g, w / 2 - 0.12, 0.13, 0.38, M.bedding, s * w / 4, 0.54, -L / 2 + 0.33).rotation.x = -0.25;
		return g;
	}
	function nightstand() {
		const g = new THREE.Group();
		P(g, 0.45, 0.42, 0.4, M.woodLight, 0, 0.08, 0);
		for (const sx of [-1, 1]) for (const sz of [-1, 1]) P(g, 0.025, 0.08, 0.025, M.woodDark, sx * 0.2, 0, sz * 0.17);
		P(g, 0.41, 0.004, 0.005, M.woodDark, 0, 0.3, 0.2);
		C(g, 0.06, 0.07, 0.28, M.pot, 0, 0.5, -0.03); C(g, 0.1, 0.14, 0.18, M.shade, 0, 0.74, -0.03);
		return g;
	}
	function wardrobe(w, d, h) {
		const g = new THREE.Group(), n = Math.round(w / 0.5), dw = w / n;
		P(g, w, 0.08, d - 0.04, M.plinth, 0, 0, -0.02);
		P(g, w, h - 0.08, d - 0.02, M.panel, 0, 0.08, -0.01);
		for (let i = 0; i < n; i++) {
			const x = -w / 2 + dw * (i + 0.5);
			P(g, dw - 0.006, h - 0.1, 0.02, M.panel, x, 0.09, d / 2 - 0.01);
			P(g, 0.015, 0.35, 0.02, M.metal, x + (i % 2 ? -1 : 1) * (dw / 2 - 0.05), 1.0, d / 2 + 0.01);
		}
		return g;
	}
	function desk() {
		const g = new THREE.Group();
		P(g, 1.0, 0.03, 0.5, M.woodLight, 0, 0.72, 0);
		for (const sx of [-1, 1]) for (const sz of [-1, 1]) P(g, 0.03, 0.72, 0.03, M.metalDark, sx * 0.47, 0, sz * 0.22);
		P(g, 0.32, 0.015, 0.22, M.metalDark, 0.15, 0.75, 0.05);
		P(g, 0.32, 0.21, 0.01, M.metalDark, 0.15, 0.765, -0.06).rotation.x = -0.25;
		C(g, 0.1, 0.12, 0.05, M.metalDark, -0.35, 0.75, -0.12); C(g, 0.01, 0.01, 0.4, M.metalDark, -0.35, 0.8, -0.12); C(g, 0.03, 0.07, 0.1, M.shade, -0.35, 1.18, -0.12);
		return g;
	}
	function plant(x, z, s = 1) {
		const g = new THREE.Group(), r = rng(Math.round(x * 100 + z));
		C(g, 0.17 * s, 0.13 * s, 0.35 * s, M.pot, 0, 0, 0);
		for (let i = 0; i < 7; i++) {
			const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18 * s * (0.7 + r() * 0.5), 1), M.leaf);
			m.position.set((r() - 0.5) * 0.3 * s, (0.5 + r() * 0.8) * s, (r() - 0.5) * 0.3 * s); m.castShadow = true; g.add(m);
		}
		C(g, 0.015, 0.02, 0.9 * s, M.woodDark, 0, 0.3 * s, 0, 6);
		return place(g, x, z, 0, 0.36 * s, 0.36 * s);
	}
	function floorLamp(x, z) {
		const g = new THREE.Group();
		C(g, 0.15, 0.15, 0.02, M.metalDark, 0, 0, 0); C(g, 0.012, 0.012, 1.4, M.metalDark, 0, 0.02, 0); C(g, 0.17, 0.2, 0.3, M.shade, 0, 1.35, 0);
		const l = new THREE.PointLight(0xffd9a0, 1.2, 0, 2); l.position.set(0, 1.45, 0); g.add(l);
		return place(g, x, z, 0, 0.3, 0.3);
	}

	// Living / dining. The living group sits south of a ~0.7 m walkway and the
	// dining table keeps 0.74 m free behind it, so the room can be crossed both ways.
	place(sofa(), 7.75, 6.5, -Math.PI / 2, 2.2, 0.9);
	place(coffeeTable(), 6.2, 6.5, Math.PI / 2, 1.2, 0.6);
	place(tvUnit(), 4.06, 6.5, Math.PI / 2, 2.0, 0.4);
	wbox(5.1, 7.6, 0, 0.008, 5.35, 7.65, M.rug, false, false);
	floorLamp(8.45, 7.55);
	plant(9.55, 7.5, 1.1); plant(4.2, 5.1, 0.9);
	place(diningTable(), 6.9, 4.0, 0, 1.4, 0.8);
	for (const x of [6.55, 7.25]) place(chair(), x, 4.5, Math.PI, 0.44, 0.44);
	place(chair(), 5.9, 4.0, Math.PI / 2, 0.44, 0.44);
	place(chair(), 7.9, 4.0, -Math.PI / 2, 0.44, 0.44);
	{ // dining pendant
		const g = new THREE.Group();
		C(g, 0.004, 0.004, H - 1.65, M.metalDark, 0, 1.65, 0, 6);
		const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.24, 0.2, 32, 1, true), M.pendant);
		shade.position.y = 1.55; g.add(shade);
		const glow = new THREE.Mesh(new THREE.CircleGeometry(0.22, 32), M.light); glow.rotation.x = Math.PI / 2; glow.position.y = 1.47; g.add(glow);
		place(g, 6.9, 4.0, 0, 0, 0, false);
	}
	{ // artwork on the living side of the kitchen wall
		wbox(6.4, 7.4, 1.3, 2.0, 2.86, 2.89, M.woodDark);
		const art = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.62), M.art); art.position.set(6.9, 1.65, 2.8905); scene.add(art);
	}
	curtains("x", 8, 4.4, 9.4, -1, EXT, 3.88, 9.86);
	curtains("z", 10, 3.6, 6.4, 1, EXT, 2.9, 7.86);

	// Main bedroom
	place(bed(1.8, 2.0, M.duvet), 1.16, 6.1, Math.PI / 2, 2.08, 1.9);
	place(nightstand(), 0.34, 4.87, Math.PI / 2, 0.45, 0.4);
	place(nightstand(), 0.34, 7.33, Math.PI / 2, 0.45, 0.4);
	place(wardrobe(2.0, 0.6, 2.4), 3.44, 6.4, -Math.PI / 2, 2.0, 0.6);
	wbox(0.75, 1.65, 2.2, 2.5, 4.36, 4.58, M.white);                                   // wall-mounted heat pump
	curtains("x", 8, 0.8, 3.0, -1, EXT, 0.14, 3.72);

	// Bedroom 2
	place(bed(1.5, 2.0, M.duvet2), 1.16, 2.05, Math.PI / 2, 2.08, 1.6);
	place(nightstand(), 0.34, 0.95, Math.PI / 2, 0.45, 0.4);
	place(desk(), 1.7, 0.39, 0, 1.0, 0.5);
	place(chair(), 1.7, 0.9, Math.PI, 0.44, 0.44);
	place(wardrobe(1.4, 0.55, 2.4), 3.065, 0.9, -Math.PI / 2, 1.4, 0.55);
	wbox(1.0, 1.9, 2.2, 2.5, 2.92, 3.14, M.white);
	curtains("x", 0, 0.9, 2.5, 1, EXT, 0.14, 3.32);

	// Kitchen (benchtop 0.86 m)
	wbox(5.66, 7.94, 0, 0.1, 0.12, 0.66, M.plinth, true);
	wbox(5.66, 7.94, 0.1, 0.82, 0.12, 0.72, M.panel);
	wbox(5.66, 7.94, 0.82, 0.86, 0.12, 0.74, M.stone);
	wbox(5.66, 6.26, 0, 0.82, 0.72, 2.04, M.panel, true);
	wbox(5.66, 6.28, 0.82, 0.86, 0.72, 2.04, M.stone);
	for (let x = 6.26; x < 7.9; x += 0.5) wbox(x + 0.01, x + 0.49, 0.12, 0.8, 0.72, 0.735, M.panel);
	wbox(6.45, 7.15, 0.86, 0.865, 0.2, 0.62, M.metal);                                  // sink
	wbox(6.49, 7.11, 0.861, 0.867, 0.24, 0.58, M.metalDark);
	C(scene, 0.015, 0.02, 0.32, M.metal, 6.8, 0.86, 0.18); wbox(6.785, 6.815, 1.15, 1.18, 0.18, 0.38, M.metal);
	wbox(5.7, 6.24, 0.86, 0.866, 1.15, 1.7, M.black);                                   // hob
	for (const z of [1.28, 1.57]) { const b = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.008, 6, 24), M.metal); b.rotation.x = Math.PI / 2; b.position.set(5.97, 0.87, z); scene.add(b); }
	wbox(5.66, 6.16, 1.65, 1.75, 1.0, 1.85, M.metal); wbox(5.66, 5.9, 1.75, H, 1.25, 1.6, M.metal);  // rangehood
	wbox(5.66, 6.01, 1.55, 2.35, 0.12, 0.95, M.panel);                                  // wall cabinets
	wbox(7.4, 7.94, 1.55, 2.35, 0.12, 0.47, M.panel);
	wbox(5.66, 6.36, 0, 1.8, 2.04, 2.74, M.metal, true);                                // fridge
	wbox(6.36, 6.37, 0.05, 1.75, 2.08, 2.7, M.metalDark);

	// Bathroom
	wbox(3.46, 4.46, 0, 0.03, 0.12, 1.12, M.ceramic);                                   // shower tray
	wbox(4.455, 4.465, 0.03, 2.03, 0.13, 1.12, M.showerGlass, true, false);
	wbox(4.45, 4.47, 2.0, 2.03, 0.12, 1.12, M.metal);
	C(scene, 0.012, 0.012, 1.0, M.metal, 3.5, 1.05, 0.6); wbox(3.47, 3.55, 1.0, 1.12, 0.52, 0.68, M.metal);
	wbox(3.5, 3.78, 2.03, 2.05, 0.59, 0.61, M.metal); C(scene, 0.12, 0.12, 0.015, M.metal, 3.78, 2.0, 0.6);
	{ // toilet (seat 0.42 m)
		const g = new THREE.Group();
		P(g, 0.4, 0.4, 0.18, M.ceramic, 0, 0.38, -0.26);
		P(g, 0.28, 0.36, 0.34, M.ceramic, 0, 0, -0.02);
		const bowl = C(g, 0.19, 0.17, 0.06, M.ceramic, 0, 0.36, 0.06); bowl.scale.z = 1.3;
		const seat = C(g, 0.19, 0.19, 0.02, M.white, 0, 0.42, 0.06); seat.scale.z = 1.3;
		place(g, 5.19, 0.75, -Math.PI / 2, 0.4, 0.7);
	}
	{ // vanity + mirror (top 0.86 m)
		const g = new THREE.Group();
		P(g, 0.8, 0.5, 0.46, M.woodLight, 0, 0.3, 0.01);
		P(g, 0.8, 0.06, 0.5, M.ceramic, 0, 0.8, 0);
		P(g, 0.5, 0.006, 0.32, M.basin, 0, 0.858, 0.03);
		C(g, 0.015, 0.02, 0.2, M.metal, 0, 0.86, -0.18);
		P(g, 0.7, 0.85, 0.02, M.mirror, 0, 1.15, -0.24);
		P(g, 0.6, 0.02, 0.04, M.light, 0, 2.05, -0.22);
		place(g, 5.29, 1.9, -Math.PI / 2, 0.8, 0.5);
	}
	wbox(4.3, 4.6, H - 0.005, H, 1.9, 2.2, M.panel, false, false);                       // extractor fan

	// Entry
	{
		const g = new THREE.Group();
		P(g, 1.16, 0.1, 0.3, M.plinth, 0, 0, -0.02);
		P(g, 1.2, 0.85, 0.36, M.panel, 0, 0.1, 0);
		P(g, 1.2, 0.03, 0.36, M.woodLight, 0, 0.95, 0);
		P(g, 1.2, 0.4, 0.03, M.woodLight, 0, 0.95, -0.165);
		P(g, 1.2, 0.85, 0.36, M.panel, 0, 1.35, 0);
		place(g, 9.70, 1.25, -Math.PI / 2, 1.2, 0.36);
	}
	// light switches (1.3 m)
	for (const [x, z] of [[8.35, 0.125], [2.0, 3.135], [2.55, 4.365], [5.05, 2.865]]) wbox(x - 0.043, x + 0.043, 1.257, 1.343, z - 0.005, z + 0.005, M.white, false, false);

	// ---------------------------------------------------------------------------
	// Tower facade + city
	// ---------------------------------------------------------------------------
	const facade = facadeTexture();
	const facadeMat = std({ map: facade, roughness: 0.6 });
	function tower(x0, x1, y0, y1, z0, z1) {
		const w = x1 - x0, h = y1 - y0, d = z1 - z0;
		const m = new THREE.Mesh(boxUV(new THREE.BoxGeometry(w, h, d), w, h, d, 0, y0), facadeMat);
		m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); m.castShadow = m.receiveShadow = true; scene.add(m);
	}
	tower(-0.12, 10.12, -ELEVATION, -0.02, -0.12, 8.12);        // 25 storeys below
	tower(-0.12, 10.12, H + 0.12, H + 0.12 + 36, -0.12, 8.12);  // 12 storeys above
	tower(-16, -0.12, -ELEVATION, H + 0.12 + 36, -10, 8.12);    // neighbouring unit
	tower(8.0, 12.5, -ELEVATION, H + 0.12 + 36, -7, -0.12);     // lift core behind the entry door
	for (const y of [-0.22, H + 0.12]) {                          // slab edge bands
		wbox(-0.12, 10.52, y, y + 0.2, 8.12, 8.5, M.panel);
		wbox(10.12, 10.5, y, y + 0.2, -0.12, 8.5, M.panel);
		wbox(-0.12, 8.0, y, y + 0.2, -0.5, -0.12, M.panel);
	}
	{ // city
		const r = rng(7), groups = [[], [], []];
		for (let i = 0; i < 460; i++) {
			const ang = r() * Math.PI * 2, dist = 210 + Math.pow(r(), 0.8) * 1400;
			const x = 5 + Math.cos(ang) * dist, z = 4 + Math.sin(ang) * dist;
			const w = 16 + r() * 30, d = 16 + r() * 30, h = 18 + Math.pow(r(), 2) * 150;
			const geo = boxUV(new THREE.BoxGeometry(w, h, d), w, h, d, r() * 30, 0);
			geo.rotateY((r() - 0.5) * 0.3); geo.translate(x, -ELEVATION + h / 2, z);
			groups[i % 3].push(geo);
		}
		const tints = [0xffffff, 0xd9dde2, 0xefe6d8];
		groups.forEach((gs, i) => scene.add(new THREE.Mesh(merge(gs), std({ map: facade, color: tints[i], roughness: 0.7 }))));
		const ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), std({ map: groundTexture(), roughness: 1 }));
		const uv = ground.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 9000, uv.getY(i) * 9000);
		ground.rotation.x = -Math.PI / 2; ground.position.y = -ELEVATION; scene.add(ground);
	}
	renderer.shadowMap.needsUpdate = true;

	// ---------------------------------------------------------------------------
	// First-person controls: pointer lock to look, WASD to walk
	// ---------------------------------------------------------------------------
	const pos = new THREE.Vector2(spawn[0], spawn[1]);
	camera.position.set(pos.x, EYE, pos.y);
	camera.lookAt(...lookAt);
	const euler = new THREE.Euler(0, 0, 0, "YXZ");
	const turn = (dx, dy) => {
		euler.setFromQuaternion(camera.quaternion);
		euler.y -= dx; euler.x = THREE.MathUtils.clamp(euler.x - dy, -1.45, 1.45);
		camera.quaternion.setFromEuler(euler);
	};
	const canvasEl = renderer.domElement;
	let walking = false;
	const lockListeners = [];
	const isLocked = () => document.pointerLockElement === canvasEl;
	document.addEventListener("mousemove", (e) => { if (isLocked()) turn(e.movementX * LOOK, e.movementY * LOOK); });
	document.addEventListener("pointerlockchange", () => { walking = isLocked(); if (!walking) vel.set(0, 0); lockListeners.forEach((f) => f(walking)); });

	// Touch: drag to look around (walking needs a keyboard)
	let drag = null;
	canvasEl.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse") drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
	addEventListener("pointermove", (e) => {
		if (!drag || e.pointerId !== drag.id) return;
		turn(-(e.clientX - drag.x) * 0.004, -(e.clientY - drag.y) * 0.004);
		drag.x = e.clientX; drag.y = e.clientY;
	});
	addEventListener("pointerup", () => { drag = null; });
	canvasEl.style.touchAction = "none";

	const keys = {}, vel = new THREE.Vector2(), fwd = new THREE.Vector3();
	let bob = 0;
	addEventListener("keydown", (e) => { keys[e.code] = true; if (walking && e.code.startsWith("Arrow")) e.preventDefault(); });
	addEventListener("keyup", (e) => { keys[e.code] = false; });
	addEventListener("blur", () => { for (const k in keys) keys[k] = false; });

	function collide(p) {
		for (let it = 0; it < 3; it++) for (const b of colliders) {
			const cx = Math.max(b.x0, Math.min(p.x, b.x1)), cz = Math.max(b.z0, Math.min(p.y, b.z1));
			const dx = p.x - cx, dz = p.y - cz, d2 = dx * dx + dz * dz;
			if (d2 >= RADIUS * RADIUS) continue;
			if (d2 > 1e-10) { const d = Math.sqrt(d2); p.x = cx + dx / d * RADIUS; p.y = cz + dz / d * RADIUS; }
			else {
				const l = p.x - b.x0, r = b.x1 - p.x, t = p.y - b.z0, bt = b.z1 - p.y, m = Math.min(l, r, t, bt);
				if (m === l) p.x = b.x0 - RADIUS; else if (m === r) p.x = b.x1 + RADIUS; else if (m === t) p.y = b.z0 - RADIUS; else p.y = b.z1 + RADIUS;
			}
		}
	}
	function update(dt) {
		const k = (c) => walking && keys[c];
		const f = (k("KeyW") || k("ArrowUp") ? 1 : 0) - (k("KeyS") || k("ArrowDown") ? 1 : 0);
		const s = (k("KeyD") || k("ArrowRight") ? 1 : 0) - (k("KeyA") || k("ArrowLeft") ? 1 : 0);
		camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
		let tx = fwd.x * f - fwd.z * s, tz = fwd.z * f + fwd.x * s;
		const len = Math.hypot(tx, tz); if (len > 0) { tx = tx / len * WALK; tz = tz / len * WALK; }
		const a = 1 - Math.exp(-dt * 7);                  // ease in/out when starting and stopping
		vel.x += (tx - vel.x) * a; vel.y += (tz - vel.y) * a;
		pos.x += vel.x * dt; pos.y += vel.y * dt; collide(pos);
		const speed = vel.length();
		bob += dt * Math.PI * 2 * 0.95 * (speed / WALK);     // ≈ 1.9 steps per second
		camera.position.set(pos.x, EYE + Math.sin(bob * 2) * 0.012 * Math.min(speed / WALK, 1), pos.y);
	}

	// ---------------------------------------------------------------------------
	// Loop
	// ---------------------------------------------------------------------------
	const frameListeners = [];
	addEventListener("resize", () => {
		camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight);
	});
	let last = performance.now();
	renderer.setAnimationLoop((now) => {
		const dt = Math.min((now - last) / 1000, 0.05); last = now;
		update(dt);
		sky.position.copy(camera.position);
		renderer.render(scene, camera);
		frameListeners.forEach((f) => f());
	});

	const rooms = [
		{ name: "Bedroom 2", note: "9.7 m² · south-facing", x0: 0, x1: 3.4, z0: 0, z1: 3.2 },
		{ name: "Bathroom", note: "5.5 m² · walk-in shower", x0: 3.4, x1: 5.6, z0: 0, z1: 2.8 },
		{ name: "Kitchen", note: "6.0 m² · L-shaped bench", x0: 5.6, x1: 8, z0: 0, z1: 2.8 },
		{ name: "Entry", note: "4.8 m²", x0: 8, x1: 10, z0: 0, z1: 2.8 },
		{ name: "Main bedroom", note: "12.7 m² · north light", x0: 0, x1: 3.8, z0: 4.3, z1: 8 },
		{ name: "Hallway", note: "1.0 m wide", x0: 0, x1: 3.8, z0: 2.8, z1: 4.3 },
		{ name: "Living & dining", note: "30.2 m² · full-height glazing", x0: 3.8, x1: 10, z0: 2.8, z1: 8 },
	];

	return {
		camera, pos, rooms, wallRects, furnRects, winLines, doorLines,
		get walking() { return walking; },
		heading: () => camera.getWorldDirection(new THREE.Vector3()),
		roomAt: (x, z) => rooms.find((r) => x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1) ?? null,
		lock: () => canvasEl.requestPointerLock(),
		onLockChange: (f) => lockListeners.push(f),
		onFrame: (f) => frameListeners.push(f),
	};
}
