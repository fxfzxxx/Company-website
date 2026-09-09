/* Earth — a lit globe with weather, night cities and traffic.

   The rules the other studies in this library follow hold here too: no image
   files, no CDN. What it does ship is vector data — coastlines and a city
   list — because a planet has to be recognisable, and no amount of noise will
   draw you Europe. Everything those two files touch (surface colour, cloud
   deck, city lights, ocean shelf) is made at load.

   The lighting is a single directional sun in world space and the globe turns
   under it, so the terminator sweeps rather than sitting still: the day side
   scatters, the night side lights up, and the band between them goes warm.

   Public API: createEarth(container, overrides) -> Promise<{ dispose, ... }>. */

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { landTexture, nightTexture, cloudTarget, terrainTarget } from "./textures.js";

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

export const DEFAULTS = {
	/* null renders on a transparent canvas, for pages that already have a
	   background of their own. */
	background: 0x04060c,
	stars: true,
	arcs: 34,
	post: true,
	radius: 1,
	tilt: 23.4,
	spin: 0.021, // radians a second — a day in five minutes
	cloudSpin: 0.006,
	sun: [0.97, 0.2, 0.1],
	camera: { fov: 26, distance: 6.1 },
	exposure: 1.0,
	segments: 128,
	mapSize: 2048,
	landSize: 4096, // coastlines carry the recognition, so they get the detail
	bloom: { strength: 0.42, radius: 0.7, threshold: 0.78 },
	grain: 0.035,
	vignette: 0.7,
	motion: { drag: 0.0038, damping: 0.93 },
	maxPixelRatio: 1.75,
};

/* — surface ————————————————————————————————————————————————————— */

const GLOBE_VERTEX = /* glsl */ `
	varying vec2 vUv;
	varying vec3 vNormalW;
	varying vec3 vViewW;
	varying vec3 vWorld;

	void main() {
		vUv = uv;
		vNormalW = normalize(mat3(modelMatrix) * normal);
		vec4 world = modelMatrix * vec4(position, 1.0);
		vWorld = world.xyz;
		vViewW = normalize(cameraPosition - world.xyz);
		gl_Position = projectionMatrix * viewMatrix * world;
	}
`;

