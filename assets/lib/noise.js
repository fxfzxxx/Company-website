/* Seeded 3D value-gradient noise (Perlin, improved) plus the two summed forms
   the specimen uses: plain fBm for the soft body warp, and ridged fBm for the
   chiselled sediment plates on the core.

   Kept dependency-free and deterministic: the same seed gives the same rock on
   every load, so the object can be art-directed by changing seeds alone. */

export function mulberry32(seed) {
	let a = seed >>> 0;
	return function () {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (t, a, b) => a + t * (b - a);

function grad(hash, x, y, z) {
	const h = hash & 15;
	const u = h < 8 ? x : y;
	const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
	return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

/* Returns noise(x, y, z) in roughly [-1, 1]. */
export function makeNoise3D(seed = 1) {
	const rand = mulberry32(seed);
	const perm = new Uint8Array(256);
	for (let i = 0; i < 256; i++) perm[i] = i;
	for (let i = 255; i > 0; i--) {
		const j = (rand() * (i + 1)) | 0;
		const t = perm[i];
		perm[i] = perm[j];
		perm[j] = t;
	}
	const p = new Uint8Array(512);
	for (let i = 0; i < 512; i++) p[i] = perm[i & 255];

	return function noise(x, y, z) {
		const X = Math.floor(x) & 255;
		const Y = Math.floor(y) & 255;
		const Z = Math.floor(z) & 255;
		x -= Math.floor(x);
		y -= Math.floor(y);
		z -= Math.floor(z);
		const u = fade(x);
		const v = fade(y);
		const w = fade(z);
		const A = p[X] + Y;
		const AA = p[A] + Z;
		const AB = p[A + 1] + Z;
		const B = p[X + 1] + Y;
		const BA = p[B] + Z;
		const BB = p[B + 1] + Z;

		return lerp(
			w,
			lerp(
				v,
				lerp(u, grad(p[AA], x, y, z), grad(p[BA], x - 1, y, z)),
				lerp(u, grad(p[AB], x, y - 1, z), grad(p[BB], x - 1, y - 1, z))
			),
			lerp(
				v,
				lerp(u, grad(p[AA + 1], x, y, z - 1), grad(p[BA + 1], x - 1, y, z - 1)),
				lerp(u, grad(p[AB + 1], x, y - 1, z - 1), grad(p[BB + 1], x - 1, y - 1, z - 1))
			)
		);
	};
}

export function fbm(noise, x, y, z, octaves = 4, lacunarity = 2.03, gain = 0.5) {
	let sum = 0;
	let amp = 1;
	let norm = 0;
	let f = 1;
	for (let i = 0; i < octaves; i++) {
		sum += amp * noise(x * f, y * f, z * f);
		norm += amp;
		amp *= gain;
		f *= lacunarity;
	}
	return sum / norm;
}

/* Ridged fBm: folds the noise around zero so the crests stay sharp. Reads as
   fractured stone rather than the soft dunes plain fBm gives. */
export function ridged(noise, x, y, z, octaves = 5, lacunarity = 2.11, gain = 0.5) {
	let sum = 0;
	let amp = 1;
	let norm = 0;
	let f = 1;
	for (let i = 0; i < octaves; i++) {
		const n = 1 - Math.abs(noise(x * f, y * f, z * f));
		sum += amp * n * n;
		norm += amp;
		amp *= gain;
		f *= lacunarity;
	}
	return (sum / norm) * 2 - 1;
}
