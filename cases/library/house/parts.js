/* Section 01 — the parts a New Zealand house is actually made of.

   A "section" is what a residential lot is called here, which is what this
   model is: a house on its section, at 1:100, on a board.

   Everything is generated. The pieces below are the ones that carry the
   local character — vertical board cladding with its shadow gaps, corrugate
   roofing, a slatted boundary fence, and the two plants you cannot drive a
   suburban street here without seeing: cabbage trees and flax. */

import * as THREE from "three";

const TAU = Math.PI * 2;

/* — cladding ————————————————————————————————————————————————————
   Vertical shiplap. What reads at a distance is not the boards, it is the
   shadow gap between them, so each board is inset and spaced rather than
   drawn as a texture. Openings are cut by splitting each board column into
   the vertical runs the windows leave behind. */

export function claddedWall({
	width,
	height,
	board = 0.18,
	gap = 0.012,
	thickness = 0.022,
	openings = [],
	material,
}) {
	const runs = [];
	const columns = Math.max(1, Math.round(width / board));
	const pitch = width / columns;

	for (let i = 0; i < columns; i++) {
		const x = -width / 2 + (i + 0.5) * pitch;
		const left = x - pitch / 2;
		const right = x + pitch / 2;

		/* Intervals this column must skip, in wall-local Y from the bottom. */
		const blocked = openings
			.filter((o) => o.x < right && o.x + o.w > left)
			.map((o) => [o.y, o.y + o.h])
			.sort((a, b) => a[0] - b[0]);

		let cursor = 0;
		for (const [from, to] of blocked) {
			if (from > cursor) runs.push([x, cursor, from]);
			cursor = Math.max(cursor, to);
		}
		if (cursor < height) runs.push([x, cursor, height]);
	}

	const geometry = new THREE.BoxGeometry(1, 1, thickness);
	const mesh = new THREE.InstancedMesh(geometry, material, runs.length);
	const matrix = new THREE.Matrix4();
	const scale = new THREE.Vector3();
	const position = new THREE.Vector3();
	const quaternion = new THREE.Quaternion();

	runs.forEach(([x, from, to], index) => {
		const span = to - from;
		/* Timber is never perfectly flat; a fraction of a millimetre of
		   variation is what stops a wall reading as a single flat plane. */
		const jitter = 1 + ((index * 37) % 11) / 900;
		scale.set(pitch - gap, span, jitter);
		position.set(x, from + span / 2, 0);
		matrix.compose(position, quaternion, scale);
		mesh.setMatrixAt(index, matrix);
	});

	mesh.instanceMatrix.needsUpdate = true;
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	return mesh;
}

/* — roofing ——————————————————————————————————————————————————————
   Corrugate, running down the slope the way it is laid. The sheet sits on a
   thin deck so the underside reads as a soffit rather than as the back of a
   single surface. */

export function corrugatedSheet({ width, run, wave = 0.076, depth = 0.011, segments = null }) {
	const ribs = Math.max(8, Math.round(width / wave));
	const geometry = new THREE.PlaneGeometry(width, run, segments || ribs * 3, 1);
	const position = geometry.attributes.position;

	for (let i = 0; i < position.count; i++) {
		const x = position.getX(i);
		position.setZ(i, Math.cos((x / wave) * TAU) * depth);
	}

	geometry.computeVertexNormals();
	geometry.rotateX(-Math.PI / 2);
	return geometry;
}

/* — joinery ———————————————————————————————————————————————————————
   Aluminium joinery: a frame, a sill, and glass set back in the reveal.
   Returning a group keeps the reveal depth in one place. */

export function window3d({ width, height, frame = 0.055, mullions = 0, materials }) {
	const group = new THREE.Group();
	const { joinery, glass } = materials;

	const bar = (w, h, x, y, d = 0.07) => {
		const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), joinery);
		mesh.position.set(x, y, 0);
		mesh.castShadow = true;
		return mesh;
	};

	group.add(bar(width, frame, 0, height / 2 - frame / 2));
	group.add(bar(width, frame, 0, -height / 2 + frame / 2));
	group.add(bar(frame, height - frame * 2, -width / 2 + frame / 2, 0));
	group.add(bar(frame, height - frame * 2, width / 2 - frame / 2, 0));

	for (let i = 1; i <= mullions; i++) {
		const x = -width / 2 + (width / (mullions + 1)) * i;
		group.add(bar(frame * 0.7, height - frame * 2, x, 0));
	}

	const pane = new THREE.Mesh(new THREE.BoxGeometry(width - frame * 1.6, height - frame * 1.6, 0.012), glass);
	pane.position.z = -0.022;
	group.add(pane);

	return group;
}

