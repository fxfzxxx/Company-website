/* Specimen 03 — a dispersive glass body around a sedimentary core, ringed by
   iridescent filaments. Everything here is generated at runtime: no model
   files, no textures, no CDN. three.js is vendored under /assets/vendor.

   How the look is built, in the order it matters:

   1. A procedural studio environment (bright strips on a near-black room) is
      pre-filtered with PMREM. Glass has nothing to refract without it, and the
      thin strips are what split into spectra across the body.
   2. The core is opaque, so three renders it into the transmission backdrop —
      the shell then refracts it per-wavelength (`dispersion`) and that is the
      rainbow fringing, not a post effect.
   3. The wings are not separate objects: the shell is thrown outward in a few
      directions, so one continuous refracting surface carries the spectrum
      all the way out to the silhouette.
   4. Post: a little bloom on the spectral highlights, then vignette, lens
      chroma and film grain to seat it in the page's dark ground.

   Public API: createSpecimen(container, overrides) -> { dispose, config }. */

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { makeNoise3D, mulberry32, fbm, ridged } from "./noise.js";

/* — art direction ——————————————————————————————————————————————
   Everything an art director would want to reach for. Seeds are stable: the
   same numbers rebuild the same specimen. */

export const DEFAULTS = {
	seed: 3,
	background: 0x0b0b0c,

	shell: {
		radius: 1.0,
		detail: 40, // icosahedron subdivision; clamped to 26 on small screens
		warp: 0.115, // low-frequency lumps
		crease: 0.012, // second octave, the folds
		ior: 1.46,
		dispersion: 13,
		roughness: 0.09,
		thickness: 0.35,
		iridescence: 0.5,
		lobes: 8, // splash protrusions pulled out of the body itself
		lobeAmplitude: 0.3,
		lobeSharpness: 8,
	},

	core: {
		radius: 0.74,
		detail: 26,
		relief: 0.15,
		plates: 0.09,
		veins: 4,
	},

	rings: { count: 5, inner: 1.45, outer: 2.5, tube: 0.0052 },
	motes: { count: 150, spread: 2.6 },

	motion: { spin: 0.055, tumble: 0.05, drag: 0.0042, damping: 0.92 },

	camera: { fov: 30, distance: 8.0 },

	exposure: 1.0,
	envIntensity: 1.35,

	post: { bloom: 0.26, bloomRadius: 0.6, bloomThreshold: 0.88, grain: 0.085, vignette: 1.05, chroma: 0.6 },

	maxPixelRatio: 1.75,
	transmissionScale: 0.75,
};

/* — geometry ————————————————————————————————————————————————————
   One workhorse: an icosphere pushed along its own directions by a field, with
   normals taken analytically from two tangent samples. Welding or
   computeVertexNormals on a non-indexed icosphere would either cost a hash
   pass or facet the surface; sampling the field twice more is cheaper and
   exact. */

function displacedSphere(detail, radius, field, colorize) {
	const geometry = new THREE.IcosahedronGeometry(1, detail);
	const source = geometry.attributes.position;
	const count = source.count;
	const positions = new Float32Array(count * 3);
	const normals = new Float32Array(count * 3);
	const colors = colorize ? new Float32Array(count * 3) : null;

	const dir = new THREE.Vector3();
	const tangentA = new THREE.Vector3();
	const tangentB = new THREE.Vector3();
	const probeA = new THREE.Vector3();
	const probeB = new THREE.Vector3();
	const point = new THREE.Vector3();
	const edgeA = new THREE.Vector3();
	const edgeB = new THREE.Vector3();
	const normal = new THREE.Vector3();
	const upright = new THREE.Vector3(0, 1, 0);
	const sideways = new THREE.Vector3(1, 0, 0);
	const tint = new THREE.Color();
	const EPS = 0.004;

	for (let i = 0; i < count; i++) {
		dir.fromBufferAttribute(source, i).normalize();
		const height = field(dir);
		point.copy(dir).multiplyScalar(radius * height);

		tangentA.crossVectors(dir, Math.abs(dir.y) > 0.92 ? sideways : upright).normalize();
		tangentB.crossVectors(dir, tangentA).normalize();

		probeA.copy(dir).addScaledVector(tangentA, EPS).normalize();
		probeA.multiplyScalar(radius * field(probeA));
		probeB.copy(dir).addScaledVector(tangentB, EPS).normalize();
		probeB.multiplyScalar(radius * field(probeB));

		edgeA.subVectors(probeA, point);
		edgeB.subVectors(probeB, point);
		normal.crossVectors(edgeA, edgeB).normalize();
		if (normal.dot(dir) < 0) normal.negate();

		positions[i * 3] = point.x;
		positions[i * 3 + 1] = point.y;
		positions[i * 3 + 2] = point.z;
		normals[i * 3] = normal.x;
		normals[i * 3 + 1] = normal.y;
		normals[i * 3 + 2] = normal.z;

		if (colors) {
			colorize(dir, height, tint);
			colors[i * 3] = tint.r;
			colors[i * 3 + 1] = tint.g;
			colors[i * 3 + 2] = tint.b;
		}
	}

	geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
	geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
	if (colors) geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
	geometry.deleteAttribute("uv");
	geometry.computeBoundingSphere();
	return geometry;
}

