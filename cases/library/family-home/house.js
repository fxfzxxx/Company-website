/* Family Home — a first-person walkthrough of a two-storey, four-bedroom
   house, built to the room sizes on its listing floor plan. Units are metres:
   2.7 m ground ceiling, 3.0 m floor to floor, 2.55 m upstairs ceiling, 2.1 m
   door heads, a U-shaped stair of sixteen 187.5 mm risers. The eye is at
   1.6 m (1.0 m crouched), the walk is 2.2 m/s (3.6 running) and a jump
   clears about 1.1 m — enough to land on a sofa, a bed or a table. Every
   door opens and shuts with E; the left mouse button fires a pistol that
   leaves holes, and shatters the ornaments. Two cats live downstairs.

   +x is east and +z is south, so the plan reads north-up with z growing down
   the page — the same way the listing plan is drawn.

   Everything is generated at load — no model files, no image textures. */

import * as THREE from "three";

const H0 = 2.7;          // ground floor ceiling
const U = 3.0;           // upper floor level
const H1 = 2.55;         // upper floor ceiling
const TOP = U + H1;      // upper ceiling, 5.55
const EYE = 1.6, WALK = 2.2, RUN = 3.6, RADIUS = 0.22, LOOK = 0.0016;
const STEP = 0.35;       // anything lower than this above your feet is walked over
const EXT = 0.2, INT = 0.1;

// The stair: flight 1 climbs west along the north half, a landing, flight 2
// climbs east along the south half and arrives on the landing at x = 3.8.
const ST = { x0: 0.55, xl: 1.85, x1: 3.8, z0: 4.75, zm: 5.95, z1: 7.15, run: 1.95, rise: 0.1875 };
function stairY(x, z) {
	if (z < ST.z0 || z >= ST.z1 || x < ST.x0 || x > ST.x1) return null;
	if (x < ST.xl) return 1.5;
	return z < ST.zm ? (ST.x1 - x) / ST.run * 1.5 : 1.5 + (x - ST.xl) / ST.run * 1.5;
}

