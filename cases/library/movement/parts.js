/* Movement 01 — geometry and texture factories.

   The brief was industrial but humane, so the vocabulary here is horological
   rather than sci-fi: turned plates, cut wheels with crossings, blued screws
   whose slots sit at whatever angle the last hand left them, jewelled pivots,
   a knurled crown, a coil someone wound. Precision that was made by people.

   Everything is generated: profiles are point arrays, engraving is drawn to a
   canvas at load. No model files, no image files. */

import * as THREE from "three";

const TAU = Math.PI * 2;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (edge0, edge1, x) => {
	const t = clamp01((x - edge0) / (edge1 - edge0));
	return t * t * (3 - 2 * t);
};

/* — wheels ——————————————————————————————————————————————————————
   A cut wheel, not a cog: teeth with rounded tips, a hub, and crossings (the
   spoke cut-outs a wheel gets so it carries less inertia). Extruded with a
   bevel, because the chamfer is what catches the light and says "machined". */

export function wheelGeometry({
	teeth = 48,
	pitch = 1,
	toothDepth = 0.05,
	thickness = 0.045,
	bore = 0.08,
	crossings = 0,
	hub = 0.26,
	rim = 0.12,
} = {}) {
	const root = pitch - toothDepth * 0.55;
	const tip = pitch + toothDepth * 0.45;
	const step = TAU / (teeth * 14);
	const points = [];

	for (let a = 0; a < TAU - 1e-6; a += step) {
		const t = ((a % (TAU / teeth)) / (TAU / teeth) + 1) % 1;
		const rise = smooth(0.16, 0.34, t);
		const fall = 1 - smooth(0.66, 0.84, t);
		const r = root + (tip - root) * Math.min(rise, fall);
		points.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
	}

	const shape = new THREE.Shape(points);

	const bored = new THREE.Path();
	bored.absarc(0, 0, bore, 0, TAU, true);
	shape.holes.push(bored);

	/* Crossings: annular sectors between hub and rim. Sharp corners here are
	   softened by the extrude bevel, the same way a real cut leaves an edge. */
	for (let i = 0; i < crossings; i++) {
		const centre = (i / crossings) * TAU;
		const gap = TAU / crossings / 2 - 0.055;
		const inner = hub;
		const outer = root - rim;
		if (outer <= inner) break;
		const cut = new THREE.Path();
		cut.absarc(0, 0, inner, centre - gap, centre + gap, false);
		cut.absarc(0, 0, outer, centre + gap, centre - gap, true);
		cut.closePath();
		shape.holes.push(cut);
	}

	const geometry = new THREE.ExtrudeGeometry(shape, {
		depth: thickness,
		bevelEnabled: true,
		bevelThickness: thickness * 0.16,
		bevelSize: Math.min(0.006, toothDepth * 0.16),
		bevelSegments: 2,
		steps: 1,
		curveSegments: 4,
	});
	geometry.translate(0, 0, -thickness / 2);
	geometry.computeVertexNormals();
	return geometry;
}

/* — turned parts ————————————————————————————————————————————————
   Lathe profiles are given as [radius, z] pairs read along the axis, which is
   how you would sketch one on paper, then rotated into the assembly's plane. */

export function turned(profile, segments = 96) {
	const points = profile.map(([r, z]) => new THREE.Vector2(Math.max(r, 1e-4), z));
	const geometry = new THREE.LatheGeometry(points, segments);
	geometry.rotateX(Math.PI / 2); // lathe spins around Y; the movement faces Z
	geometry.computeVertexNormals();
	return geometry;
}

/* — knurling ————————————————————————————————————————————————————
   A diamond knurl is two opposing helical waves. It fades out near the ends,
   because a knurling wheel never runs into the chamfer. */

export function knurledRing({
	radius = 0.3,
	height = 0.12,
	teeth = 56,
	depth = 0.012,
	twist = 26,
	radial = 220,
	rows = 64,
} = {}) {
	const geometry = new THREE.CylinderGeometry(radius, radius, height, radial, rows, true);
	const position = geometry.attributes.position;
	const v = new THREE.Vector3();

	for (let i = 0; i < position.count; i++) {
		v.fromBufferAttribute(position, i);
		const angle = Math.atan2(v.z, v.x);
		const along = v.y / height;
		const ends = smooth(0, 0.18, 0.5 - Math.abs(along)) * 1.0;
		const diamond = Math.sin(angle * teeth + along * twist) * Math.sin(angle * teeth - along * twist);
		const r = radius + depth * (diamond * 0.5 + 0.5) * ends;
		const scale = r / Math.hypot(v.x, v.z);
		position.setXYZ(i, v.x * scale, v.y, v.z * scale);
	}

	geometry.rotateX(Math.PI / 2);
	geometry.computeVertexNormals();
	return geometry;
}

/* — coil ————————————————————————————————————————————————————————
   A helix of wire around a bobbin. The winding is deliberately not perfect:
   the pitch wanders a little, the way hand-wound coils do. */