/* — environment ————————————————————————————————————————————————
   A dark room with a few hard emitters. Broad panels give the body its form;
   the narrow strips are the ones that dispersion smears into spectra. */

function studioEnvironment(renderer) {
	const scene = new THREE.Scene();
	const room = new THREE.Mesh(
		new THREE.BoxGeometry(24, 18, 24),
		new THREE.MeshBasicMaterial({ color: 0x060608, side: THREE.BackSide })
	);
	scene.add(room);

	const emit = (w, h, color, intensity, pos, look) => {
		const mesh = new THREE.Mesh(
			new THREE.PlaneGeometry(w, h),
			new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide })
		);
		mesh.position.set(...pos);
		mesh.lookAt(...(look || [0, 0, 0]));
		scene.add(mesh);
	};

	emit(7, 9, 0xffffff, 4.4, [-4.6, 3.2, 4.4]); // key
	emit(6, 7, 0x8fb4ff, 1.2, [5.4, 0.6, -3.6]); // cool rim
	emit(7, 4, 0xf6dcc6, 0.28, [1.8, -4.6, 2.4]); // warm bounce
	emit(0.35, 9, 0xffffff, 11, [3.4, 3.6, 1.2]); // spectral strips
	emit(0.28, 7, 0xdfe9ff, 8, [-3.2, -1.4, -3.4]);
	emit(2.2, 0.3, 0xffffff, 6, [0.4, 5.2, -1.6]);
	emit(13, 10, 0xeef2ff, 1.2, [0, 0.4, 9.5]); // viewer-side fill: keeps the glass off black
	emit(8, 8, 0xc9d9ff, 1.1, [4.6, -2.6, 3.4]); // lower-right fill, or that quarter goes to pitch

	const pmrem = new THREE.PMREMGenerator(renderer);
	pmrem.compileEquirectangularShader();
	const target = pmrem.fromScene(scene, 0.035);
	pmrem.dispose();
	scene.traverse((object) => {
		if (object.geometry) object.geometry.dispose();
		if (object.material) object.material.dispose();
	});
	return target.texture;
}

/* — grade ——————————————————————————————————————————————————————
   Runs after OutputPass, so it works on display-referred pixels: lens chroma
   at the corners, a soft vignette, and animated grain to match the printed,
   photographed feel of the reference plate. */

const GradeShader = {
	uniforms: {
		tDiffuse: { value: null },
		uTime: { value: 0 },
		uGrain: { value: 0.055 },
		uVignette: { value: 0.9 },
		uChroma: { value: 0.5 },
	},
	vertexShader: /* glsl */ `
		varying vec2 vUv;
		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}
	`,
	fragmentShader: /* glsl */ `
		uniform sampler2D tDiffuse;
		uniform float uTime;
		uniform float uGrain;
		uniform float uVignette;
		uniform float uChroma;
		varying vec2 vUv;

		float hash( vec2 p ) {
			p = fract( p * vec2( 443.8975, 397.2973 ) );
			p += dot( p, p.yx + 19.19 );
			return fract( ( p.x + p.y ) * p.x );
		}

		void main() {
			vec2 centered = vUv - 0.5;
			float r2 = dot( centered, centered );

			vec2 shift = centered * uChroma * r2 * 0.012;
			vec3 color;
			color.r = texture2D( tDiffuse, vUv + shift ).r;
			color.g = texture2D( tDiffuse, vUv ).g;
			color.b = texture2D( tDiffuse, vUv - shift ).b;

			color *= 1.0 - uVignette * smoothstep( 0.02, 0.42, r2 );

			float g = hash( gl_FragCoord.xy + fract( uTime ) * 137.0 );
			color += ( g - 0.5 ) * uGrain * ( 1.0 - 0.55 * dot( color, vec3( 0.333 ) ) );

			gl_FragColor = vec4( max( color, 0.0 ), 1.0 );
		}
	`,
};