const GLOBE_FRAGMENT = /* glsl */ `
	uniform sampler2D uLand;
	uniform sampler2D uNight;
	uniform sampler2D uCloud;
	uniform sampler2D uTerrain;
	uniform vec3 uSun;
	uniform float uCloudRotation;
	uniform float uNightGain;

	varying vec2 vUv;
	varying vec3 vNormalW;
	varying vec3 vViewW;

	const vec3 SUN_COLOUR = vec3(1.0, 0.96, 0.90);

	void main() {
		vec3 N = normalize(vNormalW);
		vec3 V = normalize(vViewW);
		float ndl = dot(N, uSun);
		float day = smoothstep(-0.12, 0.22, ndl);

		float land = texture2D(uLand, vUv).r;
		vec4 terrain = texture2D(uTerrain, vUv);
		float biome = terrain.r;
		float relief = terrain.g;
		float shelf = terrain.b;
		float lat = abs(vUv.y - 0.5) * 180.0;

		/* Water: the shelf channel is distance-to-land, so coasts go turquoise
		   and the abyssal plains stay almost black-blue. */
		vec3 ocean = mix(vec3(0.008, 0.031, 0.086), vec3(0.031, 0.163, 0.267), pow(shelf, 1.6));

		/* Land: latitude sets the belt, noise decides where inside it. */
		vec3 forest = vec3(0.086, 0.169, 0.078);
		vec3 grass = vec3(0.204, 0.239, 0.114);
		vec3 desert = vec3(0.451, 0.353, 0.196);
		vec3 tundra = vec3(0.263, 0.271, 0.239);
		vec3 ice = vec3(0.855, 0.898, 0.937);

		float arid = exp(-pow((lat - 24.0) / 12.0, 2.0));
		vec3 ground = mix(forest, grass, smoothstep(0.34, 0.72, biome));
		ground = mix(ground, desert, clamp(arid * smoothstep(0.30, 0.78, biome) * 1.35, 0.0, 1.0));
		ground = mix(ground, tundra, smoothstep(46.0, 62.0, lat));
		ground = mix(ground, ice, smoothstep(64.0, 73.0, lat) * (0.55 + 0.45 * biome));
		ground *= 0.82 + 0.36 * relief;

		vec3 albedo = mix(ocean, ground, land);

		/* Cloud deck, read twice: once where we stand, once offset along the
		   sun so the deck throws a shadow on the ground beneath it. */
		vec2 cloudUv = vec2(fract(vUv.x - uCloudRotation), vUv.y);
		vec3 up = N;
		vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), up) + vec3(1e-5));
		vec3 north = cross(up, east);
		float cosLat = max(cos((vUv.y - 0.5) * 3.14159265), 0.25);
		vec2 sunUv = vec2(dot(uSun, east) / cosLat, dot(uSun, north)) * 0.006;
		float cloudHere = texture2D(uCloud, cloudUv).r;
		float cloudShadow = texture2D(uCloud, cloudUv + sunUv).r;

		/* Light. The wrap term stands in for air scattering past the geometric
		   terminator — without it the night edge is a razor. */
		float wrapped = clamp((ndl + 0.18) / 1.18, 0.0, 1.0);
		vec3 lit = albedo * SUN_COLOUR * wrapped * 1.45;
		lit += albedo * vec3(0.035, 0.05, 0.09) * (0.4 + 0.6 * shelf); // sky fill
		lit += albedo * vec3(0.016, 0.020, 0.032) * (1.0 - day); // earthshine
		lit *= 1.0 - 0.45 * cloudShadow * day;

		/* Sun glint, oceans only. */
		vec3 H = normalize(uSun + V);
		float glint = pow(max(dot(N, H), 0.0), 900.0) * (1.0 - land) * day;
		lit += vec3(1.0, 0.93, 0.82) * glint * 1.5 * (1.0 - cloudHere * 0.85);

		/* Cities, only where the sun is not, and only where the deck is thin. */
		vec3 lights = texture2D(uNight, vUv).rgb;
		float night = 1.0 - day;
		lit += lights * night * uNightGain * (1.0 - cloudHere * 0.82);

		/* Limb: air seen edge-on is thicker, and at the terminator it is red. */
		float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);
		lit += vec3(0.13, 0.31, 0.66) * fresnel * (0.16 + 0.5 * day);
		float terminator = exp(-pow(ndl / 0.075, 2.0));
		lit += vec3(1.0, 0.46, 0.2) * terminator * fresnel * 0.4;

		gl_FragColor = vec4(lit, 1.0);
	}
`;

const CLOUD_FRAGMENT = /* glsl */ `
	uniform sampler2D uCloud;
	uniform vec3 uSun;

	varying vec2 vUv;
	varying vec3 vNormalW;
	varying vec3 vViewW;

	void main() {
		vec3 N = normalize(vNormalW);
		vec3 V = normalize(vViewW);
		float ndl = dot(N, uSun);
		float day = smoothstep(-0.14, 0.26, ndl);

		float density = texture2D(uCloud, vUv).r;
		if (density < 0.004) discard;

		vec3 sunlit = vec3(1.0, 0.98, 0.95) * (0.35 + 1.05 * clamp(ndl, 0.0, 1.0));
		vec3 shaded = vec3(0.05, 0.07, 0.12);
		vec3 colour = mix(shaded, sunlit, day);

		/* Silver lining: cloud tops at the terminator catch the sun first. */
		float terminator = exp(-pow(ndl / 0.14, 2.0));
		colour += vec3(1.0, 0.55, 0.28) * terminator * 0.7;

		float rim = pow(1.0 - max(dot(N, V), 0.0), 2.0);
		float alpha = density * (0.74 + 0.16 * rim);
		gl_FragColor = vec4(colour, alpha * (0.25 + 0.75 * day) + density * 0.06);
	}
`;

