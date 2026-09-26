/* Section 01 — a New Zealand house on its section, at model scale.

   The brief was a sandbox model of an ordinary two-storey house here, in
   black and white, with a little garden. Ordinary is the hard part: the
   things that make a house read as this country are not grand. They are the
   gable with its long eaves, vertical board cladding stained black, white
   aluminium joinery, a corrugate roof, a slatted boundary fence, a strip of
   lawn, and the two plants nobody plants on purpose any more because they
   are already everywhere — cabbage trees and flax.

   One unit is one metre. Everything is built from the site out: board,
   ground, house, garden, and a sun you can walk around the section.

   Public API: createSection(container, overrides) -> { dispose, setSun, ... } */

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { claddedWall, corrugatedSheet, window3d, slatFence, cabbageTree, flax, shrub } from "./parts.js";

const DEG = Math.PI / 180;

export const DEFAULTS = {
	background: 0xe6e4de,
	camera: { fov: 26, distance: 45, height: 18 },
	exposure: 1.0,
	sun: { azimuth: 62, altitude: 31 },
	spin: 0.045,
	motion: { drag: 0.004, damping: 0.9 },
	post: { bloom: 0.08, bloomRadius: 0.5, bloomThreshold: 0.9, grain: 0.035, vignette: 0.5 },
	shadowSize: 2048,
	maxPixelRatio: 1.75,
};

const GRADE = {
	uniforms: {
		tDiffuse: { value: null },
		uTime: { value: 0 },
		uGrain: { value: 0.035 },
		uVignette: { value: 0.5 },
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
			colour *= 1.0 - uVignette * smoothstep(0.05, 0.5, dot(centred, centred));
			float luma = dot(colour, vec3(0.2126, 0.7152, 0.0722));
			float tooth = 4.0 * luma * (1.0 - luma);
			colour += (hash(gl_FragCoord.xy + fract(uTime) * 137.0) - 0.5) * uGrain * tooth;
			gl_FragColor = vec4(max(colour, 0.0), 1.0);
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

/* A daylight dome: bright sky above, a paler bounce off the ground, and one
   hot patch where the sun is. Enough for matte surfaces; the shadows come
   from the directional light. */
function skyEnvironment(renderer) {
	const scene = new THREE.Scene();
	const dome = new THREE.Mesh(
		new THREE.SphereGeometry(40, 32, 16),
		new THREE.MeshBasicMaterial({ color: 0xbcd2ea, side: THREE.BackSide })
	);
	scene.add(dome);
	const ground = new THREE.Mesh(
		new THREE.CircleGeometry(40, 32),
		new THREE.MeshBasicMaterial({ color: 0x8a867e, side: THREE.DoubleSide })
	);
	ground.rotation.x = -Math.PI / 2;
	scene.add(ground);
	const patch = new THREE.Mesh(
		new THREE.PlaneGeometry(14, 14),
		new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff6e6).multiplyScalar(4.2) })
	);
	patch.position.set(-16, 22, 14);
	patch.lookAt(0, 0, 0);
	scene.add(patch);

	const pmrem = new THREE.PMREMGenerator(renderer);
	pmrem.compileEquirectangularShader();
	const target = pmrem.fromScene(scene, 0.04);
	pmrem.dispose();
	scene.traverse((object) => {
		if (object.geometry) object.geometry.dispose();
		if (object.material) object.material.dispose();
	});
	return target.texture;
}