/* — assembly ———————————————————————————————————————————————————— */

function merge(base, patch) {
	const out = Array.isArray(base) ? base.slice() : { ...base };
	for (const key of Object.keys(patch || {})) {
		const value = patch[key];
		out[key] = value && typeof value === "object" && !Array.isArray(value) ? merge(base[key] || {}, value) : value;
	}
	return out;
}

export function createSpecimen(container, overrides = {}) {
	const config = merge(DEFAULTS, overrides);

	/* Phones and tablets pay for the transmission pass twice over: once in the
	   backdrop render, once in the refraction sampling. Spend less there. */
	const compact = window.matchMedia("(max-width: 820px), (pointer: coarse)").matches;
	if (compact && !overrides.shell?.detail) {
		config.shell.detail = Math.min(config.shell.detail, 26);
		config.core.detail = Math.min(config.core.detail, 18);
		config.transmissionScale = Math.min(config.transmissionScale, 0.5);
		config.maxPixelRatio = Math.min(config.maxPixelRatio, 1.5);
		config.motes.count = Math.min(config.motes.count, 80);
	}

	const noise = makeNoise3D(config.seed);
	const detailNoise = makeNoise3D(config.seed * 31 + 7);
	const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

	const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
	renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, config.maxPixelRatio));
	renderer.toneMapping = THREE.NeutralToneMapping; // holds spectral hue where ACES would wash it out
	renderer.toneMappingExposure = config.exposure;
	renderer.transmissionResolutionScale = config.transmissionScale;
	renderer.setClearColor(config.background, 1);
	renderer.domElement.style.display = "block";
	renderer.domElement.style.width = "100%";
	renderer.domElement.style.height = "100%";
	renderer.domElement.style.touchAction = "none";
	container.appendChild(renderer.domElement);

	const scene = new THREE.Scene();
	scene.background = new THREE.Color(config.background);
	scene.environment = studioEnvironment(renderer);
	scene.environmentIntensity = config.envIntensity;

	const camera = new THREE.PerspectiveCamera(config.camera.fov, 1, 0.1, 60);
	camera.position.set(0, 0, config.camera.distance);

	const specimen = new THREE.Group();
	scene.add(specimen);

	/* — core: opaque, so it lands in the transmission backdrop and gets split
	     by the shell. Ridged noise for the plates, fBm for the erosion. */
	const coreField = (d) => {
		const plate = ridged(detailNoise, d.x * 2.1, d.y * 2.1, d.z * 2.1, 5);
		const erosion = fbm(noise, d.x * 4.4 + 11, d.y * 4.4, d.z * 4.4, 4);
		return 1 + plate * config.core.plates + erosion * config.core.relief;
	};
	const stone = new THREE.Color(0xd2d0c9);
	const shadowStone = new THREE.Color(0x6b6b68);
	const soot = new THREE.Color(0x141413);
	const coreGeometry = displacedSphere(config.core.detail, config.core.radius, coreField, (d, height, out) => {
		const blotch = fbm(detailNoise, d.x * 1.7 - 5, d.y * 1.7, d.z * 1.7, 3);
		const crevice = THREE.MathUtils.smoothstep(height, 0.86, 1.06);
		out.copy(shadowStone).lerp(stone, crevice);
		out.lerp(soot, THREE.MathUtils.smoothstep(blotch, -0.06, 0.34) * 0.95);
	});
	const core = new THREE.Mesh(
		coreGeometry,
		new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.05, envMapIntensity: 1.15 })
	);
	specimen.add(core);

	/* Ink veins: dark filaments lying on the core, read as fractures through
	   the glass. Opaque for the same backdrop reason. */
	const veinMaterial = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.92, metalness: 0.0 });
	for (let i = 0; i < config.core.veins; i++) {
		const points = [];
		const axis = new THREE.Vector3(
			Math.sin(i * 2.2) * 0.9,
			Math.cos(i * 1.7),
			Math.sin(i * 3.1 + 1.2)
		).normalize();
		const start = new THREE.Vector3(Math.cos(i * 1.9), Math.sin(i * 2.6), Math.cos(i * 0.8 + 2)).normalize();
		for (let s = 0; s <= 26; s++) {
			const t = s / 26;
			const d = start.clone().applyAxisAngle(axis, t * 2.3 - 1.1);
			d.addScaledVector(new THREE.Vector3(1, 1, 1), fbm(noise, d.x * 3 + i, d.y * 3, d.z * 3, 3) * 0.13).normalize();
			points.push(d.multiplyScalar(config.core.radius * coreField(d) * 1.012));
		}
		const vein = new THREE.Mesh(
			new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 90, 0.005 + (i % 3) * 0.0018, 6, false),
			veinMaterial
		);
		specimen.add(vein);
	}

	/* — shell: the dispersive body. The wings are not separate objects — the
	   body itself is thrown outward in a few directions, and because it stays
	   one continuous refracting surface the spectrum runs all the way through
	   them. Each lobe is a soft cosine bulge around its own axis, roughened by
	   the same noise as the body so the protrusions never read as spheres. */
	const lobeAxes = [];
	for (let i = 0; i < config.shell.lobes; i++) {
		const golden = Math.PI * (3 - Math.sqrt(5));
		const y = 1 - (2 * i + 1) / config.shell.lobes;
		const r = Math.sqrt(Math.max(0, 1 - y * y));
		const a = i * golden + config.seed;
		lobeAxes.push({
			axis: new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r).normalize(),
			amplitude: config.shell.lobeAmplitude * (0.55 + ((i * 7) % 5) / 6),
			sharpness: config.shell.lobeSharpness * (0.7 + ((i * 3) % 4) / 3),
		});
	}

	const shellField = (d) => {
		const lump = fbm(noise, d.x * 1.55, d.y * 1.55, d.z * 1.55, 3);
		const fold = fbm(detailNoise, d.x * 2.6 + 4, d.y * 2.6, d.z * 2.6, 3);
		let splash = 0;
		for (const lobe of lobeAxes) {
			const along = d.dot(lobe.axis);
			if (along <= 0) continue;
			const falloff = Math.pow(along, lobe.sharpness);
			const ragged = 1 + fbm(noise, d.x * 5.2 + 21, d.y * 5.2, d.z * 5.2, 3) * 0.55;
			splash += falloff * lobe.amplitude * ragged;
		}
		return 1 + lump * config.shell.warp + fold * config.shell.crease + splash;
	};
	const glass = new THREE.MeshPhysicalMaterial({
		color: 0xffffff,
		transmission: 1,
		transparent: true,
		opacity: 1,
		metalness: 0,
		roughness: config.shell.roughness,
		ior: config.shell.ior,
		dispersion: config.shell.dispersion,
		thickness: config.shell.thickness,
		attenuationColor: new THREE.Color(0xd8e8f4),
		attenuationDistance: 8.0,
		iridescence: config.shell.iridescence,
		iridescenceIOR: 1.34,
		iridescenceThicknessRange: [130, 720],
		clearcoat: 0.6,
		clearcoatRoughness: 0.28,
		envMapIntensity: 1.25,
		side: THREE.FrontSide,
	});
	const shell = new THREE.Mesh(displacedSphere(config.shell.detail, config.shell.radius, shellField), glass);
	specimen.add(shell);

	/* — rings: opaque iridescent filaments, so the shell refracts the arcs
	     that pass behind it. Each keeps its own axis and rate. */
	const ringMaterial = new THREE.MeshPhysicalMaterial({
		color: 0xb0b6be,
		metalness: 0.85,
		roughness: 0.24,
		iridescence: 1,
		iridescenceIOR: 1.42,
		iridescenceThicknessRange: [110, 880],
		envMapIntensity: 1.6,
	});
	const rings = [];
	for (let i = 0; i < config.rings.count; i++) {
		const t = i / Math.max(1, config.rings.count - 1);
		const radius = THREE.MathUtils.lerp(config.rings.inner, config.rings.outer, t);
		const pivot = new THREE.Group();
		pivot.rotation.set(i * 1.07 + 0.3, i * 2.41, i * 0.61);
		const ring = new THREE.Mesh(
			new THREE.TorusGeometry(radius, config.rings.tube * (1 + (i % 3) * 0.35), 6, 420),
			ringMaterial
		);
		ring.scale.set(1, 0.72 + (i % 4) * 0.09, 1);
		pivot.add(ring);
		specimen.add(pivot);
		rings.push({ pivot, rate: 0.05 + (i % 5) * 0.022, axis: i % 3 });
	}

	/* — motes: a thin dust field for depth. */
	const motePositions = new Float32Array(config.motes.count * 3);
	const random = mulberry32(config.seed * 977 + 13); // seeded, so the dust lands the same way twice
	for (let i = 0; i < config.motes.count; i++) {
		const d = new THREE.Vector3(random() * 2 - 1, random() * 2 - 1, random() * 2 - 1).normalize();
		d.multiplyScalar(1.6 + random() * config.motes.spread);
		motePositions.set([d.x, d.y * 0.7, d.z], i * 3);
	}
	const moteGeometry = new THREE.BufferGeometry();
	moteGeometry.setAttribute("position", new THREE.BufferAttribute(motePositions, 3));
	const motes = new THREE.Points(
		moteGeometry,
		new THREE.PointsMaterial({
			color: 0xdfe6f2,
			size: 0.013,
			sizeAttenuation: true,
			transparent: true,
			opacity: 0.3,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
		})
	);
	scene.add(motes);

	/* — post chain ———————————————————————————————————————————— */
	const composer = new EffectComposer(renderer);
	composer.addPass(new RenderPass(scene, camera));
	const bloom = new UnrealBloomPass(
		new THREE.Vector2(1, 1),
		config.post.bloom,
		config.post.bloomRadius,
		config.post.bloomThreshold
	);
	composer.addPass(bloom);
	composer.addPass(new OutputPass());
	const grade = new ShaderPass(GradeShader);
	grade.uniforms.uGrain.value = config.post.grain;
	grade.uniforms.uVignette.value = config.post.vignette;
	grade.uniforms.uChroma.value = config.post.chroma;
	composer.addPass(grade);

	/* — interaction: drag to turn, with inertia that decays back into the
	     idle spin. Pitch is clamped so the specimen never rolls over. */
	const pointer = { active: false, x: 0, y: 0, id: null };
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
		/* Portrait viewports are limited by horizontal field of view, so pull
		   back — but only up to a point, or the specimen turns into a bead. */
		camera.position.z = config.camera.distance * THREE.MathUtils.clamp(1 / camera.aspect, 1, 1.7);
		camera.updateProjectionMatrix();
		renderer.setSize(width, height, false);
		composer.setSize(width, height);
		bloom.setSize(width, height);
	};
	const observer = new ResizeObserver(resize);
	observer.observe(container);
	resize();

	/* — loop ——————————————————————————————————————————————————— */
	const timer = new THREE.Timer();
	timer.connect(document); // stops the clock while the tab is hidden
	let frame = 0;
	let running = true;

	const tick = () => {
		frame = requestAnimationFrame(tick);
		timer.update();
		const dt = Math.min(timer.getDelta(), 0.05);
		const time = timer.getElapsed();

		if (!reduceMotion) {
			spin.yaw += spin.yawVelocity + dt * config.motion.spin;
			spin.pitch += spin.pitchVelocity;
			spin.yawVelocity *= config.motion.damping;
			spin.pitchVelocity *= config.motion.damping;
			spin.pitch = THREE.MathUtils.clamp(spin.pitch, -0.65, 0.65);

			specimen.rotation.y = spin.yaw;
			specimen.rotation.x = spin.pitch + Math.sin(time * 0.31) * config.motion.tumble;
			specimen.rotation.z = Math.sin(time * 0.23) * config.motion.tumble * 0.8;
			specimen.position.y = Math.sin(time * 0.44) * 0.02;

			for (const ring of rings) {
				if (ring.axis === 0) ring.pivot.rotation.z += dt * ring.rate;
				else if (ring.axis === 1) ring.pivot.rotation.x += dt * ring.rate;
				else ring.pivot.rotation.y += dt * ring.rate;
			}
			motes.rotation.y = time * 0.012;
			grade.uniforms.uTime.value = time;
		}

		composer.render();
	};
	tick();

	/* Give the GPU back when the tab or the section is out of view. */
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
		specimen,
		materials: { glass, ring: ringMaterial, core: core.material },
		post: { bloom, grade },
		motion: config.motion,
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
					const materials = Array.isArray(object.material) ? object.material : [object.material];
					materials.forEach((m) => m.dispose());
				}
			});
			if (scene.environment) scene.environment.dispose();
			composer.dispose();
			renderer.dispose();
			renderer.domElement.remove();
		},
	};
}
