/* Earth — the maps, all made at load.

   Three sources feed the globe and none of them is an image file:

   - `assets/land.json`  · Natural Earth 1:50m coastlines (public domain),
     simplified to a tenth of a degree and stored as flat ring arrays.
   - `assets/cities.json` · every settlement over 200,000 people, as
     [lon, lat, log10(population)].
   - noise, evaluated on the GPU for the cloud deck so a 2048×1024 field
     costs a frame instead of the second and a half the same loop would take
     in JavaScript.

   Everything is equirectangular: x runs -180°..180°, y runs 90°..-90°. */

import * as THREE from "three";

const project = (lon, lat, width, height) => [((lon + 180) / 360) * width, ((90 - lat) / 180) * height];

function makeCanvas(width, height) {
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	return canvas;
}

/* — land ————————————————————————————————————————————————————————
   White land on black water. Rings that straddle the antimeridian are cut
   there, or they smear a continent right across the map. */

export function landCanvas(rings, width = 2048) {
	const height = width / 2;
	const canvas = makeCanvas(width, height);
	const ctx = canvas.getContext("2d", { willReadFrequently: true });
	ctx.fillStyle = "#000";
	ctx.fillRect(0, 0, width, height);
	ctx.fillStyle = "#fff";

	for (const flat of rings) {
		ctx.beginPath();
		let previous = null;
		for (let i = 0; i < flat.length; i += 2) {
			const [x, y] = project(flat[i], flat[i + 1], width, height);
			if (previous && Math.abs(x - previous) > width / 2) {
				ctx.closePath();
				ctx.fill();
				ctx.beginPath();
				ctx.moveTo(x, y);
			} else if (i === 0) {
				ctx.moveTo(x, y);
			} else {
				ctx.lineTo(x, y);
			}
			previous = x;
		}
		ctx.closePath();
		ctx.fill();
	}

	/* Antarctica arrives as a coastline, not a closed cap: fill the bottom
	   band so the pole is ice rather than a hole. */
	ctx.fillRect(0, height - Math.round(height * 0.022), width, Math.round(height * 0.022));
	return canvas;
}

export function landTexture(rings, width = 2048) {
	const texture = new THREE.CanvasTexture(landCanvas(rings, width));
	texture.colorSpace = THREE.NoColorSpace;
	texture.wrapS = THREE.RepeatWrapping;
	texture.anisotropy = 8;
	return texture;
}

/* — night ———————————————————————————————————————————————————————
   City lights. Each settlement is a soft splat scaled by the log of its
   population, with a scatter of smaller lights around it for the towns that
   grew up alongside — a single dot per city reads as a star chart, not as a
   country seen from orbit. */

export function nightTexture(cities, width = 2048, seed = 7) {
	const height = width / 2;
	const canvas = makeCanvas(width, height);
	const ctx = canvas.getContext("2d");
	ctx.fillStyle = "#000";
	ctx.fillRect(0, 0, width, height);
	ctx.globalCompositeOperation = "lighter";

	let state = seed >>> 0;
	const random = () => {
		state = (state * 1664525 + 1013904223) >>> 0;
		return state / 4294967296;
	};

	const splat = (x, y, radius, intensity, warm) => {
		const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
		const r = Math.round(255 * intensity);
		const g = Math.round((236 - warm * 26) * intensity);
		const b = Math.round((186 - warm * 66) * intensity);
		gradient.addColorStop(0, `rgba(${r},${g},${b},1)`);
		gradient.addColorStop(0.35, `rgba(${r},${g},${b},0.42)`);
		gradient.addColorStop(1, "rgba(0,0,0,0)");
		ctx.fillStyle = gradient;
		ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
	};

	/* Scale matters more than brightness here. A splat is in degrees of
	   longitude: at 2048 across, one pixel is about 20 km, so a ten-million
	   city core is a handful of pixels and its halo a couple of dozen. Draw
	   them any larger and North America fuses into one white mass. */
	const scale = width / 2048;
	for (const [lon, lat, magnitude] of cities) {
		const [x, y] = project(lon, lat, width, height);
		const core = Math.max(0.7, (magnitude - 5.0) * 3.0 * scale);
		const warm = random();
		splat(x, y, core * 4.5, 0.10 + (magnitude - 5.3) * 0.12, warm);
		splat(x, y, core * 1.6, 0.34 + (magnitude - 5.3) * 0.2, warm * 0.6);
		splat(x, y, core * 0.55, 0.62, warm * 0.3);

		/* Satellite towns: a real conurbation is a constellation, not a dot. */
		const satellites = Math.round((magnitude - 5.0) * 16);
		for (let i = 0; i < satellites; i++) {
			const spread = core * (2.0 + random() * 9);
			const angle = random() * Math.PI * 2;
			splat(
				x + Math.cos(angle) * spread,
				y + Math.sin(angle) * spread * 0.7,
				Math.max(0.5, core * (0.18 + random() * 0.4)),
				0.14 + random() * 0.26,
				random()
			);
		}
	}

	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.wrapS = THREE.RepeatWrapping;
	texture.anisotropy = 8;
	return texture;
}