export function createTour(stage, { spawn = [6.8, 12.4, 0], lookAt = [6.8, 1.5, 4] } = {}) {
	// ---------------------------------------------------------------------------
	// Renderer / scene
	// ---------------------------------------------------------------------------
	const renderer = new THREE.WebGLRenderer({ antialias: true });
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
	const SKY_TOP = new THREE.Color(0x3d7fd6), SKY_HOR = new THREE.Color(0xdfe9f1), SKY_BOT = new THREE.Color(0x9fae92);
	scene.fog = new THREE.Fog(SKY_HOR, 90, 700);
	const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.05, 3000);
	// Hold the horizontal field of view near 92°, so rooms read at their width
	// on a tall window as well as a wide one.
	const fitFov = () => {
		const a = innerWidth / innerHeight;
		camera.aspect = a;
		camera.fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(92) / 2) / a)), 58, 78);
		camera.updateProjectionMatrix();
	};
	fitFov();

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
	function boxUV(geo, w, h, d, ox = 0, oy = 0) {
		const uv = geo.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
		for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
			const k = f * 4 + i;
			uv.setXY(k, uv.getX(k) * dims[f][0] + (f >= 4 ? ox : 0), uv.getY(k) * dims[f][1] + (f < 2 || f >= 4 ? oy : 0));
		}
		return geo;
	}
	function noise(g, S, r, n, cols, smin, smax) {
		for (let k = 0; k < n; k++) { g.fillStyle = cols[Math.floor(r() * cols.length)]; const s = smin + r() * (smax - smin); g.fillRect(r() * S, r() * S, s, s); }
	}

	// ---------------------------------------------------------------------------
	// Procedural textures
	// ---------------------------------------------------------------------------
	function carpetTexture() {          // 0.6 m: a fine wool loop
		const S = 256, c = canvas(S, S), g = c.getContext("2d"), r = rng(31);
		g.fillStyle = "#cdc3b4"; g.fillRect(0, 0, S, S);
		noise(g, S, r, 9000, ["rgba(255,255,255,.18)", "rgba(90,75,60,.14)", "rgba(160,140,120,.2)"], 1, 3);
		return toTex(c, 0.6);
	}
	function tileTexture({ S = 512, nx, ny, base, vary, grout, gw, size, seed, vein = 0 }) {
		const c = canvas(S, S), g = c.getContext("2d"), r = rng(seed), tw = S / nx, th = S / ny;
		g.fillStyle = grout; g.fillRect(0, 0, S, S);
		for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
			const v = (r() - 0.5) * vary;
			g.fillStyle = `rgb(${base[0] + v},${base[1] + v},${base[2] + v})`;
			g.fillRect(i * tw + gw / 2, j * th + gw / 2, tw - gw, th - gw);
			for (let k = 0; k < 500; k++) {
				g.fillStyle = `rgba(${r() > 0.5 ? "255,255,255" : "120,110,100"},${r() * 0.06})`;
				g.fillRect(i * tw + r() * tw, j * th + r() * th, 2 + r() * 5, 2 + r() * 5);
			}
			for (let k = 0; k < vein; k++) {
				g.strokeStyle = `rgba(150,135,115,${0.08 + r() * 0.1})`; g.lineWidth = 0.6 + r();
				let x = i * tw + r() * tw, y = j * th; g.beginPath(); g.moveTo(x, y);
				for (let s = 0; s < 8; s++) { x += (r() - 0.4) * tw * 0.2; y += th / 8; g.lineTo(x, y); }
				g.stroke();
			}
		}
		return toTex(c, size);
	}
	function boardsTexture() {          // 1.2 m: six 200 mm weatherboards
		const S = 256, c = canvas(S, S), g = c.getContext("2d"), r = rng(9), bh = S / 6;
		for (let i = 0; i < 6; i++) {
			const gr = g.createLinearGradient(0, i * bh, 0, (i + 1) * bh);
			gr.addColorStop(0, "#f1eee8"); gr.addColorStop(0.85, "#e6e2da"); gr.addColorStop(1, "#b9b4aa");
			g.fillStyle = gr; g.fillRect(0, i * bh, S, bh);
		}
		noise(g, S, r, 1500, ["rgba(255,255,255,.1)", "rgba(0,0,0,.03)"], 1, 2);
		return toTex(c, 1.2);
	}
	function plasterTexture() {
		const S = 256, c = canvas(S, S), g = c.getContext("2d"), r = rng(13);
		g.fillStyle = "#e9e7e2"; g.fillRect(0, 0, S, S);
		noise(g, S, r, 5000, ["rgba(255,255,255,.12)", "rgba(0,0,0,.03)"], 1, 4);
		return toTex(c, 2);
	}
	function roofTexture() {            // 1.2 m: concrete tiles in 330 mm courses
		const S = 256, c = canvas(S, S), g = c.getContext("2d"), r = rng(17), rows = 4, th = S / rows, tw = S / 4;
		for (let j = 0; j < rows; j++) for (let i = 0; i < 5; i++) {
			const x = (i - (j % 2) * 0.5) * tw, v = (r() - 0.5) * 10;
			const gr = g.createLinearGradient(0, j * th, 0, (j + 1) * th);
			gr.addColorStop(0, `rgb(${46 + v},${48 + v},${52 + v})`); gr.addColorStop(0.8, `rgb(${60 + v},${62 + v},${66 + v})`); gr.addColorStop(1, "#1e1f21");
			g.fillStyle = gr; g.fillRect(x + 1, j * th, tw - 2, th);
		}
		noise(g, S, r, 2500, ["rgba(255,255,255,.05)", "rgba(0,0,0,.1)"], 1, 3);
		return toTex(c, 1.2);
	}
	function grassTexture() {
		const S = 256, c = canvas(S, S), g = c.getContext("2d"), r = rng(23);
		g.fillStyle = "#5f8a45"; g.fillRect(0, 0, S, S);
		noise(g, S, r, 14000, ["#6f9a4f", "#557d3c", "#7aa65a", "#4e7437"], 1, 3);
		return toTex(c, 3);
	}
	function aggregateTexture() {       // exposed-aggregate concrete
		const S = 256, c = canvas(S, S), g = c.getContext("2d"), r = rng(29);
		g.fillStyle = "#8d8a85"; g.fillRect(0, 0, S, S);
		noise(g, S, r, 9000, ["#6d6a66", "#a7a39c", "#57544f", "#b9b4ab", "#7e7a73"], 1, 3.5);
		return toTex(c, 1);
	}
	function hedgeTexture() {
		const S = 256, c = canvas(S, S), g = c.getContext("2d"), r = rng(37);
		g.fillStyle = "#2f5227"; g.fillRect(0, 0, S, S);
		for (let k = 0; k < 2200; k++) {
			g.fillStyle = ["#3f6a31", "#4d7c3a", "#2a4722", "#5a8a44"][Math.floor(r() * 4)];
			g.beginPath(); g.ellipse(r() * S, r() * S, 2 + r() * 4, 1 + r() * 2.5, r() * 3, 0, Math.PI * 2); g.fill();
		}
		return toTex(c, 1.5);
	}
	function asphaltTexture() {
		const S = 256, c = canvas(S, S), g = c.getContext("2d"), r = rng(41);
		g.fillStyle = "#6c6b69"; g.fillRect(0, 0, S, S);
		noise(g, S, r, 8000, ["#5b5a58", "#7d7c79", "#4d4c4a"], 1, 2.5);
		return toTex(c, 2);
	}
	function curtainTexture(cols, seed) {    // printed blocks, 0.8 m repeat
		const S = 256, c = canvas(S, S), g = c.getContext("2d"), r = rng(seed);
		for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { g.fillStyle = cols[(i + j * 2) % cols.length]; g.fillRect(i * 64, j * 64, 64, 64); }
		for (let k = 0; k < 10; k++) { g.fillStyle = `rgba(255,255,255,${0.08 + r() * 0.12})`; g.beginPath(); g.arc(r() * S, r() * S, 12 + r() * 28, 0, Math.PI * 2); g.fill(); }
		return toTex(c, 0.8);
	}
	function paintingTexture(seed, bg, cols) {
		const c = canvas(256, 320), g = c.getContext("2d"), r = rng(seed);
		g.fillStyle = bg; g.fillRect(0, 0, 256, 320);
		for (let i = 0; i < 26; i++) { g.fillStyle = cols[i % cols.length]; g.globalAlpha = 0.8; g.beginPath(); g.arc(50 + r() * 156, 50 + r() * 170, 10 + r() * 26, 0, Math.PI * 2); g.fill(); }
		g.globalAlpha = 1; g.fillStyle = "rgba(60,80,110,.6)"; g.fillRect(90, 220, 76, 70);
		const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
	}
	function rugTexture(bg, border, motif, seed) {
		const S = 512, c = canvas(S, S), g = c.getContext("2d"), r = rng(seed);
		g.fillStyle = bg; g.fillRect(0, 0, S, S);
		g.strokeStyle = border; g.lineWidth = 16; g.strokeRect(24, 24, S - 48, S - 48);
		g.lineWidth = 4; g.strokeRect(48, 48, S - 96, S - 96);
		for (let k = 0; k < 60; k++) { g.fillStyle = motif; g.globalAlpha = 0.25 + r() * 0.3; g.beginPath(); g.arc(80 + r() * 352, 80 + r() * 352, 4 + r() * 12, 0, Math.PI * 2); g.fill(); }
		g.globalAlpha = 1;
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
	const sky = new THREE.Mesh(new THREE.SphereGeometry(2000, 32, 16), skyMaterial);
	sky.renderOrder = -1; sky.userData.noHit = true; scene.add(sky);
	{
		const envScene = new THREE.Scene();
		envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMaterial));
		const warm = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshBasicMaterial({ color: 0xb8a58c }));
		warm.rotation.x = -Math.PI / 2; warm.position.y = -2; envScene.add(warm);
		const pmrem = new THREE.PMREMGenerator(renderer);
		scene.environment = pmrem.fromScene(envScene, 0.04).texture;
		scene.environmentIntensity = 0.5;
		pmrem.dispose();
	}

	// ---------------------------------------------------------------------------
	// Materials — taken from the photographs: warm white walls, oatmeal carpet,
	// cream tiles, black aluminium joinery, off-white weatherboards below and
	// plaster above, charcoal concrete tiles on the roof.
	// ---------------------------------------------------------------------------
	const carpetMap = carpetTexture();
	const M = {
		paint: std({ color: 0xefebe3, roughness: 0.95 }),
		ceiling: std({ color: 0xf7f6f3, emissive: 0xf4efe6, emissiveIntensity: 0.28, roughness: 0.95 }),
		trim: std({ color: 0xf6f4ef, roughness: 0.45 }),
		door: std({ color: 0xf4f2ed, roughness: 0.5 }),
		entry: std({ color: 0x4d545d, roughness: 0.5, metalness: 0.2 }),
		handle: std({ color: 0xc9ccd0, roughness: 0.25, metalness: 1 }),
		frame: std({ color: 0x1e2022, roughness: 0.45, metalness: 0.4 }),
		glass: new THREE.MeshPhysicalMaterial({ color: 0xe2eef2, transparent: true, opacity: 0.12, roughness: 0.03, side: THREE.DoubleSide, depthWrite: false }),
		frosted: std({ color: 0xf2f5f5, transparent: true, opacity: 0.88, roughness: 0.9, side: THREE.DoubleSide }),
		showerGlass: new THREE.MeshPhysicalMaterial({ color: 0xdfeff0, transparent: true, opacity: 0.18, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false }),
		boards: std({ map: boardsTexture(), roughness: 0.8 }),
		plaster: std({ map: plasterTexture(), roughness: 0.9 }),
		roof: std({ map: roofTexture(), roughness: 0.75, side: THREE.DoubleSide }),
		membrane: std({ color: 0x3c3e42, roughness: 0.8 }),
		fascia: std({ color: 0x2a2c2f, roughness: 0.5, metalness: 0.3 }),
		carpet: std({ map: carpetMap, color: 0xfff1dc, roughness: 1 }),
		carpetUp: std({ map: carpetMap, color: 0xf2e8da, roughness: 1 }),
		floorTile: std({ map: tileTexture({ nx: 2, ny: 2, base: [232, 220, 202], vary: 8, grout: "#c9bda9", gw: 4, size: 0.9, seed: 3 }), roughness: 0.3 }),
		bathTile: std({ map: tileTexture({ nx: 2, ny: 2, base: [222, 214, 200], vary: 6, grout: "#c8bfb0", gw: 3, size: 0.8, seed: 5, vein: 3 }), roughness: 0.3 }),
		wallTile: std({ map: tileTexture({ nx: 2, ny: 2, base: [216, 210, 198], vary: 5, grout: "#cfc7ba", gw: 3, size: 0.8, seed: 4, vein: 4 }), roughness: 0.25 }),
		splash: std({ map: tileTexture({ S: 256, nx: 2, ny: 2, base: [244, 242, 236], vary: 3, grout: "#d8d4ca", gw: 3, size: 0.3, seed: 6 }), roughness: 0.2 }),
		concrete: std({ color: 0xb8b4ac, roughness: 0.95 }),
		aggregate: std({ map: aggregateTexture(), roughness: 0.95 }),
		asphalt: std({ map: asphaltTexture(), roughness: 1 }),
		grass: std({ map: grassTexture(), roughness: 1 }),
		hedge: std({ map: hedgeTexture(), roughness: 1 }),
		cabinet: std({ color: 0xeeede8, roughness: 0.4 }),
		granite: std({ color: 0x2b2a2c, roughness: 0.18, metalness: 0.1 }),
		butcher: std({ color: 0xb57a44, roughness: 0.5 }),
		steel: std({ color: 0xc4c8cc, roughness: 0.25, metalness: 0.95 }),
		metalDark: std({ color: 0x2c2e31, roughness: 0.5, metalness: 0.6 }),
		black: std({ color: 0x141517, roughness: 0.35 }),
		gloss: std({ color: 0x0b0b0c, roughness: 0.08, metalness: 0.2 }),
		screen: std({ color: 0x06070a, roughness: 0.06, metalness: 0.3 }),
		ceramic: std({ color: 0xfafafa, roughness: 0.12 }),
		mirror: std({ color: 0xe6eef0, roughness: 0.03, metalness: 1 }),
		gilt: std({ color: 0xb49a62, roughness: 0.35, metalness: 0.7 }),
		wood: std({ color: 0xa8662f, roughness: 0.5 }),       // honey antique pieces
		woodDark: std({ color: 0x5a3b24, roughness: 0.5 }),
		woodPale: std({ color: 0xc9a071, roughness: 0.6 }),
		timberGrey: std({ color: 0xa6a097, roughness: 0.9 }),  // weathered outdoor table
		wicker: std({ color: 0x5c5a57, roughness: 1 }),
		linen: std({ color: 0xe0d9cc, roughness: 1 }),        // family room sofa
		blush: std({ color: 0xe8dcd2, roughness: 1 }),        // living room sofas
		leather: std({ color: 0xd6bd92, roughness: 0.55 }),
		leatherY: std({ color: 0xd9c071, roughness: 0.55 }),
		teal: std({ color: 0x1f6f80, roughness: 1 }),
		navy: std({ color: 0x2b3050, roughness: 1 }),
		mustard: std({ color: 0xb8a236, roughness: 1 }),
		cream: std({ color: 0xefe9dc, roughness: 1 }),
		bedding: std({ color: 0xf4f2ee, roughness: 1 }),
		duvetGreen: std({ color: 0xdfe3d6, roughness: 1 }),
		duvetOrange: std({ color: 0xd98a5c, roughness: 1 }),
		duvetPink: std({ color: 0xc98b85, roughness: 1 }),
		duvetBlue: std({ color: 0xb8c7cf, roughness: 1 }),
		headboard: std({ color: 0x9d8b77, roughness: 1 }),
		white: std({ color: 0xf2f1ee, roughness: 0.4 }),
		curtainTeal: std({ color: 0x21434b, roughness: 0.9, side: THREE.DoubleSide }),
		curtainPrint: std({ map: curtainTexture(["#2f7f86", "#d59a3a", "#6f8f55", "#b35a45", "#e0c060", "#3b6a8a"], 7), roughness: 1, side: THREE.DoubleSide }),
		curtainSage: std({ color: 0x9fb477, roughness: 1, side: THREE.DoubleSide }),
		curtainMocha: std({ color: 0xa08a70, roughness: 1, side: THREE.DoubleSide }),
		rugFloral: std({ map: rugTexture("#ead8c4", "#caa58e", "#b27f78", 3), roughness: 1 }),
		rugShag: std({ color: 0xe9e6e0, roughness: 1 }),
		rugMaster: std({ color: 0xcfc6ba, roughness: 1 }),
		leaf: std({ color: 0x4d7a45, roughness: 0.8, flatShading: true }),
		leaf2: std({ color: 0x6b8f3e, roughness: 0.8, flatShading: true }),
		leaf3: std({ color: 0x3a5f36, roughness: 0.8, flatShading: true }),
		maple: std({ color: 0x8a2f3a, roughness: 0.8, flatShading: true }),
		bark: std({ color: 0x6b5b4b, roughness: 1 }),
		pot: std({ color: 0xd8d2c8, roughness: 0.7 }),
		potTeal: std({ color: 0x2f7c82, roughness: 0.2 }),
		orchid: std({ color: 0xffffff, roughness: 0.8 }),
		light: new THREE.MeshBasicMaterial({ color: 0xfff3dc }),
		shade: std({ color: 0xf1e8d8, emissive: 0xffd49a, emissiveIntensity: 0.5, roughness: 1, side: THREE.DoubleSide }),
		fire: std({ color: 0x331a08, emissive: 0xff7a1a, emissiveIntensity: 2.2 }),
		garageDoor: std({ color: 0x3f6f96, roughness: 0.6 }),
		fence: std({ color: 0xa47c55, roughness: 0.9 }),
		sunflowers: std({ map: paintingTexture(3, "#e3c65a", ["#c98a1c", "#e8b830", "#7a5b1a", "#f2d45a"]), roughness: 0.8 }),
		abstract: std({ map: paintingTexture(9, "#e9d9e6", ["#2d9a9a", "#e58fb0", "#7fbf6a", "#f2c14e", "#6b4aa0"]), roughness: 0.8 }),
		stripes: std({ map: paintingTexture(12, "#efe6e0", ["#c4302b", "#e9b4a8", "#8c1c1a"]), roughness: 0.8 }),
	};

	// ---------------------------------------------------------------------------
	// Collision & minimap data. Every box also carries a height range, so the
	// same list works on both floors and on the stair. Door boxes move.
	// ---------------------------------------------------------------------------
	const colliders = [], wallRects = [], furnRects = [], winLines = [], doorLines = [];
	function addRect(x0, x1, z0, z1, list, y0 = 0, y1 = H0) {
		const r = { x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), y0, y1 };
		colliders.push(r); if (list) list.push(r);
		return r;
	}
	const setRect = (r, [x0, z0], [x1, z1], pad = 0) => Object.assign(r, { x0: Math.min(x0, x1) - pad, x1: Math.max(x0, x1) + pad, z0: Math.min(z0, z1) - pad, z1: Math.max(z0, z1) + pad });
	const toWorld = (axis, at, lx, lz) => axis === "x" ? [lx, at + lz] : [at - lz, lx];
	function frame(axis, at, y = 0) {
		const g = new THREE.Group(); g.position.y = y;
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
		if (col) addRect(x0, x1, z0, z1, furnRects, y0, y1);
		return m;
	}
	// Furniture group; origin = footprint centre. Its collision box is as tall
	// as the piece (ornaments on it don't count), or `top` above the floor —
	// the mattress of a bed, the seat of a sofa — so you can stand on it.
	function place(g, x, z, ry, w, d, col = true, y = 0, top) {
		g.position.set(x, y, z); g.rotation.y = ry; scene.add(g);
		if (col) {
			const s = Math.abs(Math.sin(ry)) > 0.5, hw = (s ? d : w) / 2, hd = (s ? w : d) / 2;
			if (top === undefined) {
				const box = new THREE.Box3(); g.updateWorldMatrix(true, true);
				g.traverse((o) => { if (!o.isMesh) return; for (let q = o; q && q !== g; q = q.parent) if (q.userData.breakable) return; box.expandByObject(o); });
				top = box.max.y - y;
			}
			g.userData.col = addRect(x - hw, x + hw, z - hd, z + hd, furnRects, y, y + Math.max(0.3, top));
		}
		return g;
	}
	const brk = (o) => { o.userData.breakable = true; return o; };   // shoot it and it shatters

	// ---------------------------------------------------------------------------
	// Doors. Every door — hinged leaves, the bifolds, the garage door — is an
	// entry in `doors` with a state from 0 (shut) to 1 (open) and a collision
	// box that follows it. E toggles the one you are facing.
	// ---------------------------------------------------------------------------
	const doors = [];
	const ease = (s) => s * s * (3 - 2 * s);
	const doorBox = (y) => { const r = { x0: 0, x1: 0, z0: 0, z1: 0, y0: y, y1: y + 2.15 }; colliders.push(r); furnRects.push(r); return r; };
	function registerDoor(d, root, axis, at, a, b, y) {
		const [cx, cz] = toWorld(axis, at, (a + b) / 2, 0);
		Object.assign(d, { cx, cz, y, target: d.cur, line: [...toWorld(axis, at, a, 0), ...toWorld(axis, at, b, 0)] });
		root.traverse((o) => { o.userData.door = d; });
		doors.push(d); applyDoor(d);
		return d;
	}
	function applyDoor(d) {
		const s = ease(d.cur);
		if (d.kind === "hinge") {
			const phi = d.phiOpen * s; d.pivot.rotation.y = phi;
			const ex = d.hx + d.lw * d.hs * Math.cos(phi), ez = d.hz - d.lw * d.hs * Math.sin(phi);
			setRect(d.col, toWorld(d.axis, d.at, d.hx, d.hz), toWorld(d.axis, d.at, ex, ez), 0.03);
		} else if (d.kind === "bifold") {
			for (const p of d.panels) {
				p.g.position.set(p.c.x + (p.o.x - p.c.x) * s, 0, p.c.z + (p.o.z - p.c.z) * s);
				p.g.rotation.y = p.o.r * s;
			}
			d.span.off = d.cur > 0.85;
			for (const r of d.stacks) r.off = d.cur < 0.15;
		} else if (d.kind === "garage") {
			d.pivot.rotation.x = d.dir * Math.PI / 2 * s;
			d.span.off = d.cur > 0.8;
		}
	}
	function toggleDoor(d) {
		const to = d.target > 0.5 ? 0 : 1;
		for (const x of d.set) x.target = to;
	}

	// ---------------------------------------------------------------------------
	// Walls. `inside` says which face (+1 / −1 in wall-local z) is the room, so
	// the other face can take the exterior cladding. Doors, bifolds, the garage
	// door and plain openings leave a gap in the wall's collision.
	// ---------------------------------------------------------------------------
	const PASS = new Set(["door", "entry", "open", "bifold", "garage"]);
	function wall({ axis, at, from, to, t = INT, y = 0, h = H0, openings = [], mat = M.paint, ext = null, inside = 0, collide = true, decorate = true }) {
		const g = frame(axis, at, y), ops = [...openings].sort((p, q) => p.a - q.a);
		const mats = ext ? [mat, mat, mat, mat, inside > 0 ? mat : ext, inside > 0 ? ext : mat] : mat;
		const piece = (x0, x1, y0, y1) => {
			if (x1 - x0 < 1e-4 || y1 - y0 < 1e-4) return;
			const w = x1 - x0, hh = y1 - y0, m = new THREE.Mesh(boxUV(new THREE.BoxGeometry(w, hh, t), w, hh, t, x0, y0 + y), mats);
			m.position.set(x0 + w / 2, y0 + hh / 2, 0); m.castShadow = m.receiveShadow = true; g.add(m);
		};
		let cur = from;
		for (const p of ops) {
			piece(cur, p.a, 0, h);
			if (p.bottom > 0) piece(p.a, p.b, 0, p.bottom);
			if (p.top < h) piece(p.a, p.b, p.top, h);
			cur = p.b;
			if (decorate) ({ window: addWindow, bifold: addBifold, door: addDoor, entry: addDoor, garage: addGarage, open: () => {}, fire: () => {} })[p.kind](g, p, t, inside, axis, at, y);
		}
		piece(cur, to, 0, h);

		if (collide) {
			const rect = (a, b, y0 = 0, y1 = h, list = wallRects) => { const [x0, z0] = toWorld(axis, at, a, -t / 2), [x1, z1] = toWorld(axis, at, b, t / 2); return addRect(x0, x1, z0, z1, list, y + y0, y + y1); };
			let c = from;
			for (const p of ops) {
				if (p.a > c) rect(c, p.a);
				c = p.b;
				if (p.kind === "fire") rect(p.a, p.b);
				else if (p.kind === "window") {                                  // sill (stand on it), pane (breaks), wall over
					if (p.bottom > 0) rect(p.a, p.b, 0, p.bottom);
					const pane = rect(p.a, p.b, p.bottom, p.top, null);
					if (p.glassMesh) p.glassMesh.userData.glass.col = pane;
					if (p.top < h) rect(p.a, p.b, p.top, h);
				} else if (p.top < h) rect(p.a, p.b, p.top, h);                  // over a door
			}
			if (to > c) rect(c, to);
			for (const p of ops) if (!p.bare && p.kind !== "fire") (p.kind === "window" ? winLines : doorLines).push({ y, l: [...toWorld(axis, at, p.a, 0), ...toWorld(axis, at, p.b, 0)] });
		}
	}
	function addWindow(g, p, t, inside) {
		const w = p.b - p.a, h = p.top - p.bottom, cx = (p.a + p.b) / 2, y0 = p.bottom, fw = 0.05, fd = 0.07;
		const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), p.frosted ? M.frosted : M.glass);
		glass.position.set(cx, y0 + h / 2, 0); g.add(glass);
		P(g, w, fw, fd, M.frame, cx, y0, 0); P(g, w, fw, fd, M.frame, cx, p.top - fw, 0);
		P(g, fw, h, fd, M.frame, p.a + fw / 2, y0, 0); P(g, fw, h, fd, M.frame, p.b - fw / 2, y0, 0);
		const n = Math.max(1, Math.round(w / 0.9)), bars = [];
		for (let i = 1; i < n; i++) bars.push(P(g, 0.045, h, fd, M.frame, p.a + w * i / n, y0, 0));
		if (p.transom) bars.push(P(g, w, 0.045, fd, M.frame, cx, p.top - 0.45, 0));
		glass.userData.glass = { hits: 0, bars };                            // the mullions go with the glass
		p.glassMesh = glass;
		if (inside && p.bottom > 0.05) { const dep = t / 2 + 0.04; P(g, w + 0.1, 0.025, dep, M.trim, cx, p.bottom - 0.025, inside * dep / 2); }
	}
	function addDoor(g, p, t, inside, axis, at, y) {
		const cw = 0.07, d = t + 0.03, tm = p.kind === "entry" ? M.frame : M.trim;
		P(g, cw, p.top + 0.05, d, tm, p.a - cw / 2 + 0.02, 0, 0);
		P(g, cw, p.top + 0.05, d, tm, p.b + cw / 2 - 0.02, 0, 0);
		P(g, p.b - p.a + 2 * cw - 0.04, cw, d, tm, (p.a + p.b) / 2, p.top - 0.02, 0);
		const leaves = p.leaves ?? (p.leaf ? [p.leaf] : []);
		const span = (p.b - p.a) / leaves.length, set = [];
		leaves.forEach((L, i) => {
			const a = p.a + span * i, b = a + span;
			const hs = L.hinge === "a" ? 1 : -1, lw = b - a - 0.04, lh = p.top - 0.03, lt = p.kind === "entry" ? 0.06 : 0.04;
			const hx = hs === 1 ? a + 0.02 : b - 0.02, hz = L.side * (t / 2 - lt / 2 - 0.005);
			const pivot = new THREE.Group(); pivot.position.set(hx, 0.01, hz); g.add(pivot);
			const geo = new THREE.BoxGeometry(lw, lh, lt); geo.translate(hs * lw / 2, lh / 2, 0);
			const leaf = new THREE.Mesh(geo, p.kind === "entry" ? M.entry : M.door); leaf.castShadow = leaf.receiveShadow = true; pivot.add(leaf);
			if (p.kind !== "entry") for (const s of [-1, 1]) for (const [py, ph] of [[0.25, 0.8], [1.2, 0.75]]) for (const px of [0.25, 0.75]) {  // four raised panels
				P(pivot, lw * 0.36, ph * lh / 2.07, 0.008, M.door, hs * lw * px, py * lh / 2.07, s * (lt / 2 + 0.002));
			}
			else for (let k = 1; k < 7; k++) P(pivot, 0.012, lh - 0.1, lt + 0.004, M.frame, hs * lw * k / 7, 0.05, 0);          // grooved front door
			const hxL = hs * (lw - 0.08);
			for (const s of [-1, 1]) C(pivot, 0.03, 0.03, 0.05, M.handle, hxL, 0.97, s * (lt / 2 + 0.03)).rotation.x = Math.PI / 2;
			const d = { kind: "hinge", pivot, hx, hz, hs, lw, axis, at, set, col: doorBox(y), cur: L.open === false ? 0 : 1, phiOpen: -L.side * hs * THREE.MathUtils.degToRad(L.angle ?? 88) };
			set.push(d); registerDoor(d, pivot, axis, at, p.a, p.b, y);
		});
	}
	function addBifold(g, p, t, inside, axis, at, y) {             // four glazed leaves folding back to both ends, outside
		const h = p.top, out = -inside, fw = 0.045, n = 4, pw = (p.b - p.a) / n;
		P(g, p.b - p.a, fw, t + 0.02, M.frame, (p.a + p.b) / 2, h - fw, 0);
		P(g, p.b - p.a, 0.02, t + 0.02, M.frame, (p.a + p.b) / 2, 0, 0);
		const root = new THREE.Group(); g.add(root);
		const panels = [];
		for (let k = 0; k < n; k++) {
			const pg = new THREE.Group(); root.add(pg);
			P(pg, pw - 0.02, h - 0.06, 0.012, M.glass, 0, 0.03, 0, false).userData.glass = { hits: 0, bars: [] };
			P(pg, pw, fw, 0.05, M.frame, 0, 0.03, 0); P(pg, pw, fw, 0.05, M.frame, 0, h - 0.03 - fw, 0);
			P(pg, fw, h - 0.06, 0.05, M.frame, -pw / 2 + fw / 2, 0.03, 0); P(pg, fw, h - 0.06, 0.05, M.frame, pw / 2 - fw / 2, 0.03, 0);
			const left = k < n / 2, j = left ? k : n - 1 - k;
			panels.push({ g: pg, c: { x: p.a + pw * (k + 0.5), z: 0 }, o: { x: left ? p.a + 0.05 + j * 0.06 : p.b - 0.05 - j * 0.06, z: out * (t / 2 + pw / 2 + 0.03), r: Math.PI / 2 } });
		}
		const span = doorBox(y); setRect(span, toWorld(axis, at, p.a, -t / 2 - 0.04), toWorld(axis, at, p.b, t / 2 + 0.04));
		const stacks = [[p.a, p.a + 0.18], [p.b - 0.18, p.b]].map(([a, b]) => setRect(doorBox(y), toWorld(axis, at, a, out * t / 2), toWorld(axis, at, b, out * (t / 2 + pw + 0.06))));
		const d = { kind: "bifold", panels, span, stacks, cur: p.open === false ? 0 : 1 }; d.set = [d];
		registerDoor(d, root, axis, at, p.a, p.b, y);
	}
	function addGarage(g, p, t, inside, axis, at, y) {             // tilt door: swings up under the garage ceiling
		const w = p.b - p.a, h = p.top;
		P(g, w + 0.1, 0.08, t + 0.02, M.trim, (p.a + p.b) / 2, h, 0);
		const pivot = new THREE.Group(); pivot.position.set((p.a + p.b) / 2, h, 0); g.add(pivot);
		P(pivot, w, h, 0.05, M.garageDoor, 0, -h, 0);
		for (let i = 1; i < 12; i++) P(pivot, 0.015, h - 0.04, 0.06, M.fascia, -w / 2 + w * i / 12, -h + 0.02, 0);
		C(pivot, 0.03, 0.03, 0.18, M.handle, 0, -h + 0.9, -inside * 0.05).rotation.z = Math.PI / 2;
		const span = doorBox(y); setRect(span, toWorld(axis, at, p.a, -t / 2 - 0.04), toWorld(axis, at, p.b, t / 2 + 0.04));
		const d = { kind: "garage", pivot, dir: -inside, span, cur: 0 }; d.set = [d];
		registerDoor(d, pivot, axis, at, p.a, p.b, y);
	}
	function curtains(axis, at, wa, wb, inside, t, mat, { y = 0, h = H0, lo = -Infinity, hi = Infinity, drop } = {}) {
		const g = frame(axis, at, y), z = inside * (t / 2 + 0.13), ch = (drop ?? h - 0.35);
		const r0 = Math.max(lo, wa - 0.4), r1 = Math.min(hi, wb + 0.4);
		P(g, r1 - r0, 0.025, 0.025, M.metalDark, (r0 + r1) / 2, h - 0.3, z, false);
		for (const [a, b] of [[Math.max(lo, wa - 0.38), wa + 0.12], [wb - 0.12, Math.min(hi, wb + 0.38)]]) {
			const w = b - a, geo = new THREE.PlaneGeometry(w, ch, Math.round(w * 40), 1), pos = geo.attributes.position, uv = geo.attributes.uv;
			for (let i = 0; i < pos.count; i++) { pos.setZ(i, Math.sin(pos.getX(i) * Math.PI * 2 / 0.13) * 0.035); uv.setXY(i, uv.getX(i) * w, uv.getY(i) * ch); }
			geo.computeVertexNormals();
			const m = new THREE.Mesh(geo, mat); m.position.set((a + b) / 2, h - 0.32 - ch / 2, z); m.castShadow = m.receiveShadow = true; g.add(m);
		}
	}
	function blind(axis, at, wa, wb, inside, t, mat, { y = 0, top, drop = 0.45 } = {}) {   // roman blind, drawn half up
		const g = frame(axis, at, y), z = inside * (t / 2 + 0.05);
		for (let i = 0; i < 4; i++) P(g, wb - wa + 0.1, drop / 4 + 0.02, 0.04 + i * 0.01, mat, (wa + wb) / 2, top - (i + 1) * drop / 4, z, false);
	}

	const door = (a, b, leaf, top = 2.1) => ({ a, b, bottom: 0, top, kind: "door", leaf });
	const win = (a, b, bottom, top, extra = {}) => ({ a, b, bottom, top, kind: "window", ...extra });

	// ---------------------------------------------------------------------------
	// Ground floor, from the plan's own room sizes (centre-line dimensions):
	//   kitchen 4.8 × 4.7 | dining 3.0 × 4.7 | family 3.8 × 4.7      (north)
	//   stair + laundry | passage + WC | hall | living 6.1 × 5.8     (middle)
	//   garage 6.0 × 6.3 | hall + porch | study 2.8 × 2.8           (south)
	// Exterior walls rise to 3.0 m so they close the edge of the first floor.
	// ---------------------------------------------------------------------------
	// The plan's own layout, made roomier where the drawing is tight: the back
	// passage is 1.5 m (so the powder room, hall, living room and study sit
	// 0.6 m further east than drawn) and the laundry is 1.6 m deep (so the
	// garage sits 0.55 m further south). Every labelled room keeps its size.
	const G = { t: EXT, h: U, ext: M.boards };
	wall({ ...G, axis: "x", at: 0, from: -0.1, to: 11.7, inside: 1, openings: [win(1.6, 3.15, 1.05, 2.1), win(5.8, 6.7, 0.25, 2.2)] });
	wall({ ...G, axis: "z", at: 0, from: -0.1, to: 4.85, inside: -1, openings: [win(1.8, 3.7, 1.05, 2.1)] });
	wall({ ...G, axis: "x", at: 4.75, from: -0.1, to: 0.55, inside: -1 });
	wall({ ...G, axis: "z", at: 0.55, from: 4.65, to: 7.25, inside: -1, openings: [win(5.4, 6.6, 1.0, 2.1)] });
	wall({ ...G, axis: "x", at: 7.15, from: 0.45, to: 1.25, inside: -1 });
	wall({ ...G, axis: "z", at: 1.15, from: 7.05, to: 8.85, inside: -1, openings: [door(7.3, 8.15, { hinge: "a", side: 1, open: false })] });
	wall({ ...G, axis: "x", at: 8.75, from: 0.2, to: 1.25, inside: 1, openings: [door(0.38, 1.08, { hinge: "a", side: -1, open: false })] });
	wall({ ...G, axis: "z", at: 0.3, from: 8.65, to: 15.15, inside: -1, openings: [win(10.25, 11.75, 1.0, 2.1)] });
	wall({ ...G, axis: "x", at: 15.05, from: 0.2, to: 6.4, inside: -1, openings: [{ a: 0.8, b: 5.8, bottom: 0, top: 2.2, kind: "garage" }] });
	wall({ ...G, axis: "z", at: 6.3, from: 13.35, to: 15.15, inside: 1 });
	wall({ ...G, axis: "x", at: 13.35, from: 6.2, to: 11.4, inside: -1, openings: [
		{ a: 6.55, b: 7.75, bottom: 0, top: 2.2, kind: "entry", leaf: { hinge: "a", side: -1, open: false } },
		win(7.85, 8.3, 0.1, 2.2), win(9.1, 10.6, 0.9, 2.2),
	] });
	wall({ ...G, axis: "z", at: 11.3, from: 10.45, to: 13.45, inside: 1 });
	wall({ ...G, axis: "x", at: 10.55, from: 11.2, to: 14.7, inside: -1, openings: [win(12.0, 13.8, 0.9, 2.2)] });
	wall({ ...G, axis: "z", at: 14.6, from: 4.65, to: 10.65, inside: 1, openings: [{ a: 6.8, b: 9.5, bottom: 0, top: 2.2, kind: "bifold" }] });
	wall({ ...G, axis: "x", at: 4.75, from: 11.6, to: 14.7, inside: 1 });
	wall({ ...G, axis: "z", at: 11.6, from: -0.1, to: 4.85, inside: 1, openings: [{ a: 1.05, b: 3.7, bottom: 0, top: 2.2, kind: "bifold" }] });

	// Interior
	wall({ axis: "z", at: 1.1, from: 0.1, to: 1.1 });                                                    // pantry
	wall({ axis: "x", at: 1.05, from: 0.1, to: 1.15, openings: [door(0.12, 1.0, { hinge: "b", side: -1, open: false })] });
	wall({ axis: "x", at: 4.75, from: 0.55, to: 3.9, t: 0.2 });                                          // kitchen | stair
	wall({ axis: "x", at: 7.15, from: 1.15, to: 3.8 });                                                  // stair | laundry
	wall({ axis: "z", at: 3.8, from: 7.15, to: 8.75, openings: [door(7.3, 8.15, { hinge: "a", side: 1 })] });
	wall({ axis: "z", at: 3.8, from: 6.0, to: 7.15, h: 2.9, openings: [door(6.12, 7.05, { hinge: "b", side: -1, open: false }, 2.0)] });   // understair cupboard
	wall({ axis: "x", at: 8.75, from: 1.15, to: 6.3, openings: [door(4.0, 5.1, { hinge: "a", side: 1 })] });   // garage door into the passage
	wall({ axis: "z", at: 5.3, from: 6.3, to: 8.75, openings: [door(6.95, 7.85, { hinge: "a", side: -1 })] });  // powder room, off the passage
	wall({ axis: "x", at: 6.3, from: 5.3, to: 6.3 });
	wall({ axis: "z", at: 6.3, from: 6.3, to: 13.35 });
	wall({ axis: "x", at: 4.75, from: 5.3, to: 11.6, t: 0.2, openings: [
		{ a: 6.45, b: 7.65, bottom: 0, top: 2.1, kind: "door", leaves: [{ hinge: "a", side: -1 }, { hinge: "b", side: -1 }] },
		{ a: 8.65, b: 10.15, bottom: 0, top: H0, kind: "fire" },
	] });
	wall({ axis: "z", at: 8.5, from: 4.75, to: 10.55, openings: [{ a: 6.2, b: 9.0, bottom: 0, top: 2.3, kind: "open" }] });
	wall({ axis: "x", at: 10.55, from: 8.5, to: 11.3 });
	wall({ axis: "z", at: 8.5, from: 10.55, to: 13.35, openings: [door(10.65, 11.65, { hinge: "a", side: -1 })] });

	{ // see-through gas fire in a chimney breast between family room and living
		const x0 = 8.65, x1 = 10.15, z0 = 4.35, z1 = 5.15, b = 0.35, t = 0.95;
		wbox(x0, x1, 0, b, z0, z1, M.paint); wbox(x0, x1, t, H0, z0, z1, M.paint);
		wbox(x0, x0 + 0.2, b, t, z0, z1, M.paint); wbox(x1 - 0.2, x1, b, t, z0, z1, M.paint);
		wbox(x0 + 0.2, x1 - 0.2, b, b + 0.1, z0 + 0.05, z1 - 0.05, M.black);
		for (let i = 0; i < 5; i++) { const l = C(scene, 0.035, 0.035, 0.5, M.woodDark, x0 + 0.4 + i * 0.17, b + 0.12, (z0 + z1) / 2 + (i % 2 - 0.5) * 0.12); l.rotation.set(Math.PI / 2, 0, (i - 2) * 0.3); }
		wbox(x0 + 0.35, x1 - 0.35, b + 0.1, b + 0.24, (z0 + z1) / 2 - 0.05, (z0 + z1) / 2 + 0.05, M.fire, false, false);
		for (const z of [z0, z1]) {
			const gl = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 - 0.4, t - b), M.glass); gl.position.set((x0 + x1) / 2, (b + t) / 2, z); gl.userData.glass = { hits: 0, bars: [] }; scene.add(gl);
			wbox(x0 - 0.05, x1 + 0.05, b - 0.12, b, z - 0.06, z + 0.06, M.steel);
		}
		const l = new THREE.PointLight(0xff9a4a, 1.6, 4, 2); l.position.set((x0 + x1) / 2, b + 0.35, (z0 + z1) / 2); scene.add(l);
		addRect(x0, x1, z0, z1, wallRects, 0, H0);
	}

	// Bathroom and kitchen tiling
	const tiles = { t: 0.01, mat: M.wallTile, collide: false, decorate: false };
	wall({ ...tiles, axis: "z", at: 5.355, from: 6.35, to: 8.7, h: 1.2, openings: [door(6.95, 7.85)] });
	wall({ ...tiles, axis: "z", at: 6.245, from: 6.35, to: 8.7, h: 1.2 });
	wall({ ...tiles, axis: "z", at: 0.105, from: 1.6, to: 4.65, h: 1.5, mat: M.splash, openings: [win(1.8, 3.7, 1.05, 2.1)] });
	wall({ ...tiles, axis: "x", at: 0.105, from: 1.15, to: 3.9, h: 1.5, mat: M.splash, openings: [win(1.6, 3.15, 1.05, 2.1)] });
	wall({ ...tiles, axis: "x", at: 4.645, from: 0.1, to: 1.75, h: 1.5, mat: M.splash });

	// ---------------------------------------------------------------------------
	// Upper floor, also from the plan's room sizes: master 4.9 × 3.2 with its
	// ensuite and walk-in robe (north), bedroom 2 4.1 × 3.4, bedroom 4 3.3 × 3.3,
	// bedroom 3 3.8 × 4.0, bathroom with a separate WC, linen off the hall.
	// ---------------------------------------------------------------------------
	const UX = { t: EXT, y: U, h: 2.7, ext: M.plaster };
	const UI = { y: U, h: H1 };
	wall({ ...UX, axis: "x", at: 1.5, from: 1.85, to: 9.5, inside: 1, openings: [win(5.3, 6.1, 0.75, 2.2, { transom: true }), win(7.8, 8.55, 0.75, 2.2, { transom: true })] });
	wall({ ...UX, axis: "z", at: 9.4, from: 1.4, to: 5.45, inside: 1, openings: [win(2.6, 4.25, 0.75, 2.2, { transom: true })] });
	wall({ ...UX, axis: "x", at: 5.35, from: 9.3, to: 11.0, inside: 1 });
	wall({ ...UX, axis: "z", at: 10.9, from: 5.25, to: 9.45, inside: 1, openings: [win(6.6, 8.8, 1.0, 2.2)] });
	wall({ ...UX, axis: "x", at: 9.35, from: 9.8, to: 11.0, inside: -1 });
	wall({ ...UX, axis: "z", at: 9.9, from: 9.25, to: 12.75, inside: 1, openings: [win(9.8, 11.7, 0.9, 2.2)] });
	wall({ ...UX, axis: "x", at: 12.65, from: 6.5, to: 10.0, inside: -1 });
	wall({ ...UX, axis: "z", at: 6.6, from: 12.55, to: 13.85, inside: 1 });
	wall({ ...UX, axis: "x", at: 13.75, from: 1.85, to: 6.7, inside: -1, openings: [win(3.9, 5.2, 0.9, 2.2)] });
	wall({ ...UX, axis: "z", at: 1.95, from: 7.05, to: 13.85, inside: -1, openings: [win(7.3, 7.8, 1.4, 2.1, { frosted: true }), win(8.7, 9.6, 1.3, 2.1, { frosted: true }), win(11.3, 12.8, 0.9, 2.2)] });
	wall({ ...UX, axis: "z", at: 1.95, from: 1.4, to: 4.85, inside: -1, openings: [win(2.9, 3.9, 1.2, 2.1, { frosted: true })] });
	wall({ ...UX, axis: "x", at: 4.75, from: 0.45, to: 1.95, inside: 1 });
	wall({ ...UX, axis: "x", at: 7.15, from: 0.45, to: 1.95, inside: -1 });
	wall({ ...UX, axis: "z", at: 0.55, from: 4.65, to: 7.25, inside: -1, openings: [win(5.5, 6.7, 0.4, 1.6)] });

	wall({ ...UI, axis: "z", at: 4.5, from: 1.5, to: 4.75, openings: [door(3.2, 4.25, { hinge: "a", side: -1 })] });
	wall({ ...UI, axis: "x", at: 4.75, from: 1.95, to: 9.4, openings: [
		door(4.9, 5.95, { hinge: "a", side: -1 }),
		{ a: 7.35, b: 8.85, bottom: 0, top: 2.1, kind: "door", leaves: [{ hinge: "a", side: 1 }, { hinge: "b", side: 1 }] },
	] });
	wbox(6.3, 6.8, U, TOP, 4.8, 6.7, M.paint, false); addRect(6.3, 6.8, 4.8, 6.7, wallRects, U, TOP);    // pier on the landing
	wall({ ...UI, axis: "x", at: 5.95, from: 6.8, to: 9.4 });
	wall({ ...UI, axis: "z", at: 9.4, from: 5.35, to: 5.95 });
	wall({ ...UI, axis: "z", at: 6.8, from: 6.7, to: 9.35, openings: [door(8.3, 9.3, { hinge: "b", side: -1 })] });
	wall({ ...UI, axis: "x", at: 9.35, from: 6.6, to: 9.9 });
	wall({ ...UI, axis: "z", at: 6.6, from: 9.35, to: 10.3, openings: [door(9.4, 10.25, { hinge: "a", side: -1 })] });
	wbox(5.95, 6.6, U, TOP, 10.3, 13.75, M.paint, false); addRect(5.95, 6.6, 10.3, 13.75, wallRects, U, TOP);   // robes for bedrooms 4 and 3
	// The bathroom pushes into bedroom 3: its door opens on a short entry
	// passage that runs down beside the bathroom before the room opens up.
	wall({ ...UI, axis: "x", at: 10.9, from: 1.95, to: 5.05 });
	wall({ ...UI, axis: "x", at: 9.95, from: 5.05, to: 5.95, openings: [door(5.1, 5.9, { hinge: "a", side: 1 })] });
	wall({ ...UI, axis: "z", at: 5.95, from: 9.95, to: 10.3 });
	wall({ ...UI, axis: "z", at: 5.05, from: 7.15, to: 10.9, openings: [door(7.2, 7.95, { hinge: "a", side: 1 }), door(8.2, 9.1, { hinge: "a", side: 1 })] });
	wall({ ...UI, axis: "x", at: 8.0, from: 1.95, to: 5.05 });
	wall({ ...UI, axis: "x", at: 7.15, from: 1.95, to: 5.05 });

	// Ensuite and bathroom tiling
	const upTiles = { ...tiles, y: U, h: 2.2 };
	wall({ ...upTiles, axis: "z", at: 2.055, from: 1.6, to: 4.7, openings: [win(2.9, 3.9, 1.2, 2.1)] });
	wall({ ...upTiles, axis: "x", at: 1.605, from: 2.05, to: 4.45 });
	wall({ ...upTiles, axis: "z", at: 4.445, from: 1.6, to: 4.7, openings: [door(3.2, 4.25)] });
	wall({ ...upTiles, axis: "x", at: 4.695, from: 2.05, to: 4.45 });
	wall({ ...upTiles, axis: "z", at: 2.055, from: 7.2, to: 10.85, openings: [win(7.3, 7.8, 1.4, 2.1), win(8.7, 9.6, 1.3, 2.1)] });
	wall({ ...upTiles, axis: "x", at: 7.205, from: 2.05, to: 5.0 });
	wall({ ...upTiles, axis: "z", at: 4.995, from: 7.2, to: 10.85, openings: [door(7.2, 7.95), door(8.2, 9.1)] });
	wall({ ...upTiles, axis: "x", at: 7.945, from: 2.05, to: 5.0 });
	wall({ ...upTiles, axis: "x", at: 8.055, from: 2.05, to: 5.0 });
	wall({ ...upTiles, axis: "x", at: 10.845, from: 2.05, to: 5.0 });

	// ---------------------------------------------------------------------------
	// Floors, ceilings, slabs, roofs
	// ---------------------------------------------------------------------------
	function floor(x0, x1, z0, z1, mat, y = 0) {
		const w = x1 - x0, d = z1 - z0, geo = new THREE.PlaneGeometry(w, d), uv = geo.attributes.uv;
		for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w + x0, uv.getY(i) * d - z1);
		geo.rotateX(-Math.PI / 2);
		const m = new THREE.Mesh(geo, mat); m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); m.receiveShadow = true; scene.add(m);
	}
	floor(0, 4.75, 0, 4.75, M.floorTile, 0.002);
	floor(4.75, 11.6, 0, 4.75, M.carpet, 0.002);
	floor(3.8, 6.3, 4.75, 8.75, M.carpet, 0.002);
	floor(6.3, 14.6, 4.75, 10.55, M.carpet, 0.002);
	floor(6.3, 11.3, 10.55, 13.35, M.carpet, 0.002);
	floor(3.05, 3.8, 6.0, 7.1, M.carpet, 0.002);
	floor(5.3, 6.3, 6.3, 8.75, M.floorTile, 0.004);
	floor(1.15, 3.8, 7.15, 8.75, M.floorTile, 0.002);
	floor(0.3, 6.3, 8.75, 15.05, M.concrete, 0.002);
	floor(6.3, 8.5, 13.35, 15.05, M.floorTile, 0.004);
	const UF = U + 0.002;
	floor(1.95, 4.5, 1.5, 4.75, M.bathTile, UF);
	floor(4.5, 9.4, 1.5, 4.75, M.carpetUp, UF);
	floor(6.8, 9.4, 4.75, 5.95, M.carpetUp, UF);
	floor(3.8, 6.8, 4.75, 7.15, M.carpetUp, UF);
	floor(5.05, 6.8, 6.65, 10.45, M.carpetUp, UF);
	floor(1.95, 5.05, 7.15, 9.95, M.bathTile, UF);
	floor(1.95, 5.05, 9.95, 10.9, M.bathTile, UF + 0.002);
	floor(6.8, 10.9, 5.35, 9.35, M.carpetUp, UF);
	floor(6.6, 9.9, 9.35, 12.65, M.carpetUp, UF);
	floor(1.95, 5.95, 9.95, 13.75, M.carpetUp, UF);

	for (const [x0, x1, z0, z1] of [[-0.1, 11.7, -0.1, 4.75], [3.8, 6.3, 4.75, 8.75], [6.3, 14.7, 4.75, 10.55], [1.15, 3.8, 7.15, 8.75], [0.2, 6.3, 8.75, 15.15], [6.3, 11.4, 10.55, 13.35], [6.3, 8.5, 13.35, 15.05]])
		wbox(x0, x1, H0, U, z0, z1, M.ceiling);
	C(scene, 0.08, 0.08, H0, M.white, 8.4, 0, 14.95);                                                    // porch post
	addRect(8.32, 8.48, 14.87, 15.03, furnRects, 0, H0);
	for (const [x0, x1, z0, z1] of [[1.95, 9.4, 1.5, 4.75], [0.55, 1.95, 4.75, 7.15], [1.95, 6.6, 4.75, 13.75], [6.6, 9.4, 4.75, 9.35], [9.4, 10.9, 5.35, 9.35], [6.6, 9.9, 9.35, 12.65]])
		wbox(x0, x1, TOP, TOP + 0.15, z0, z1, M.ceiling);

	// Single-storey roofs read as a low, dark roof with a fascia edge
	const roofMats = [M.fascia, M.fascia, M.membrane, M.ceiling, M.fascia, M.fascia];
	for (const [x0, x1, z0, z1] of [[-0.5, 12.0, -0.5, 1.5], [-0.5, 1.95, 1.5, 4.75], [9.4, 12.0, 1.5, 4.35], [9.4, 15.0, 4.35, 5.35], [10.9, 15.0, 5.35, 10.95], [9.9, 10.9, 9.35, 10.95],
		[9.9, 11.7, 10.95, 13.75], [6.6, 9.9, 12.65, 13.75], [-0.8, 0.55, 4.75, 7.15], [-0.8, 1.95, 7.15, 15.45], [1.95, 8.9, 13.75, 15.45]]) {
		const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.2, z1 - z0), roofMats);
		m.position.set((x0 + x1) / 2, U - 0.02, (z0 + z1) / 2); m.castShadow = m.receiveShadow = true; scene.add(m);
		addRect(x0, x1, z0, z1, null, U - 0.12, U + 0.08);                     // out of a window upstairs, you can walk on it
	}

	function hipRoof(x0, x1, z0, z1, y, o = 0.45, pitch = 0.42) {
		x0 -= o; x1 += o; z0 -= o; z1 += o;
		const w = x1 - x0, d = z1 - z0, alongX = w >= d, r = Math.min(w, d) / 2, top = y + r * Math.tan(pitch), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
		const A = alongX ? [x0 + r, top, cz] : [cx, top, z0 + r], B = alongX ? [x1 - r, top, cz] : [cx, top, z1 - r];
		const a = [x0, y, z0], b = [x1, y, z0], c = [x1, y, z1], e = [x0, y, z1];
		const faces = alongX
			? [[a, b, B, A, "x"], [c, e, A, B, "x"], [e, a, A, null, "z"], [b, c, B, null, "z"]]
			: [[e, a, A, B, "z"], [b, c, B, A, "z"], [a, b, A, null, "x"], [c, e, B, null, "x"]];
		const pos = [], uv = [], sl = 1 / Math.sin(pitch);
		const push = (p, ax) => { pos.push(...p); uv.push(ax === "x" ? p[0] : p[2], (p[1] - y) * sl); };
		for (const [p, q, s, t, ax] of faces) { for (const v of [p, q, s]) push(v, ax); if (t) for (const v of [p, s, t]) push(v, ax); }
		const geo = new THREE.BufferGeometry();
		geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
		geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
		geo.computeVertexNormals();
		const m = new THREE.Mesh(geo, M.roof); m.castShadow = m.receiveShadow = true; scene.add(m);
		// fascia sits on the eave line, never below the ceiling, so an overlapping roof can't show indoors
		wbox(x0, x1, y - 0.02, y + 0.14, z0, z0 + 0.14, M.fascia); wbox(x0, x1, y - 0.02, y + 0.14, z1 - 0.14, z1, M.fascia);
		wbox(x0, x0 + 0.14, y - 0.02, y + 0.14, z0, z1, M.fascia); wbox(x1 - 0.14, x1, y - 0.02, y + 0.14, z0, z1, M.fascia);
		const soffit = new THREE.Mesh(new THREE.PlaneGeometry(w, d), M.ceiling); soffit.rotation.x = Math.PI / 2; soffit.position.set(cx, y - 0.01, cz); scene.add(soffit);
	}
	hipRoof(1.95, 9.4, 1.5, 13.75, TOP + 0.15);
	hipRoof(6.6, 10.9, 5.35, 9.35, TOP + 0.15);
	hipRoof(6.6, 9.9, 9.35, 12.65, TOP + 0.15);
	hipRoof(0.55, 1.95, 4.75, 7.15, TOP + 0.15, 0.3);
	wbox(9.5, 10.2, U, 8.3, 4.45, 5.1, M.plaster);                                                        // chimney
	wbox(9.45, 10.25, 8.3, 8.4, 4.4, 5.15, M.fascia);

	// ---------------------------------------------------------------------------
	// The stair — carpeted treads, a spine wall between the flights, a cupboard
	// under the top of flight 2, glass balustrade on the landing above.
	// ---------------------------------------------------------------------------
	{
		const g = ST.run / 8, CL = 3.07;          // cupboard runs from x = 3.05 to the door
		for (let i = 0; i < 8; i++) {
			const top = (i + 1) * ST.rise, xa = ST.xl + i * g, xb = xa + g;
			wbox(ST.x1 - (i + 1) * g, ST.x1 - i * g, 0, top, ST.z0 + 0.1, ST.zm - 0.05, M.carpet, false);
			wbox(xa, xb, 1.5 + top - ST.rise, 1.5 + top, ST.zm + 0.05, ST.z1 - 0.05, M.carpet, false);
			const under = xa >= CL - 0.01 ? 2.0 : 0;
			if (1.5 + top - ST.rise > under) wbox(xa, xb, under, 1.5 + top - ST.rise, ST.zm + 0.05, ST.z1 - 0.05, M.paint, false);
			wbox(xa, xb, 0, 1.5 + top + 0.95, ST.zm - 0.05, ST.zm + 0.05, M.paint, false);                 // spine wall
		}
		wbox(ST.x0 + 0.1, ST.xl, 0, 1.5, ST.z0 + 0.1, ST.z1 - 0.05, M.carpet, false);                          // landing
		addRect(ST.xl, ST.x1, ST.zm - 0.05, ST.zm + 0.05, wallRects, 0, U + 1.0);
		addRect(ST.xl, CL, ST.zm + 0.05, ST.z1, furnRects, 0, 1.4);                                            // solid under flight 2
		const pitch = Math.atan2(1.5, ST.run), len = Math.hypot(ST.run, 1.5);
		const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, len, 12), M.woodPale);
		rail.rotation.z = -(Math.PI / 2 - pitch); rail.position.set((ST.xl + ST.x1) / 2, 2.25 + 0.85, ST.zm + 0.09); scene.add(rail);
		const rail1 = rail.clone(); rail1.rotation.z = Math.PI / 2 - pitch; rail1.position.set((ST.xl + ST.x1) / 2, 0.75 + 0.9, ST.z0 + 0.14); scene.add(rail1);
		wbox(ST.x1 - 0.01, ST.x1 + 0.01, U, U + 0.95, ST.z0 + 0.1, ST.zm - 0.05, M.glass, false, false).userData.glass = { hits: 0, bars: [], col: addRect(ST.x1 - 0.05, ST.x1 + 0.05, ST.z0, ST.zm, wallRects, U, U + 1.0) };
		wbox(ST.x1 - 0.03, ST.x1 + 0.03, U + 0.95, U + 1.0, ST.z0 + 0.1, ST.zm, M.woodPale);
	}

	// ---------------------------------------------------------------------------
	// Lighting
	// ---------------------------------------------------------------------------
	scene.add(new THREE.HemisphereLight(0xe3ecff, 0x9c9384, 0.6));
	const sun = new THREE.DirectionalLight(0xfff1dd, 3.4);          // high northern sun
	sun.position.set(7 + 14, 30, 7 - 24); sun.target.position.set(7, 0, 7);
	sun.castShadow = true;
	Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 90 });
	sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
	scene.add(sun, sun.target);
	for (const [x, y, z, i] of [
		[2.4, 2.45, 2.4, 3.5], [6.25, 2.45, 2.3, 3], [9.7, 2.45, 2.4, 3.5], [11.5, 2.45, 7.7, 4.5], [7.4, 2.45, 7.0, 2], [7.4, 2.45, 11.8, 2],
		[9.9, 2.45, 12.0, 2], [4.55, 2.45, 6.5, 1.5], [3.3, 2.45, 12.0, 2], [2.5, 2.45, 7.95, 1.2],
		[6.95, 5.3, 3.1, 3], [3.2, 5.3, 3.1, 2], [5.0, 5.3, 5.7, 2], [3.5, 5.3, 8.3, 2], [8.85, 5.3, 7.65, 2.5], [8.25, 5.3, 11.0, 2.5], [3.95, 5.3, 12.3, 2.5],
	]) {
		const l = new THREE.PointLight(0xffe7c4, i, 5.5, 2); l.position.set(x, y, z); scene.add(l);
	}
	function downlight(x, z, y = H0) { const m = new THREE.Mesh(new THREE.CircleGeometry(0.045, 20), M.light); m.rotation.x = Math.PI / 2; m.position.set(x, y - 0.002, z); scene.add(m); }
	[[5.6, 1.4], [6.9, 3.2], [8.7, 1.4], [10.7, 1.4], [8.7, 3.4], [10.7, 3.4], [10.1, 6.2], [13.1, 6.2], [10.1, 9.2], [13.1, 9.2], [11.6, 7.7],
		[7.4, 6.0], [7.4, 8.4], [7.4, 10.6], [7.4, 12.4], [9.9, 12.0], [4.55, 5.6], [4.55, 7.6], [2.5, 7.95], [5.8, 7.5], [5.8, 5.5]].forEach(([x, z]) => downlight(x, z));
	[[5.9, 3.1], [8.0, 3.1], [3.2, 3.1], [5.0, 5.7], [5.9, 8.4], [3.5, 8.3], [8.85, 7.65], [8.25, 11.0], [3.95, 12.3]].forEach(([x, z]) => downlight(x, z, TOP));
	function track(x0, z0, x1, z1) {                                  // kitchen track lights
		const len = Math.hypot(x1 - x0, z1 - z0), g = new THREE.Group();
		P(g, len, 0.025, 0.03, M.white, 0, -0.03, 0, false);
		for (let i = 0; i < 4; i++) { const s = C(g, 0.035, 0.035, 0.1, M.white, -len / 2 + len * (i + 0.5) / 4, -0.18, 0.06, 12); s.rotation.x = 0.5; }
		g.position.set((x0 + x1) / 2, H0, (z0 + z1) / 2); g.rotation.y = -Math.atan2(z1 - z0, x1 - x0); scene.add(g);
	}
	track(1.2, 1.4, 3.7, 1.4); track(1.2, 3.3, 3.7, 3.3); track(4.3, 0.6, 4.3, 2.6);

	// ---------------------------------------------------------------------------
	// Furniture
	// ---------------------------------------------------------------------------
	function sofa(W, D, body, cushion, n = 3, legs = M.metalDark) {
		const g = new THREE.Group();
		for (const sx of [-1, 1]) for (const sz of [-1, 1]) C(g, 0.02, 0.02, 0.1, legs, sx * (W / 2 - 0.08), 0, sz * (D / 2 - 0.08));
		P(g, W, 0.3, D, body, 0, 0.1, 0);
		for (const s of [-1, 1]) P(g, 0.18, 0.55, D, body, s * (W / 2 - 0.09), 0.1, 0);
		P(g, W, 0.5, 0.2, body, 0, 0.4, -D / 2 + 0.1);
		const cw = (W - 0.36) / n;
		for (let i = 0; i < n; i++) {
			const x = -W / 2 + 0.18 + cw * (i + 0.5);
			P(g, cw - 0.012, 0.12, D - 0.22, cushion, x, 0.4, 0.11);
			P(g, cw - 0.012, 0.4, 0.14, cushion, x, 0.5, -D / 2 + 0.27).rotation.x = -0.12;
		}
		return g;
	}
	const cushions = (g, W, mats) => mats.forEach((m, i) => { P(g, 0.42, 0.4, 0.12, m, -W / 2 + 0.45 + i * (W - 0.9) / Math.max(1, mats.length - 1), 0.52, -0.14).rotation.set(-0.2, (i % 2 - 0.5) * 0.4, 0); });
	function armchair(body, legs = M.metalDark) {
		const g = sofa(0.9, 0.85, body, body, 1, legs);
		return g;
	}
	function wingChair() {                                             // the carved bergère in the family room
		const g = new THREE.Group();
		for (const sx of [-1, 1]) for (const sz of [-1, 1]) C(g, 0.025, 0.02, 0.4, M.wood, sx * 0.3, 0, sz * 0.3);
		P(g, 0.7, 0.14, 0.7, M.cream, 0, 0.36, 0);
		P(g, 0.7, 0.85, 0.12, M.cream, 0, 0.45, -0.3);
		for (const s of [-1, 1]) P(g, 0.08, 0.3, 0.6, M.cream, s * 0.32, 0.5, 0);
		P(g, 0.4, 0.3, 0.1, M.mustard, 0, 0.55, -0.2).rotation.x = -0.2;
		return g;
	}
	function coffeeTable(w, d, top, legs, h = 0.42) {
		const g = new THREE.Group();
		P(g, w, 0.03, d, top, 0, h - 0.03, 0);
		for (const sx of [-1, 1]) for (const sz of [-1, 1]) P(g, 0.03, h - 0.03, 0.03, legs, sx * (w / 2 - 0.03), 0, sz * (d / 2 - 0.03));
		return g;
	}
	function diningTable(w, d) {
		const g = new THREE.Group();
		P(g, w, 0.04, d, M.wood, 0, 0.72, 0);
		for (const sx of [-1, 1]) for (const sz of [-1, 1]) C(g, 0.04, 0.03, 0.72, M.wood, sx * (w / 2 - 0.1), 0, sz * (d / 2 - 0.1), 12);
		const orchid = brk(new THREE.Group()); g.add(orchid);
		C(orchid, 0.12, 0.09, 0.1, M.white, 0, 0.76, 0);
		for (let i = 0; i < 9; i++) { const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 0), M.orchid); f.position.set((i % 3 - 1) * 0.08, 1.0 + Math.floor(i / 3) * 0.06, ((i * 7) % 3 - 1) * 0.06); orchid.add(f); }
		return g;
	}
	function chair(mat = M.cream) {                                     // upholstered dining chair
		const g = new THREE.Group();
		for (const sx of [-1, 1]) for (const sz of [-1, 1]) P(g, 0.035, 0.46, 0.035, M.woodPale, sx * 0.2, 0, sz * 0.2);
		P(g, 0.48, 0.08, 0.48, mat, 0, 0.44, 0);
		P(g, 0.48, 0.55, 0.08, mat, 0, 0.5, -0.22).rotation.x = -0.08;
		return g;
	}
	function stool() {
		const g = new THREE.Group();
		C(g, 0.18, 0.18, 0.04, M.woodDark, 0, 0.7, 0);
		for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4, l = C(g, 0.018, 0.022, 0.72, M.woodDark, Math.cos(a) * 0.14, 0, Math.sin(a) * 0.14, 8); l.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12); }
		for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; P(g, 0.26, 0.02, 0.02, M.woodDark, Math.cos(a) * 0.13, 0.28, Math.sin(a) * 0.13).rotation.y = -a + Math.PI / 2; }
		return g;
	}
	function bed(w, l, duvet, head = M.headboard, frameMat = M.wood) {
		const g = new THREE.Group(), L = l + 0.08, zc = -L / 2 + 0.08 + l / 2;
		P(g, w + 0.16, 1.2, 0.08, frameMat, 0, 0, -L / 2 + 0.04);
		P(g, w - 0.1, 0.55, 0.05, head, 0, 0.55, -L / 2 + 0.1);
		P(g, w + 0.08, 0.3, l, frameMat, 0, 0.06, zc);
		P(g, w, 0.22, l - 0.04, M.bedding, 0, 0.36, zc);
		P(g, w + 0.1, 0.12, l * 0.6, M.bedding, 0, 0.5, zc + l * 0.18);
		P(g, w + 0.06, 0.06, l * 0.36, duvet, 0, 0.6, zc + l * 0.28);
		for (const s of [-1, 1]) P(g, w / 2 - 0.1, 0.16, 0.36, M.bedding, s * w / 4, 0.58, -L / 2 + 0.3).rotation.x = -0.3;
		P(g, 0.4, 0.32, 0.12, duvet, 0.18, 0.6, -L / 2 + 0.55).rotation.x = -0.3;
		return g;
	}
	function nightstand(lamp = true) {
		const g = new THREE.Group();
		P(g, 0.5, 0.58, 0.4, M.wood, 0, 0.06, 0);
		for (const sx of [-1, 1]) for (const sz of [-1, 1]) C(g, 0.025, 0.025, 0.06, M.wood, sx * 0.21, 0, sz * 0.16, 8);
		P(g, 0.46, 0.004, 0.005, M.woodDark, 0, 0.36, 0.2);
		if (lamp) { const l = brk(new THREE.Group()); g.add(l); C(l, 0.02, 0.07, 0.35, M.steel, 0, 0.64, -0.03); C(l, 0.13, 0.17, 0.25, M.shade, 0, 0.94, -0.03); }
		return g;
	}
	function dresser(w, h = 0.85, mat = M.wood) {
		const g = new THREE.Group();
		P(g, w, h, 0.48, mat, 0, 0.08, 0);
		for (let i = 1; i < Math.round(h / 0.2); i++) P(g, w - 0.06, 0.005, 0.01, M.woodDark, 0, 0.08 + i * 0.2, 0.245);
		for (const sx of [-1, 1]) for (const sz of [-1, 1]) P(g, 0.04, 0.08, 0.04, mat, sx * (w / 2 - 0.04), 0, sz * 0.2);
		brk(C(g, 0.08, 0.06, 0.26, M.potTeal, -w / 4, h + 0.08, 0)); brk(C(g, 0.06, 0.06, 0.2, M.potTeal, w / 4, h + 0.08, 0));
		return g;
	}
	function wardrobe(w, d, h, mat = M.door) {
		const g = new THREE.Group(), n = Math.round(w / 0.5), dw = w / n;
		P(g, w, h, d - 0.02, M.paint, 0, 0, -0.01);
		for (let i = 0; i < n; i++) {
			const x = -w / 2 + dw * (i + 0.5);
			P(g, dw - 0.006, h - 0.02, 0.02, mat, x, 0.01, d / 2 - 0.01);
			for (const [py, ph] of [[0.2, 1.0], [1.35, 0.7]]) P(g, dw * 0.7, ph, 0.006, mat, x, py, d / 2 + 0.003);
			C(g, 0.025, 0.025, 0.04, M.handle, x + (i % 2 ? -1 : 1) * (dw / 2 - 0.06), 1.0, d / 2 + 0.02, 12).rotation.x = Math.PI / 2;
		}
		return g;
	}
	function bookcase(w, h, d = 0.35) {
		const g = new THREE.Group(), r = rng(Math.round(w * 100 + h * 10));
		P(g, w, h, 0.02, M.wood, 0, 0, -d / 2 + 0.01);
		for (const s of [-1, 1]) P(g, 0.025, h, d, M.wood, s * (w / 2 - 0.0125), 0, 0);
		const n = Math.round(h / 0.36);
		for (let i = 0; i <= n; i++) P(g, w, 0.025, d, M.wood, 0, i * (h - 0.025) / n, 0);
		const cols = [M.teal, M.navy, M.cream, M.duvetOrange, M.woodDark, M.white];
		for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) if (r() > 0.35) {
			const bw = 0.12 + r() * 0.12, bh = 0.18 + r() * 0.12;
			P(g, bw, bh, d * 0.7, cols[Math.floor(r() * cols.length)], -w / 2 + 0.1 + k * (w - 0.2) / 4 + bw / 2, i * (h - 0.025) / n + 0.025, 0);
		}
		return g;
	}
	function piano() {
		const g = new THREE.Group();
		P(g, 1.5, 1.2, 0.3, M.gloss, 0, 0.1, -0.1);
		P(g, 1.5, 0.08, 0.6, M.gloss, 0, 0.68, 0.05);
		P(g, 1.3, 0.02, 0.15, M.white, 0, 0.76, 0.2);
		for (const s of [-1, 1]) P(g, 0.06, 0.68, 0.6, M.gloss, s * 0.72, 0, 0.05);
		P(g, 1.55, 0.35, 0.34, M.teal, 0, 1.1, -0.1);                   // velvet runner
		brk(C(g, 0.05, 0.05, 0.15, M.metalDark, 0.5, 1.3, -0.1));
		P(g, 0.8, 0.5, 0.36, M.gloss, 0, 0, 0.62);                       // bench
		return g;
	}
	function toilet() {
		const g = new THREE.Group();
		P(g, 0.4, 0.4, 0.18, M.ceramic, 0, 0.38, -0.26);
		P(g, 0.28, 0.36, 0.34, M.ceramic, 0, 0, -0.02);
		const bowl = C(g, 0.19, 0.17, 0.06, M.ceramic, 0, 0.36, 0.06); bowl.scale.z = 1.3;
		const seat = C(g, 0.19, 0.19, 0.02, M.white, 0, 0.42, 0.06); seat.scale.z = 1.3;
		return g;
	}
	function vanity(w, basins = 1) {
		const g = new THREE.Group();
		P(g, w, 0.55, 0.5, M.white, 0, 0.3, 0.01);
		P(g, w + 0.02, 0.05, 0.55, M.linen, 0, 0.85, 0);
		for (let i = 0; i < basins; i++) {
			const x = basins === 1 ? 0 : (i - 0.5) * w * 0.5;
			const b = C(g, 0.2, 0.14, 0.14, M.ceramic, x, 0.82, 0.08, 24); b.scale.z = 0.8;
			C(g, 0.015, 0.02, 0.2, M.steel, x, 0.9, -0.16);
			brk(P(g, 0.55, 0.7, 0.02, M.mirror, x, 1.2, -0.26));
		}
		for (let i = 0; i < Math.round(w / 0.5); i++) C(g, 0.015, 0.015, 0.02, M.steel, -w / 2 + 0.25 + i * 0.5, 0.7, 0.27, 8).rotation.x = Math.PI / 2;
		return g;
	}
	function shower(x0, x1, z0, z1, y, doorSides) {
		wbox(x0, x1, y, y + 0.05, z0, z1, M.ceramic, false);
		for (const [a, b, c, d] of doorSides) wbox(a, b, y + 0.05, y + 2.0, c, d, M.showerGlass, false, false).userData.glass = { hits: 0, bars: [], col: addRect(a, b, c, d, furnRects, y + 0.05, y + 2.0) };
		C(scene, 0.1, 0.1, 0.015, M.steel, (x0 + x1) / 2, y + 2.0, (z0 + z1) / 2);
	}
	function bath(x0, x1, z0, z1, y) {
		wbox(x0, x1, y, y + 0.55, z0, z1, M.wallTile, true);
		const tub = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 - 0.16, 0.02, z1 - z0 - 0.16), M.ceramic);
		tub.position.set((x0 + x1) / 2, y + 0.556, (z0 + z1) / 2); scene.add(tub);
		wbox(x0 + 0.04, x1 - 0.04, y + 0.55, y + 0.58, z0 + 0.04, z0 + 0.08, M.ceramic);
		wbox(x0 + 0.04, x1 - 0.04, y + 0.55, y + 0.58, z1 - 0.08, z1 - 0.04, M.ceramic);
	}
	function plant(x, z, s = 1, y = 0, pot = M.pot) {
		const g = new THREE.Group(), r = rng(Math.round(x * 100 + z));
		C(g, 0.17 * s, 0.13 * s, 0.35 * s, pot, 0, 0, 0);
		for (let i = 0; i < 7; i++) {
			const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18 * s * (0.7 + r() * 0.5), 1), M.leaf);
			m.position.set((r() - 0.5) * 0.3 * s, (0.5 + r() * 0.8) * s, (r() - 0.5) * 0.3 * s); m.castShadow = true; g.add(m);
		}
		return brk(place(g, x, z, 0, 0.36 * s, 0.36 * s, true, y));
	}
	function vase(x, z, y = 0) {                                       // tall floor vase with dried grass
		const g = new THREE.Group();
		const v = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 14), M.wood); v.scale.y = 1.3; v.position.y = 0.28; g.add(v);
		C(g, 0.04, 0.08, 0.35, M.wood, 0, 0.5, 0);
		for (let i = 0; i < 14; i++) { const s = C(g, 0.004, 0.004, 0.8, M.butcher, 0, 0.8, 0, 4); s.rotation.set((i % 4 - 1.5) * 0.12, 0, (i % 3 - 1) * 0.15); }
		return brk(place(g, x, z, 0, 0.44, 0.44, true, y));
	}
	function picture(axis, at, a, face, w, h, mat, y, frameMat = M.gilt) {   // face: ±1, which side of the wall
		const g = frame(axis, at, 0), off = face * 0.07;
		P(g, w + 0.1, h + 0.1, 0.04, frameMat, a, y - 0.05, off);
		const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(a, y + h / 2, off + face * 0.021); if (face < 0) m.rotation.y = Math.PI; g.add(m);
	}
	function mirrorOn(axis, at, a, face, w, h, y, d = 0.07) {
		const g = frame(axis, at, 0), off = face * d;
		P(g, w + 0.14, h + 0.14, 0.05, M.gilt, a, y - 0.07, off);
		brk(P(g, w, h, 0.01, M.mirror, a, y, off + face * 0.025));
	}


	// Kitchen, as drawn: pantry in the north-west corner, sink bench under the
	// west window, hob / oven / fridge along the south wall, a bench along the
	// north wall that turns into a peninsula with a curved breakfast bar, and
	// an island with a butcher-block top.
	const bench = (x0, x1, z0, z1, top = M.granite) => { wbox(x0, x1, 0, 0.1, z0, z1, M.black); addRect(x0, x1, z0, z1, furnRects, 0, 0.9); wbox(x0, x1, 0.1, 0.87, z0, z1, M.cabinet); wbox(x0 - 0.01, x1 + 0.01, 0.87, 0.9, z0 - 0.01, z1 + 0.01, top); };
	bench(0.1, 0.7, 1.6, 4.1);
	bench(0.1, 1.75, 4.1, 4.65);
	bench(1.15, 3.9, 0.1, 0.7);
	bench(3.9, 4.72, 0.1, 2.65);
	C(scene, 0.41, 0.41, 0.87, M.cabinet, 4.31, 0, 2.65, 32); C(scene, 0.45, 0.45, 0.03, M.granite, 4.31, 0.87, 2.65, 32);
	addRect(3.9, 4.72, 2.65, 3.06, furnRects, 0, 0.9);
	for (const z of [1.7, 3.2]) wbox(0.69, 0.7, 0.12, 0.84, z, z + 0.58, M.steel);                              // dish drawers
	wbox(0.13, 0.67, 0.88, 0.905, 2.35, 3.1, M.steel); wbox(0.17, 0.63, 0.89, 0.91, 2.4, 2.7, M.metalDark); wbox(0.17, 0.63, 0.89, 0.91, 2.76, 3.05, M.metalDark);
	C(scene, 0.015, 0.02, 0.35, M.steel, 0.15, 0.9, 2.73); wbox(0.14, 0.4, 1.22, 1.25, 2.71, 2.75, M.steel);
	wbox(0.95, 1.55, 0.9, 0.91, 4.12, 4.62, M.black);                                                          // gas hob
	for (const [dx, dz] of [[1.1, 4.25], [1.4, 4.25], [1.1, 4.5], [1.4, 4.5]]) C(scene, 0.06, 0.06, 0.02, M.metalDark, dx, 0.91, dz, 12);
	C(scene, 0.12, 0.12, 1.05, M.steel, 1.25, 1.65, 4.5); wbox(0.9, 1.6, 1.55, 1.65, 4.1, 4.65, M.steel);     // rangehood
	wbox(1.75, 2.5, 0, 2.35, 4.1, 4.65, M.cabinet, true);                                                      // oven tower
	wbox(1.8, 2.45, 0.85, 1.45, 4.09, 4.1, M.white); wbox(1.87, 2.38, 0.9, 1.3, 4.085, 4.09, M.black);
	wbox(2.5, 3.4, 0, 1.8, 4.0, 4.65, M.steel, true);                                                          // side-by-side fridge
	wbox(2.945, 2.955, 0.05, 1.75, 3.99, 4.0, M.metalDark); for (const x of [2.88, 3.02]) wbox(x - 0.01, x + 0.01, 0.6, 1.4, 3.93, 3.97, M.steel);
	wbox(2.5, 3.4, 1.85, 2.35, 4.0, 4.65, M.cabinet);
	wbox(3.4, 3.85, 0, 2.35, 4.05, 4.65, M.cabinet, true);
	for (const [x0, x1] of [[1.15, 1.9], [3.1, 3.9]]) wbox(x0, x1, 1.6, 2.35, 0.1, 0.45, M.cabinet);          // wall cupboards
	{ // island with butcher-block top and wine racks
		wbox(1.8, 2.7, 0, 0.87, 1.65, 2.65, M.cabinet, true);
		wbox(1.72, 2.78, 0.87, 0.92, 1.57, 2.73, M.butcher);
		C(scene, 0.17, 0.17, 0.015, M.steel, 2.25, 0.915, 2.15, 24);
		C(scene, 0.015, 0.02, 0.3, M.steel, 2.25, 0.92, 1.85);
		for (let i = 0; i < 4; i++) for (const x of [1.79, 2.71]) brk(C(scene, 0.03, 0.03, 0.12, M.woodDark, x, 0.15 + i * 0.18, 1.85 + (i % 2) * 0.2, 8)).rotation.z = Math.PI / 2;
	}
	for (const z of [0.8, 1.4, 2.0]) place(stool(), 5.0, z, 0, 0.36, 0.36);
	place(stool(), 4.9, 3.15, 0, 0.36, 0.36);
	{ const bowl = brk(new THREE.Group()); scene.add(bowl); C(bowl, 0.15, 0.1, 0.08, M.metalDark, 4.4, 0.9, 1.5, 16); for (let i = 0; i < 6; i++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), [M.mustard, M.leaf2, M.duvetOrange][i % 3]); f.position.set(4.36 + (i % 3) * 0.04, 1.0, 1.46 + Math.floor(i / 3) * 0.06); bowl.add(f); } }
	for (let i = 0; i < 4; i++) wbox(0.15, 1.0, 0.3 + i * 0.5, 0.32 + i * 0.5, 0.15, 0.4, M.woodPale);         // pantry shelves
	for (let i = 0; i < 4; i++) wbox(0.15, 0.4, 0.32 + i * 0.5, 0.32 + i * 0.5 + 0.25, 0.45, 0.95, M.woodPale);

	// Dining
	place(diningTable(0.95, 1.9), 6.4, 2.2, 0, 0.95, 1.9);
	for (const z of [1.55, 2.2, 2.85]) { place(chair(), 5.7, z, Math.PI / 2, 0.48, 0.48); place(chair(), 7.1, z, -Math.PI / 2, 0.48, 0.48); }
	curtains("x", 0, 5.8, 6.7, 1, EXT, M.curtainPrint);
	picture("x", 0, 5.0, 1, 0.4, 0.5, M.sunflowers, 1.35);
	picture("x", 0, 7.4, 1, 0.4, 0.5, M.sunflowers, 1.35);

	// Family room: sofa facing the fire, carved coffee table, bergère and
	// ottoman, bookcase beside the bifolds, printed curtains.
	{ const g = sofa(2.1, 0.92, M.linen, M.linen); cushions(g, 2.1, [M.teal, M.mustard, M.teal]); place(g, 9.5, 0.62, 0, 2.1, 0.92, true, 0, 0.55); }
	wbox(8.5, 10.6, 0, 0.01, 1.4, 3.7, M.rugShag, false, false);
	place(coffeeTable(1.1, 0.6, M.wood, M.wood, 0.45), 9.5, 2.4, 0, 1.1, 0.6);
	brk(C(scene, 0.09, 0.12, 0.25, M.potTeal, 9.7, 0.45, 2.4, 16));
	place(wingChair(), 8.3, 3.4, 2.3, 0.75, 0.75);
	place(coffeeTable(0.6, 0.5, M.cream, M.wood, 0.4), 10.8, 3.5, 0, 0.6, 0.5);
	place(bookcase(0.9, 2.0), 11.32, 4.2, -Math.PI / 2, 0.9, 0.35);
	vase(8.05, 4.35);
	mirrorOn("x", 4.75, 9.4, -1, 1.0, 0.65, 1.3, 0.42);
	mirrorOn("x", 4.75, 9.4, 1, 1.0, 0.65, 1.35, 0.42);
	curtains("z", 11.6, 1.05, 3.7, 1, EXT, M.curtainPrint, { lo: 0.05, hi: 4.65 });

	// Living: TV on the study wall, sofas round a black glass table, the
	// piano against the east wall beside the bifolds, teal curtains.
	wbox(9.7, 13.1, 0, 0.01, 6.3, 9.6, M.rugFloral, false, false);
	{ const g = sofa(2.1, 0.92, M.leather, M.leather); cushions(g, 2.1, [M.navy, M.cream, M.duvetBlue]); place(g, 11.0, 6.55, 0, 2.1, 0.92, true, 0, 0.55); }
	{ const g = sofa(2.2, 0.95, M.blush, M.blush); cushions(g, 2.2, [M.cream, M.navy, M.duvetBlue]); place(g, 12.9, 8.4, -Math.PI / 2, 2.2, 0.95, true, 0, 0.55); }
	place(armchair(M.leatherY), 9.4, 9.4, Math.PI * 0.75, 0.9, 0.85, true, 0, 0.55);
	place(armchair(M.leatherY), 9.4, 5.6, Math.PI * 0.25, 0.9, 0.85, true, 0, 0.55);
	place(coffeeTable(1.3, 0.8, M.gloss, M.steel, 0.42), 11.0, 8.1, 0, 1.3, 0.8);
	brk(C(scene, 0.08, 0.08, 0.28, M.navy, 10.8, 0.42, 8.0, 16)); brk(C(scene, 0.07, 0.07, 0.2, M.navy, 11.05, 0.42, 8.2, 16));
	place(piano(), 14.15, 5.8, -Math.PI / 2, 1.5, 0.9);
	{ const g = frame("x", 10.55, 0); P(g, 1.3, 0.76, 0.06, M.black, 9.9, 1.05, -0.08); brk(P(g, 1.26, 0.72, 0.005, M.screen, 9.9, 1.07, -0.115)); }
	wbox(8.9, 10.9, 0, 0.45, 10.1, 10.5, M.white, true);
	curtains("z", 14.6, 6.8, 9.5, 1, EXT, M.curtainTeal, { lo: 4.9, hi: 10.4 });
	curtains("x", 10.55, 12.0, 13.8, -1, EXT, M.curtainTeal, { hi: 14.5 });
	picture("z", 14.6, 10.05, 1, 0.35, 0.45, M.sunflowers, 1.5);
	{ const g = new THREE.Group(); P(g, 0.8, 0.9, 0.38, M.wood, 0, 0, 0); brk(P(g, 0.76, 0.6, 0.02, M.glass, 0, 0.12, 0.19)); place(g, 14.1, 10.25, Math.PI, 0.8, 0.38); }   // glass cabinet
	plant(11.5, 10.2, 0.9);

	// Entrance hall: console and art
	{ const g = new THREE.Group(); P(g, 0.9, 0.04, 0.3, M.woodPale, 0, 0.78, 0); for (const s of [-1, 1]) P(g, 0.06, 0.78, 0.3, M.woodPale, s * 0.42, 0, 0); place(g, 6.53, 9.8, Math.PI / 2, 0.9, 0.3); }
	brk(C(scene, 0.08, 0.1, 0.35, M.gilt, 6.53, 0.82, 9.6, 16)); brk(C(scene, 0.07, 0.09, 0.25, M.gilt, 6.53, 0.82, 10.0, 16));
	picture("z", 8.5, 12.3, -1, 0.9, 1.3, M.abstract, 0.8, M.white);

	// Study: built-in L desk and shelving under the window
	wbox(8.6, 11.2, 0.72, 0.75, 12.7, 13.25, M.cabinet, true);
	wbox(10.65, 11.2, 0.72, 0.75, 10.7, 12.7, M.cabinet, true);
	for (const [x0, x1, z0, z1] of [[8.6, 9.15, 12.7, 13.25], [9.8, 10.35, 12.7, 13.25], [10.65, 11.2, 11.5, 12.05]]) wbox(x0, x1, 0, 0.72, z0, z1, M.cabinet);
	for (let i = 0; i < 3; i++) wbox(10.9, 11.2, 1.2 + i * 0.36, 1.22 + i * 0.36, 10.7, 12.6, M.cabinet);
	wbox(10.83, 10.85, 0.75, 1.1, 11.6, 12.1, M.black); wbox(10.8, 10.83, 0.77, 1.07, 11.62, 12.08, M.screen);
	place(chair(M.white), 10.0, 12.2, Math.PI, 0.48, 0.48);
	for (const [z, c] of [[10.9, M.duvetOrange], [11.5, M.black], [12.2, M.duvetOrange]]) brk(C(scene, 0.05, 0.05, 0.22, c, 11.05, 1.58, z, 12));
	blind("x", 13.35, 9.1, 10.6, -1, EXT, M.white, { top: 2.25, drop: 0.2 });

	// Powder room, laundry, garage
	place(toilet(), 5.8, 8.35, Math.PI, 0.4, 0.7);
	{ const g = new THREE.Group(); P(g, 0.45, 0.12, 0.3, M.white, 0, 0.8, 0); C(g, 0.15, 0.1, 0.1, M.ceramic, 0, 0.85, 0.02); brk(P(g, 0.4, 0.6, 0.02, M.mirror, 0, 1.2, -0.14)); place(g, 5.8, 6.5, 0, 0.45, 0.3); }
	wbox(1.25, 3.3, 0, 0.9, 8.15, 8.7, M.cabinet, true); wbox(1.23, 3.32, 0.9, 0.93, 8.13, 8.72, M.linen);
	wbox(2.4, 3.0, 0.05, 0.85, 8.13, 8.14, M.white); C(scene, 0.12, 0.12, 0.01, M.glass, 2.7, 0.45, 8.125);
	wbox(1.4, 1.95, 0.93, 0.95, 8.25, 8.6, M.steel);
	wbox(1.25, 3.3, 1.5, 2.2, 8.35, 8.7, M.cabinet);

	// ---------------------------------------------------------------------------
	// Upstairs furniture
	// ---------------------------------------------------------------------------
	// Master: bed against the north wall between the two windows, dresser under
	// the east window; the walk-in robe behind the double doors.
	place(bed(1.6, 2.05, M.duvetGreen, M.headboard, M.wood), 6.95, 2.67, 0, 1.76, 2.13, true, U, 0.66);
	place(nightstand(), 5.8, 1.85, 0, 0.5, 0.4, true, U);
	place(nightstand(), 8.1, 1.85, 0, 0.5, 0.4, true, U);
	place(dresser(1.2), 9.05, 3.4, -Math.PI / 2, 1.2, 0.48, true, U);
	wbox(6.2, 7.7, U, U + 0.01, 3.0, 4.2, M.rugMaster, false, false);
	curtains("x", 1.5, 5.3, 6.1, 1, EXT, M.curtainMocha, { y: U, h: H1 });
	curtains("x", 1.5, 7.8, 8.55, 1, EXT, M.curtainMocha, { y: U, h: H1 });
	curtains("z", 9.4, 2.6, 4.25, 1, EXT, M.curtainMocha, { y: U, h: H1, lo: 1.65, hi: 4.65 });
	{ // robe: rails and hanging clothes along both side walls, shelf over
		const r = rng(77), cols = [M.cream, M.navy, M.teal, M.duvetOrange, M.white, M.woodDark, M.duvetPink];
		for (const [x0, x1] of [[6.85, 7.3], [8.9, 9.35]]) {
			wbox((x0 + x1) / 2 - 0.02, (x0 + x1) / 2 + 0.02, U + 1.75, U + 1.78, 4.85, 5.9, M.steel);
			for (let z = 4.9; z < 5.85; z += 0.07) { const h = 0.7 + r() * 0.5; wbox(x0 + 0.03, x1 - 0.03, U + 1.75 - h, U + 1.72, z, z + 0.05, cols[Math.floor(r() * cols.length)], false, false); }
			wbox(x0, x1, U + 1.95, U + 1.98, 4.85, 5.9, M.white);
			addRect(x0, x1, 4.85, 5.9, furnRects, U, TOP);
		}
	}
	// Ensuite: shower in the north-west corner, WC by the north wall, double
	// vanity along the south wall.
	shower(2.05, 3.05, 1.6, 2.7, U, [[2.05, 3.05, 2.69, 2.71], [3.04, 3.06, 1.6, 2.7]]);
	place(toilet(), 3.95, 1.95, 0, 0.4, 0.7, true, U);
	place(vanity(2.0, 2), 3.2, 4.42, Math.PI, 2.0, 0.55, true, U);
	// Landing and hall: linen cupboard, a painting
	place(wardrobe(1.6, 0.42, 2.2), 6.54, 7.5, -Math.PI / 2, 1.6, 0.42, true, U);
	picture("x", 7.15, 4.45, -1, 0.8, 1.0, M.abstract, U + 0.9, M.white);
	// Bathroom: WC compartment at the north end, shower and bath along the
	// west wall, vanity by the door.
	place(toilet(), 2.35, 7.58, Math.PI / 2, 0.4, 0.7, true, U);
	shower(2.05, 3.1, 8.1, 8.95, U, [[2.05, 3.1, 8.94, 8.96], [3.09, 3.11, 8.1, 8.95]]);
	bath(2.05, 3.75, 10.1, 10.8, U);
	place(vanity(1.0, 1), 4.72, 9.85, -Math.PI / 2, 1.0, 0.55, true, U);
	wbox(3.9, 4.3, U + 0.9, U + 1.5, 10.79, 10.8, M.steel, false, false);                                          // heated rail
	// Bedroom 2: bed on the east wall, robe to the north
	place(bed(1.5, 2.0, M.duvetPink, M.white, M.white), 9.76, 7.7, -Math.PI / 2, 1.66, 2.08, true, U, 0.66);
	place(nightstand(), 10.6, 6.5, -Math.PI / 2, 0.5, 0.4, true, U);
	place(dresser(0.8, 1.1, M.white), 7.2, 6.4, 0, 0.8, 0.48, true, U);
	place(wardrobe(1.45, 0.55, 2.2), 10.15, 5.67, 0, 1.45, 0.55, true, U);
	curtains("z", 10.9, 6.6, 8.8, 1, EXT, M.curtainSage, { y: U, h: H1, lo: 6.0, hi: 9.3 });
	// Bedroom 4: bed against the south wall, robe off the west wall
	place(bed(1.5, 2.0, M.duvetOrange), 8.25, 11.6, Math.PI, 1.66, 2.08, true, U, 0.66);
	place(nightstand(), 7.2, 12.35, Math.PI, 0.5, 0.4, true, U);
	place(nightstand(), 9.3, 12.35, Math.PI, 0.5, 0.4, true, U);
	{ const g = new THREE.Group(); for (let i = 0; i < 2; i++) { P(g, 0.5, 2.15, 0.03, M.door, -0.25 + i * 0.5, 0, 0); C(g, 0.025, 0.025, 0.04, M.handle, i ? 0.05 : -0.05, 1.0, 0.03, 12).rotation.x = Math.PI / 2; } place(g, 6.62, 10.95, Math.PI / 2, 1.0, 0.05, false, U); }
	place(dresser(1.0, 1.2), 8.3, 9.65, 0, 1.0, 0.48, true, U);
	picture("x", 9.35, 9.3, 1, 0.5, 0.6, M.sunflowers, U + 1.4);
	blind("z", 9.9, 9.8, 11.7, 1, EXT, M.headboard, { y: U, top: 2.3 });
	// Bedroom 3: bed on the north wall, desk under the south window, robe
	// doors on the east wall.
	place(bed(1.4, 2.0, M.duvetBlue), 3.1, 12.0, 0, 1.56, 2.08, true, U, 0.66);
	place(nightstand(false), 2.3, 11.22, 0, 0.5, 0.4, true, U);
	place(bookcase(0.8, 1.9), 4.5, 11.15, 0, 0.8, 0.35, true, U);
	{ const g = new THREE.Group(); P(g, 1.4, 0.04, 0.55, M.wood, 0, 0.72, 0); for (const s of [-1, 1]) P(g, 0.05, 0.72, 0.5, M.wood, s * 0.65, 0, 0); place(g, 4.75, 13.35, Math.PI, 1.4, 0.55, true, U); }
	place(chair(M.linen), 4.75, 12.8, 0, 0.48, 0.48, true, U);
	{ const g = new THREE.Group(); for (let i = 0; i < 4; i++) { P(g, 0.55, 2.15, 0.03, M.door, -0.825 + i * 0.55, 0, 0); C(g, 0.025, 0.025, 0.04, M.handle, -0.825 + i * 0.55 + (i % 2 ? -0.2 : 0.2), 1.0, 0.03, 12).rotation.x = Math.PI / 2; } place(g, 5.93, 12.6, -Math.PI / 2, 2.2, 0.05, false, U); }
	blind("x", 13.75, 3.9, 5.2, -1, EXT, M.curtainPrint, { y: U, top: 2.35 });
	blind("z", 1.95, 11.3, 12.8, -1, EXT, M.curtainPrint, { y: U, top: 2.35 });

	// ---------------------------------------------------------------------------
	// Site: patio, lawn and beds, hedges and fences, neighbours
	// ---------------------------------------------------------------------------
	const SITE = { x0: -4, x1: 20, z0: -5, z1: 21 };
	{
		const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), M.grass);
		const uv = ground.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1600, uv.getY(i) * 1600);
		ground.rotation.x = -Math.PI / 2; ground.position.y = -0.03; ground.receiveShadow = true; scene.add(ground);
	}
	floor(11.6, 18.3, -1.2, 11.0, M.aggregate, -0.01);                                                     // patio
	floor(-0.2, 11.5, 15.05, 21.5, M.asphalt, -0.012);                                                      // drive
	floor(11.4, 13.3, 11.0, 14.0, M.aggregate, -0.01);
	floor(-3.2, -0.8, -2.0, 21.0, M.aggregate, -0.012);                                                    // side path
	floor(-3.2, 11.6, -2.0, -0.6, M.aggregate, -0.012);
	for (const [x0, x1, z0, z1] of [[18.3, 19.6, -4.6, 14.0], [11.9, 18.3, -4.6, -1.2], [8.7, 11.3, 13.55, 15.4]]) {    // planted beds
		floor(x0, x1, z0, z1, std({ color: 0x3b2f24, roughness: 1 }), -0.005);
		const r = rng(Math.round(x0 * 10 + z0));
		for (let i = 0; i < (x1 - x0) * (z1 - z0) * 0.9; i++) {
			const s = 0.25 + r() * 0.45, m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), [M.leaf, M.leaf2, M.leaf3][i % 3]);
			m.position.set(x0 + 0.3 + r() * (x1 - x0 - 0.6), s * 0.7, z0 + 0.3 + r() * (z1 - z0 - 0.6)); m.scale.y = 0.8; m.castShadow = true; scene.add(m);
		}
		addRect(x0, x1, z0, z1, null, 0, 1);
	}
	function hedge(x0, x1, z0, z1, h) {
		const m = wbox(x0, x1, 0, h, z0, z1, M.hedge, false);
		const w = x1 - x0, d = z1 - z0; m.geometry = boxUV(new THREE.BoxGeometry(w, h, d), w, h, d);
		addRect(x0, x1, z0, z1, wallRects, 0, h);
	}
	hedge(SITE.x0, SITE.x1, SITE.z0, SITE.z0 + 0.8, 2.6);
	hedge(SITE.x1 - 0.8, SITE.x1, SITE.z0, 14.4, 2.6);
	hedge(SITE.x0, SITE.x0 + 0.7, SITE.z0, 17, 2.4);
	{ // timber fence and gate between the front and the back garden
		wbox(11.4, SITE.x1, 0, 1.8, 14.0, 14.08, M.fence, false);
		for (let x = 11.4; x < SITE.x1; x += 0.15) wbox(x, x + 0.13, 0, 1.85, 14.08, 14.1, M.fence, false);
		addRect(11.4, SITE.x1, 13.95, 14.15, wallRects, 0, 1.9);
		wbox(SITE.x1 - 0.1, SITE.x1, 0, 1.8, 14.0, SITE.z1, M.fence, true);
	}
	for (const [x, z] of [[9.2, 14.1], [10.1, 14.8], [10.9, 14.1], [13.0, 16.8], [15.5, 16.8]]) {  // clipped standards in the front bed
		const g = new THREE.Group(); C(g, 0.03, 0.04, 0.9, M.bark, 0, 0, 0, 6);
		const b = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 10), M.leaf2); b.position.y = 1.1; b.castShadow = true; g.add(b);
		place(g, x, z, 0, 0.3, 0.3);
	}
	wbox(11.9, 16.0, 0, 0.5, 15.2, 16.0, M.hedge, true);
	function tree(x, z, h, r, mat = M.leaf, seed = 1) {
		const g = new THREE.Group(), q = rng(seed);
		C(g, 0.12, 0.2, h * 0.6, M.bark, 0, 0, 0, 8);
		for (let i = 0; i < 9; i++) {
			const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r * (0.45 + q() * 0.35), 1), mat);
			m.position.set((q() - 0.5) * r * 1.3, h * 0.6 + q() * r, (q() - 0.5) * r * 1.3); m.castShadow = true; g.add(m);
		}
		return place(g, x, z, 0, 0.5, 0.5);
	}
	function palm(x, z, h) {
		const g = new THREE.Group();
		C(g, 0.16, 0.24, h, M.bark, 0, 0, 0, 10);
		for (let i = 0; i < 12; i++) {
			const f = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.03, 0.35), M.leaf2); f.geometry.translate(1.1, 0, 0);
			f.position.y = h; f.rotation.set(0, i * Math.PI / 6, -0.35 - (i % 2) * 0.3); f.castShadow = true; g.add(f);
		}
		return place(g, x, z, 0, 0.5, 0.5);
	}
	tree(18.2, 2.0, 4.5, 2.2, M.leaf, 3); tree(15.2, -3.0, 3.2, 1.5, M.maple, 5); tree(-2.2, 1.2, 5.5, 2.6, M.leaf3, 7);
	tree(18.5, 11.5, 3.6, 1.8, M.leaf2, 11); tree(-2.5, 19.5, 5.0, 2.4, M.leaf, 13); palm(19.0, 19.5, 9); palm(15.5, 22.5, 8);
	tree(12.2, 12.8, 3.0, 1.2, M.maple, 17);
	{ // outdoor setting on the patio
		place(coffeeTable(1.9, 0.95, M.timberGrey, M.timberGrey, 0.75), 15.9, 3.2, Math.PI / 2, 1.9, 0.95);
		for (const [x, z, ry] of [[15.3, 2.6, Math.PI / 2], [15.3, 3.8, Math.PI / 2], [16.5, 2.6, -Math.PI / 2], [16.5, 3.8, -Math.PI / 2], [15.9, 1.9, 0], [15.9, 4.5, Math.PI]]) {
			const g = new THREE.Group(); P(g, 0.58, 0.45, 0.58, M.wicker, 0, 0, 0); P(g, 0.58, 0.55, 0.12, M.wicker, 0, 0.45, -0.23); place(g, x, z, ry, 0.58, 0.58);
		}
		wbox(15.2, 17.2, 0, 0.5, 8.6, 9.6, M.woodPale, true);                                               // planter box
		for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 1), M.leaf2); m.position.set(15.5 + i * 0.28, 0.75, 9.1); scene.add(m); }
	}
	{ // garden shed
		wbox(13.6, 16.2, 0, 2.2, 11.6, 13.4, M.boards, true);
		wbox(13.4, 16.4, 2.2, 2.3, 11.4, 13.6, M.fascia);
		wbox(14.5, 15.3, 0, 1.95, 11.58, 11.6, M.white);
	}
	for (const [x, z, s] of [[12.4, -0.6, 1], [15.0, 10.95, 0.9], [15.0, 4.4, 0.8]]) plant(x, z, s);

	function neighbour(x0, x1, z0, z1, storeys, clad, seed) {
		const h = storeys * 2.9;
		const m = wbox(x0, x1, 0, h, z0, z1, clad);
		const w = x1 - x0, d = z1 - z0; m.geometry = boxUV(new THREE.BoxGeometry(w, h, d), w, h, d);
		const r = rng(seed);
		for (let s = 0; s < storeys; s++) for (let i = 0; i < Math.floor(w / 3); i++) {
			const wx = x0 + 1 + i * 3 + r() * 0.5;
			for (const z of [z0 - 0.01, z1 + 0.01]) wbox(wx, wx + 1.4, s * 2.9 + 1.0, s * 2.9 + 2.2, z - 0.02, z + 0.02, M.frame, false, false);
		}
		hipRoof(x0, x1, z0, z1, h, 0.5, 0.4);
	}
	neighbour(4, 16, -17, -8, 2, M.plaster, 1);
	neighbour(-16, -7, -3, 9, 1, M.boards, 2);
	neighbour(-15, -7, 12, 22, 2, M.plaster, 3);
	neighbour(24, 34, -6, 5, 2, M.plaster, 4);
	neighbour(24, 32, 9, 19, 1, M.boards, 5);
	neighbour(2, 12, 28, 38, 2, M.boards, 6);
	for (const [x0, x1, z0, z1] of [[SITE.x0 - 0.2, SITE.x1 + 0.2, SITE.z0 - 0.2, SITE.z0], [SITE.x0 - 0.2, SITE.x0, SITE.z0, SITE.z1], [SITE.x1, SITE.x1 + 0.2, SITE.z0, SITE.z1], [SITE.x0, SITE.x1, SITE.z1, SITE.z1 + 0.2]])
		addRect(x0, x1, z0, z1, null, 0, 3);
	floor(-40, 60, 21.5, 27, M.asphalt, -0.015);                                                           // the street
	renderer.shadowMap.needsUpdate = true;

	// ---------------------------------------------------------------------------
	// Two cats — a calico ragdoll and a slightly bigger orange tabby — wander
	// the ground floor and the patio on a graph of open floor. A link that
	// passes through a door is only taken while that door is open. Shoot one
	// and it jumps, cries and bolts away from you.
	// ---------------------------------------------------------------------------
	const NODES = {
		K3: [1.25, 1.3], K2: [1.25, 3.4], K1: [3.3, 3.4], D: [7.0, 3.9], F1: [9.5, 3.95], F2: [11.1, 1.8],
		PT1: [13.2, 2.0], PT3: [15.2, 4.9], PT2: [16.0, 8.0],
		P1: [4.55, 5.4], L: [5.8, 5.4], H1: [7.4, 5.5], H2: [7.4, 7.6], H3: [7.4, 11.15], H4: [7.4, 12.4],
		LV1: [9.6, 7.25], LV2: [13.95, 7.15], LV3: [13.8, 9.8], O: [9.4, 11.6],
		P2: [4.55, 7.7], LA: [2.5, 7.6], G1: [4.55, 9.8], G2: [2.5, 12.5],
	};
	const LINKS = "K3-K2 K2-K1 K1-P1 K1-D D-F1 F1-F2 F2-PT1 PT1-PT3 PT3-PT2 PT2-LV2 D-H1 P1-L L-H1 H1-H2 H2-H3 H3-H4 H2-LV1 LV1-LV2 LV2-LV3 H3-O P1-P2 P2-LA P2-G1 G1-G2";
	const crosses = ([ax, az], [bx, bz], [cx, cz, dx, dz]) => {                // do two segments cross?
		const s = (px, pz, qx, qz, rx, rz) => Math.sign((qx - px) * (rz - pz) - (qz - pz) * (rx - px));
		return s(ax, az, bx, bz, cx, cz) !== s(ax, az, bx, bz, dx, dz) && s(cx, cz, dx, dz, ax, az) !== s(cx, cz, dx, dz, bx, bz);
	};
	const graph = {};
	for (const k in NODES) graph[k] = [];
	for (const e of LINKS.split(" ")) {
		const [a, b] = e.split("-");
		const via = doors.filter((d) => d.y < 1 && d.line && crosses(NODES[a], NODES[b], d.line));
		graph[a].push({ to: b, via }); graph[b].push({ to: a, via });
	}
	const passable = (l) => l.via.every((d) => d.cur > 0.7);

	function catTexture(kind, seed) {
		const c = canvas(256, 128), g = c.getContext("2d"), r = rng(seed);
		if (kind === "calico") {                                         // white, with ginger and black patches on the back
			g.fillStyle = "#f4efe7"; g.fillRect(0, 0, 256, 128);
			for (const [col, n] of [["#d8873a", 7], ["#2b2521", 6]]) for (let i = 0; i < n; i++) {
				g.fillStyle = col; g.beginPath(); g.ellipse(r() * 256, 8 + r() * 62, 16 + r() * 26, 10 + r() * 18, r() * 3, 0, Math.PI * 2); g.fill();
			}
		} else {                                                         // ginger tabby with a pale belly
			const gr = g.createLinearGradient(0, 0, 0, 128);
			gr.addColorStop(0, "#df8738"); gr.addColorStop(0.62, "#e8964a"); gr.addColorStop(1, "#f6cf9c");
			g.fillStyle = gr; g.fillRect(0, 0, 256, 128);
			g.strokeStyle = "#b0601f"; g.lineCap = "round";
			for (let i = 0; i < 16; i++) {
				let x = i * 16 + r() * 6; g.lineWidth = 3 + r() * 4; g.beginPath(); g.moveTo(x, 0);
				for (let y = 0; y <= 80; y += 10) { x += (r() - 0.5) * 6; g.lineTo(x, y); }
				g.stroke();
			}
		}
		for (let k = 0; k < 2500; k++) { g.fillStyle = `rgba(${r() > 0.5 ? "255,255,255" : "60,40,20"},${r() * 0.08})`; g.fillRect(r() * 256, r() * 128, 1, 3); }
		const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
	}

	const cats = [];
	function makeCat({ kind, seed, scale, fluff, eye, pitch, start }) {
		const coat = std({ map: catTexture(kind, seed), roughness: 1 });
		const pale = std({ color: kind === "calico" ? 0xf6f2ec : 0xf3c995, roughness: 1 });
		const eyes = std({ color: eye, roughness: 0.15, emissive: eye, emissiveIntensity: 0.25 });
		const pink = std({ color: 0xd98a8a, roughness: 0.6 });
		const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
		const blob = (rx, ry, rz, mat, x, y, z, parent = body) => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), mat); m.scale.set(rx, ry, rz); m.position.set(x, y, z); parent.add(m); return m; };
		blob(0.1 * fluff, 0.1 * fluff, 0.2, coat, 0, 0.21, 0);
		blob(0.085 * fluff, 0.085 * fluff, 0.09, pale, 0, 0.21, 0.13);                 // chest
		const head = new THREE.Group(); head.position.set(0, 0.3, 0.21); body.add(head);
		blob(0.075 * fluff, 0.068 * fluff, 0.07 * fluff, coat, 0, 0, 0, head);
		blob(0.036, 0.028, 0.03, pale, 0, -0.024, 0.055, head);                         // muzzle
		blob(0.008, 0.006, 0.005, pink, 0, -0.01, 0.085, head);                          // nose
		for (const s of [-1, 1]) {
			const ear = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.065, 4), coat); ear.position.set(s * 0.042, 0.066, -0.01); ear.rotation.set(-0.1, Math.PI / 4, -s * 0.25); head.add(ear);
			blob(0.013, 0.016, 0.006, eyes, s * 0.03, 0.012, 0.064, head);
			for (const k of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.09, 3), pale); w.rotation.set(0, 0, Math.PI / 2 + k * 0.12); w.position.set(s * 0.06, -0.025 + k * 0.006, 0.06); head.add(w); }
		}
		const legs = [];
		for (const [x, z] of [[-0.055, 0.12], [0.055, 0.12], [-0.055, -0.12], [0.055, -0.12]]) {
			const pivot = new THREE.Group(); pivot.position.set(x, 0.17, z); body.add(pivot);
			const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.022 * fluff, 0.02, 0.16, 8), kind === "calico" ? pale : coat); leg.position.y = -0.08; pivot.add(leg);
			blob(0.025, 0.014, 0.032, pale, 0, -0.163, 0.01, pivot);
			legs.push(pivot);
		}
		const tail = [], tr = kind === "calico" ? 0.032 : 0.02;
		let parent = body;
		for (let i = 0; i < 7; i++) {
			const seg = new THREE.Group();
			if (i) seg.position.y = 0.06; else seg.position.set(0, 0.24, -0.19);
			parent.add(seg);
			const m = new THREE.Mesh(new THREE.CylinderGeometry(tr * (1 - (i + 1) * 0.07), tr * (1 - i * 0.07), 0.066, 8), coat); m.position.y = 0.03; seg.add(m);
			tail.push(seg); parent = seg;
		}
		g.scale.setScalar(scale);
		g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
		scene.add(g);
		const cat = {
			g, body, head, legs, tail, pitch, node: start, prev: null, from: NODES[start].slice(), to: null, idle: 1 + Math.random() * 2,
			phase: Math.random() * 6, jumpT: 0, flee: 0, yaw: Math.random() * 6, sit: 0, t: Math.random() * 10,
			spook() {                                                    // hit: jump, cry, run
				this.jumpT = 0.5; this.flee = 5 + Math.random() * 2; this.idle = 0;
				if (!this.to) this.pick();
				else if (awayScore(this.node) > awayScore(this.to.node)) this.retreat();     // run back the way it came if that's away from you
				meow(this.pitch);
			},
			retreat() { [this.node, this.to.node] = [this.to.node, this.node]; this.to.x = NODES[this.to.node][0]; this.to.z = NODES[this.to.node][1]; },
			pick() {
				const links = graph[this.node].filter(passable);
				if (!links.length) { this.idle = 2; this.to = null; return; }
				let l;
				if (this.flee > 0) l = links.reduce((a, b) => awayScore(b.to) > awayScore(a.to) ? b : a);
				else { const fresh = links.filter((q) => q.to !== this.prev); const pool = fresh.length ? fresh : links; l = pool[Math.floor(Math.random() * pool.length)]; }
				const [x, z] = NODES[l.to], j = this.flee > 0 ? 0 : 0.18;
				this.to = { node: l.to, x: x + (Math.random() - 0.5) * j, z: z + (Math.random() - 0.5) * j, via: l.via };
			},
		};
		g.position.set(NODES[start][0], 0, NODES[start][1]);
		cat.g.traverse((o) => { o.userData.cat = cat; });
		cats.push(cat);
		return cat;
	}
	const awayScore = (n) => Math.hypot(NODES[n][0] - pos.x, NODES[n][1] - pos.y);
	const catOf = (o) => { for (; o; o = o.parent) if (o.userData.cat) return o.userData.cat; return null; };
	function updateCat(c, dt) {
		c.t += dt;
		c.flee = Math.max(0, c.flee - dt);
		let speed = 0;
		if (c.to && c.to.via.some((d) => d.cur <= 0.7 && crosses([c.g.position.x, c.g.position.z], [c.to.x, c.to.z], d.line))) { c.retreat(); c.to.via = []; }   // a door shut in its face: turn back
		if (c.idle > 0 && c.flee === 0) {
			c.idle -= dt;
			c.sit = Math.min(1, c.sit + dt * 2);
		} else {
			c.sit = Math.max(0, c.sit - dt * 4);
			if (!c.to) c.pick();
			if (c.to) {
				const dx = c.to.x - c.g.position.x, dz = c.to.z - c.g.position.z, d = Math.hypot(dx, dz);
				speed = c.flee > 0 ? 2.6 : 0.45;
				if (d < 0.05) {
					c.prev = c.node; c.node = c.to.node; c.to = null;
					if (c.flee === 0 && Math.random() < 0.35) c.idle = 2 + Math.random() * 5;
				} else {
					const step = Math.min(d, speed * dt);
					c.g.position.x += dx / d * step; c.g.position.z += dz / d * step;
					const want = Math.atan2(dx, dz);
					let dy = want - c.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
					c.yaw += dy * Math.min(1, dt * (c.flee > 0 ? 14 : 6));
				}
			}
		}
		c.g.rotation.y = c.yaw;
		// gait, sitting, the jump when hit
		c.phase += dt * speed * 13;
		const moving = speed > 0 ? 1 : 0;
		c.legs.forEach((l, i) => { l.rotation.x = moving * Math.sin(c.phase + (i === 0 || i === 3 ? 0 : Math.PI)) * (c.flee > 0 ? 0.8 : 0.5); });
		c.body.rotation.x = -0.32 * c.sit;
		c.body.position.y = -0.03 * c.sit;
		c.legs[2].rotation.x -= 0.9 * c.sit; c.legs[3].rotation.x -= 0.9 * c.sit;
		c.head.rotation.y = Math.sin(c.t * 0.7) * 0.35 * (1 - moving);
		c.head.rotation.x = 0.3 * c.sit;
		c.tail.forEach((s, i) => {
			s.rotation.x = i === 0 ? (c.flee > 0 ? -0.6 : -1.2 + 0.4 * c.sit) : (c.flee > 0 ? 0.05 : 0.18 + 0.1 * c.sit);
			s.rotation.z = Math.sin(c.t * (c.flee > 0 ? 6 : 1.8) + i * 0.6) * 0.12;
		});
		let y = 0;
		if (c.jumpT > 0) { c.jumpT = Math.max(0, c.jumpT - dt); y = Math.sin(Math.PI * (1 - c.jumpT / 0.5)) * 0.45; }
		c.g.position.y = y;
	}
	function meow(pitch) {                                               // a startled "mrrrow"
		const a = audio(); if (!a) return;
		const t0 = a.currentTime, o = a.createOscillator(), o2 = a.createOscillator(), f = a.createBiquadFilter(), g = a.createGain();
		o.type = "sawtooth"; o2.type = "triangle";
		for (const [osc, k] of [[o, 1], [o2, 2.02]]) {
			osc.frequency.setValueAtTime(520 * pitch * k, t0);
			osc.frequency.linearRampToValueAtTime(980 * pitch * k, t0 + 0.12);
			osc.frequency.linearRampToValueAtTime(760 * pitch * k, t0 + 0.32);
			osc.frequency.linearRampToValueAtTime(430 * pitch * k, t0 + 0.55);
		}
		f.type = "bandpass"; f.Q.value = 3; f.frequency.setValueAtTime(1500 * pitch, t0); f.frequency.linearRampToValueAtTime(900 * pitch, t0 + 0.55);
		g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.32, t0 + 0.05); g.gain.setValueAtTime(0.3, t0 + 0.35); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.6);
		o.connect(f); o2.connect(f); f.connect(g).connect(a.destination);
		o.start(t0); o2.start(t0); o.stop(t0 + 0.62); o2.stop(t0 + 0.62);
	}
	makeCat({ kind: "calico", seed: 51, scale: 1.0, fluff: 1.18, eye: 0x3f7fd0, pitch: 1.15, start: "F1" });   // ragdoll: long fluffy coat, blue eyes
	makeCat({ kind: "tabby", seed: 53, scale: 1.18, fluff: 1.0, eye: 0xd09a2a, pitch: 0.85, start: "H2" });    // ginger: bigger, amber eyes

	// ---------------------------------------------------------------------------
	// First-person controls: pointer lock to look, WASD to walk, Ctrl / C to
	// crouch, Space to jump, E for doors, left click to fire.
	// ---------------------------------------------------------------------------
	const pos = new THREE.Vector2(spawn[0], spawn[1]);
	let foot = (spawn[2] ?? 0) > 0 ? U : 0, feet = foot, eyeFeet = foot, eyeH = EYE, vy = 0, grounded = true;   // foot: the floor you are on; feet: where your feet are
	scene.add(camera);
	camera.position.set(pos.x, foot + EYE, pos.y);
	camera.lookAt(lookAt[0], lookAt[1] + foot, lookAt[2]);
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
	document.addEventListener("pointerlockchange", () => { walking = isLocked(); if (!walking) { vel.set(0, 0); for (const k in keys) keys[k] = false; } lockListeners.forEach((f) => f(walking)); });
	document.addEventListener("mousedown", (e) => { if (isLocked() && e.button === 0) shoot(); });

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
	addEventListener("keydown", (e) => {
		keys[e.code] = true;
		if (!walking) return;
		if (e.code.startsWith("Arrow") || e.code === "Space" || e.ctrlKey) e.preventDefault();
		if (e.repeat) return;
		if (e.code === "Space" && grounded) { vy = 4.7; grounded = false; }   // about 1.1 m: onto a sofa, a bed or a table
		if (e.code === "KeyE") interact();
	});
	addEventListener("keyup", (e) => { keys[e.code] = false; });
	addEventListener("blur", () => { for (const k in keys) keys[k] = false; });

	const inRoom = (x, z, lv, m = 0) => rooms.some((q) => q.lv === lv && q.name !== "Patio" && x >= q.x0 - m && x < q.x1 + m && z >= q.z0 - m && z < q.z1 + m);
	const footAt = (x, z, cur) => stairY(x, z) ?? (cur > 1.5 && inRoom(x, z, 1, 0.15) ? U : 0);
	function collide(p, f, head) {
		for (let it = 0; it < 3; it++) for (const b of colliders) {
			if (b.off || b.y1 <= f + STEP || b.y0 >= f + head) continue;
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
	// The highest thing under you that you could be standing on: the floor or
	// stair, or the top of any piece of furniture within a step of your feet.
	function supportAt(x, z, f, base, r = RADIUS * 0.6) {
		let top = base;
		for (const b of colliders) {
			if (b.off || b.y1 <= top || b.y1 > f + STEP) continue;
			const cx = Math.max(b.x0, Math.min(x, b.x1)), cz = Math.max(b.z0, Math.min(z, b.z1));
			if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) top = b.y1;
		}
		return top;
	}
	function ceilingAt(x, z) {
		if (stairY(x, z) !== null) return TOP;
		if (feet >= U - 0.3) return inRoom(x, z, 1) ? TOP : Infinity;           // upstairs, or out on a roof
		return inRoom(x, z, 0) ? H0 : Infinity;
	}
	let crouching = false;
	function update(dt) {
		const k = (c) => walking && keys[c];
		crouching = k("ControlLeft") || k("ControlRight") || k("KeyC");
		const f = (k("KeyW") || k("ArrowUp") ? 1 : 0) - (k("KeyS") || k("ArrowDown") ? 1 : 0);
		const s = (k("KeyD") || k("ArrowRight") ? 1 : 0) - (k("KeyA") || k("ArrowLeft") ? 1 : 0);
		const pace = crouching ? 1.0 : k("ShiftLeft") || k("ShiftRight") ? RUN : WALK;
		camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
		let tx = fwd.x * f - fwd.z * s, tz = fwd.z * f + fwd.x * s;
		const len = Math.hypot(tx, tz); if (len > 0) { tx = tx / len * pace; tz = tz / len * pace; }
		const a = 1 - Math.exp(-dt * (grounded ? 8 : 2.5));                // a little steering in the air
		vel.x += (tx - vel.x) * a; vel.y += (tz - vel.y) * a;
		pos.x += vel.x * dt; pos.y += vel.y * dt;
		collide(pos, feet, crouching ? 1.2 : 1.85);
		foot = footAt(pos.x, pos.y, foot);
		const sup = supportAt(pos.x, pos.y, feet, foot);
		if (grounded && vy <= 0 && feet - sup < 0.45) feet = sup;              // follow the stair down, step off low things
		if (feet > sup || vy > 0) {
			grounded = false; vy -= 9.8 * dt; feet += vy * dt;
			if (feet <= sup) { feet = sup; vy = 0; grounded = true; }
		} else { feet = sup; vy = 0; grounded = true; }
		const ceil = ceilingAt(pos.x, pos.y);
		if (feet + eyeH + 0.12 > ceil) { feet = Math.max(sup, ceil - eyeH - 0.12); if (vy > 0) vy = 0; }
		eyeFeet = grounded ? eyeFeet + (feet - eyeFeet) * Math.min(1, dt * 14) : feet;
		eyeH += ((crouching ? 1.0 : EYE) - eyeH) * Math.min(1, dt * 10);
		const speed = vel.length();
		if (grounded) bob += dt * Math.PI * 2 * 0.95 * Math.min(speed, 2.8) / 1.4;
		camera.position.set(pos.x, eyeFeet + eyeH + Math.sin(bob * 2) * 0.014 * Math.min(speed / WALK, 1), pos.y);
		gunBob = Math.sin(bob) * Math.min(speed / WALK, 1);
	}

	// ---------------------------------------------------------------------------
	// Doors: E toggles the door under the crosshair, or failing that the
	// nearest one you are facing on this floor.
	// ---------------------------------------------------------------------------
	const ray = new THREE.Raycaster(), CENTRE = new THREE.Vector2(0, 0), look3 = new THREE.Vector3();
	const noHit = (o) => { for (; o; o = o.parent) if (o.userData.noHit) return true; return false; };
	const firstHit = (far) => { ray.setFromCamera(CENTRE, camera); ray.far = far; return ray.intersectObjects(scene.children, true).find((h) => !noHit(h.object)); };
	function facingDoor() {
		camera.getWorldDirection(look3);
		const fl = Math.hypot(look3.x, look3.z) || 1;
		let best = null, score = Infinity;
		for (const d of doors) {
			if (Math.abs(d.y - foot) > 1) continue;
			const dx = d.cx - camera.position.x, dz = d.cz - camera.position.z, dist = Math.hypot(dx, dz);
			if (dist > 2.2) continue;
			const dot = dist < 0.4 ? 1 : (dx * look3.x + dz * look3.z) / (dist * fl);
			if (dot < 0.6) continue;
			const sc = dist * (1.7 - dot);
			if (sc < score) { score = sc; best = d; }
		}
		return best;
	}
	function interact() {
		let d = null;
		const h = firstHit(2.6);
		if (h) for (let o = h.object; o; o = o.parent) if (o.userData.door) { d = o.userData.door; break; }
		d ??= facingDoor();
		if (d) { toggleDoor(d); thud(d.kind === "garage" ? 90 : 160); }
	}

	// ---------------------------------------------------------------------------
	// The pistol: a hitscan shot from the centre of the view, a tracer from the
	// muzzle, a bullet hole stuck to whatever it hit (so holes in a door swing
	// with it), sparks, a flash and a report.
	// ---------------------------------------------------------------------------
	const gun = new THREE.Group();
	{
		const gm = std({ color: 0x1c1d20, roughness: 0.35, metalness: 0.7 }), gg = std({ color: 0x2a2724, roughness: 0.8 });
		P(gun, 0.034, 0.045, 0.2, gm, 0, -0.02, -0.1, false);                      // slide
		P(gun, 0.03, 0.03, 0.17, gm, 0, -0.05, -0.09, false);                     // frame
		P(gun, 0.032, 0.12, 0.055, gg, 0, -0.16, -0.02, false).rotation.x = 0.28; // grip
		P(gun, 0.006, 0.01, 0.01, gm, 0, 0.025, -0.19, false);                    // front sight
		P(gun, 0.02, 0.01, 0.01, gm, 0, 0.025, -0.01, false);                     // rear sight
		const tg = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.004, 6, 12, Math.PI), gm); tg.rotation.y = Math.PI / 2; tg.position.set(0, -0.05, -0.07); gun.add(tg);
	}
	const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.002, -0.21); gun.add(muzzle);
	const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.12), new THREE.MeshBasicMaterial({ map: glowTexture("255,210,120"), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
	flash.position.copy(muzzle.position).z -= 0.03; flash.visible = false; gun.add(flash);
	const flashLight = new THREE.PointLight(0xffc27a, 0, 6, 2); flashLight.position.copy(muzzle.position); gun.add(flashLight);
	const GUN_AT = new THREE.Vector3(0.15, -0.14, -0.36);
	gun.position.copy(GUN_AT);
	gun.traverse((o) => { o.userData.noHit = true; o.frustumCulled = false; if (o.isMesh) o.renderOrder = 10; });
	camera.add(gun);
	let recoil = 0, gunBob = 0, lastShot = 0, flashT = 0;

	function glowTexture(rgb) {
		const c = canvas(64, 64), g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
		gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(0.35, `rgba(${rgb},.6)`); gr.addColorStop(1, `rgba(${rgb},0)`);
		g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
		return new THREE.CanvasTexture(c);
	}
	function holeTexture(glass) {
		const S = 64, c = canvas(S, S), g = c.getContext("2d"), r = rng(glass ? 5 : 3);
		if (glass) {
			g.strokeStyle = "rgba(255,255,255,.85)"; g.lineWidth = 1.2;
			for (let i = 0; i < 11; i++) { const a = i / 11 * Math.PI * 2 + r() * 0.3; g.beginPath(); g.moveTo(32, 32); let x = 32, y = 32; for (let k = 0; k < 4; k++) { x += Math.cos(a + (r() - 0.5) * 0.5) * 7; y += Math.sin(a + (r() - 0.5) * 0.5) * 7; g.lineTo(x, y); } g.stroke(); }
			for (const rad of [8, 15]) { g.beginPath(); g.arc(32, 32, rad + r() * 2, 0, Math.PI * 2); g.stroke(); }
			g.fillStyle = "rgba(40,40,40,.8)"; g.beginPath(); g.arc(32, 32, 3, 0, Math.PI * 2); g.fill();
		} else {
			const gr = g.createRadialGradient(32, 32, 0, 32, 32, 30);
			gr.addColorStop(0, "rgba(10,8,6,1)"); gr.addColorStop(0.22, "rgba(20,16,12,.95)"); gr.addColorStop(0.3, "rgba(70,62,54,.7)"); gr.addColorStop(0.62, "rgba(90,80,70,.22)"); gr.addColorStop(1, "rgba(90,80,70,0)");
			g.fillStyle = gr; g.fillRect(0, 0, S, S);
			g.strokeStyle = "rgba(30,25,20,.5)"; for (let i = 0; i < 6; i++) { const a = r() * Math.PI * 2; g.beginPath(); g.moveTo(32 + Math.cos(a) * 8, 32 + Math.sin(a) * 8); g.lineTo(32 + Math.cos(a) * (14 + r() * 8), 32 + Math.sin(a) * (14 + r() * 8)); g.stroke(); }
		}
		const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
	}
	const decal = (map) => new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
	const holeMat = decal(holeTexture(false)), crackMat = decal(holeTexture(true));
	const holeGeo = new THREE.PlaneGeometry(0.09, 0.09);
	const tracerGeo = new THREE.CylinderGeometry(0.0025, 0.0025, 1, 5, 1, true); tracerGeo.rotateX(Math.PI / 2);
	const sparkGeo = new THREE.BoxGeometry(0.012, 0.012, 0.012);
	const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffc46a });
	const dustMat = new THREE.MeshBasicMaterial({ map: glowTexture("200,190,175"), transparent: true, depthWrite: false });
	const holes = [], fx = [];
	const MUZZLE = new THREE.Vector3(), N = new THREE.Vector3();

	function shoot() {
		const now = performance.now() / 1000;
		if (now - lastShot < 0.12) return;
		lastShot = now;
		const hit = firstHit(250);
		muzzle.getWorldPosition(MUZZLE);
		const to = hit ? hit.point.clone() : ray.ray.at(150, new THREE.Vector3());
		{ // tracer: a bright streak that fades
			const len = MUZZLE.distanceTo(to), m = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({ color: 0xffc860, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
			m.scale.set(1, 1, len); m.position.copy(MUZZLE).lerp(to, 0.5); m.lookAt(to); m.userData.noHit = true; scene.add(m);
			fx.push({ m, t: 0, life: 0.07, kind: "tracer" });
		}
		const cat = hit && catOf(hit.object);
		const pane = hit && !cat && hit.object.userData.glass;
		const root = hit && !cat && !pane && breakRoot(hit.object);
		if (cat) cat.spook();
		else if (pane && ++pane.hits >= 5) {                                        // fifth hit: the pane goes
			if (pane.col) pane.col.off = true;
			pane.bars.forEach((b) => b.removeFromParent());
			shatter(hit.object, hit.point, ray.ray.direction);
		} else if (root) shatter(root, hit.point, ray.ray.direction);
		else if (hit) {
			N.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
			if (N.dot(ray.ray.direction) > 0) N.negate();
			const mat = Array.isArray(hit.object.material) ? hit.object.material[hit.face.materialIndex] : hit.object.material;
			const glassy = !!pane;
			const h = new THREE.Mesh(holeGeo, glassy ? crackMat : holeMat);
			h.position.copy(hit.point).addScaledVector(N, 0.003);
			h.lookAt(h.position.clone().add(N)); h.rotateZ(Math.random() * Math.PI * 2);
			h.scale.setScalar(glassy ? 2.6 : 0.8 + Math.random() * 0.4);
			h.userData.noHit = true; h.renderOrder = 2;
			hit.object.attach(h); holes.push(h);
			if (holes.length > 300) holes.shift().removeFromParent();
			for (let i = 0; i < 7; i++) {                                           // sparks
				const s = new THREE.Mesh(sparkGeo, sparkMat); s.userData.noHit = true; s.position.copy(hit.point).addScaledVector(N, 0.01); scene.add(s);
				const v = N.clone().multiplyScalar(1.5 + Math.random() * 1.5).add(new THREE.Vector3((Math.random() - 0.5) * 2.5, Math.random() * 1.5, (Math.random() - 0.5) * 2.5));
				fx.push({ m: s, t: 0, life: 0.25 + Math.random() * 0.2, kind: "spark", v });
			}
			const dust = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), dustMat.clone()); dust.userData.noHit = true;
			dust.position.copy(hit.point).addScaledVector(N, 0.05); dust.lookAt(camera.position); scene.add(dust);
			fx.push({ m: dust, t: 0, life: 0.5, kind: "dust" });
		}
		recoil = 1; flashT = 0.05; flash.rotation.z = Math.random() * Math.PI;
		turn((Math.random() - 0.5) * 0.004, -0.012);
		bang();
	}
	// Ornaments — vases, lamps, pot plants, mirrors, the TV screen, bottles,
	// the fruit bowl — fly apart into shards of their own material, which
	// bounce and settle on whatever is under them, then fade.
	const shardGeo = new THREE.TetrahedronGeometry(1, 0), BOX = new THREE.Box3(), SIZE = new THREE.Vector3();
	const shardGlass = new THREE.MeshPhysicalMaterial({ color: 0xe6f3f5, transparent: true, opacity: 0.55, roughness: 0.04, metalness: 0.2, side: THREE.DoubleSide });
	let shards = 0;
	const breakRoot = (o) => { for (; o; o = o.parent) if (o.userData.breakable) return o; return null; };
	function groundAt(x, z, y) {
		let g = y >= U - 0.3 && inRoom(x, z, 1, 0.1) ? U : 0;
		for (const b of colliders) if (!b.off && b.y1 > g && b.y1 <= y + 0.02 && x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) g = b.y1;
		return g;
	}
	function shatter(root, point, dir) {
		root.updateWorldMatrix(true, true);
		let glass = false;
		root.traverse((o) => {
			if (!o.isMesh || o.userData.noHit) return;
			BOX.setFromObject(o); BOX.getSize(SIZE);
			const mat = Array.isArray(o.material) ? o.material[0] : o.material;
			if (mat.transparent || mat.metalness > 0.8) glass = true;
			const pane = mat.transparent, area = SIZE.x * SIZE.y + SIZE.y * SIZE.z + SIZE.x * SIZE.z;
			const n = pane ? THREE.MathUtils.clamp(Math.round(area * 16), 10, 45) : THREE.MathUtils.clamp(Math.round(SIZE.x * SIZE.y * SIZE.z * 8000), 5, 18);
			const sz = pane ? 0.035 : THREE.MathUtils.clamp(Math.max(SIZE.x, SIZE.y, SIZE.z) * 0.12, 0.008, 0.05);
			for (let i = 0; i < n && shards < 700; i++) {
				const m = new THREE.Mesh(shardGeo, pane ? shardGlass : mat); m.userData.noHit = true; m.castShadow = !pane;
				m.position.set(BOX.min.x + Math.random() * SIZE.x, BOX.min.y + Math.random() * SIZE.y, BOX.min.z + Math.random() * SIZE.z);
				m.scale.set(sz * (0.5 + Math.random()), sz * (0.5 + Math.random()), sz * (0.3 + Math.random() * 0.6));
				m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
				const v = m.position.clone().sub(point).normalize().multiplyScalar(0.8 + Math.random() * 2.2).addScaledVector(dir, 1 + Math.random() * 1.5);
				v.y += 1 + Math.random() * 1.8;
				scene.add(m); shards++;
				fx.push({ m, t: 0, life: 5 + Math.random() * 2, kind: "shard", v, w: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(24), floor: groundAt(m.position.x, m.position.z, BOX.min.y), s0: m.scale.clone() });
			}
		});
		if (root.userData.col) root.userData.col.off = true;
		root.removeFromParent();
		renderer.shadowMap.needsUpdate = true;
		crash(glass);
	}
	function stepFx(dt) {
		for (let i = fx.length - 1; i >= 0; i--) {
			const e = fx[i]; e.t += dt; const k = e.t / e.life;
			if (k >= 1) {
				e.m.removeFromParent();
				if (e.kind === "tracer" || e.kind === "dust") e.m.material.dispose();
				if (e.kind === "dust") e.m.geometry.dispose();
				if (e.kind === "shard") shards--;
				fx.splice(i, 1); continue;
			}
			if (e.kind === "tracer") e.m.material.opacity = 0.9 * (1 - k);
			else if (e.kind === "shard") {
				if (e.m.position.y > e.floor || e.v.y > 0) {
					e.v.y -= 9.8 * dt; e.m.position.addScaledVector(e.v, dt);
					e.m.rotation.x += e.w.x * dt; e.m.rotation.y += e.w.y * dt; e.m.rotation.z += e.w.z * dt;
					e.floor = groundAt(e.m.position.x, e.m.position.z, e.m.position.y);   // off the edge of a table, down to the floor
					if (e.m.position.y <= e.floor) {                                  // bounce, lose most of it
						e.m.position.y = e.floor; e.v.y = Math.abs(e.v.y) > 0.8 ? -e.v.y * 0.3 : 0;
						e.v.x *= 0.45; e.v.z *= 0.45; e.w.multiplyScalar(0.4);
					}
				}
				if (k > 0.85) e.m.scale.copy(e.s0).multiplyScalar((1 - k) / 0.15);
			}
			else if (e.kind === "spark") { e.v.y -= 9.8 * dt; e.m.position.addScaledVector(e.v, dt); e.m.scale.setScalar(1 - k); }
			else { e.m.material.opacity = 0.7 * (1 - k); e.m.scale.setScalar(1 + k * 2); }
		}
		recoil = Math.max(0, recoil - dt * 7);
		flashT -= dt; flash.visible = flashT > 0; flashLight.intensity = flashT > 0 ? 4 : 0;
		gun.visible = walking;
		gun.position.set(GUN_AT.x + gunBob * 0.006, GUN_AT.y + Math.abs(gunBob) * 0.005 - (crouching ? 0.01 : 0), GUN_AT.z + recoil * 0.05);
		gun.rotation.set(recoil * 0.3, 0, 0);
	}

	// Sound, made on the spot
	let actx = null;
	function audio() { try { actx ??= new AudioContext(); if (actx.state === "suspended") actx.resume(); return actx; } catch { return null; } }
	function noiseBurst(dur, freq, gain, decay = 3) {
		const a = audio(); if (!a) return;
		const n = Math.floor(dur * a.sampleRate), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
		for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
		const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
		src.buffer = buf; f.type = "lowpass"; f.frequency.value = freq; g.gain.value = gain;
		src.connect(f).connect(g).connect(a.destination); src.start();
	}
	const bang = () => { noiseBurst(0.22, 3200, 0.55, 4); noiseBurst(0.35, 280, 0.8, 2); };
	const thud = (f) => noiseBurst(0.12, f * 4, 0.25, 2);
	const crash = (glass) => {
		noiseBurst(0.45, glass ? 9000 : 3500, 0.5, 5); noiseBurst(0.2, 500, 0.35, 3);
		if (glass) for (let i = 0; i < 6; i++) setTimeout(() => noiseBurst(0.05, 12000, 0.12, 6), 50 + i * 45 + Math.random() * 40);
	};

	// ---------------------------------------------------------------------------
	// Loop
	// ---------------------------------------------------------------------------
	const frameListeners = [];
	addEventListener("resize", () => {
		fitFov(); renderer.setSize(innerWidth, innerHeight);
	});
	let last = performance.now();
	renderer.setAnimationLoop((now) => {
		const dt = Math.max(0, Math.min((now - last) / 1000, 0.05)); last = now;
		update(dt);
		let moving = false;
		for (const d of doors) if (d.cur !== d.target) {
			d.cur = d.target > d.cur ? Math.min(d.target, d.cur + dt * (d.kind === "garage" ? 0.8 : 1.6)) : Math.max(d.target, d.cur - dt * (d.kind === "garage" ? 0.8 : 1.6));
			applyDoor(d); moving = true;
		}
		if (moving) renderer.shadowMap.needsUpdate = true;
		stepFx(dt);
		for (const c of cats) updateCat(c, dt);
		sky.position.copy(camera.position);
		renderer.render(scene, camera);
		frameListeners.forEach((f) => f());
	});

	const rooms = [
		{ lv: -1, name: "Stair", note: "16 risers · 187.5 mm", x0: 0.55, x1: 3.8, z0: 4.75, z1: 7.15 },
		{ lv: 0, name: "Pantry", note: "", x0: 0, x1: 1.1, z0: 0, z1: 1.05 },
		{ lv: 0, name: "Kitchen", note: "4.8 × 4.7 m · island, breakfast bar", x0: 0, x1: 4.75, z0: 0, z1: 4.75 },
		{ lv: 0, name: "Dining", note: "3.0 × 4.7 m", x0: 4.75, x1: 7.75, z0: 0, z1: 4.75 },
		{ lv: 0, name: "Family room", note: "3.8 × 4.7 m · bifolds to the patio", x0: 7.75, x1: 11.6, z0: 0, z1: 4.75 },
		{ lv: 0, name: "Powder room", note: "WC", x0: 5.3, x1: 6.3, z0: 6.3, z1: 8.75 },
		{ lv: 0, name: "Back passage", note: "to stair, laundry, garage", x0: 3.8, x1: 6.3, z0: 4.75, z1: 8.75 },
		{ lv: 0, name: "Laundry", note: "", x0: 1.15, x1: 3.8, z0: 7.15, z1: 8.75 },
		{ lv: 0, name: "Living", note: "6.1 × 5.8 m · see-through gas fire", x0: 8.5, x1: 14.6, z0: 4.75, z1: 10.55 },
		{ lv: 0, name: "Entrance hall", note: "", x0: 6.3, x1: 8.5, z0: 4.75, z1: 13.35 },
		{ lv: 0, name: "Office / study", note: "2.8 × 2.8 m · built-in desk", x0: 8.5, x1: 11.3, z0: 10.55, z1: 13.35 },
		{ lv: 0, name: "Garage", note: "6.0 × 6.3 m · double", x0: 0.3, x1: 6.3, z0: 8.75, z1: 15.05 },
		{ lv: 0, name: "Covered porch", note: "", x0: 6.3, x1: 8.5, z0: 13.35, z1: 15.05 },
		{ lv: 0, name: "Patio", note: "off family and living", x0: 11.6, x1: 18.3, z0: -1.2, z1: 11.0 },
		{ lv: 1, name: "Ensuite", note: "double vanity · shower", x0: 1.95, x1: 4.5, z0: 1.5, z1: 4.75 },
		{ lv: 1, name: "Master bedroom", note: "4.9 × 3.2 m · ensuite, walk-in robe", x0: 4.5, x1: 9.4, z0: 1.5, z1: 4.75 },
		{ lv: 1, name: "Walk-in robe", note: "", x0: 6.8, x1: 9.4, z0: 4.75, z1: 5.95 },
		{ lv: 1, name: "Landing", note: "", x0: 3.8, x1: 6.8, z0: 4.75, z1: 7.15 },
		{ lv: 1, name: "WC", note: "", x0: 1.95, x1: 5.05, z0: 7.15, z1: 8.0 },
		{ lv: 1, name: "Bathroom", note: "bath · separate shower", x0: 1.95, x1: 5.05, z0: 8.0, z1: 10.9 },
		{ lv: 1, name: "Bedroom 4", note: "3.3 × 3.3 m · built-in robe", x0: 6.6, x1: 9.9, z0: 9.35, z1: 12.65 },
		{ lv: 1, name: "Bedroom 2", note: "4.1 × 3.4 m · built-in robe", x0: 6.8, x1: 10.9, z0: 5.35, z1: 9.35 },
		{ lv: 1, name: "Hall", note: "linen cupboard", x0: 5.05, x1: 6.8, z0: 6.65, z1: 9.95 },
		{ lv: 1, name: "Hall", note: "linen cupboard", x0: 5.95, x1: 6.6, z0: 9.95, z1: 10.3 },
		{ lv: 1, name: "Bedroom 3", note: "3.8 × 4.0 m · built-in robe", x0: 1.95, x1: 6.6, z0: 9.95, z1: 13.75 },
	];
	const levelOf = (f) => f > 1.5 ? 1 : 0;

	return {
		camera, pos, rooms, wallRects, furnRects, winLines, doorLines, U,
		get walking() { return walking; },
		get foot() { return foot; },
		get level() { return levelOf(foot); },
		get crouching() { return crouching; },
		heading: () => camera.getWorldDirection(new THREE.Vector3()),
		roomAt: (x, z, f = foot) => f < 1.5 && feet > U - 0.3 && stairY(x, z) === null ? { lv: 0, name: "Roof", note: "single-storey roof", x0: x, x1: x, z0: z, z1: z } : rooms.find((r) => (r.lv === -1 || r.lv === levelOf(f)) && x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1) ?? null,
		doorPrompt: () => { const d = walking && facingDoor(); return d ? (d.target > 0.5 ? "Close" : "Open") : null; },
		lock: () => canvasEl.requestPointerLock(),
		onLockChange: (f) => lockListeners.push(f),
		onFrame: (f) => frameListeners.push(f),
	};
}