const ATMOSPHERE_FRAGMENT = /* glsl */ `
	uniform vec3 uSun;
	uniform float uPlanet;
	uniform float uShell;

	varying vec3 vNormalW;
	varying vec3 vViewW;
	varying vec3 vWorld;

	void main() {
		vec3 N = normalize(vNormalW);
		vec3 V = normalize(vViewW);

		/* How close this pixel's line of sight passes to the planet: the
		   perpendicular distance from the centre to the view ray. Fading on
		   that instead of on the shell's own silhouette is the difference
		   between a halo and a visible bubble around the globe. */
		float impact = length(cross(vWorld, -V));
		float height = clamp((impact - uPlanet) / (uShell - uPlanet), 0.0, 1.0);
		float density = exp(-height * 4.6) * smoothstep(1.0, 0.0, height);

		/* Air is thicker along a grazing ray even inside the disc, so the
		   limb keeps a rim where the atmosphere crosses the planet. */
		float limb = smoothstep(uPlanet * 1.002, uPlanet * 0.86, impact);
		density = max(density, limb * 0.45 * exp(-(uPlanet - impact) * 5.0));

		float ndl = dot(N, uSun);
		float sunAmount = smoothstep(-0.5, 0.55, ndl);

		/* Forward scattering: cool where the sun is high behind the limb,
		   red where the ray grazes the terminator. */
		vec3 cool = vec3(0.26, 0.5, 1.0);
		vec3 warm = vec3(1.0, 0.44, 0.2);
		float dusk = exp(-pow((ndl - 0.02) / 0.22, 2.0));
		vec3 colour = mix(cool, warm, dusk * 0.8);

		float strength = density * (0.03 + 1.0 * sunAmount);
		gl_FragColor = vec4(colour * strength, strength);
	}
`;

const ARC_VERTEX = /* glsl */ `
	attribute float aT;
	varying float vT;
	void main() {
		vT = aT;
		gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	}
`;

const ARC_FRAGMENT = /* glsl */ `
	uniform float uTime;
	uniform float uOffset;
	uniform float uSpeed;
	uniform vec3 uColour;
	varying float vT;

	void main() {
		/* A pulse runs the arc and drags a tail behind it; the rest of the
		   line stays as a faint filament so the route is still readable. */
		float head = fract(uTime * uSpeed + uOffset);
		float behind = head - vT;
		float tail = exp(-max(behind, 0.0) * 26.0) * step(0.0, behind);
		float ends = smoothstep(0.0, 0.06, vT) * smoothstep(1.0, 0.94, vT);
		float alpha = (0.06 + 0.94 * tail) * ends;
		gl_FragColor = vec4(uColour * (0.7 + 2.0 * tail), alpha);
	}
`;

const GRADE = {
	uniforms: {
		tDiffuse: { value: null },
		uTime: { value: 0 },
		uGrain: { value: 0.035 },
		uVignette: { value: 0.7 },
	},
	vertexShader: /* glsl */ `
		varying vec2 vUv;
		void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
	`,
	fragmentShader: /* glsl */ `
		uniform sampler2D tDiffuse;
		uniform float uTime;
		uniform float uGrain;
		uniform float uVignette;
		varying vec2 vUv;

		float hash(vec2 p) {
			p = fract(p * vec2(443.8975, 397.2973));
			p += dot(p, p.yx + 19.19);
			return fract((p.x + p.y) * p.x);
		}

		void main() {
			vec3 colour = texture2D(tDiffuse, vUv).rgb;
			vec2 centred = vUv - 0.5;
			colour *= 1.0 - uVignette * smoothstep(0.06, 0.55, dot(centred, centred));
			float g = hash(gl_FragCoord.xy + fract(uTime) * 137.0);
			colour += (g - 0.5) * uGrain;
			gl_FragColor = vec4(max(colour, 0.0), 1.0);
		}
	`,
};

/* — helpers ————————————————————————————————————————————————————— */

const toVector = (lon, lat, radius) => {
	const phi = (90 - lat) * DEG;
	const theta = (lon + 180) * DEG;
	return new THREE.Vector3(
		-radius * Math.sin(phi) * Math.cos(theta),
		radius * Math.cos(phi),
		radius * Math.sin(phi) * Math.sin(theta)
	);
};

function merge(base, patch) {
	const out = { ...base };
	for (const key of Object.keys(patch || {})) {
		const value = patch[key];
		out[key] = value && typeof value === "object" && !Array.isArray(value) ? merge(base[key] || {}, value) : value;
	}
	return out;
}

/* — assembly ———————————————————————————————————————————————————— */