/* — GPU bakes ————————————————————————————————————————————————————
   One fullscreen pass into a render target. The noise is evaluated on the
   sphere the pixel maps to, so the field wraps at the antimeridian with no
   seam and does not pinch at the poles. */

const NOISE_GLSL = /* glsl */ `
	/* Simplex noise 3D — Ashima Arts / Stefan Gustavson, MIT. */
	vec3 mod289(vec3 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
	vec4 mod289(vec4 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
	vec4 permute(vec4 x){ return mod289(((x*34.0)+1.0)*x); }
	vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }

	float snoise(vec3 v) {
		const vec2 C = vec2(1.0/6.0, 1.0/3.0);
		const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
		vec3 i  = floor(v + dot(v, C.yyy));
		vec3 x0 = v - i + dot(i, C.xxx);
		vec3 g = step(x0.yzx, x0.xyz);
		vec3 l = 1.0 - g;
		vec3 i1 = min(g.xyz, l.zxy);
		vec3 i2 = max(g.xyz, l.zxy);
		vec3 x1 = x0 - i1 + C.xxx;
		vec3 x2 = x0 - i2 + C.yyy;
		vec3 x3 = x0 - D.yyy;
		i = mod289(i);
		vec4 p = permute(permute(permute(
			i.z + vec4(0.0, i1.z, i2.z, 1.0))
			+ i.y + vec4(0.0, i1.y, i2.y, 1.0))
			+ i.x + vec4(0.0, i1.x, i2.x, 1.0));
		float n_ = 0.142857142857;
		vec3 ns = n_ * D.wyz - D.xzx;
		vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
		vec4 x_ = floor(j * ns.z);
		vec4 y_ = floor(j - 7.0 * x_);
		vec4 x = x_ * ns.x + ns.yyyy;
		vec4 y = y_ * ns.x + ns.yyyy;
		vec4 h = 1.0 - abs(x) - abs(y);
		vec4 b0 = vec4(x.xy, y.xy);
		vec4 b1 = vec4(x.zw, y.zw);
		vec4 s0 = floor(b0) * 2.0 + 1.0;
		vec4 s1 = floor(b1) * 2.0 + 1.0;
		vec4 sh = -step(h, vec4(0.0));
		vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
		vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
		vec3 p0 = vec3(a0.xy, h.x);
		vec3 p1 = vec3(a0.zw, h.y);
		vec3 p2 = vec3(a1.xy, h.z);
		vec3 p3 = vec3(a1.zw, h.w);
		vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
		p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
		vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
		m = m * m;
		return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
	}

	float fbm(vec3 p, int octaves, float lacunarity, float gain) {
		float sum = 0.0;
		float amp = 0.5;
		float norm = 0.0;
		for (int i = 0; i < 8; i++) {
			if (i >= octaves) break;
			sum += amp * snoise(p);
			norm += amp;
			amp *= gain;
			p *= lacunarity;
		}
		return sum / norm;
	}

	vec3 sphere(vec2 uv) {
		float lon = (uv.x * 2.0 - 1.0) * 3.14159265;
		float lat = (uv.y - 0.5) * 3.14159265;
		float c = cos(lat);
		return vec3(c * cos(lon), sin(lat), c * sin(lon));
	}
`;

