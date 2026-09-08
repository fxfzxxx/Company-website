/* Movement 01 — an instrument, generated at load.

   The brief: industrial, more complex than the specimen, but with a human
   register. Those pull in opposite directions unless you pick a subject where
   they already meet, so the subject here is a watch movement — the densest
   piece of precision engineering people still finish by hand.

   What carries the industry: cut wheels with real gear ratios, chamfered
   edges, turned plate finishes, a knurled crown, blued screws.
   What carries the hand: a guilloché rosette engraved on the plate, bridge
   outlines drawn by eye rather than by formula, jewelled pivots, a coil
   somebody wound unevenly, screw slots left at whatever angle they stopped at.

   Public API: createMovement(container, overrides) -> { dispose, ... }. */

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import {
	wheelGeometry,
	turned,
	knurledRing,
	coilGeometry,
	dialTexture,
	turningTexture,
	perlageTexture,
	woodTexture,
} from "./parts.js";

const TAU = Math.PI * 2;

export const DEFAULTS = {
	background: 0xe7e3da,
	camera: { fov: 30, distance: 7.4 },
	exposure: 0.9,
	envIntensity: 0.8,
	train: { greatTeeth: 80, greatPitch: 0.72, pinionTeeth: 12, rate: 0.08 },
	post: { bloom: 0.1, bloomRadius: 0.5, bloomThreshold: 0.97, grain: 0.05, vignette: 0.42, chroma: 0.45 },
	motion: { drag: 0.0032, damping: 0.9, sway: 0.045 },
	maxPixelRatio: 1.75,
	transmissionScale: 0.6,
};

/* — light: a bench, not a stage ————————————————————————————————
   Warm key from the upper left the way a lamp sits over a workbench, a cool
   window fill opposite so the steel keeps its edge, and narrow strips that
   the turned finishes can sweep. */

function benchEnvironment(renderer) {
	const scene = new THREE.Scene();
	const room = new THREE.Mesh(
		new THREE.BoxGeometry(30, 22, 30),
		new THREE.MeshBasicMaterial({ color: 0x2f2b26, side: THREE.BackSide })
	);
	scene.add(room);

	const emit = (w, h, color, intensity, pos) => {
		const mesh = new THREE.Mesh(
			new THREE.PlaneGeometry(w, h),
			new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide })
		);
		mesh.position.set(...pos);
		mesh.lookAt(0, 0, 0);
		scene.add(mesh);
	};

	emit(9, 7, 0xfff0dc, 2.4, [-4.4, 4.6, 5.2]); // bench lamp, warm
	emit(10, 9, 0xdce8ff, 0.85, [6.2, 1.4, 3.0]); // window fill, cool
	emit(14, 12, 0xfff4e8, 0.5, [0, 0.5, 11]); // viewer side, keeps faces readable
	emit(0.42, 8, 0xffffff, 5, [2.6, 3.8, 3.2]); // strips for the turned finishes
	emit(0.32, 7, 0xfff2e2, 4.5, [-3.4, -1.2, 3.6]);
	emit(9, 6, 0xd8cfc0, 0.55, [0, -5.4, 2.2]); // bench top bounce

	const pmrem = new THREE.PMREMGenerator(renderer);
	pmrem.compileEquirectangularShader();
	const target = pmrem.fromScene(scene, 0.03);
	pmrem.dispose();
	scene.traverse((object) => {
		if (object.geometry) object.geometry.dispose();
		if (object.material) object.material.dispose();
	});
	return target.texture;
}

/* — grade —————————————————————————————————————————————————————— */