export async function createEarth(container, overrides = {}) {
	const config = merge(DEFAULTS, overrides);
	const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	const compact = window.matchMedia("(max-width: 820px), (pointer: coarse)").matches;
	if (compact) {
		config.mapSize = Math.min(config.mapSize, 1024);
		config.landSize = Math.min(config.landSize, 2048);
		config.segments = Math.min(config.segments, 96);
		config.maxPixelRatio = Math.min(config.maxPixelRatio, 1.5);
		config.arcs = Math.min(config.arcs, 10);
	}

	const [rings, cities] = await Promise.all([
		fetch(new URL("./assets/land.json", import.meta.url)).then((r) => r.json()),
		fetch(new URL("./assets/cities.json", import.meta.url)).then((r) => r.json()),
	]);

	const transparent = config.background === null;
	const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: transparent, powerPreference: "high-performance" });
	renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, config.maxPixelRatio));
	renderer.toneMapping = THREE.NeutralToneMapping;
	renderer.toneMappingExposure = config.exposure;
	if (transparent) renderer.setClearAlpha(0);
	else renderer.setClearColor(config.background, 1);
	renderer.domElement.style.display = "block";
	renderer.domElement.style.width = "100%";
	renderer.domElement.style.height = "100%";
	renderer.domElement.style.touchAction = "pan-y";
	container.appendChild(renderer.domElement);

	const scene = new THREE.Scene();
	if (!transparent) scene.background = new THREE.Color(config.background);

	const camera = new THREE.PerspectiveCamera(config.camera.fov, 1, 0.1, 100);
	camera.position.set(0, 0, config.camera.distance);

	/* — maps ————————————————————————————————————————————————— */
	const land = landTexture(rings, config.landSize);
	const night = nightTexture(cities, config.mapSize);
	const clouds = cloudTarget(renderer, config.mapSize);
	const terrain = terrainTarget(renderer, land, config.mapSize);

	const sun = new THREE.Vector3(...config.sun).normalize();

	/* — globe ———————————————————————————————————————————————— */
	const tilted = new THREE.Group();
	tilted.rotation.z = config.tilt * DEG;
	scene.add(tilted);

	const globeUniforms = {
		uLand: { value: land },
		uNight: { value: night },
		uCloud: { value: clouds.texture },
		uTerrain: { value: terrain.texture },
		uSun: { value: sun },
		uCloudRotation: { value: 0 },
		uNightGain: { value: transparent ? 1.15 : 1.45 },
	};
	const globe = new THREE.Mesh(
		new THREE.SphereGeometry(config.radius, config.segments, config.segments / 2),
		new THREE.ShaderMaterial({
			uniforms: globeUniforms,
			vertexShader: GLOBE_VERTEX,
			fragmentShader: GLOBE_FRAGMENT,
		})
	);
	tilted.add(globe);

	const cloudUniforms = { uCloud: { value: clouds.texture }, uSun: { value: sun } };
	const cloudShell = new THREE.Mesh(
		new THREE.SphereGeometry(config.radius * 1.012, config.segments, config.segments / 2),
		new THREE.ShaderMaterial({
			uniforms: cloudUniforms,
			vertexShader: GLOBE_VERTEX,
			fragmentShader: CLOUD_FRAGMENT,
			transparent: true,
			depthWrite: false,
		})
	);
	tilted.add(cloudShell);

	const atmosphere = new THREE.Mesh(
		new THREE.SphereGeometry(config.radius * 1.28, 96, 48),
		new THREE.ShaderMaterial({
			uniforms: {
				uSun: { value: sun },
				uPlanet: { value: config.radius },
				uShell: { value: config.radius * 1.28 },
			},
			vertexShader: GLOBE_VERTEX,
			fragmentShader: ATMOSPHERE_FRAGMENT,
			transparent: true,
			blending: THREE.AdditiveBlending,
			side: THREE.BackSide,
			depthWrite: false,
		})
	);
	scene.add(atmosphere);

	/* — routes: great circles between the largest cities, lifted off the
	     surface and given a pulse that runs the line ————————————————— */
	const arcGroup = new THREE.Group();
	tilted.add(arcGroup);
	const arcMaterials = [];
	if (config.arcs > 0) {
		const hubs = cities.slice(0, 90);
		let seed = 20260909;
		const random = () => {
			seed = (seed * 1664525 + 1013904223) >>> 0;
			return seed / 4294967296;
		};
		for (let i = 0; i < config.arcs; i++) {
			const a = hubs[Math.floor(random() * hubs.length)];
			const b = hubs[Math.floor(random() * hubs.length)];
			const from = toVector(a[0], a[1], config.radius);
			const to = toVector(b[0], b[1], config.radius);
			const separation = from.angleTo(to);
			if (separation < 0.35) continue;

			const lift = 1 + separation * 0.045;
			const points = [];
			const steps = 96;
			for (let s = 0; s <= steps; s++) {
				const t = s / steps;
				const point = from.clone().lerp(to, t).normalize();
				const arch = Math.sin(t * Math.PI);
				points.push(point.multiplyScalar(config.radius * (1 + (lift - 1) * arch) + 0.004));
			}
			const geometry = new THREE.BufferGeometry().setFromPoints(points);
			geometry.setAttribute(
				"aT",
				new THREE.BufferAttribute(new Float32Array(points.map((_, s) => s / steps)), 1)
			);
			const material = new THREE.ShaderMaterial({
				uniforms: {
					uTime: { value: 0 },
					uOffset: { value: random() },
					uSpeed: { value: 0.055 + random() * 0.06 },
					uColour: { value: new THREE.Color(random() > 0.7 ? 0xffb066 : 0x7fd0ff) },
				},
				vertexShader: ARC_VERTEX,
				fragmentShader: ARC_FRAGMENT,
				transparent: true,
				blending: THREE.AdditiveBlending,
				depthWrite: false,
			});
			arcMaterials.push(material);
			arcGroup.add(new THREE.Line(geometry, material));

			for (const end of [from, to]) {
				const beacon = new THREE.Mesh(
					new THREE.SphereGeometry(0.006, 10, 8),
					new THREE.MeshBasicMaterial({ color: material.uniforms.uColour.value })
				);
				beacon.position.copy(end).multiplyScalar(1.002);
				arcGroup.add(beacon);
			}
		}
	}

	/* — stars ———————————————————————————————————————————————— */
	let stars = null;
	if (config.stars) {
		const count = 3600;
		const positions = new Float32Array(count * 3);
		const colours = new Float32Array(count * 3);
		const sizes = new Float32Array(count);
		const tint = new THREE.Color();
		for (let i = 0; i < count; i++) {
			const direction = new THREE.Vector3(
				Math.random() * 2 - 1,
				Math.random() * 2 - 1,
				Math.random() * 2 - 1
			).normalize().multiplyScalar(24 + Math.random() * 14);
			positions.set([direction.x, direction.y, direction.z], i * 3);
			tint.setHSL(0.55 + Math.random() * 0.12, 0.35 * Math.random(), 0.65 + Math.random() * 0.35);
			colours.set([tint.r, tint.g, tint.b], i * 3);
			sizes[i] = 0.03 + Math.pow(Math.random(), 3) * 0.2;
		}
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
		geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
		geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
		stars = new THREE.Points(
			geometry,
			new THREE.ShaderMaterial({
				uniforms: { uTime: { value: 0 } },
				vertexShader: /* glsl */ `
					attribute float size;
					varying vec3 vColour;
					varying float vTwinkle;
					uniform float uTime;
					void main() {
						vColour = color;
						vTwinkle = 0.75 + 0.25 * sin(uTime * 1.7 + position.x * 3.1 + position.y);
						vec4 mv = modelViewMatrix * vec4(position, 1.0);
						gl_PointSize = size * 320.0 / -mv.z;
						gl_Position = projectionMatrix * mv;
					}
				`,
				fragmentShader: /* glsl */ `
					varying vec3 vColour;
					varying float vTwinkle;
					void main() {
						float d = length(gl_PointCoord - 0.5);
						float alpha = smoothstep(0.5, 0.06, d);
						gl_FragColor = vec4(vColour * vTwinkle, alpha * vTwinkle);
					}
				`,
				transparent: true,
				depthWrite: false,
				blending: THREE.AdditiveBlending,
				vertexColors: true,
			})
		);
		scene.add(stars);
	}

	/* — post ————————————————————————————————————————————————— */
	let composer = null;
	let bloom = null;
	let grade = null;
	if (config.post && !transparent) {
		composer = new EffectComposer(renderer);
		composer.addPass(new RenderPass(scene, camera));
		bloom = new UnrealBloomPass(
			new THREE.Vector2(1, 1),
			config.bloom.strength,
			config.bloom.radius,
			config.bloom.threshold
		);
		composer.addPass(bloom);
		composer.addPass(new OutputPass());
		grade = new ShaderPass(GRADE);
		grade.uniforms.uGrain.value = config.grain;
		grade.uniforms.uVignette.value = config.vignette;
		composer.addPass(grade);
	}

	/* — pointer ——————————————————————————————————————————————— */
	const pointer = { active: false, id: null, x: 0, y: 0 };
	const spin = { yaw: 0, pitch: 0, yawVelocity: 0, pitchVelocity: 0 };

	const onPointerDown = (event) => {
		pointer.active = true;
		pointer.id = event.pointerId;
		pointer.x = event.clientX;
		pointer.y = event.clientY;
		renderer.domElement.setPointerCapture(event.pointerId);
		container.classList.add("is-dragging");
	};
	const onPointerMove = (event) => {
		if (!pointer.active || event.pointerId !== pointer.id) return;
		spin.yawVelocity += (event.clientX - pointer.x) * config.motion.drag;
		spin.pitchVelocity += (event.clientY - pointer.y) * config.motion.drag;
		pointer.x = event.clientX;
		pointer.y = event.clientY;
	};
	const onPointerUp = (event) => {
		if (event.pointerId !== pointer.id) return;
		pointer.active = false;
		pointer.id = null;
		renderer.domElement.releasePointerCapture(event.pointerId);
		container.classList.remove("is-dragging");
	};
	renderer.domElement.addEventListener("pointerdown", onPointerDown);
	renderer.domElement.addEventListener("pointermove", onPointerMove);
	renderer.domElement.addEventListener("pointerup", onPointerUp);
	renderer.domElement.addEventListener("pointercancel", onPointerUp);

	/* — sizing ————————————————————————————————————————————————— */
	const resize = () => {
		const width = Math.max(1, container.clientWidth);
		const height = Math.max(1, container.clientHeight);
		camera.aspect = width / height;
		camera.position.z = config.camera.distance * THREE.MathUtils.clamp(1 / camera.aspect, 1, 1.55);
		camera.updateProjectionMatrix();
		renderer.setSize(width, height, false);
		if (composer) {
			composer.setSize(width, height);
			bloom.setSize(width, height);
		}
	};
	const observer = new ResizeObserver(resize);
	observer.observe(container);
	resize();

	/* — loop ——————————————————————————————————————————————————— */
	const timer = new THREE.Timer();
	timer.connect(document);
	let frame = 0;
	let running = true;

	const tick = () => {
		frame = requestAnimationFrame(tick);
		timer.update();
		const time = timer.getElapsed();

		if (!reduceMotion) {
			spin.yaw += spin.yawVelocity;
			spin.pitch += spin.pitchVelocity;
			spin.yawVelocity *= config.motion.damping;
			spin.pitchVelocity *= config.motion.damping;
			spin.pitch = THREE.MathUtils.clamp(spin.pitch, -0.6, 0.6);

			const rotation = time * config.spin + spin.yaw;
			globe.rotation.y = rotation;
			arcGroup.rotation.y = rotation;
			cloudShell.rotation.y = rotation + time * config.cloudSpin;
			globeUniforms.uCloudRotation.value = ((time * config.cloudSpin) / TAU) % 1;
			tilted.rotation.x = spin.pitch;

			for (const material of arcMaterials) material.uniforms.uTime.value = time;
			if (stars) {
				stars.material.uniforms.uTime.value = time;
				stars.rotation.y = time * 0.004;
			}
			if (grade) grade.uniforms.uTime.value = time;
		}

		if (composer) composer.render();
		else renderer.render(scene, camera);
	};
	tick();

	const onVisibility = () => {
		if (document.hidden && running) {
			cancelAnimationFrame(frame);
			running = false;
		} else if (!document.hidden && !running) {
			running = true;
			tick();
		}
	};
	document.addEventListener("visibilitychange", onVisibility);

	return {
		config,
		renderer,
		scene,
		camera,
		globe,
		uniforms: globeUniforms,
		post: { bloom, grade },
		setSun(x, y, z) {
			sun.set(x, y, z).normalize();
		},
		dispose() {
			cancelAnimationFrame(frame);
			timer.dispose();
			observer.disconnect();
			document.removeEventListener("visibilitychange", onVisibility);
			renderer.domElement.removeEventListener("pointerdown", onPointerDown);
			renderer.domElement.removeEventListener("pointermove", onPointerMove);
			renderer.domElement.removeEventListener("pointerup", onPointerUp);
			renderer.domElement.removeEventListener("pointercancel", onPointerUp);
			scene.traverse((object) => {
				if (object.geometry) object.geometry.dispose();
				if (object.material) {
					const list = Array.isArray(object.material) ? object.material : [object.material];
					list.forEach((m) => m.dispose());
				}
			});
			land.dispose();
			night.dispose();
			clouds.dispose();
			terrain.dispose();
			if (composer) composer.dispose();
			renderer.dispose();
			renderer.domElement.remove();
		},
	};
}