function bake(renderer, width, height, fragmentShader, uniforms = {}) {
	const target = new THREE.WebGLRenderTarget(width, height, {
		minFilter: THREE.LinearMipmapLinearFilter,
		magFilter: THREE.LinearFilter,
		generateMipmaps: true,
		wrapS: THREE.RepeatWrapping,
		colorSpace: THREE.NoColorSpace,
	});
	const scene = new THREE.Scene();
	const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
	const material = new THREE.ShaderMaterial({
		uniforms,
		vertexShader: `
			varying vec2 vUv;
			void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
		`,
		fragmentShader: NOISE_GLSL + fragmentShader,
	});
	const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
	scene.add(quad);

	const previous = renderer.getRenderTarget();
	renderer.setRenderTarget(target);
	renderer.render(scene, camera);
	renderer.setRenderTarget(previous);

	quad.geometry.dispose();
	material.dispose();
	target.texture.wrapS = THREE.RepeatWrapping;
	target.texture.anisotropy = 8;
	return target;
}

/* Cloud deck: weather does not sit evenly on a planet. There is a wet band at
   the equator, dry belts at the horse latitudes, and storm tracks in the mid
   latitudes — banding the noise that way is most of what makes it read. */
export function cloudTarget(renderer, width = 2048) {
	return bake(
		renderer,
		width,
		width / 2,
		/* glsl */ `
			varying vec2 vUv;
			void main() {
				vec3 p = sphere(vUv);
				float lat = (vUv.y - 0.5) * 180.0;

				float bands =
					0.9 * exp(-pow(lat / 9.5, 2.0)) +              // intertropical convergence
					0.58 * exp(-pow((abs(lat) - 52.0) / 14.0, 2.0)) + // storm tracks
					0.30 * exp(-pow((abs(lat) - 78.0) / 12.0, 2.0));  // polar cloud
				float dry = 0.62 * exp(-pow((abs(lat) - 26.0) / 10.0, 2.0));

				float base = fbm(p * 2.4, 6, 2.1, 0.55) * 0.5 + 0.5;
				float warp = fbm(p * 4.1 + 31.0, 4, 2.0, 0.5);
				float detail = fbm(p * 7.5 + warp * 1.4, 5, 2.2, 0.5) * 0.5 + 0.5;

				float density = base * 0.62 + detail * 0.38;
				density = density * (0.42 + bands) - dry;
				density = smoothstep(0.46, 0.88, density);

				/* Cyclonic swirl in the storm tracks, so the mid latitudes are
				   not just a smear. */
				float swirl = fbm(vec3(p.xz * 3.0, p.y * 6.0), 4, 2.0, 0.5);
				density *= 0.82 + 0.18 * swirl;

				gl_FragColor = vec4(vec3(clamp(density, 0.0, 1.0)), 1.0);
			}
		`
	);
}

/* Surface variation: R is broad biome noise, G is fine relief, B is a coastal
   shelf gradient the ocean uses to shade shallows. */
export function terrainTarget(renderer, landTex, width = 2048) {
	return bake(
		renderer,
		width,
		width / 2,
		/* glsl */ `
			uniform sampler2D uLand;
			uniform vec2 uTexel;
			varying vec2 vUv;
			void main() {
				vec3 p = sphere(vUv);
				float biome = fbm(p * 3.2, 5, 2.1, 0.55) * 0.5 + 0.5;
				float relief = fbm(p * 12.0, 5, 2.3, 0.5) * 0.5 + 0.5;

				/* Distance to land, sampled outward in rings: cheap, and all the
				   ocean needs to know to fade from shelf to abyss. */
				float shelf = 0.0;
				for (int i = 1; i <= 7; i++) {
					float r = float(i) * 2.2;
					shelf = max(shelf, texture2D(uLand, vUv + vec2(uTexel.x * r, 0.0)).r * (1.0 - float(i) / 8.0));
					shelf = max(shelf, texture2D(uLand, vUv - vec2(uTexel.x * r, 0.0)).r * (1.0 - float(i) / 8.0));
					shelf = max(shelf, texture2D(uLand, vUv + vec2(0.0, uTexel.y * r)).r * (1.0 - float(i) / 8.0));
					shelf = max(shelf, texture2D(uLand, vUv - vec2(0.0, uTexel.y * r)).r * (1.0 - float(i) / 8.0));
				}

				gl_FragColor = vec4(biome, relief, shelf, 1.0);
			}
		`,
		{
			uLand: { value: landTex },
			uTexel: { value: new THREE.Vector2(1 / width, 2 / width) },
		}
	);
}