/* — fence ————————————————————————————————————————————————————————
   Horizontal slats on posts: the boundary treatment on half the streets in
   any new subdivision here. */

export function slatFence({ length, height = 1.7, slat = 0.09, gap = 0.035, materials }) {
	const group = new THREE.Group();
	const rows = Math.floor(height / (slat + gap));
	const slats = new THREE.InstancedMesh(
		new THREE.BoxGeometry(length, slat, 0.028),
		materials.fence,
		rows
	);
	const matrix = new THREE.Matrix4();
	for (let i = 0; i < rows; i++) {
		matrix.makeTranslation(0, (i + 0.6) * (slat + gap), 0);
		slats.setMatrixAt(i, matrix);
	}
	slats.instanceMatrix.needsUpdate = true;
	slats.castShadow = true;
	slats.receiveShadow = true;
	group.add(slats);

	const posts = Math.max(2, Math.round(length / 2.2));
	for (let i = 0; i <= posts; i++) {
		const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, height + 0.06, 0.09), materials.fencePost);
		post.position.set(-length / 2 + (length / posts) * i, (height + 0.06) / 2, 0);
		post.castShadow = true;
		group.add(post);
	}
	return group;
}

/* — planting ——————————————————————————————————————————————————————
   Two plants do most of the work of saying where this is. A cabbage tree —
   tī kōuka — is a bare trunk that forks into tufts of blades; flax —
   harakeke — is a fan of blades springing from the ground. Both are drawn
   the way a model maker would: enough blades to read, not one more. */

export function cabbageTree({ height = 3.4, seed = 1, materials }) {
	const group = new THREE.Group();
	let state = seed >>> 0;
	const random = () => {
		state = (state * 1664525 + 1013904223) >>> 0;
		return state / 4294967296;
	};

	const trunkHeight = height * 0.62;
	const trunk = new THREE.Mesh(
		new THREE.CylinderGeometry(height * 0.026, height * 0.042, trunkHeight, 9),
		materials.trunk
	);
	trunk.position.y = trunkHeight / 2;
	trunk.castShadow = true;
	group.add(trunk);

	const heads = 2 + Math.floor(random() * 3);
	for (let h = 0; h < heads; h++) {
		const head = new THREE.Group();
		const lean = 0.22 + random() * 0.3;
		const around = (h / heads) * TAU + random();
		const branchLength = height * (0.12 + random() * 0.1);

		const branch = new THREE.Mesh(
			new THREE.CylinderGeometry(height * 0.016, height * 0.024, branchLength, 7),
			materials.trunk
		);
		branch.position.y = branchLength / 2;
		branch.castShadow = true;
		head.add(branch);

		const blades = 13 + Math.floor(random() * 7);
		const bladeGeometry = new THREE.ConeGeometry(height * 0.019, height * (0.26 + random() * 0.08), 4, 1, true);
		const crown = new THREE.InstancedMesh(bladeGeometry, materials.blade, blades);
		const matrix = new THREE.Matrix4();
		const euler = new THREE.Euler();
		const quaternion = new THREE.Quaternion();
		const position = new THREE.Vector3();
		const scale = new THREE.Vector3(1, 1, 1);
		for (let i = 0; i < blades; i++) {
			const droop = 0.5 + random() * 0.85;
			const spin = (i / blades) * TAU + random() * 0.4;
			euler.set(droop, spin, 0, "YXZ");
			quaternion.setFromEuler(euler);
			position.set(0, branchLength, 0).add(
				new THREE.Vector3(0, Math.cos(droop), 0).multiplyScalar(height * 0.12)
			);
			scale.setScalar(0.85 + random() * 0.4);
			matrix.compose(position, quaternion, scale);
			crown.setMatrixAt(i, matrix);
		}
		crown.instanceMatrix.needsUpdate = true;
		crown.castShadow = true;
		head.add(crown);

		head.position.y = trunkHeight;
		head.rotation.set(lean * Math.cos(around), 0, lean * Math.sin(around));
		group.add(head);
	}

	return group;
}