export function createSection(container, overrides = {}) {
	const config = merge(DEFAULTS, overrides);
	const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	const compact = window.matchMedia("(max-width: 820px), (pointer: coarse)").matches;
	if (compact) {
		config.shadowSize = 1024;
		config.maxPixelRatio = Math.min(config.maxPixelRatio, 1.5);
	}

	const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
	renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, config.maxPixelRatio));
	renderer.toneMapping = THREE.NeutralToneMapping;
	renderer.toneMappingExposure = config.exposure;
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFShadowMap;
	renderer.setClearColor(config.background, 1);
	renderer.domElement.style.display = "block";
	renderer.domElement.style.width = "100%";
	renderer.domElement.style.height = "100%";
	renderer.domElement.style.touchAction = "none";
	container.appendChild(renderer.domElement);

	const scene = new THREE.Scene();
	scene.background = new THREE.Color(config.background);
	scene.environment = skyEnvironment(renderer);
	scene.environmentIntensity = 0.36;

	const camera = new THREE.PerspectiveCamera(config.camera.fov, 1, 0.5, 300);

	const sun = new THREE.DirectionalLight(0xfff4e4, 3.9);
	sun.castShadow = true;
	sun.shadow.mapSize.set(config.shadowSize, config.shadowSize);
	sun.shadow.camera.near = 8;
	sun.shadow.camera.far = 90;
	sun.shadow.camera.left = -17;
	sun.shadow.camera.right = 17;
	sun.shadow.camera.top = 17;
	sun.shadow.camera.bottom = -17;
	sun.shadow.bias = -0.0009;
	sun.shadow.normalBias = 0.03;
	scene.add(sun, sun.target);

	const placeSun = (azimuth, altitude) => {
		const a = azimuth * DEG;
		const h = altitude * DEG;
		sun.position.set(Math.sin(a) * Math.cos(h) * 40, Math.sin(h) * 40, Math.cos(a) * Math.cos(h) * 40);
		sun.target.position.set(0, 0, 0);
		sun.target.updateMatrixWorld();
	};
	placeSun(config.sun.azimuth, config.sun.altitude);

	/* — materials ————————————————————————————————————————————— */
	const M = {
		board: new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.74 }),
		boardShadow: new THREE.MeshStandardMaterial({ color: 0x6f747c, roughness: 0.92 }),
		plaster: new THREE.MeshStandardMaterial({ color: 0xe8e7e2, roughness: 0.88 }),
		trim: new THREE.MeshStandardMaterial({ color: 0xf4f4f1, roughness: 0.55 }),
		joinery: new THREE.MeshStandardMaterial({ color: 0xf1f1ee, roughness: 0.42, metalness: 0.15 }),
		roof: new THREE.MeshStandardMaterial({ color: 0x25272b, roughness: 0.48, metalness: 0.42 }),
		/* Joinery glass reads as a reflection of the sky far more than as a
		   view inside, which is also how a model maker cuts it: acrylic. */
		glass: new THREE.MeshPhysicalMaterial({
			color: 0xdbe4ea,
			transmission: 0.34,
			transparent: true,
			roughness: 0.14,
			ior: 1.48,
			thickness: 0.06,
			metalness: 0,
			clearcoat: 1,
			clearcoatRoughness: 0.04,
			envMapIntensity: 2.4,
		}),
		deck: new THREE.MeshStandardMaterial({ color: 0xa39b8c, roughness: 0.82 }),
		concrete: new THREE.MeshStandardMaterial({ color: 0xbab7b1, roughness: 0.92 }),
		lawn: new THREE.MeshStandardMaterial({ color: 0x8f978a, roughness: 1 }),
		mulch: new THREE.MeshStandardMaterial({ color: 0x4b463f, roughness: 1 }),
		plinth: new THREE.MeshStandardMaterial({ color: 0xd9d6cf, roughness: 0.95 }),
		plinthEdge: new THREE.MeshStandardMaterial({ color: 0xc3bfb6, roughness: 0.95 }),
		fence: new THREE.MeshStandardMaterial({ color: 0x33353a, roughness: 0.8 }),
		fencePost: new THREE.MeshStandardMaterial({ color: 0x26282c, roughness: 0.8 }),
		trunk: new THREE.MeshStandardMaterial({ color: 0x6a6459, roughness: 0.92 }),
		blade: new THREE.MeshStandardMaterial({ color: 0x77856f, roughness: 0.9, side: THREE.DoubleSide }),
		flax: new THREE.MeshStandardMaterial({ color: 0x6d7c66, roughness: 0.9, side: THREE.DoubleSide }),
		hedge: new THREE.MeshStandardMaterial({ color: 0x707d68, roughness: 1 }),
	};

	const site = new THREE.Group();
	scene.add(site);

	const parts = [];
	const register = (object, name, note) => {
		object.userData.part = { name, note };
		parts.push(object);
		return object;
	};

	const solid = (w, h, d, material, x, y, z) => {
		const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
		mesh.position.set(x, y, z);
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		return mesh;
	};

	/* — the board —————————————————————————————————————————————
	   A presentation model sits on something. The plinth is what makes this
	   read as a model of a house rather than a house. */
	const BOARD = { width: 26, depth: 19, thickness: 0.55 };
	const plinth = new THREE.Group();
	plinth.add(solid(BOARD.width, BOARD.thickness, BOARD.depth, M.plinthEdge, 0, -BOARD.thickness / 2, 0));
	const top = solid(BOARD.width - 0.5, 0.06, BOARD.depth - 0.5, M.plinth, 0, -0.03, 0);
	plinth.add(top);
	register(plinth, "Board", "Model base, 26 × 19 m at 1:100");
	site.add(plinth);

	const lawn = solid(BOARD.width - 0.5, 0.05, BOARD.depth - 0.5, M.lawn, 0, 0.01, 0);
	lawn.castShadow = false;
	register(lawn, "Lawn", "What is left once the house and beds are set out");
	site.add(lawn);

	/* — hard landscaping ——————————————————————————————————————
	   The street runs along the southern edge; everything is set out from
	   the driveway crossing, as it is on a real section. */
	const STREET_Z = BOARD.depth / 2 - 0.25;
	const driveway = solid(3.8, 0.07, 9.4, M.concrete, -6.0, 0.045, STREET_Z - 4.7);
	driveway.castShadow = false;
	register(driveway, "Driveway", "Exposed aggregate, 3.6 m to the garage");
	site.add(driveway);

	const footpath = solid(BOARD.width - 0.5, 0.08, 1.5, M.concrete, 0, 0.05, STREET_Z + 0.95);
	footpath.castShadow = false;
	site.add(footpath);
	const kerb = solid(BOARD.width - 0.5, 0.16, 0.16, M.plinthEdge, 0, 0.08, STREET_Z + 1.78);
	site.add(kerb);
	const road = solid(BOARD.width - 0.5, 0.06, 2.4, M.plinthEdge, 0, 0.03, STREET_Z + 3.0);
	road.castShadow = false;
	site.add(road);
	register(footpath, "Street edge", "Berm, footpath and kerb");

	const path = solid(1.2, 0.07, 3.8, M.concrete, -2.6, 0.045, STREET_Z - 5.6);
	path.castShadow = false;
	site.add(path);
	const pathStep = solid(2.2, 0.07, 1.3, M.concrete, -2.6, 0.05, STREET_Z - 7.4);
	pathStep.castShadow = false;
	site.add(pathStep);
	register(path, "Path", "Front door off the driveway crossing");

	/* — the house —————————————————————————————————————————————
	   Two storeys under a gable, with a single-storey wing for the garage.
	   Walls are a dark core with board cladding hung on the faces, so the
	   window openings are holes in the boards rather than decals on them. */
	const HOUSE = {
		width: 9.4,
		depth: 7.6,
		wall: 5.5, // two storeys to the eaves
		pitch: 28,
		x: 1.6,
		z: STREET_Z - 11.4,
	};
	const ridgeRise = (HOUSE.depth / 2) * Math.tan(HOUSE.pitch * DEG);
	const house = new THREE.Group();
	house.position.set(HOUSE.x, 0, HOUSE.z);
	site.add(house);

	const core = solid(HOUSE.width - 0.06, HOUSE.wall, HOUSE.depth - 0.06, M.boardShadow, 0, HOUSE.wall / 2, 0);
	core.name = "core";
	house.add(core);

	/* Openings are given in wall-local coordinates: x from the left edge,
	   y from the floor. Ground floor sills at 0.9, first floor at 3.6. */
	const faces = [
		{
			name: "south",
			width: HOUSE.width,
			rotation: 0,
			position: [0, 0, HOUSE.depth / 2],
			openings: [
				{ x: 1.0, y: 0.75, w: 3.4, h: 2.2, mullions: 2 },
				{ x: 5.6, y: 1.1, w: 1.5, h: 1.5, mullions: 1 },
				{ x: 1.3, y: 3.75, w: 1.9, h: 1.4, mullions: 1 },
				{ x: 4.3, y: 3.75, w: 1.9, h: 1.4, mullions: 1 },
				{ x: 7.0, y: 3.75, w: 1.2, h: 1.4 },
			],
		},
		{
			name: "north",
			width: HOUSE.width,
			rotation: Math.PI,
			position: [0, 0, -HOUSE.depth / 2],
			openings: [
				{ x: 1.4, y: 0.2, w: 4.6, h: 2.5, mullions: 3 },
				{ x: 6.8, y: 1.1, w: 1.4, h: 1.5 },
				{ x: 2.0, y: 3.75, w: 2.4, h: 1.5, mullions: 1 },
				{ x: 5.6, y: 3.75, w: 1.6, h: 1.5, mullions: 1 },
			],
		},
		{
			name: "east",
			width: HOUSE.depth,
			rotation: Math.PI / 2,
			position: [HOUSE.width / 2, 0, 0],
			openings: [
				{ x: 1.4, y: 1.2, w: 0.9, h: 2.0 },
				{ x: 3.0, y: 1.2, w: 0.9, h: 2.0 },
				{ x: 2.1, y: 3.8, w: 2.2, h: 1.3, mullions: 1 },
			],
		},
		{
			name: "west",
			width: HOUSE.depth,
			rotation: -Math.PI / 2,
			position: [-HOUSE.width / 2, 0, 0],
			openings: [
				{ x: 4.6, y: 1.3, w: 1.1, h: 1.6 },
				{ x: 2.6, y: 3.9, w: 1.3, h: 1.2 },
			],
		},
	];

	const cladding = new THREE.Group();
	house.add(cladding);
	for (const face of faces) {
		const wall = new THREE.Group();
		wall.position.set(...face.position);
		wall.rotation.y = face.rotation;

		const skin = claddedWall({
			width: face.width,
			height: HOUSE.wall,
			openings: face.openings.map((o) => ({ x: o.x - face.width / 2, y: o.y, w: o.w, h: o.h })),
			material: M.board,
		});
		skin.position.z = 0.012;
		wall.add(skin);

		for (const opening of face.openings) {
			const x = opening.x - face.width / 2 + opening.w / 2;
			const y = opening.y + opening.h / 2;

			/* A white reveal around every opening: the single detail doing
			   the most work in a black-and-white house. */
			const reveal = new THREE.Group();
			const jamb = 0.07;
			reveal.add(solid(opening.w + jamb * 2, jamb, 0.1, M.trim, 0, opening.h / 2 + jamb / 2, 0));
			reveal.add(solid(opening.w + jamb * 2, jamb * 1.4, 0.14, M.trim, 0, -opening.h / 2 - jamb * 0.7, 0.01));
			reveal.add(solid(jamb, opening.h, 0.1, M.trim, -opening.w / 2 - jamb / 2, 0, 0));
			reveal.add(solid(jamb, opening.h, 0.1, M.trim, opening.w / 2 + jamb / 2, 0, 0));
			reveal.position.set(x, y, 0.03);
			wall.add(reveal);

			const unit = window3d({
				width: opening.w,
				height: opening.h,
				mullions: opening.mullions || 0,
				materials: { joinery: M.joinery, glass: M.glass },
			});
			unit.position.set(x, y, -0.02);
			wall.add(unit);
		}

		cladding.add(wall);
	}
	register(cladding, "Cladding", "Vertical shiplap, stained black, 180 mm boards");

	/* Gable ends: a triangle either side, clad the same way. */
	/* The gable fill. Its profile runs across the depth and is extruded along
	   the width, because the ridge runs parallel to the street. */
	const gableShape = new THREE.Shape();
	gableShape.moveTo(-HOUSE.depth / 2, 0);
	gableShape.lineTo(HOUSE.depth / 2, 0);
	gableShape.lineTo(0, ridgeRise);
	gableShape.closePath();
	const gableGeometry = new THREE.ExtrudeGeometry(gableShape, { depth: HOUSE.width, bevelEnabled: false });
	gableGeometry.rotateY(-Math.PI / 2);
	gableGeometry.translate(HOUSE.width / 2, HOUSE.wall, 0);
	const gables = new THREE.Mesh(gableGeometry, M.board);
	gables.name = "gables";
	gables.castShadow = true;
	gables.receiveShadow = true;
	house.add(gables);

	/* Roof: two corrugate planes on a thin deck, with eaves and barge
	   overhangs. Long eaves are half of why a house here looks like one. */
	const EAVE = 0.62;
	const BARGE = 0.35;
	/* Measured from the ridge down to the end of the eave, along the slope. */
	const slopeRun = (HOUSE.depth / 2 + EAVE) / Math.cos(HOUSE.pitch * DEG);
	const roof = new THREE.Group();
	roof.name = "roof";
	roof.position.y = HOUSE.wall + ridgeRise;
	house.add(roof);

	for (const side of [1, -1]) {
		const pitchGroup = new THREE.Group();
		pitchGroup.name = `pitch${side}`;
		pitchGroup.rotation.x = side * HOUSE.pitch * DEG; // +Z tips downward
		const centre = side * (slopeRun / 2);

		const deck = new THREE.Mesh(new THREE.BoxGeometry(HOUSE.width + BARGE * 2, 0.12, slopeRun), M.roof);
		deck.position.set(0, -0.06, centre);
		deck.castShadow = true;
		deck.receiveShadow = true;
		pitchGroup.add(deck);

		const sheet = new THREE.Mesh(corrugatedSheet({ width: HOUSE.width + BARGE * 2, run: slopeRun }), M.roof);
		sheet.position.set(0, 0.01, centre);
		sheet.castShadow = true;
		sheet.receiveShadow = true;
		pitchGroup.add(sheet);

		/* White fascia on the eave line, and a barge board down each rake. */
		const fascia = new THREE.Mesh(new THREE.BoxGeometry(HOUSE.width + BARGE * 2 + 0.08, 0.26, 0.06), M.trim);
		fascia.position.set(0, -0.19, side * (slopeRun - 0.03));
		fascia.castShadow = true;
		pitchGroup.add(fascia);

		for (const end of [-1, 1]) {
			const barge = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.26, slopeRun), M.trim);
			barge.position.set(end * (HOUSE.width / 2 + BARGE + 0.03), -0.19, centre);
			barge.castShadow = true;
			pitchGroup.add(barge);
		}

		roof.add(pitchGroup);
	}
	const ridge = solid(HOUSE.width + BARGE * 2 + 0.06, 0.09, 0.3, M.roof, 0, HOUSE.wall + ridgeRise + 0.05, 0);
	house.add(ridge);
	for (const [x, z] of [
		[HOUSE.width / 2 - 0.12, HOUSE.depth / 2 + 0.06],
		[-HOUSE.width / 2 + 0.12, HOUSE.depth / 2 + 0.06],
		[HOUSE.width / 2 - 0.12, -HOUSE.depth / 2 - 0.06],
	]) {
		const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, HOUSE.wall, 8), M.trim);
		pipe.position.set(x, HOUSE.wall / 2, z);
		pipe.castShadow = true;
		house.add(pipe);
	}
	register(roof, "Roof", "Corrugate, 28° pitch, 620 mm eaves");

	/* — the wing: garage and entry, single storey, white ——————————— */
	const WING = { width: 6.4, depth: 6.6, height: 3.2 };
	const wing = new THREE.Group();
	wing.position.set(HOUSE.x - HOUSE.width / 2 - WING.width / 2 + 0.1, 0, HOUSE.z + 0.9);
	site.add(wing);
	wing.add(solid(WING.width, WING.height, WING.depth, M.plaster, 0, WING.height / 2, 0));

	const wingRoof = solid(WING.width + 0.44, 0.14, WING.depth + 0.44, M.roof, 0, WING.height + 0.07, 0);
	wing.add(wingRoof);
	/* A thin white band on the edge of the slab, not a lid over it. */
	for (const [w, d, x, z] of [
		[WING.width + 0.56, 0.06, 0, (WING.depth + 0.5) / 2],
		[WING.width + 0.56, 0.06, 0, -(WING.depth + 0.5) / 2],
		[0.06, WING.depth + 0.56, (WING.width + 0.5) / 2, 0],
		[0.06, WING.depth + 0.56, -(WING.width + 0.5) / 2, 0],
	]) {
		wing.add(solid(w, 0.2, d, M.trim, x, WING.height + 0.16, z));
	}
	register(wing, "Wing", "Garage and entry, plastered, flat roof");

	const garageDoor = new THREE.Group();
	const panels = 5;
	for (let i = 0; i < panels; i++) {
		const panel = solid(4.6, 2.5 / panels - 0.03, 0.08, M.trim, 0, (i + 0.5) * (2.5 / panels), 0);
		garageDoor.add(panel);
	}
	garageDoor.position.set(0.2, 0, WING.depth / 2 + 0.05);
	wing.add(garageDoor);
	const doorReveal = new THREE.Group();
	doorReveal.add(solid(4.94, 0.14, 0.12, M.board, 0, 2.57, 0));
	doorReveal.add(solid(0.14, 2.6, 0.12, M.board, -2.4, 1.3, 0));
	doorReveal.add(solid(0.14, 2.6, 0.12, M.board, 2.4, 1.3, 0));
	doorReveal.position.set(0.2, 0, WING.depth / 2 + 0.01);
	wing.add(doorReveal);
	register(garageDoor, "Garage door", "Sectional, 4.6 m");

	const entry = new THREE.Group();
	entry.add(solid(1.0, 2.25, 0.08, M.board, 0, 1.125, 0));
	entry.add(solid(0.3, 2.25, 0.05, M.glass, 0.72, 1.125, 0));
	entry.position.set(WING.width / 2 - 0.02, 0, WING.depth / 2 - 1.6);
	entry.rotation.y = Math.PI / 2;
	wing.add(entry);

	/* — deck at the back ——————————————————————————————————————— */
	const deckGroup = new THREE.Group();
	deckGroup.position.set(HOUSE.x - 0.6, 0, HOUSE.z - HOUSE.depth / 2 - 2.6);
	site.add(deckGroup);
	const DECK = { width: 7.2, depth: 5.0, height: 0.42 };
	deckGroup.add(solid(DECK.width, 0.12, DECK.depth, M.deck, 0, DECK.height, 0));
	for (let i = 0; i < 2; i++) {
		deckGroup.add(solid(DECK.width * 0.45, 0.1, 0.42, M.deck, -1.2, DECK.height - 0.14 * (i + 1), DECK.depth / 2 + 0.22 + i * 0.42));
	}
	/* Boards: the gaps are what tell you it is a deck and not a slab. */
	const deckBoards = claddedWall({
		width: DECK.width,
		height: DECK.depth,
		board: 0.14,
		gap: 0.012,
		thickness: 0.03,
		material: M.deck,
	});
	deckBoards.rotation.x = -Math.PI / 2; // the board run maps to -Z, so centre it
	deckBoards.position.set(0, DECK.height + 0.075, DECK.depth / 2);
	deckGroup.add(deckBoards);
	register(deckGroup, "Deck", "Off the living room, 7.2 × 5.0 m");

	/* — boundary ——————————————————————————————————————————————— */
	const frontFence = slatFence({ length: 8.8, materials: M });
	frontFence.position.set(5.4, 0, STREET_Z - 0.4);
	site.add(frontFence);
	const sideFence = slatFence({ length: 8.4, materials: M });
	sideFence.position.set(-10.4, 0, STREET_Z - 5.0);
	sideFence.rotation.y = Math.PI / 2;
	site.add(sideFence);
	register(frontFence, "Fence", "Horizontal slats, 1.7 m");

	const letterbox = new THREE.Group();
	letterbox.add(solid(0.12, 1.0, 0.12, M.fencePost, 0, 0.5, 0));
	letterbox.add(solid(0.34, 0.26, 0.5, M.trim, 0, 1.12, 0));
	letterbox.position.set(-2.4, 0, STREET_Z - 0.5);
	site.add(letterbox);
	register(letterbox, "Letterbox", "On the boundary, as required");

	/* — planting ———————————————————————————————————————————————
	   A little garden: two beds, two cabbage trees, flax, clipped shrubs and
	   a hedge along one boundary. */
	const bedFront = solid(7.6, 0.09, 3.0, M.mulch, 4.6, 0.055, STREET_Z - 3.4);
	bedFront.castShadow = false;
	site.add(bedFront);
	const bedSide = solid(2.6, 0.09, 8.0, M.mulch, -9.2, 0.055, STREET_Z - 8.6);
	bedSide.castShadow = false;
	site.add(bedSide);
	register(bedFront, "Garden bed", "Mulched, planted in natives");

	const planting = new THREE.Group();
	site.add(planting);

	const trees = [
		[6.2, STREET_Z - 3.2, 3.9, 3],
		[3.0, STREET_Z - 4.0, 3.1, 11],
		[-9.0, STREET_Z - 12.0, 3.5, 23],
	];
	for (const [x, z, height, seed] of trees) {
		const tree = cabbageTree({ height, seed, materials: M });
		tree.position.set(x, 0.04, z);
		planting.add(tree);
	}

	const flaxes = [
		[8.0, STREET_Z - 3.8, 1.6, 5],
		[5.0, STREET_Z - 2.6, 1.35, 9],
		[-9.4, STREET_Z - 6.4, 1.5, 13],
		[-9.0, STREET_Z - 9.6, 1.25, 17],
		[7.2, STREET_Z - 12.8, 1.45, 29],
	];
	for (const [x, z, height, seed] of flaxes) {
		const clump = flax({ height, seed, materials: M });
		clump.position.set(x, 0.04, z);
		planting.add(clump);
	}

	const shrubs = [
		[2.0, STREET_Z - 2.8, 0.55, 7],
		[3.6, STREET_Z - 2.4, 0.42, 19],
		[9.0, STREET_Z - 2.9, 0.5, 31],
		[-9.3, STREET_Z - 4.4, 0.46, 37],
		[-1.2, STREET_Z - 8.2, 0.38, 41],
		[0.2, STREET_Z - 8.4, 0.34, 43],
	];
	for (const [x, z, radius, seed] of shrubs) {
		const bush = shrub({ radius, seed, material: M.hedge });
		bush.position.set(x, radius * 0.72, z);
		planting.add(bush);
	}

	const hedge = solid(0.85, 1.0, 8.0, M.hedge, 11.7, 0.5, STREET_Z - 8.6);
	planting.add(hedge);
	register(planting, "Planting", "Cabbage trees, flax, clipped natives");

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
	const grade = new ShaderPass(GRADE);
	grade.uniforms.uGrain.value = config.post.grain;
	grade.uniforms.uVignette.value = config.post.vignette;
	composer.addPass(grade);

	/* — turntable ——————————————————————————————————————————————
	   A model is looked at by walking around it, so drag turns the section
	   rather than flying the camera. */
	const pointer = { active: false, id: null, x: 0, y: 0, inside: false };
	const spin = { yaw: 0.35, tilt: 0, yawVelocity: 0, tiltVelocity: 0 };
	const raycaster = new THREE.Raycaster();
	const pointerNdc = new THREE.Vector2();
	const hoverPoint = new THREE.Vector3();
	let hovered = null;
	let onHover = null;
	let onHoverMove = null;

	const setHover = (object) => {
		if (hovered === object) return;
		hovered = object;
		if (onHover) onHover(object ? object.userData.part : null);
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
		spin.tiltVelocity += (event.clientY - pointer.y) * config.motion.drag * 0.45;
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
		const pull = THREE.MathUtils.clamp(1 / camera.aspect, 1, 1.6);
		camera.position.set(0, config.camera.height * pull, config.camera.distance * pull);
		camera.lookAt(-1.6, 2.4, 0);
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

	const tick = () => {
		frame = requestAnimationFrame(tick);
		timer.update();
		const dt = Math.min(timer.getDelta(), 0.05);
		const time = timer.getElapsed();

		if (!reduceMotion) {
			spin.yaw += spin.yawVelocity + dt * config.spin;
			spin.tilt += spin.tiltVelocity;
			spin.yawVelocity *= config.motion.damping;
			spin.tiltVelocity *= config.motion.damping;
			spin.tilt = THREE.MathUtils.clamp(spin.tilt, -0.32, 0.5);
			site.rotation.y = spin.yaw;
			site.rotation.x = spin.tilt * 0.35;
			grade.uniforms.uTime.value = time;
		}

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
		site,
		materials: M,
		parts,
		post: { bloom, grade },
		setSun(azimuth, altitude) {
			placeSun(azimuth, altitude ?? config.sun.altitude);
		},
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
			composer.dispose();
			renderer.dispose();
			renderer.domElement.remove();
		},
	};
}