export function coilGeometry({ radius = 0.2, turns = 26, height = 0.3, wire = 0.011 } = {}) {
	const points = [];
	const steps = turns * 36;
	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		const a = t * turns * TAU;
		const wobble = Math.sin(t * 11) * 0.004 + Math.sin(t * 27) * 0.002;
		const r = radius + wobble;
		points.push(new THREE.Vector3(Math.cos(a) * r, (t - 0.5) * height + wobble * 0.5, Math.sin(a) * r));
	}
	const geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), steps, wire, 6, false);
	geometry.rotateX(Math.PI / 2);
	return geometry;
}

/* — engraving ————————————————————————————————————————————————————
   Guilloché: the engine-turned rosette on an instrument dial. Two centuries
   before anyone wrote a fragment shader, this was made by a machine a person
   cranked — which is exactly the register the brief asked for. */

function makeCanvas(size) {
	const canvas = document.createElement("canvas");
	canvas.width = canvas.height = size;
	return canvas;
}

export function dialTexture({ size = 2048, rings = 190, lobes = 34, label = "", serial = "" } = {}) {
	const canvas = makeCanvas(size);
	const ctx = canvas.getContext("2d");
	const c = size / 2;

	ctx.fillStyle = "#8f8f8f"; // mid grey: the map is used for roughness and bump
	ctx.fillRect(0, 0, size, size);

	/* The rosette: a family of epitrochoids drawn as hairlines. */
	ctx.lineWidth = size / 1400;
	for (let i = 0; i < rings; i++) {
		const t = i / rings;
		const base = c * (0.13 + t * 0.66);
		const amp = c * 0.021 * (0.4 + 0.6 * Math.sin(t * Math.PI));
		ctx.strokeStyle = i % 2 ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.42)";
		ctx.beginPath();
		for (let s = 0; s <= 720; s++) {
			const a = (s / 720) * TAU;
			const r = base + Math.sin(a * lobes + t * 5.2) * amp;
			const x = c + Math.cos(a) * r;
			const y = c + Math.sin(a) * r;
			if (s === 0) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		}
		ctx.stroke();
	}

	/* A chapter ring of minute ticks, with the fives cut deeper. */
	const tickOuter = c * 0.955;
	for (let i = 0; i < 120; i++) {
		const a = (i / 120) * TAU - Math.PI / 2;
		const major = i % 10 === 0;
		const minor = i % 5 === 0;
		const len = c * (major ? 0.075 : minor ? 0.05 : 0.028);
		ctx.strokeStyle = "rgba(0,0,0,0.62)";
		ctx.lineWidth = (major ? size / 320 : minor ? size / 560 : size / 900);
		ctx.beginPath();
		ctx.moveTo(c + Math.cos(a) * tickOuter, c + Math.sin(a) * tickOuter);
		ctx.lineTo(c + Math.cos(a) * (tickOuter - len), c + Math.sin(a) * (tickOuter - len));
		ctx.stroke();
	}

	ctx.strokeStyle = "rgba(0,0,0,0.5)";
	ctx.lineWidth = size / 900;
	for (const r of [c * 0.845, c * 0.972]) {
		ctx.beginPath();
		ctx.arc(c, c, r, 0, TAU);
		ctx.stroke();
	}

	/* Engraved lettering: small, centred, the way a maker signs a plate. */
	const engrave = (text, y, px, spacing) => {
		if (!text) return;
		ctx.save();
		ctx.translate(c, c + y);
		ctx.fillStyle = "rgba(0,0,0,0.66)";
		ctx.font = `500 ${px}px ui-monospace, "SFMono-Regular", Menlo, monospace`;
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		let x = -((text.length - 1) * spacing) / 2;
		for (const ch of text) {
			ctx.fillText(ch, x, 0);
			x += spacing;
		}
		ctx.restore();
	};
	engrave(label, -c * 0.42, size / 52, size / 44);
	engrave(serial, c * 0.46, size / 74, size / 62);

	const texture = new THREE.CanvasTexture(canvas);
	texture.anisotropy = 8;
	texture.colorSpace = THREE.NoColorSpace; // read as data, not colour
	return texture;
}

/* Walnut on a turned dish shows its growth rings as concentric ovals, never
   as even circles — the wobble is the whole reason wood reads as wood. Two
   canvases come back: colour for the surface, and a grayscale twin so the
   grain also shows in the roughness. */