const GradeShader = {
	uniforms: {
		tDiffuse: { value: null },
		uTime: { value: 0 },
		uGrain: { value: 0.05 },
		uVignette: { value: 0.42 },
		uChroma: { value: 0.45 },
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

			vec2 shift = centered * uChroma * r2 * 0.010;
			vec3 color;
			color.r = texture2D( tDiffuse, vUv + shift ).r;
			color.g = texture2D( tDiffuse, vUv ).g;
			color.b = texture2D( tDiffuse, vUv - shift ).b;

			color *= 1.0 - uVignette * smoothstep( 0.04, 0.52, r2 );

			/* Grain on a pale ground should read as paper tooth, so it is
			   strongest in the midtones and lets the highlights stay clean. */
			float luma = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
			float tooth = 4.0 * luma * ( 1.0 - luma );
			float g = hash( gl_FragCoord.xy + fract( uTime ) * 137.0 );
			color += ( g - 0.5 ) * uGrain * tooth;

			gl_FragColor = vec4( max( color, 0.0 ), 1.0 );
		}
	`,
};

function merge(base, patch) {
	const out = { ...base };
	for (const key of Object.keys(patch || {})) {
		const value = patch[key];
		out[key] = value && typeof value === "object" && !Array.isArray(value) ? merge(base[key] || {}, value) : value;
	}
	return out;
}

/* A closed outline drawn through control points rather than derived from a
   formula — this is how bridge shapes actually look, and why no two calibres
   have the same one. */
function outlineShape(controls, samples = 220) {
	const curve = new THREE.CatmullRomCurve3(
		controls.map(([x, y]) => new THREE.Vector3(x, y, 0)),
		true,
		"catmullrom",
		0.5
	);
	const shape = new THREE.Shape(curve.getPoints(samples).map((p) => new THREE.Vector2(p.x, p.y)));
	return shape;
}

export function createMovement(container, overrides = {}) {
	const config = merge(DEFAULTS, overrides);
	const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	const compact = window.matchMedia("(max-width: 820px), (pointer: coarse)").matches;
	if (compact) {
		config.maxPixelRatio = Math.min(config.maxPixelRatio, 1.5);
		config.transmissionScale = 0.4;
	}

	const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
	renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, config.maxPixelRatio));
	renderer.toneMapping = THREE.NeutralToneMapping;
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
	scene.environment = benchEnvironment(renderer);
	scene.environmentIntensity = config.envIntensity;

	/* The environment gives the metal something to reflect, but only a real
	   shadow tells you a wheel sits above a plate. One directional light does
	   the whole stack. */
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFSoftShadowMap;
	const key = new THREE.DirectionalLight(0xfff1de, 1.5);
	key.position.set(-2.6, 3.4, 4.2);
	key.castShadow = true;
	key.shadow.mapSize.set(compact ? 1024 : 2048, compact ? 1024 : 2048);
	key.shadow.camera.near = 1;
	key.shadow.camera.far = 14;
	key.shadow.camera.left = -2.4;
	key.shadow.camera.right = 2.4;
	key.shadow.camera.top = 2.4;
	key.shadow.camera.bottom = -2.4;
	key.shadow.bias = -0.0012;
	key.shadow.normalBias = 0.012;
	scene.add(key, key.target);

	const camera = new THREE.PerspectiveCamera(config.camera.fov, 1, 0.1, 60);
	camera.position.set(0, 0, config.camera.distance);

	const movement = new THREE.Group();
	movement.position.set(0, 0.12, 0); // resize() offsets it on wide viewports
	movement.rotation.set(-0.30, 0.26, 0.12); // laid on the bench, seen from above left
	scene.add(movement);

	/* — finishes ————————————————————————————————————————————— */
	const turning = turningTexture({});
	const perlage = perlageTexture({});
	const wood = woodTexture({});
	const engraving = dialTexture({ label: "MOVEMENT 01", serial: "YONDER · N° 0001" });

	const brass = new THREE.MeshPhysicalMaterial({
		color: 0xa79067,
		metalness: 1,
		roughness: 0.31,
		roughnessMap: turning,
		envMapIntensity: 1.15,
	});
	const platedBrass = new THREE.MeshPhysicalMaterial({
		color: 0xb59a6e,
		metalness: 1,
		roughness: 0.26,
		roughnessMap: engraving,
		bumpMap: engraving,
		bumpScale: 0.78,
		envMapIntensity: 1.2,
	});
	const wheelBrass = new THREE.MeshPhysicalMaterial({
		color: 0x99682f,
		metalness: 1,
		roughness: 0.34,
		roughnessMap: turning,
		envMapIntensity: 1.1,
	});
	const rhodium = new THREE.MeshPhysicalMaterial({
		color: 0xc0c4c8,
		metalness: 1,
		roughness: 0.33,
		roughnessMap: perlage,
		bumpMap: perlage,
		bumpScale: 0.22,
		envMapIntensity: 0.85,
	});
	const steel = new THREE.MeshPhysicalMaterial({
		color: 0xb7bcc2,
		metalness: 1,
		roughness: 0.22,
		roughnessMap: turning,
		envMapIntensity: 1.2,
	});
	const blued = new THREE.MeshPhysicalMaterial({
		color: 0x35508c,
		metalness: 1,
		roughness: 0.11,
		clearcoat: 0.5,
		clearcoatRoughness: 0.06,
		envMapIntensity: 1.35,
	});
	const copper = new THREE.MeshPhysicalMaterial({ color: 0xb2643a, metalness: 1, roughness: 0.33, envMapIntensity: 1.1 });
	const gold = new THREE.MeshPhysicalMaterial({ color: 0xd7a94f, metalness: 1, roughness: 0.19, envMapIntensity: 1.25 });
	const walnut = new THREE.MeshPhysicalMaterial({
		map: wood.map,
		roughnessMap: wood.rough,
		bumpMap: wood.rough,
		bumpScale: 0.35,
		color: 0xb9a48f,
		metalness: 0,
		roughness: 0.62,
		clearcoat: 0.4,
		clearcoatRoughness: 0.26,
		envMapIntensity: 0.85,
	});
	const ruby = new THREE.MeshPhysicalMaterial({
		color: 0xffffff,
		transmission: 1,
		transparent: true,
		metalness: 0,
		roughness: 0.03,
		ior: 1.77,
		thickness: 0.05,
		attenuationColor: new THREE.Color(0x8d1220),
		attenuationDistance: 0.06,
		envMapIntensity: 1.3,
	});
	const glass = new THREE.MeshPhysicalMaterial({
		color: 0xffffff,
		transmission: 1,
		transparent: true,
		metalness: 0,
		roughness: 0.05,
		ior: 1.52,
		thickness: 0.12,
		dispersion: 3,
		envMapIntensity: 1.2,
	});
	const shadowMetal = new THREE.MeshPhysicalMaterial({ color: 0x35312c, metalness: 0.85, roughness: 0.5 });

	const materials = { brass, platedBrass, wheelBrass, rhodium, steel, blued, copper, gold, walnut, ruby, glass };

	/* — parts, each registered so the page can name what the pointer is on — */
	const parts = [];
	const register = (object, name, note) => {
		object.userData.part = { name, note };
		object.userData.rest = object.position.z;
		object.userData.lift = 0;
		parts.push(object);
		return object;
	};

	/* Main plate: a facing cut, chamfered at the rim, with the rosette
	   engraved on its face. */
	const plateGroup = new THREE.Group();
	movement.add(plateGroup);
	const plate = new THREE.Mesh(
		turned([
			[0, 0.045],
			[1.2, 0.045],
			[1.27, 0.03],
			[1.3, 0.012],
			[1.3, -0.03],
			[1.24, -0.05],
			[0, -0.05],
		]),
		brass
	);
	plateGroup.add(plate);
	const dial = new THREE.Mesh(new THREE.CircleGeometry(1.2, 160), platedBrass);
	dial.position.z = 0.0465;
	plateGroup.add(dial);
	register(plateGroup, "Main plate", "Guilloché rosette, engine-turned finish");

	/* The dish the movement is set into. Every instrument like this lives in
	   something softer than itself, and the wood is what the hand touches. */
	const dish = new THREE.Mesh(
		turned([
			[0, -0.12],
			[1.3, -0.12],
			[1.4, -0.08],
			[1.5, -0.02],
			[1.52, 0.015],
			[1.5, 0.045],
			[1.38, 0.015],
			[1.3, -0.02],
			[0, -0.02],
		], 128),
		walnut
	);
	register(dish, "Dish", "Turned walnut, hand-polished");
	movement.add(dish);

	/* Bezel: knurled, because instruments are meant to be held. */
	const bezelGroup = new THREE.Group();
	bezelGroup.add(new THREE.Mesh(knurledRing({ radius: 1.34, height: 0.2, teeth: 76, depth: 0.015, twist: 17 }), rhodium));
	bezelGroup.add(
		new THREE.Mesh(
			turned([
				[1.3, 0.1],
				[1.36, 0.082],
				[1.36, -0.082],
				[1.3, -0.1],
				[1.3, 0.1],
			], 96),
			rhodium
		)
	);
	register(bezelGroup, "Bezel", "Diamond knurl, 76 lines");
	movement.add(bezelGroup);

	/* — going train: ratios are real, so the pinions turn as fast as their
	     tooth counts say they must. */
	const { greatTeeth, greatPitch, pinionTeeth } = config.train;
	const module = (2 * greatPitch) / greatTeeth;
	const pinionPitch = (module * pinionTeeth) / 2;
	const centre = greatPitch + pinionPitch;

	const greatWheel = new THREE.Mesh(
		wheelGeometry({
			teeth: greatTeeth,
			pitch: greatPitch,
			toothDepth: module * 2.2,
			thickness: 0.05,
			bore: 0.1,
			crossings: 6,
			hub: 0.19,
			rim: 0.07,
		}),
		wheelBrass
	);
	greatWheel.position.z = 0.12;
	register(greatWheel, "Great wheel", `${greatTeeth} teeth · 5 crossings`);
	movement.add(greatWheel);

	const pinions = [];
	const pinionGeometry = wheelGeometry({
		teeth: pinionTeeth,
		pitch: pinionPitch,
		toothDepth: module * 2.2,
		thickness: 0.07,
		bore: 0.022,
		crossings: 0,
	});
	for (let i = 0; i < 3; i++) {
		const at = -0.55 + i * 1.9;
		const pinion = new THREE.Mesh(pinionGeometry, steel);
		pinion.position.set(Math.cos(at) * centre, Math.sin(at) * centre, 0.12);
		register(pinion, "Pinion", `${pinionTeeth} leaves · ${(greatTeeth / pinionTeeth).toFixed(2)}:1`);
		movement.add(pinion);
		pinions.push({ mesh: pinion, angle: at });
	}

	/* — bridges: outlines drawn by eye, screwed down over the wheels ——— */
	const bridgeMaterial = rhodium;
	const bridgeShapes = [
		{
			outline: [
				[-1.04, 0.2],
				[-0.94, 0.58],
				[-0.6, 0.78],
				[-0.2, 0.7],
				[-0.12, 0.46],
				[-0.44, 0.3],
				[-0.7, 0.1],
			],
			holes: [
				[-0.86, 0.5, 0.075],
				[-0.3, 0.6, 0.075],
			],
		},
		{
			outline: [
				[0.34, -0.86],
				[0.72, -0.94],
				[1.0, -0.6],
				[0.94, -0.22],
				[0.66, -0.2],
				[0.6, -0.5],
				[0.36, -0.58],
			],
			holes: [
				[0.86, -0.5, 0.075],
				[0.5, -0.74, 0.075],
			],
		},
	];
	for (const { outline: controls, holes } of bridgeShapes) {
		const shape = outlineShape(controls);
		for (const [hx, hy, hr] of holes) {
			const hole = new THREE.Path();
			hole.absarc(hx, hy, hr, 0, TAU, true);
			shape.holes.push(hole);
		}
		const geometry = new THREE.ExtrudeGeometry(shape, {
			depth: 0.042,
			bevelEnabled: true,
			bevelThickness: 0.01,
			bevelSize: 0.01,
			bevelSegments: 3,
			steps: 1,
			curveSegments: 3,
		});
		const bridge = new THREE.Mesh(geometry, bridgeMaterial);
		bridge.position.z = 0.152;
		register(bridge, "Bridge", "Outline drawn by eye, not by formula");
		movement.add(bridge);
	}

	/* — jewels: synthetic ruby in gold chatons, at the pivots ————————— */
	const jewelAt = (x, y, z = 0.212) => {
		const chaton = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.022, 32), gold);
		chaton.rotation.x = Math.PI / 2;
		chaton.position.set(x, y, z);
		const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.03, 28), ruby);
		stone.rotation.x = Math.PI / 2;
		stone.position.set(x, y, z + 0.004);
		const group = new THREE.Group();
		group.add(chaton, stone);
		register(group, "Jewel", "Synthetic ruby pivot, gold chaton");
		movement.add(group);
	};
	jewelAt(-0.86, 0.5);
	jewelAt(-0.3, 0.6);
	jewelAt(0.86, -0.5);
	jewelAt(0.5, -0.74);
	jewelAt(0.0, 0.0, 0.086); // centre pivot, under the hand

	/* — screws: slots left wherever the driver stopped ————————————— */
	const screwHead = turned([
		[0, 0.018],
		[0.045, 0.018],
		[0.052, 0.008],
		[0.052, -0.03],
		[0, -0.03],
	], 28);
	const slotGeometry = new THREE.BoxGeometry(0.092, 0.011, 0.012);
	const screwAt = (x, y, z, seed) => {
		const group = new THREE.Group();
		const head = new THREE.Mesh(screwHead, blued);
		const slot = new THREE.Mesh(slotGeometry, shadowMetal);
		slot.position.z = 0.014;
		slot.rotation.z = (seed * 2.399) % Math.PI; // no two the same
		group.add(head, slot);
		group.position.set(x, y, z);
		register(group, "Screw", "Blued steel · slot left as tightened");
		movement.add(group);
	};
	for (let i = 0; i < 7; i++) {
		const a = (i / 7) * TAU + 0.24;
		const r = 1.13 + (i % 3) * 0.025;
		screwAt(Math.cos(a) * r, Math.sin(a) * r, 0.062, i);
	}
	/* Four more where the bridges are actually held down. */
	screwAt(-1.0, 0.24, 0.196, 11);
	screwAt(-0.2, 0.68, 0.196, 5);
	screwAt(0.4, -0.8, 0.196, 8);
	screwAt(0.96, -0.26, 0.196, 3);

	/* — balance and hairspring: the part that is alive ————————————— */
	const balanceGroup = new THREE.Group();
	balanceGroup.position.set(-0.62, -0.6, 0.2);
	movement.add(balanceGroup);
	const balanceWheel = new THREE.Mesh(
		wheelGeometry({ teeth: 128, pitch: 0.38, toothDepth: 0.0015, thickness: 0.026, bore: 0.028, crossings: 2, hub: 0.05, rim: 0.038 }),
		steel
	);
	balanceGroup.add(balanceWheel);
	/* Hairspring: an Archimedean spiral in blued steel wire. */
	const spiral = [];
	for (let i = 0; i <= 640; i++) {
		const t = i / 640;
		const a = t * TAU * 5.5;
		const r = 0.035 + t * 0.2;
		spiral.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0.045 + t * 0.004));
	}
	const hairspring = new THREE.Mesh(
		new THREE.TubeGeometry(new THREE.CatmullRomCurve3(spiral), 640, 0.0055, 5, false),
		blued
	);
	balanceGroup.add(hairspring);
	register(balanceGroup, "Balance", "Bimetallic rim · hairspring, 5½ coils");

	/* — coil on a walnut bobbin: wound by hand, and it shows ————————— */
	const coilGroup = new THREE.Group();
	coilGroup.position.set(0.66, 0.76, 0.3);
	coilGroup.rotation.set(Math.PI / 2, 0, 0.42); // axis laid into the plate, so you see the turns
	movement.add(coilGroup);
	coilGroup.add(new THREE.Mesh(turned([
		[0, 0.115],
		[0.15, 0.115],
		[0.15, 0.095],
		[0.1, 0.085],
		[0.1, -0.085],
		[0.15, -0.095],
		[0.15, -0.115],
		[0, -0.115],
	], 48), walnut));
	coilGroup.add(new THREE.Mesh(coilGeometry({ radius: 0.128, turns: 20, height: 0.165, wire: 0.0125 }), copper));
	register(coilGroup, "Coil", "22 turns, hand-wound on walnut");

	/* — the centre: a lens seated in a gold bezel over the barrel. An iris
	     was tried here first and read as a flower on top of the movement:
	     dense mechanisms want one quiet focus, not a second busy one. */
	const lens = new THREE.Mesh(new THREE.SphereGeometry(0.17, 64, 40, 0, TAU, 0, Math.PI * 0.4), glass);
	lens.position.z = 0.196;
	lens.rotation.x = Math.PI / 2;
	const lensRing = new THREE.Mesh(
		turned([
			[0.155, 0.216],
			[0.2, 0.208],
			[0.208, 0.18],
			[0.208, 0.12],
			[0.155, 0.12],
		], 72),
		gold
	);
	const lensGroup = new THREE.Group();
	lensGroup.add(lens, lensRing);
	register(lensGroup, "Lens", "Plano-convex, index 1.52");
	movement.add(lensGroup);

	const barrel = new THREE.Mesh(turned([
		[0.27, 0.17],
		[0.27, 0.1],
		[0.19, 0.08],
		[0.19, -0.02],
		[0, -0.02],
	], 64), shadowMetal);
	movement.add(barrel);

	/* — crown at three o'clock ————————————————————————————————— */
	const crown = new THREE.Group();
	crown.position.set(1.42, 0.06, 0.02);
	crown.rotation.y = Math.PI / 2;
	crown.add(new THREE.Mesh(knurledRing({ radius: 0.115, height: 0.11, teeth: 44, depth: 0.011, twist: 22 }), steel));
	crown.add(new THREE.Mesh(turned([
		[0, 0.055],
		[0.115, 0.055],
		[0.115, -0.055],
		[0, -0.055],
	], 48), steel));
	register(crown, "Crown", "Knurled, 44 lines");
	movement.add(crown);

	/* — the hand: polished, tapered, sweeping ——————————————————— */
	const handShape = new THREE.Shape();
	handShape.moveTo(-0.09, -0.042);
	handShape.lineTo(0.9, -0.011);
	handShape.lineTo(1.02, 0);
	handShape.lineTo(0.9, 0.011);
	handShape.lineTo(-0.09, 0.042);
	handShape.closePath();
	const hand = new THREE.Mesh(
		new THREE.ExtrudeGeometry(handShape, {
			depth: 0.012,
			bevelEnabled: true,
			bevelThickness: 0.004,
			bevelSize: 0.004,
			bevelSegments: 2,
			steps: 1,
		}),
		blued
	);
	hand.position.z = 0.26;
	register(hand, "Hand", "Blued steel, polished by hand");
	movement.add(hand);

	/* Metal casts and catches; the ruby and the lens are left out so they do
	   not throw a solid black shadow through glass. */
	movement.traverse((object) => {
		if (!object.isMesh) return;
		const transmissive = object.material === ruby || object.material === glass;
		object.castShadow = !transmissive;
		object.receiveShadow = true;
	});

	/* — post ————————————————————————————————————————————————— */
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

	/* — pointer: drag to turn, hover to name ————————————————————— */
	const raycaster = new THREE.Raycaster();
	const pointerNdc = new THREE.Vector2(0, 0);
	const pointer = { active: false, id: null, x: 0, y: 0, inside: false };
	const spin = { yaw: 0, pitch: 0, yawVelocity: 0, pitchVelocity: 0 };
	let hovered = null;
	let onHover = null;
	let onHoverMove = null;
	/* The callout points at the spot the ray actually struck, not at the
	   part's origin — a bridge's origin is the middle of the movement, and a
	   leader line that always points there is a leader line pointing at
	   nothing. */
	const hoverPoint = new THREE.Vector3();

	const setHover = (object) => {
		if (hovered === object) return;
		hovered = object;
		if (onHover) onHover(object ? object.userData.part : null, object || null);
	};

	const onPointerDown = (event) => {
		pointer.active = true;
		pointer.id = event.pointerId;
		pointer.x = event.clientX;
		pointer.y = event.clientY;
		renderer.domElement.setPointerCapture(event.pointerId);
		container.classList.add("is-dragging");
	};
	const onPointerMove = (event) => {
		const rect = renderer.domElement.getBoundingClientRect();
		pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
		pointer.inside = true;
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
	const onPointerLeave = () => {
		pointer.inside = false;
		setHover(null);
	};
	renderer.domElement.addEventListener("pointerdown", onPointerDown);
	renderer.domElement.addEventListener("pointermove", onPointerMove);
	renderer.domElement.addEventListener("pointerup", onPointerUp);
	renderer.domElement.addEventListener("pointercancel", onPointerUp);
	renderer.domElement.addEventListener("pointerleave", onPointerLeave);

	/* — sizing ————————————————————————————————————————————————— */
	const resize = () => {
		const width = Math.max(1, container.clientWidth);
		const height = Math.max(1, container.clientHeight);
		camera.aspect = width / height;
		camera.position.z = config.camera.distance * THREE.MathUtils.clamp(1 / camera.aspect, 1, 1.65);
		/* The instrument sits right of centre to clear the title column, but
		   only where there is a column to clear. */
		movement.position.x = camera.aspect > 1.25 ? 0.42 : 0;
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
	timer.connect(document);
	let frame = 0;
	let running = true;
	const ratio = greatTeeth / pinionTeeth;

	const tick = () => {
		frame = requestAnimationFrame(tick);
		timer.update();
		const dt = Math.min(timer.getDelta(), 0.05);
		const time = timer.getElapsed();

		if (!reduceMotion) {
			spin.yaw += spin.yawVelocity;
			spin.pitch += spin.pitchVelocity;
			spin.yawVelocity *= config.motion.damping;
			spin.pitchVelocity *= config.motion.damping;
			spin.pitch = THREE.MathUtils.clamp(spin.pitch, -0.5, 0.5);

			movement.rotation.y = 0.26 + spin.yaw + Math.sin(time * 0.21) * config.motion.sway;
			movement.rotation.x = -0.3 + spin.pitch + Math.sin(time * 0.17) * config.motion.sway * 0.6;

			/* The train. A pinion driven by a wheel turns backwards, faster by
			   exactly the ratio of their tooth counts. */
			const phase = time * config.train.rate;
			greatWheel.rotation.z = phase;
			for (const { mesh, angle } of pinions) {
				mesh.rotation.z = angle * (1 + ratio) + Math.PI / pinionTeeth - ratio * phase;
			}

			/* The balance beats; the hairspring breathes with it. */
			const beat = Math.sin(time * 7.2);
			balanceGroup.rotation.z = beat * 0.72;
			hairspring.scale.setScalar(1 + beat * 0.03);

			hand.rotation.z = -time * 0.14;
			crown.rotation.x = time * 0.4;
			grade.uniforms.uTime.value = time;
		}

		/* Hover: name the part under the pointer. */
		if (pointer.inside && !pointer.active) {
			raycaster.setFromCamera(pointerNdc, camera);
			const hits = raycaster.intersectObjects(parts, true);
			let found = null;
			for (const hit of hits) {
				let node = hit.object;
				while (node && !node.userData.part) node = node.parent;
				if (node) {
					found = node;
					hoverPoint.copy(hit.point);
					break;
				}
			}
			setHover(found);
		}

		/* Hovering lifts a part off the plate, the way you would pick it up
		   with tweezers to look at it. */
		for (const part of parts) {
			part.userData.lift = THREE.MathUtils.damp(part.userData.lift, part === hovered ? 1 : 0, 9, dt);
			part.position.z = part.userData.rest + part.userData.lift * 0.055;
		}
		if (hovered && onHoverMove) onHoverMove(hoverPoint.clone().project(camera));

		composer.render();
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
		movement,
		materials,
		post: { bloom, grade },
		parts,
		onPart(callback) {
			onHover = callback;
		},
		onPartMove(callback) {
			onHoverMove = callback;
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
			renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
			scene.traverse((object) => {
				if (object.geometry) object.geometry.dispose();
				if (object.material) {
					const list = Array.isArray(object.material) ? object.material : [object.material];
					list.forEach((m) => m.dispose());
				}
			});
			if (scene.environment) scene.environment.dispose();
			turning.dispose();
			engraving.dispose();
			perlage.dispose();
			wood.map.dispose();
			wood.rough.dispose();
			composer.dispose();
			renderer.dispose();
			renderer.domElement.remove();
		},
	};
}