export function flax({ height = 1.5, seed = 1, materials }) {
	let state = seed >>> 0;
	const random = () => {
		state = (state * 1664525 + 1013904223) >>> 0;
		return state / 4294967296;
	};

	const blades = 16 + Math.floor(random() * 8);
	const geometry = new THREE.ConeGeometry(height * 0.06, height, 3, 1, true);
	const mesh = new THREE.InstancedMesh(geometry, materials.flax, blades);
	const matrix = new THREE.Matrix4();
	const euler = new THREE.Euler();
	const quaternion = new THREE.Quaternion();
	const position = new THREE.Vector3();
	const scale = new THREE.Vector3();

	for (let i = 0; i < blades; i++) {
		const spin = random() * TAU;
		const splay = 0.12 + random() * 0.5;
		const tall = 0.55 + random() * 0.65;
		euler.set(splay, spin, 0, "YXZ");
		quaternion.setFromEuler(euler);
		position.set(Math.cos(spin) * 0.06, (height * tall) / 2, Math.sin(spin) * 0.06);
		scale.set(0.8 + random() * 0.5, tall, 0.5);
		matrix.compose(position, quaternion, scale);
		mesh.setMatrixAt(i, matrix);
	}

	mesh.instanceMatrix.needsUpdate = true;
	mesh.castShadow = true;
	return mesh;
}

/* A clipped shrub: the other half of every front garden here. */
export function shrub({ radius = 0.5, seed = 1, material }) {
	const geometry = new THREE.IcosahedronGeometry(radius, 2);
	const position = geometry.attributes.position;
	let state = seed >>> 0;
	const random = () => {
		state = (state * 1664525 + 1013904223) >>> 0;
		return state / 4294967296;
	};
	const v = new THREE.Vector3();
	for (let i = 0; i < position.count; i++) {
		v.fromBufferAttribute(position, i);
		v.multiplyScalar(0.9 + random() * 0.2);
		v.y *= 0.82;
		position.setXYZ(i, v.x, v.y, v.z);
	}
	geometry.computeVertexNormals();
	const mesh = new THREE.Mesh(geometry, material);
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	return mesh;
}

/* — light, after dark ————————————————————————————————————————————
   At model scale the fixtures matter less than what they throw. Three cheap
   pieces do the work: a visible cone of light, a pool on the ground, and a
   lens that glows. None of them are lights — they are geometry that reads as
   light, which is what keeps a dozen fittings affordable. */

const GLOW_VERTEX = /* glsl */ `
	varying vec2 vUv;
	varying vec3 vLocal;
	void main() {
		vUv = uv;
		vLocal = position;
		gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	}
`;

/* A beam: bright at the fitting, gone by the time it lands. The cone is open
   at the wide end so you never see a lid on the light. */
export function lightCone({ radius = 0.6, height = 1.8, colour = 0xffd9a0, strength = 0.5 } = {}) {
	const geometry = new THREE.ConeGeometry(radius, height, 24, 1, true);
	geometry.translate(0, -height / 2, 0); // apex at the origin, opening downward
	const material = new THREE.ShaderMaterial({
		uniforms: {
			uColour: { value: new THREE.Color(colour) },
			uStrength: { value: strength },
			uHeight: { value: height },
		},
		vertexShader: GLOW_VERTEX,
		fragmentShader: /* glsl */ `
			uniform vec3 uColour;
			uniform float uStrength;
			uniform float uHeight;
			varying vec3 vLocal;
			void main() {
				/* Fade along the beam, and again towards its edge, so the cone
				   has no rim to give itself away. */
				float along = clamp(-vLocal.y / uHeight, 0.0, 1.0);
				float fall = pow(1.0 - along, 2.2);
				float edge = 1.0 - pow(clamp(length(vLocal.xz) / (uHeight * 0.36), 0.0, 1.0), 2.0);
				gl_FragColor = vec4(uColour, fall * edge * uStrength);
			}
		`,
		transparent: true,
		blending: THREE.AdditiveBlending,
		depthWrite: false,
		side: THREE.DoubleSide,
	});
	return new THREE.Mesh(geometry, material);
}

/* The pool a fitting leaves on the ground or up a wall. */
export function lightPool({ radius = 0.8, colour = 0xffd9a0, strength = 0.45 } = {}) {
	const geometry = new THREE.CircleGeometry(radius, 32);
	geometry.rotateX(-Math.PI / 2);
	const material = new THREE.ShaderMaterial({
		uniforms: {
			uColour: { value: new THREE.Color(colour) },
			uStrength: { value: strength },
		},
		vertexShader: GLOW_VERTEX,
		fragmentShader: /* glsl */ `
			uniform vec3 uColour;
			uniform float uStrength;
			varying vec2 vUv;
			void main() {
				float d = length(vUv - 0.5) * 2.0;
				float fall = pow(1.0 - clamp(d, 0.0, 1.0), 2.4);
				gl_FragColor = vec4(uColour, fall * uStrength);
			}
		`,
		transparent: true,
		blending: THREE.AdditiveBlending,
		depthWrite: false,
	});
	return new THREE.Mesh(geometry, material);
}