export function woodTexture({ size = 1024, rings = 130 } = {}) {
	const colour = makeCanvas(size);
	const grain = makeCanvas(size);
	const cc = colour.getContext("2d");
	const gc = grain.getContext("2d");
	const c = size / 2;

	cc.fillStyle = "#4b2f1d";
	cc.fillRect(0, 0, size, size);
	gc.fillStyle = "#8a8a8a";
	gc.fillRect(0, 0, size, size);

	const wobble = Array.from({ length: 9 }, () => ({
		freq: 1 + Math.floor(Math.random() * 5),
		phase: Math.random() * TAU,
		amp: 0.2 + Math.random() * 0.8,
	}));

	for (let i = 0; i < rings; i++) {
		const t = i / rings;
		const base = c * (0.04 + t * 1.05);
		const dark = i % 3 === 0;
		cc.strokeStyle = dark ? "rgba(30,17,9,0.55)" : "rgba(126,86,54,0.34)";
		gc.strokeStyle = dark ? "rgba(196,196,196,0.5)" : "rgba(70,70,70,0.35)";
		cc.lineWidth = gc.lineWidth = (size / 620) * (dark ? 1.5 : 0.9);
		cc.beginPath();
		gc.beginPath();
		for (let sIdx = 0; sIdx <= 360; sIdx++) {
			const a = (sIdx / 360) * TAU;
			let r = base;
			for (const w of wobble) r += Math.sin(a * w.freq + w.phase + t * 3.1) * w.amp * size * 0.004;
			const x = c + Math.cos(a) * r * 1.05;
			const y = c + Math.sin(a) * r * 0.93; // rings run oval, not round
			if (sIdx === 0) {
				cc.moveTo(x, y);
				gc.moveTo(x, y);
			} else {
				cc.lineTo(x, y);
				gc.lineTo(x, y);
			}
		}
		cc.stroke();
		gc.stroke();
	}

	const map = new THREE.CanvasTexture(colour);
	map.colorSpace = THREE.SRGBColorSpace;
	map.anisotropy = 8;
	const rough = new THREE.CanvasTexture(grain);
	rough.colorSpace = THREE.NoColorSpace;
	rough.anisotropy = 8;
	return { map, rough };
}

/* Perlage: the overlapping circular graining ground into a movement's plates
   and bridges, one spot at a time, each overlapping the last. It is the most
   quietly human finish in the whole craft — a machine could do it evenly, and
   nobody wants it even. */
export function perlageTexture({ size = 1024, spacing = 34, radius = 26 } = {}) {
	const canvas = makeCanvas(size);
	const ctx = canvas.getContext("2d");
	ctx.fillStyle = "#8d8d8d";
	ctx.fillRect(0, 0, size, size);

	for (let y = -radius; y < size + radius; y += spacing) {
		for (let x = -radius; x < size + radius; x += spacing) {
			const jx = x + (Math.random() - 0.5) * spacing * 0.22;
			const jy = y + (Math.random() - 0.5) * spacing * 0.22;
			const r = radius * (0.9 + Math.random() * 0.2);
			const g = ctx.createRadialGradient(jx - r * 0.3, jy - r * 0.3, r * 0.05, jx, jy, r);
			g.addColorStop(0, "rgba(255,255,255,0.42)");
			g.addColorStop(0.75, "rgba(150,150,150,0.22)");
			g.addColorStop(1, "rgba(60,60,60,0.30)");
			ctx.fillStyle = g;
			ctx.beginPath();
			ctx.arc(jx, jy, r, 0, TAU);
			ctx.fill();
		}
	}

	const texture = new THREE.CanvasTexture(canvas);
	texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
	texture.anisotropy = 8;
	texture.colorSpace = THREE.NoColorSpace;
	return texture;
}

/* Concentric turning marks: the finish left on a plate by a facing cut. Used
   as a roughness map so highlights sweep around the part instead of sitting
   on it like plastic. */
export function turningTexture({ size = 1024, lines = 260 } = {}) {
	const canvas = makeCanvas(size);
	const ctx = canvas.getContext("2d");
	const c = size / 2;

	ctx.fillStyle = "#9a9a9a";
	ctx.fillRect(0, 0, size, size);

	for (let i = 0; i < lines; i++) {
		const r = (i / lines) * c * 1.42;
		const shade = 120 + Math.floor(Math.random() * 70);
		ctx.strokeStyle = `rgba(${shade},${shade},${shade},0.5)`;
		ctx.lineWidth = (size / 900) * (0.6 + Math.random());
		ctx.beginPath();
		ctx.arc(c, c, r, 0, TAU);
		ctx.stroke();
	}

	/* A few soft smudges: no plate leaves the bench perfectly even. */
	for (let i = 0; i < 40; i++) {
		const x = Math.random() * size;
		const y = Math.random() * size;
		const r = size * (0.02 + Math.random() * 0.09);
		const g = ctx.createRadialGradient(x, y, 0, x, y, r);
		g.addColorStop(0, "rgba(190,190,190,0.28)");
		g.addColorStop(1, "rgba(190,190,190,0)");
		ctx.fillStyle = g;
		ctx.fillRect(x - r, y - r, r * 2, r * 2);
	}

	const texture = new THREE.CanvasTexture(canvas);
	texture.anisotropy = 8;
	texture.colorSpace = THREE.NoColorSpace;
	return texture;
}
