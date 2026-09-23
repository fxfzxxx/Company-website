/* Case library art.
   Every image the concept sites show is painted here, from seeded noise, and
   rendered to JPEG once by tools/render-case-art.mjs. Nothing is photographed
   and nothing is downloaded: the same seed always paints the same picture.

   A piece is a function (ctx, w, h, r) where r is a seeded random source. The
   manifest at the bottom says which piece lands in which file, at what size. */

(function () {
	/* — seeded helpers ——————————————————————————————————————————————— */

	const mulberry = (seed) => () => {
		seed |= 0;
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};

	const makeNoise = (r) => {
		const p = new Uint8Array(512);
		const base = [...Array(256).keys()];
		for (let i = 255; i > 0; i--) {
			const j = Math.floor(r() * (i + 1));
			[base[i], base[j]] = [base[j], base[i]];
		}
		for (let i = 0; i < 512; i++) p[i] = base[i & 255];
		const grad = (h, x, y) => {
			const g = h & 7;
			const u = g < 4 ? x : y;
			const v = g < 4 ? y : x;
			return (g & 1 ? -u : u) + (g & 2 ? -2 * v : 2 * v);
		};
		const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
		const lerp = (a, b, t) => a + (b - a) * t;
		const n2 = (x, y) => {
			const X = Math.floor(x) & 255;
			const Y = Math.floor(y) & 255;
			x -= Math.floor(x);
			y -= Math.floor(y);
			const u = fade(x);
			const v = fade(y);
			const a = p[X] + Y;
			const b = p[X + 1] + Y;
			return (
				lerp(
					lerp(grad(p[a], x, y), grad(p[b], x - 1, y), u),
					lerp(grad(p[a + 1], x, y - 1), grad(p[b + 1], x - 1, y - 1), u),
					v
				) * 0.25
			);
		};
		const fbm = (x, y, oct = 5, lac = 2, gain = 0.5) => {
			let s = 0;
			let a = 0.5;
			let f = 1;
			for (let i = 0; i < oct; i++) {
				s += a * n2(x * f, y * f);
				f *= lac;
				a *= gain;
			}
			return s;
		};
		return { n2, fbm };
	};

	const hex = (h) => {
		const n = parseInt(h.slice(1), 16);
		return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
	};
	const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
	const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
	const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
	const smooth = (a, b, v) => {
		const t = clamp((v - a) / (b - a));
		return t * t * (3 - 2 * t);
	};

	/* Evaluate a multi-stop palette at t. */
	const ramp = (stops, t) => {
		t = clamp(t);
		for (let i = 1; i < stops.length; i++) {
			if (t <= stops[i][0]) {
				const [t0, c0] = stops[i - 1];
				const [t1, c1] = stops[i];
				return mix(hex(c0), hex(c1), (t - t0) / (t1 - t0 || 1));
			}
		}
		return hex(stops[stops.length - 1][1]);
	};

	const vGrad = (ctx, w, h, stops, y0 = 0, y1 = h) => {
		const g = ctx.createLinearGradient(0, y0, 0, y1);
		stops.forEach(([t, c]) => g.addColorStop(t, c));
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, w, h);
	};

	const glow = (ctx, x, y, rad, color, alpha = 1) => {
		const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
		const c = hex(color);
		g.addColorStop(0, rgba(c, alpha));
		g.addColorStop(0.35, rgba(c, alpha * 0.35));
		g.addColorStop(1, rgba(c, 0));
		ctx.fillStyle = g;
		ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
	};

	/* Per-pixel pass through ImageData: fn(x, y, [r,g,b]) -> [r,g,b]. */
	const shade = (ctx, w, h, fn, step = 1) => {
		const img = ctx.getImageData(0, 0, w, h);
		const d = img.data;
		for (let y = 0; y < h; y += step) {
			for (let x = 0; x < w; x += step) {
				const i = (y * w + x) * 4;
				const out = fn(x, y, [d[i], d[i + 1], d[i + 2]]);
				d[i] = out[0];
				d[i + 1] = out[1];
				d[i + 2] = out[2];
				d[i + 3] = 255;
			}
		}
		ctx.putImageData(img, 0, 0);
	};

	/* Film grain and a soft vignette: the finish every piece shares. */
	const finish = (ctx, w, h, r, { grain = 10, vignette = 0.35 } = {}) => {
		const img = ctx.getImageData(0, 0, w, h);
		const d = img.data;
		const cx = w / 2;
		const cy = h / 2;
		const maxD = Math.hypot(cx, cy);
		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				const i = (y * w + x) * 4;
				const n = (r() - 0.5) * grain;
				const v = 1 - vignette * Math.pow(Math.hypot(x - cx, y - cy) / maxD, 2.2);
				d[i] = clamp((d[i] + n) * v, 0, 255);
				d[i + 1] = clamp((d[i + 1] + n) * v, 0, 255);
				d[i + 2] = clamp((d[i + 2] + n) * v, 0, 255);
			}
		}
		ctx.putImageData(img, 0, 0);
	};

	/* A ridge line built from fBm: returns y for each x. */
	const ridge = (noise, w, base, amp, freq, seed, sharp = false) => {
		const ys = new Float32Array(w + 1);
		for (let x = 0; x <= w; x++) {
			let n = noise.fbm(x * freq + seed, seed * 0.37, 5);
			if (sharp) n = 0.5 - Math.abs(n);
			ys[x] = base - n * amp;
		}
		return ys;
	};

	const fillRidge = (ctx, w, h, ys, fill) => {
		ctx.beginPath();
		ctx.moveTo(0, h);
		for (let x = 0; x <= w; x++) ctx.lineTo(x, ys[x]);
		ctx.lineTo(w, h);
		ctx.closePath();
		ctx.fillStyle = fill;
		ctx.fill();
	};

	/* — landscapes (Ishq Escape, Starlight Kingdom) ———————————————————— */

	/* Layered atmospheric landscape. opts: sky stops, sun, layers, water,
	   haze colour, trees, arches. */
	const landscape = (ctx, w, h, r, o) => {
		const noise = makeNoise(r);
		vGrad(ctx, w, h, o.sky, 0, h * (o.horizon ?? 0.62));
		if (o.stars) stars(ctx, w, h * 0.6, r, o.stars);
		if (o.sun) {
			const [sx, sy, sr, sc] = o.sun;
			glow(ctx, sx * w, sy * h, sr * w * 5, sc, 0.55);
			glow(ctx, sx * w, sy * h, sr * w * 1.8, sc, 0.8);
			ctx.fillStyle = o.sunCore || "#fff6e8";
			ctx.beginPath();
			ctx.arc(sx * w, sy * h, sr * w, 0, Math.PI * 2);
			ctx.fill();
		}
		if (o.clouds) {
			const cHex = hex(o.clouds);
			shade(ctx, w, h, (x, y, c) => {
				if (y > h * 0.62) return c;
				const n = noise.fbm(x / w * 3.2, y / h * 11, 5);
				const a = smooth(0.05, 0.4, n) * 0.55 * (1 - y / (h * 0.62));
				return mix(c, cHex, a);
			});
		}
		const layers = o.layers;
		const horizon = (o.horizon ?? 0.62) * h;
		let lastYs = null;
		layers.forEach((L, i) => {
			const ys = ridge(noise, w, L.base * h, L.amp * h, L.freq / w, 11 + i * 17, L.sharp);
			fillRidge(ctx, w, h, ys, L.color);
			if (L.haze) {
				const g = ctx.createLinearGradient(0, L.base * h - L.amp * h, 0, L.base * h + h * 0.12);
				g.addColorStop(0, rgba(hex(o.haze), 0));
				g.addColorStop(1, rgba(hex(o.haze), L.haze));
				ctx.save();
				ctx.globalCompositeOperation = "source-atop";
				ctx.fillStyle = g;
				ctx.fillRect(0, 0, w, h);
				ctx.restore();
			}
			if (L.trees) trees(ctx, w, ys, r, L.trees, L.color);
			lastYs = ys;
		});
		if (o.arches) arches(ctx, w, h, o.arches);
		if (o.water) {
			const wy = o.water.y * h;
			// reflect the upper frame into the water band, rippled
			const src = ctx.getImageData(0, 0, w, h);
			const dst = ctx.getImageData(0, 0, w, h);
			const tint = hex(o.water.tint);
			for (let y = Math.floor(wy); y < h; y++) {
				const depth = (y - wy) / (h - wy);
				for (let x = 0; x < w; x++) {
					const off = noise.n2(x * 0.004, y * 0.09) * 26 * (0.3 + depth);
					const sy = clamp(Math.round(2 * wy - y + off), 0, h - 1);
					const si = (sy * w + x) * 4;
					const di = (y * w + x) * 4;
					const c = mix([src.data[si], src.data[si + 1], src.data[si + 2]], tint, 0.35 + depth * 0.45);
					dst.data[di] = c[0];
					dst.data[di + 1] = c[1];
					dst.data[di + 2] = c[2];
				}
			}
			ctx.putImageData(dst, 0, 0);
			// glints on the water under the sun
			if (o.sun) {
				const [sx] = o.sun;
				for (let i = 0; i < 900; i++) {
					const y = wy + Math.pow(r(), 1.6) * (h - wy);
					const spread = 0.02 + (y - wy) / (h - wy) * 0.16;
					const x = (sx + (r() - 0.5) * spread * 2) * w;
					ctx.fillStyle = rgba(hex(o.sunCore || "#fff3dc"), 0.25 + r() * 0.5);
					ctx.fillRect(x, y, 4 + r() * 22 * (1 + (y - wy) / (h - wy)), 1.2);
				}
			}
			ctx.fillStyle = rgba(hex(o.haze), 0.18);
			ctx.fillRect(0, wy - 1, w, 2);
		}
		if (o.pool) poolEdge(ctx, w, h, o.pool);
		if (o.palms) {
			o.palms.forEach(([px, py, ph]) => {
				palm(ctx, px * w, py * h, ph * h, mulberry(Math.floor(px * 1000)), "#1c1320");
			});
		}
	};

	const palm = (ctx, x, y, hgt, r, color) => {
		ctx.fillStyle = color;
		ctx.strokeStyle = color;
		ctx.lineWidth = hgt * 0.05;
		const lean = (r() - 0.5) * hgt * 0.5;
		ctx.beginPath();
		ctx.moveTo(x, y + 4);
		ctx.quadraticCurveTo(x + lean * 0.2, y - hgt * 0.6, x + lean, y - hgt);
		ctx.stroke();
		const tx = x + lean;
		const ty = y - hgt;
		for (let f = 0; f < 11; f++) {
			const a = -Math.PI / 2 + (f / 10 - 0.5) * Math.PI * 1.9 + (r() - 0.5) * 0.2;
			const len = hgt * (0.4 + r() * 0.18);
			const droop = len * (0.25 + Math.abs(Math.cos(a)) * 0.3);
			const ex = tx + Math.cos(a) * len;
			const ey = ty + Math.sin(a) * len * 0.6 + droop;
			const mx = tx + Math.cos(a) * len * 0.5;
			const my = ty + Math.sin(a) * len * 0.5 - len * 0.1;
			const nx = -Math.sin(a) * hgt * 0.05;
			const ny = Math.cos(a) * hgt * 0.05;
			ctx.beginPath();
			ctx.moveTo(tx, ty);
			ctx.quadraticCurveTo(mx + nx, my + ny, ex, ey);
			ctx.quadraticCurveTo(mx - nx, my - ny, tx, ty);
			ctx.fill();
		}
	};

	const trees = (ctx, w, ys, r, t, color) => {
		ctx.fillStyle = color;
		const count = Math.floor(w / t.spacing);
		for (let i = 0; i < count; i++) {
			const x = (i + r() * 0.9) * t.spacing;
			const y = ys[Math.min(w, Math.max(0, Math.floor(x)))];
			const hgt = t.height * (0.6 + r() * 0.8);
			if (t.kind === "palm") {
				palm(ctx, x, y, hgt, r, color);
			} else {
				// conifer: stacked soft triangles
				const wdt = hgt * 0.28;
				ctx.beginPath();
				ctx.moveTo(x, y - hgt);
				for (let k = 0; k <= 6; k++) {
					const yy = y - hgt + (hgt * k) / 6;
					const ww = wdt * (k / 6) * (k % 2 ? 0.75 : 1);
					ctx.lineTo(x + ww, yy);
				}
				for (let k = 6; k >= 0; k--) {
					const yy = y - hgt + (hgt * k) / 6;
					const ww = wdt * (k / 6) * (k % 2 ? 0.75 : 1);
					ctx.lineTo(x - ww, yy);
				}
				ctx.closePath();
				ctx.fill();
				ctx.fillRect(x - 1.5, y - 2, 3, 8);
			}
		}
	};

	const arches = (ctx, w, h, a) => {
		ctx.fillStyle = a.color;
		const baseY = a.y * h;
		const aw = a.width * w;
		const x0 = a.x * w;
		// a colonnade: wall with round-arched openings
		ctx.beginPath();
		ctx.rect(x0, baseY - a.height * h, aw, a.height * h + h);
		const n = a.count;
		const bay = aw / n;
		for (let i = 0; i < n; i++) {
			const ox = x0 + i * bay + bay * 0.2;
			const ow = bay * 0.6;
			const top = baseY - a.height * h * 0.78;
			ctx.moveTo(ox, baseY + 2);
			ctx.lineTo(ox, top + ow / 2);
			ctx.arc(ox + ow / 2, top + ow / 2, ow / 2, Math.PI, 0);
			ctx.lineTo(ox + ow, baseY + 2);
			ctx.closePath();
		}
		ctx.fill("evenodd");
		if (a.dome) {
			ctx.beginPath();
			ctx.arc(x0 + aw * a.dome, baseY - a.height * h, aw * 0.11, Math.PI, 0);
			ctx.fill();
			ctx.fillRect(x0 + aw * a.dome - 2, baseY - a.height * h - aw * 0.11 - 26, 4, 28);
		}
	};

	/* Infinity-pool lip across the foreground: stone edge and a still band. */
	const poolEdge = (ctx, w, h, p) => {
		const y = p.y * h;
		const g = ctx.createLinearGradient(0, y, 0, h);
		g.addColorStop(0, p.water[0]);
		g.addColorStop(1, p.water[1]);
		ctx.fillStyle = g;
		ctx.fillRect(0, y, w, h - y);
		ctx.fillStyle = p.stone;
		ctx.fillRect(0, y - h * 0.008, w, h * 0.012);
		ctx.fillStyle = "rgba(255,255,255,0.25)";
		ctx.fillRect(0, y - h * 0.008, w, 1.5);
	};

	const stars = (ctx, w, h, r, n) => {
		for (let i = 0; i < n; i++) {
			const x = r() * w;
			const y = Math.pow(r(), 1.4) * h;
			const s = Math.pow(r(), 6) * 2.4 + 0.4;
			ctx.fillStyle = `rgba(255,${240 + r() * 15},${220 + r() * 35},${0.35 + r() * 0.65})`;
			ctx.beginPath();
			ctx.arc(x, y, s, 0, Math.PI * 2);
			ctx.fill();
			if (s > 2) glow(ctx, x, y, s * 7, "#cfe0ff", 0.35);
		}
	};

	const milkyWay = (ctx, w, h, r, noise, tilt = -0.35) => {
		shade(ctx, w, h, (x, y, c) => {
			const u = (x / w - 0.5) * Math.cos(tilt) - (y / h - 0.35) * Math.sin(tilt);
			const v = (x / w - 0.5) * Math.sin(tilt) + (y / h - 0.35) * Math.cos(tilt);
			const band = Math.exp(-(v * v) / 0.012);
			const n = noise.fbm(u * 6 + 3, v * 14, 6);
			const dust = smooth(-0.1, 0.35, n);
			const a = band * (0.2 + dust * 0.55);
			return mix(c, [214, 206, 255], a * 0.55);
		});
		for (let i = 0; i < 2200; i++) {
			const u = (r() - 0.5) * 1.6;
			const v = (r() + r() + r() - 1.5) * 0.09;
			const x = (0.5 + u * Math.cos(tilt) + v * Math.sin(tilt)) * w;
			const y = (0.35 - u * Math.sin(tilt) + v * Math.cos(tilt)) * h;
			ctx.fillStyle = `rgba(255,255,255,${r() * 0.7})`;
			ctx.fillRect(x, y, 1.1, 1.1);
		}
	};

	/* A fairy-tale skyline of spires, drawn as one silhouette. */
	const castle = (ctx, w, h, c) => {
		ctx.fillStyle = c.color;
		const bx = c.x * w;
		const by = c.y * h;
		const s = c.scale * h;
		const tower = (x, top, tw, cap) => {
			ctx.fillRect(bx + x * s - (tw * s) / 2, by - top * s, tw * s, top * s + h);
			ctx.beginPath();
			ctx.moveTo(bx + x * s - (tw * s) / 2 - tw * s * 0.18, by - top * s);
			ctx.lineTo(bx + x * s, by - (top + cap) * s);
			ctx.lineTo(bx + x * s + (tw * s) / 2 + tw * s * 0.18, by - top * s);
			ctx.fill();
			ctx.fillRect(bx + x * s - 1, by - (top + cap + 0.06) * s, 2, 0.08 * s);
		};
		ctx.fillRect(bx - 0.9 * s, by - 0.28 * s, 1.8 * s, h);
		tower(-0.78, 0.46, 0.12, 0.22);
		tower(-0.52, 0.62, 0.14, 0.3);
		tower(-0.26, 0.5, 0.1, 0.24);
		tower(0, 0.92, 0.2, 0.46);
		tower(0.24, 0.56, 0.11, 0.28);
		tower(0.5, 0.7, 0.15, 0.34);
		tower(0.8, 0.42, 0.12, 0.2);
		// lit windows
		if (c.windows) {
			const r = mulberry(99);
			for (let i = 0; i < 60; i++) {
				const x = bx + (r() - 0.5) * 1.6 * s;
				const y = by - r() * 0.7 * s;
				ctx.fillStyle = rgba(hex(c.windows), 0.5 + r() * 0.5);
				ctx.fillRect(x, y, s * 0.012, s * 0.022);
			}
			ctx.fillStyle = c.color;
		}
	};

	const firework = (ctx, x, y, rad, color, r) => {
		const c = hex(color);
		glow(ctx, x, y, rad * 1.6, color, 0.22);
		const n = 70 + Math.floor(r() * 40);
		for (let i = 0; i < n; i++) {
			const a = (i / n) * Math.PI * 2 + r() * 0.05;
			const len = rad * (0.75 + r() * 0.25);
			const segs = 14;
			for (let k = 0; k < segs; k++) {
				const t = k / segs;
				const px = x + Math.cos(a) * len * t;
				const py = y + Math.sin(a) * len * t + t * t * rad * 0.25;
				ctx.fillStyle = rgba(mix(c, [255, 255, 255], 1 - t), t * 0.9);
				ctx.fillRect(px, py, 1.6, 1.6);
			}
		}
	};

	/* — fabric (Velvet Atelier) ——————————————————————————————————————— */

	/* Draped cloth: a height field of travelling folds, lit from one side.
	   Velvet gets a sheen at grazing angles; silk gets tight speculars. */
	const fabric = (ctx, w, h, r, o) => {
		const noise = makeNoise(r);
		const folds = o.folds || 7;
		const img = ctx.createImageData(w, h);
		const d = img.data;
		const light = [Math.cos(o.lightA ?? -0.8), Math.sin(o.lightA ?? -0.8), 0.9];
		const ll = Math.hypot(...light);
		light.forEach((v, i) => (light[i] = v / ll));
		const hf = (x, y) => {
			const u = x / w;
			const v = y / h;
			const warp = noise.fbm(u * 1.6, v * 1.6, 4) * (o.warp ?? 1.4);
			const t = (u * Math.cos(o.angle) + v * Math.sin(o.angle)) * folds + warp;
			const f = Math.sin(t * Math.PI * 2) * 0.5 + Math.sin(t * Math.PI * 4.1 + 1.3) * 0.18;
			return f + noise.fbm(u * 5, v * 5, 3) * 0.25;
		};
		const e = 1.5;
		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				const hx = (hf(x + e, y) - hf(x - e, y)) * (w / 90);
				const hy = (hf(x, y + e) - hf(x, y - e)) * (w / 90);
				let nx = -hx;
				let ny = -hy;
				let nz = 1;
				const nl = Math.hypot(nx, ny, nz);
				nx /= nl;
				ny /= nl;
				nz /= nl;
				const diff = clamp(nx * light[0] + ny * light[1] + nz * light[2]);
				const facing = nz;
				let col;
				if (o.kind === "velvet") {
					// pile reads darker face-on, brighter at the edge of a fold
					const sheen = Math.pow(1 - facing, 1.6);
					const t = clamp(diff * 0.75 + sheen * 0.9 - 0.08);
					col = ramp(o.palette, t);
				} else {
					const hv = [light[0], light[1], light[2] + 1];
					const hl = Math.hypot(...hv);
					const spec = Math.pow(clamp((nx * hv[0] + ny * hv[1] + nz * hv[2]) / hl), o.gloss || 60);
					col = ramp(o.palette, clamp(diff * 0.9));
					col = mix(col, [255, 250, 240], spec * 0.85);
				}
				const i = (y * w + x) * 4;
				d[i] = col[0];
				d[i + 1] = col[1];
				d[i + 2] = col[2];
				d[i + 3] = 255;
			}
		}
		ctx.putImageData(img, 0, 0);
	};

	/* — metal (Ion Forge) ——————————————————————————————————————————————— */

	/* A machined puck seen three-quarter on: body, chamfer, brushed cap,
	   light ring. Conic gradients carry the brushed anisotropy. */
	const puck = (ctx, w, h, r, o) => {
		vGrad(ctx, w, h, [
			[0, o.bg[0]],
			[1, o.bg[1]],
		]);
		glow(ctx, w * 0.5, h * 0.58, w * 0.55, o.accent, 0.16);
		const cx = w * 0.5;
		const cy = h * 0.5;
		const R = w * o.size;
		const sq = 0.42; // ellipse squash for the 3/4 view
		const depth = R * 0.34;

		// floor shadow and reflection glow
		ctx.save();
		ctx.translate(cx, cy + depth + R * sq * 0.9);
		ctx.scale(1, 0.18);
		const sh = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 1.3);
		sh.addColorStop(0, "rgba(0,0,0,0.75)");
		sh.addColorStop(1, "rgba(0,0,0,0)");
		ctx.fillStyle = sh;
		ctx.beginPath();
		ctx.arc(0, 0, R * 1.3, 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();

		// side wall
		const side = ctx.createLinearGradient(cx - R, 0, cx + R, 0);
		side.addColorStop(0, "#0c0e12");
		side.addColorStop(0.18, "#3a3f47");
		side.addColorStop(0.32, "#9aa3ad");
		side.addColorStop(0.42, "#454b54");
		side.addColorStop(0.7, "#1a1d22");
		side.addColorStop(0.9, "#5b626c");
		side.addColorStop(1, "#111317");
		ctx.fillStyle = side;
		ctx.beginPath();
		ctx.ellipse(cx, cy + depth, R, R * sq, 0, 0, Math.PI);
		ctx.lineTo(cx - R, cy);
		ctx.ellipse(cx, cy, R, R * sq, 0, Math.PI, 0, true);
		ctx.closePath();
		ctx.fill();

		// machined grooves on the wall
		for (let i = 1; i < 6; i++) {
			const yy = cy + (depth * i) / 6;
			ctx.strokeStyle = `rgba(255,255,255,${0.035 + (i % 2) * 0.03})`;
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.ellipse(cx, yy, R, R * sq, 0, 0.05, Math.PI - 0.05);
			ctx.stroke();
		}

		// light ring where cap meets wall
		ctx.save();
		ctx.shadowColor = o.accent;
		ctx.shadowBlur = R * 0.12;
		ctx.strokeStyle = o.accent;
		ctx.lineWidth = R * 0.018;
		ctx.beginPath();
		ctx.ellipse(cx, cy + depth * 0.62, R * 1.0, R * sq, 0, 0.1, Math.PI - 0.1);
		ctx.stroke();
		ctx.restore();

		// chamfer
		const ch = ctx.createConicGradient(-0.6, cx, cy);
		[
			[0, "#e8edf2"], [0.08, "#5d646d"], [0.22, "#20242a"], [0.38, "#c2c9d1"],
			[0.5, "#2a2e35"], [0.62, "#f4f7fa"], [0.75, "#3a4048"], [0.9, "#8e969f"], [1, "#e8edf2"],
		].forEach(([t, c]) => ch.addColorStop(t, c));
		ctx.fillStyle = ch;
		ctx.beginPath();
		ctx.ellipse(cx, cy, R, R * sq, 0, 0, Math.PI * 2);
		ctx.fill();

		// brushed cap: conic gradient plus fine radial scratches
		const capR = R * 0.93;
		ctx.save();
		ctx.beginPath();
		ctx.ellipse(cx, cy, capR, capR * sq, 0, 0, Math.PI * 2);
		ctx.clip();
		ctx.translate(cx, cy);
		ctx.scale(1, sq);
		const cap = ctx.createConicGradient(0.3, 0, 0);
		[
			[0, "#7b838c"], [0.12, "#d9dfe5"], [0.25, "#6c737c"], [0.37, "#2f343a"],
			[0.5, "#8a929b"], [0.62, "#e6ebf0"], [0.75, "#5d646c"], [0.87, "#2a2e33"], [1, "#7b838c"],
		].forEach(([t, c]) => cap.addColorStop(t, c));
		ctx.fillStyle = cap;
		ctx.fillRect(-capR, -capR, capR * 2, capR * 2);
		for (let i = 0; i < 1400; i++) {
			const rr = Math.sqrt(r()) * capR;
			const a = r() * Math.PI * 2;
			ctx.strokeStyle = `rgba(${r() > 0.5 ? "255,255,255" : "0,0,0"},${0.03 + r() * 0.05})`;
			ctx.lineWidth = 0.8;
			ctx.beginPath();
			ctx.arc(0, 0, rr, a, a + 0.2 + r() * 0.5);
			ctx.stroke();
		}
		// centre inset
		const inset = ctx.createRadialGradient(0, -capR * 0.05, 0, 0, 0, capR * 0.36);
		inset.addColorStop(0, "#15181d");
		inset.addColorStop(0.85, "#0b0d10");
		inset.addColorStop(1, "#4a5058");
		ctx.fillStyle = inset;
		ctx.beginPath();
		ctx.arc(0, 0, capR * 0.36, 0, Math.PI * 2);
		ctx.fill();
		ctx.strokeStyle = o.accent;
		ctx.globalAlpha = 0.9;
		ctx.lineWidth = capR * 0.012;
		ctx.beginPath();
		ctx.arc(0, 0, capR * 0.26, -2.2, 0.9);
		ctx.stroke();
		ctx.globalAlpha = 1;
		ctx.restore();

		// specular sweep
		ctx.save();
		ctx.globalCompositeOperation = "screen";
		glow(ctx, cx - R * 0.35, cy - R * sq * 0.35, R * 0.55, "#ffffff", 0.22);
		ctx.restore();

		if (o.particles) {
			for (let i = 0; i < 180; i++) {
				const a = r() * Math.PI * 2;
				const rr = R * (1.25 + r() * 0.9);
				ctx.fillStyle = rgba(hex(o.accent), r() * 0.6);
				ctx.fillRect(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.55, 1.5, 1.5);
			}
		}
	};

	const brushed = (ctx, w, h, r, o) => {
		const noise = makeNoise(r);
		const img = ctx.createImageData(w, h);
		const d = img.data;
		const rowN = new Float32Array(h).map(() => r());
		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				const band = noise.fbm(x / w * 0.8, y / h * 0.8, 3);
				const streak = (rowN[y] - 0.5) * 0.18 + noise.n2(x * 0.002, y * 0.9) * 0.12;
				const light = 0.5 + band * 0.9 + streak + Math.sin((x / w) * Math.PI * 1.1 + 0.4) * 0.22;
				const c = ramp(o.palette, clamp(light));
				const i = (y * w + x) * 4;
				d[i] = c[0];
				d[i + 1] = c[1];
				d[i + 2] = c[2];
				d[i + 3] = 255;
			}
		}
		ctx.putImageData(img, 0, 0);
		if (o.slot) {
			ctx.fillStyle = "#07080a";
			ctx.fillRect(w * 0.12, h * 0.46, w * 0.76, h * 0.03);
			ctx.save();
			ctx.shadowColor = o.accent;
			ctx.shadowBlur = h * 0.05;
			ctx.fillStyle = o.accent;
			ctx.fillRect(w * 0.14, h * 0.471, w * 0.72 * o.slot, h * 0.008);
			ctx.restore();
		}
	};

	/* — aurora ribbons, soft blooms, gradient fields ——————————————————— */

	const aurora = (ctx, w, h, r, o) => {
		const noise = makeNoise(r);
		vGrad(ctx, w, h, o.sky);
		if (o.stars) stars(ctx, w, h * 0.7, r, o.stars);
		ctx.save();
		ctx.globalCompositeOperation = "screen";
		o.ribbons.forEach((rb, k) => {
			const col = hex(rb.color);
			const top = mix(col, hex(rb.top || "#b35cff"), 0.7);
			for (let x = 0; x < w; x++) {
				const u = x / w;
				// the curtain's lower hem folds back and forth
				const y0 = (rb.y + noise.fbm(u * 2.2 + k * 3, k, 4) * rb.wave) * h;
				// vertical rays: high-frequency brightness along x
				const rays = 0.55 + 0.45 * clamp(0.5 + noise.n2(u * 90 + k * 11, k) * 1.8);
				const body = clamp(0.6 + noise.fbm(u * 3 + k * 5, 2 + k, 3) * 1.8);
				const len = rb.height * h * (0.4 + rays * 0.8);
				const a = rb.alpha * body * rays;
				const g = ctx.createLinearGradient(0, y0 - len, 0, y0);
				g.addColorStop(0, rgba(top, 0));
				g.addColorStop(0.55, rgba(mix(col, top, 0.45), a * 0.35));
				g.addColorStop(0.9, rgba(col, a));
				g.addColorStop(0.97, rgba(mix(col, [255, 255, 255], 0.45), Math.min(1, a * 1.3)));
				g.addColorStop(1, rgba(col, 0));
				ctx.fillStyle = g;
				ctx.fillRect(x, y0 - len, 1.2, len + 2);
			}
		});
		ctx.restore();
		if (o.ground) {
			const noise2 = makeNoise(mulberry(7));
			const ys = ridge(noise2, w, o.ground.y * h, o.ground.amp * h, 2.2 / w, 5);
			fillRidge(ctx, w, h, ys, o.ground.color);
		}
	};

	/* Smooth domain-warped colour field, the base for many soft pieces. */
	const field = (ctx, w, h, r, o) => {
		const noise = makeNoise(r);
		const step = 2;
		shade(
			ctx,
			w,
			h,
			(x, y) => {
				const u = x / w;
				const v = y / h;
				const qx = noise.fbm(u * o.scale, v * o.scale, 4);
				const qy = noise.fbm(u * o.scale + 5.2, v * o.scale + 1.3, 4);
				const t = noise.fbm(u * o.scale + qx * o.warp, v * o.scale + qy * o.warp, 5);
				return ramp(o.palette, clamp(0.5 + t * (o.contrast ?? 1.4) + (o.tilt ?? 0) * (v - 0.5)));
			},
			1
		);
		void step;
	};

	/* Petals radiating from a centre: soft, translucent, overlapping. */
	const bloom = (ctx, w, h, r, o) => {
		field(ctx, w, h, r, { scale: 1.3, warp: 1.8, palette: o.bg, contrast: 1.1 });
		const cx = o.x * w;
		const cy = o.y * h;
		if (o.moon) {
			glow(ctx, o.moon[0] * w, o.moon[1] * h, o.moon[2] * w * 3, "#fff4ea", 0.5);
			ctx.fillStyle = "rgba(255,250,244,0.92)";
			ctx.beginPath();
			ctx.arc(o.moon[0] * w, o.moon[1] * h, o.moon[2] * w, 0, Math.PI * 2);
			ctx.fill();
		}
		const rings = o.rings;
		for (let ring = rings.length - 1; ring >= 0; ring--) {
			const R = rings[ring].r * Math.min(w, h);
			const n = rings[ring].n;
			const col = hex(rings[ring].color);
			for (let i = 0; i < n; i++) {
				const a = (i / n) * Math.PI * 2 + ring * 0.35 + (o.rot || 0);
				ctx.save();
				ctx.translate(cx, cy);
				ctx.rotate(a);
				const g = ctx.createLinearGradient(0, 0, R, 0);
				g.addColorStop(0, rgba(mix(col, [255, 255, 255], 0.5), 0.1));
				g.addColorStop(0.6, rgba(col, 0.42));
				g.addColorStop(1, rgba(mix(col, [255, 255, 255], 0.6), 0.65));
				ctx.fillStyle = g;
				ctx.beginPath();
				ctx.moveTo(0, 0);
				ctx.bezierCurveTo(R * 0.3, -R * 0.42, R * 0.92, -R * 0.36, R, 0);
				ctx.bezierCurveTo(R * 0.92, R * 0.36, R * 0.3, R * 0.42, 0, 0);
				ctx.fill();
				ctx.strokeStyle = rgba([255, 255, 255], 0.18);
				ctx.lineWidth = 1;
				ctx.stroke();
				ctx.restore();
			}
		}
		glow(ctx, cx, cy, Math.min(w, h) * 0.08, o.heart || "#fff1d6", 0.9);
		// floating pollen
		for (let i = 0; i < 90; i++) {
			const x = r() * w;
			const y = r() * h;
			glow(ctx, x, y, 3 + r() * 10, "#fff8ee", 0.25 + r() * 0.3);
		}
	};

	/* — posters (Lumen Stream) ———————————————————————————————————————— */

	const poster = (ctx, w, h, r, o) => {
		const noise = makeNoise(r);
		vGrad(ctx, w, h, o.sky, 0, h * o.horizon);
		if (o.stars) stars(ctx, w, h * o.horizon, r, o.stars);
		if (o.sun) {
			const [sx, sy, sr, sc] = o.sun;
			glow(ctx, sx * w, sy * h, sr * w * 4, sc, 0.5);
			ctx.fillStyle = o.sunFill || sc;
			ctx.beginPath();
			ctx.arc(sx * w, sy * h, sr * w, 0, Math.PI * 2);
			ctx.fill();
			if (o.sunBands) {
				ctx.fillStyle = o.sky[o.sky.length - 1][1];
				for (let i = 0; i < 6; i++) {
					const by = sy * h + sr * w * (0.1 + i * 0.16);
					ctx.fillRect(sx * w - sr * w, by, sr * w * 2, 2 + i * 1.6);
				}
			}
		}
		const hy = o.horizon * h;
		ctx.fillStyle = o.ground;
		ctx.fillRect(0, hy, w, h - hy);
		if (o.motif === "road") {
			const g = ctx.createLinearGradient(0, hy, 0, h);
			g.addColorStop(0, "#0b0b10");
			g.addColorStop(1, "#1d1c24");
			ctx.fillStyle = g;
			ctx.beginPath();
			ctx.moveTo(w * 0.49, hy);
			ctx.lineTo(w * 0.51, hy);
			ctx.lineTo(w * 1.1, h);
			ctx.lineTo(-w * 0.1, h);
			ctx.fill();
			for (let i = 0; i < 12; i++) {
				const t0 = Math.pow(i / 12, 2);
				const t1 = Math.pow((i + 0.5) / 12, 2);
				ctx.fillStyle = o.accent;
				ctx.beginPath();
				ctx.moveTo(w * 0.5 - 1 - t0 * 6, hy + t0 * (h - hy));
				ctx.lineTo(w * 0.5 + 1 + t0 * 6, hy + t0 * (h - hy));
				ctx.lineTo(w * 0.5 + 1 + t1 * 6, hy + t1 * (h - hy));
				ctx.lineTo(w * 0.5 - 1 - t1 * 6, hy + t1 * (h - hy));
				ctx.fill();
			}
			// light trails
			ctx.save();
			ctx.globalCompositeOperation = "screen";
			[[-1, "#ff4d5e"], [1, "#fff1d0"]].forEach(([side, c]) => {
				for (let k = 0; k < 3; k++) {
					ctx.strokeStyle = rgba(hex(c), 0.5 - k * 0.12);
					ctx.lineWidth = 2 + k * 3;
					ctx.shadowColor = c;
					ctx.shadowBlur = 14;
					ctx.beginPath();
					ctx.moveTo(w * 0.5 + side * 4, hy + 2);
					ctx.lineTo(w * 0.5 + side * w * (0.36 + k * 0.05), h);
					ctx.stroke();
				}
			});
			ctx.restore();
		} else if (o.motif === "sea") {
			for (let y = hy; y < h; y += 2) {
				const t = (y - hy) / (h - hy);
				for (let x = 0; x < w; x += 3) {
					const n = noise.n2(x * 0.02 / (0.3 + t), y * 0.25 / (0.3 + t));
					if (n > 0.18) {
						ctx.fillStyle = rgba(hex(o.accent), (n - 0.18) * 1.4 * (1 - t * 0.5));
						ctx.fillRect(x, y, 3 + t * 6, 1);
					}
				}
			}
		} else if (o.motif === "city") {
			let x = 0;
			while (x < w) {
				const bw = w * (0.04 + r() * 0.08);
				const bh = h * (0.08 + Math.pow(r(), 2) * 0.35);
				ctx.fillStyle = o.buildings;
				ctx.fillRect(x, hy - bh, bw - 2, bh + 1);
				for (let wy = hy - bh + 8; wy < hy - 6; wy += 9) {
					for (let wx = x + 4; wx < x + bw - 8; wx += 7) {
						if (r() < 0.35) {
							ctx.fillStyle = rgba(hex(o.accent), 0.3 + r() * 0.7);
							ctx.fillRect(wx, wy, 3, 4);
						}
					}
				}
				x += bw;
			}
			// wet street reflection
			const g = ctx.createLinearGradient(0, hy, 0, h);
			g.addColorStop(0, rgba(hex(o.accent), 0.35));
			g.addColorStop(1, rgba(hex(o.accent), 0));
			ctx.fillStyle = g;
			ctx.fillRect(0, hy, w, h - hy);
		} else if (o.motif === "dunes") {
			for (let i = 0; i < 5; i++) {
				const ys = ridge(noise, w, hy + (h - hy) * (0.1 + i * 0.22), h * 0.08, 1.4 / w, 40 + i, true);
				fillRidge(ctx, w, h, ys, rgba(mix(hex(o.ground), hex(o.accent), 0.3 - i * 0.06)));
			}
		} else if (o.motif === "forest") {
			const layers = 4;
			for (let i = 0; i < layers; i++) {
				const col = mix(hex(o.sky[o.sky.length - 1][1]), hex(o.ground), (i + 1) / layers);
				const ys = ridge(noise, w, hy - h * 0.02 + i * h * 0.05, h * 0.05, 2 / w, 9 + i);
				fillRidge(ctx, w, h, ys, rgba(col));
				trees(ctx, w, ys, r, { spacing: 26 - i * 4, height: h * (0.06 + i * 0.05) }, rgba(col));
			}
		} else if (o.motif === "peaks") {
			for (let i = 0; i < 4; i++) {
				const col = mix(hex(o.sky[o.sky.length - 1][1]), hex(o.ground), (i + 1) / 4);
				const ys = ridge(noise, w, hy - h * (0.16 - i * 0.05), h * (0.3 - i * 0.05), 1.8 / w, 3 + i, true);
				fillRidge(ctx, w, h, ys, rgba(col));
			}
		}
		if (o.figure) {
			// a lone figure, which every film poster needs
			const fx = o.figure[0] * w;
			const fy = o.figure[1] * h;
			const s = o.figure[2] * h;
			ctx.fillStyle = "#050507";
			ctx.beginPath();
			ctx.arc(fx, fy - s * 0.92, s * 0.08, 0, Math.PI * 2);
			ctx.fill();
			ctx.beginPath();
			ctx.moveTo(fx - s * 0.12, fy - s * 0.8);
			ctx.lineTo(fx + s * 0.12, fy - s * 0.8);
			ctx.lineTo(fx + s * 0.16, fy - s * 0.3);
			ctx.lineTo(fx + s * 0.07, fy);
			ctx.lineTo(fx - s * 0.07, fy);
			ctx.lineTo(fx - s * 0.16, fy - s * 0.3);
			ctx.fill();
		}
		// cinematic grade: lift blacks toward the accent, crush the edges
		const lift = hex(o.lift || "#101018");
		shade(ctx, w, h, (x, y, c) => mix(c, lift, 0.08 + 0.18 * Math.pow(y / h, 3)));
	};

	/* — editorial abstracts (Northbridge, Atlas) ———————————————————————— */

	const editorial = (ctx, w, h, r, o) => {
		const noise = makeNoise(r);
		ctx.fillStyle = o.paper;
		ctx.fillRect(0, 0, w, h);
		const ink = o.ink;
		const acc = o.accent;
		const m = o.motif;
		ctx.lineCap = "round";
		if (m === "contours") {
			for (let k = 0; k < 26; k++) {
				const lvl = -0.35 + k * 0.028;
				ctx.strokeStyle = k % 6 === 0 ? acc : rgba(hex(ink), 0.55);
				ctx.lineWidth = k % 6 === 0 ? 2.2 : 1;
				// marching squares, coarse
				const s = 8;
				ctx.beginPath();
				for (let y = 0; y < h; y += s) {
					for (let x = 0; x < w; x += s) {
						const f = (xx, yy) => noise.fbm(xx / w * 2.2, yy / h * 1.6, 4) - lvl;
						const a = f(x, y), b = f(x + s, y), c = f(x + s, y + s), d = f(x, y + s);
						const pts = [];
						if (a * b < 0) pts.push([x + (s * a) / (a - b), y]);
						if (b * c < 0) pts.push([x + s, y + (s * b) / (b - c)]);
						if (d * c < 0) pts.push([x + (s * d) / (d - c), y + s]);
						if (a * d < 0) pts.push([x, y + (s * a) / (a - d)]);
						if (pts.length >= 2) {
							ctx.moveTo(pts[0][0], pts[0][1]);
							ctx.lineTo(pts[1][0], pts[1][1]);
						}
					}
				}
				ctx.stroke();
			}
		} else if (m === "bars") {
			const n = 34;
			const bw = w / n;
			for (let i = 0; i < n; i++) {
				const v = 0.25 + (noise.fbm(i * 0.12, 3, 3) + 0.5) * 0.6 + i / n * 0.2;
				ctx.fillStyle = i === n - 6 ? acc : rgba(hex(ink), 0.85);
				ctx.fillRect(i * bw + bw * 0.22, h * (1 - v * 0.8), bw * 0.56, h * v * 0.8);
			}
			ctx.strokeStyle = acc;
			ctx.lineWidth = 3;
			ctx.beginPath();
			for (let i = 0; i <= n; i++) {
				const v = 0.35 + (noise.fbm(i * 0.12 + 9, 1, 3) + 0.5) * 0.4 + i / n * 0.25;
				const x = i * bw;
				const y = h * (1 - v * 0.85);
				i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
			}
			ctx.stroke();
		} else if (m === "nodes") {
			const pts = [];
			for (let i = 0; i < 70; i++) pts.push([r() * w, r() * h, r()]);
			ctx.strokeStyle = rgba(hex(ink), 0.35);
			ctx.lineWidth = 1;
			pts.forEach((p, i) =>
				pts.slice(i + 1).forEach((q) => {
					if (Math.hypot(p[0] - q[0], p[1] - q[1]) < w * 0.16) {
						ctx.beginPath();
						ctx.moveTo(p[0], p[1]);
						ctx.lineTo(q[0], q[1]);
						ctx.stroke();
					}
				})
			);
			pts.forEach((p) => {
				ctx.fillStyle = p[2] > 0.9 ? acc : ink;
				ctx.beginPath();
				ctx.arc(p[0], p[1], p[2] > 0.9 ? 9 : 3 + p[2] * 3, 0, Math.PI * 2);
				ctx.fill();
			});
		} else if (m === "rings") {
			const cx = w * (0.35 + r() * 0.3);
			const cy = h * (0.4 + r() * 0.2);
			for (let i = 1; i < 30; i++) {
				ctx.strokeStyle = i === 11 ? acc : rgba(hex(ink), 0.5);
				ctx.lineWidth = i === 11 ? 4 : 1.1;
				ctx.beginPath();
				ctx.arc(cx, cy, i * w * 0.022, 0, Math.PI * 2);
				ctx.stroke();
			}
			ctx.fillStyle = acc;
			ctx.beginPath();
			ctx.arc(cx + w * 0.24, cy - h * 0.1, 10, 0, Math.PI * 2);
			ctx.fill();
		} else if (m === "grid") {
			const s = w / 28;
			for (let y = s / 2; y < h; y += s) {
				for (let x = s / 2; x < w; x += s) {
					const n = noise.fbm(x / w * 3, y / h * 3, 3);
					const rad = clamp(0.5 + n * 1.6) * s * 0.42;
					ctx.fillStyle = n > 0.24 ? acc : ink;
					ctx.beginPath();
					ctx.arc(x, y, rad, 0, Math.PI * 2);
					ctx.fill();
				}
			}
		} else if (m === "waves") {
			for (let k = 0; k < 60; k++) {
				ctx.strokeStyle = k === 38 ? acc : rgba(hex(ink), 0.6);
				ctx.lineWidth = k === 38 ? 3 : 1;
				ctx.beginPath();
				for (let x = 0; x <= w; x += 4) {
					const y = h * 0.1 + k * (h / 70) + noise.fbm(x / w * 2, k * 0.05, 4) * h * 0.35;
					x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
				}
				ctx.stroke();
			}
		} else if (m === "blocks") {
			const split = (x, y, bw, bh, d) => {
				if (d > 4 || (d > 1 && r() < 0.25)) {
					const t = r();
					ctx.fillStyle = t > 0.9 ? acc : t > 0.55 ? ink : rgba(hex(ink), 0.12);
					ctx.fillRect(x + 3, y + 3, bw - 6, bh - 6);
					return;
				}
				if (bw > bh) {
					const s = bw * (0.3 + r() * 0.4);
					split(x, y, s, bh, d + 1);
					split(x + s, y, bw - s, bh, d + 1);
				} else {
					const s = bh * (0.3 + r() * 0.4);
					split(x, y, bw, s, d + 1);
					split(x, y + s, bw, bh - s, d + 1);
				}
			};
			split(0, 0, w, h, 0);
		} else if (m === "orbit") {
			const cx = w / 2;
			const cy = h / 2;
			for (let i = 0; i < 9; i++) {
				ctx.save();
				ctx.translate(cx, cy);
				ctx.rotate(i * 0.35);
				ctx.strokeStyle = i === 4 ? acc : rgba(hex(ink), 0.55);
				ctx.lineWidth = i === 4 ? 3 : 1.2;
				ctx.beginPath();
				ctx.ellipse(0, 0, w * 0.4, h * 0.12, 0, 0, Math.PI * 2);
				ctx.stroke();
				ctx.restore();
			}
			ctx.fillStyle = ink;
			ctx.beginPath();
			ctx.arc(cx, cy, h * 0.08, 0, Math.PI * 2);
			ctx.fill();
		} else if (m === "halftone") {
			const s = 12;
			for (let y = 0; y < h; y += s) {
				for (let x = 0; x < w; x += s) {
					const g = clamp(0.5 + noise.fbm(x / w * 1.4, y / h * 1.4, 5) * 1.8 - (y / h - 0.5) * 0.6);
					ctx.fillStyle = ink;
					ctx.beginPath();
					ctx.arc(x, y, g * s * 0.55, 0, Math.PI * 2);
					ctx.fill();
				}
			}
			ctx.fillStyle = acc;
			ctx.fillRect(w * 0.08, h * 0.62, w * 0.36, h * 0.03);
		}
		finish(ctx, w, h, r, { grain: 14, vignette: 0.05 });
	};

	/* Atlas: light through a colonnade, in warm stone. */
	const colonnade = (ctx, w, h, r, o) => {
		const noise = makeNoise(r);
		vGrad(ctx, w, h, [
			[0, o.stone[0]],
			[1, o.stone[1]],
		]);
		const n = o.columns;
		const cw = w / n;
		for (let i = 0; i < n; i++) {
			const x = i * cw;
			// column body with a cylindrical shade
			const g = ctx.createLinearGradient(x + cw * 0.18, 0, x + cw * 0.62, 0);
			g.addColorStop(0, o.shadow);
			g.addColorStop(0.35, o.lit);
			g.addColorStop(0.7, o.mid);
			g.addColorStop(1, o.shadow);
			ctx.fillStyle = g;
			ctx.fillRect(x + cw * 0.18, 0, cw * 0.44, h);
			// flutes
			for (let f = 0; f < 7; f++) {
				ctx.fillStyle = "rgba(0,0,0,0.06)";
				ctx.fillRect(x + cw * 0.2 + f * cw * 0.06, 0, cw * 0.012, h);
			}
		}
		// slanted light shafts falling across
		ctx.save();
		ctx.globalCompositeOperation = "soft-light";
		for (let i = 0; i < n + 3; i++) {
			const x = (i - 1.2) * cw + cw * 0.65;
			const g = ctx.createLinearGradient(0, 0, 0, h);
			g.addColorStop(0, "rgba(255,244,222,0.0)");
			g.addColorStop(0.4, "rgba(255,244,222,0.55)");
			g.addColorStop(1, "rgba(255,244,222,0.15)");
			ctx.fillStyle = g;
			ctx.beginPath();
			ctx.moveTo(x, 0);
			ctx.lineTo(x + cw * 0.3, 0);
			ctx.lineTo(x + cw * 0.3 - h * 0.38, h);
			ctx.lineTo(x - h * 0.38, h);
			ctx.fill();
		}
		ctx.restore();
		// stone texture
		shade(ctx, w, h, (x, y, c) => {
			const t = noise.fbm(x / w * 9, y / h * 9, 4);
			return c.map((v) => v * (1 + t * 0.12));
		});
		// floor
		const fy = h * o.floor;
		const fg = ctx.createLinearGradient(0, fy, 0, h);
		fg.addColorStop(0, o.mid);
		fg.addColorStop(1, o.shadow);
		ctx.fillStyle = fg;
		ctx.fillRect(0, fy, w, h - fy);
		ctx.fillStyle = "rgba(255,248,235,0.4)";
		ctx.fillRect(0, fy, w, 2);
	};

	/* Atlas interview frame: out-of-focus city through a boardroom window. */
	const bokehRoom = (ctx, w, h, r, o) => {
		vGrad(ctx, w, h, o.sky);
		for (let i = 0; i < o.count; i++) {
			const x = r() * w;
			const y = h * (0.2 + r() * 0.6);
			const rad = 10 + Math.pow(r(), 2) * w * 0.05;
			const c = o.lights[Math.floor(r() * o.lights.length)];
			glow(ctx, x, y, rad, c, 0.25 + r() * 0.35);
			ctx.fillStyle = rgba(hex(c), 0.08 + r() * 0.12);
			ctx.beginPath();
			ctx.arc(x, y, rad * 0.6, 0, Math.PI * 2);
			ctx.fill();
		}
		// mullions
		ctx.fillStyle = o.frame;
		for (let i = 1; i < 4; i++) ctx.fillRect((w * i) / 4 - 6, 0, 12, h);
		ctx.fillRect(0, h * 0.78, w, h * 0.22);
		// table edge highlight
		ctx.fillStyle = "rgba(255,240,220,0.18)";
		ctx.fillRect(0, h * 0.78, w, 2);
	};

	/* — manifest ——————————————————————————————————————————————————— */

	const L = landscape;
	const P = (fn, o) => (ctx, w, h, r) => fn(ctx, w, h, r, o);
	const F = (fn, o, fin) => (ctx, w, h, r) => {
		fn(ctx, w, h, r, o);
		if (fin !== false) finish(ctx, w, h, r, fin || {});
	};

	const velvet = (palette, angle, folds, lightA) =>
		F(fabric, { kind: "velvet", palette, angle, folds, lightA }, { grain: 8, vignette: 0.3 });
	const silk = (palette, angle, folds, lightA, gloss) =>
		F(fabric, { kind: "silk", palette, angle, folds, lightA, gloss }, { grain: 6, vignette: 0.25 });

	const posterOf = (o) => F(poster, o, { grain: 16, vignette: 0.45 });
	const ed = (motif, accent = "#b8412e") => (ctx, w, h, r) =>
		editorial(ctx, w, h, r, { motif, paper: "#efeae0", ink: "#1b1d22", accent });

	const pieces = {
		/* Ishq Escape — forest, ocean and heritage estates, at golden hour. */
		"ishq-escape/hero": F(L, {
			horizon: 0.6,
			sky: [[0, "#2b2a4a"], [0.45, "#b96b5a"], [0.8, "#f1b77e"], [1, "#fbe0b0"]],
			sun: [0.6, 0.55, 0.035, "#ffd9a0"],
			clouds: "#f7c9a3",
			haze: "#f2b88a",
			layers: [
				{ base: 0.56, amp: 0.08, freq: 2.2, color: "#8a5a63", haze: 0.6 },
				{ base: 0.6, amp: 0.05, freq: 3.2, color: "#4b3445", haze: 0.35 },
			],
			water: { y: 0.62, tint: "#3b3654" },
			pool: { y: 0.86, water: ["#4d7f93", "#173848"], stone: "#e9dccb" },
			palms: [[0.86, 0.86, 0.52], [0.95, 0.86, 0.38]],
		}, { grain: 9, vignette: 0.4 }),
		"ishq-escape/forest": F(L, {
			horizon: 0.7,
			sky: [[0, "#dfe6d9"], [0.7, "#c9d6c2"], [1, "#eef0e2"]],
			sun: [0.3, 0.2, 0.05, "#fff6de"],
			haze: "#e6ecdf",
			layers: [
				{ base: 0.46, amp: 0.14, freq: 1.6, color: "#a9b8a4", haze: 0.7, trees: { spacing: 18, height: 40 } },
				{ base: 0.6, amp: 0.12, freq: 2, color: "#6d816c", haze: 0.5, trees: { spacing: 26, height: 80 } },
				{ base: 0.76, amp: 0.1, freq: 2.4, color: "#35493b", haze: 0.3, trees: { spacing: 40, height: 150 } },
				{ base: 0.93, amp: 0.06, freq: 3, color: "#18241c", trees: { spacing: 70, height: 320 } },
			],
		}, { grain: 8, vignette: 0.3 }),
		"ishq-escape/ocean": F(L, {
			horizon: 0.52,
			sky: [[0, "#7fb6c9"], [0.6, "#cfe3e2"], [1, "#f6ecd8"]],
			sun: [0.72, 0.28, 0.03, "#fff4dc"],
			clouds: "#ffffff",
			haze: "#e9efe8",
			layers: [{ base: 0.5, amp: 0.05, freq: 1.4, color: "#7c9aa3", haze: 0.7 }],
			water: { y: 0.52, tint: "#2c6d80" },
			pool: { y: 0.8, water: ["#6fc0c9", "#1f6c7c"], stone: "#efe6d6" },
		}, { grain: 8, vignette: 0.3 }),
		"ishq-escape/heritage": F(L, {
			horizon: 0.72,
			sky: [[0, "#e8c79c"], [0.7, "#f3d9b2"], [1, "#fbeedb"]],
			sun: [0.22, 0.46, 0.045, "#fff1d4"],
			haze: "#f1d6b0",
			layers: [
				{ base: 0.66, amp: 0.05, freq: 1.2, color: "#caa27c", haze: 0.6 },
				{ base: 0.76, amp: 0.04, freq: 2, color: "#a3754f", haze: 0.3, trees: { kind: "palm", spacing: 180, height: 170 } },
			],
			arches: { x: 0.42, y: 0.77, width: 0.5, height: 0.22, count: 5, color: "#6e4631", dome: 0.5 },
		}, { grain: 10, vignette: 0.35 }),
		"ishq-escape/villa-1": F(L, {
			horizon: 0.58,
			sky: [[0, "#1d2440"], [0.6, "#5f5a7a"], [1, "#e1a58c"]],
			sun: [0.5, 0.56, 0.028, "#ffc79a"],
			haze: "#c98d86",
			layers: [{ base: 0.55, amp: 0.1, freq: 2, color: "#3a3450", haze: 0.4, trees: { kind: "palm", spacing: 160, height: 120 } }],
			water: { y: 0.58, tint: "#262a45" },
			pool: { y: 0.8, water: ["#35607a", "#0f2433"], stone: "#d8c8b2" },
		}, { grain: 9, vignette: 0.4 }),
		"ishq-escape/villa-2": F(L, {
			horizon: 0.68,
			sky: [[0, "#9fb9c4"], [1, "#e9e3d3"]],
			haze: "#e3e2d6",
			sun: [0.8, 0.18, 0.04, "#fffaf0"],
			layers: [
				{ base: 0.42, amp: 0.2, freq: 1.3, color: "#8ea09a", haze: 0.7, sharp: true },
				{ base: 0.6, amp: 0.12, freq: 2.2, color: "#50655d", haze: 0.4, trees: { spacing: 22, height: 60 } },
				{ base: 0.82, amp: 0.05, freq: 3, color: "#2a3832", trees: { spacing: 60, height: 190 } },
			],
		}, { grain: 8, vignette: 0.3 }),
		"ishq-escape/villa-3": F(L, {
			horizon: 0.7,
			sky: [[0, "#f0b68c"], [0.6, "#f6cfa6"], [1, "#fde9cf"]],
			sun: [0.62, 0.52, 0.05, "#fff3dd"],
			haze: "#f3caa1",
			layers: [
				{ base: 0.7, amp: 0.05, freq: 1.4, color: "#d19f7a", haze: 0.5 },
				{ base: 0.82, amp: 0.03, freq: 2.5, color: "#8a5b3f", trees: { kind: "palm", spacing: 140, height: 200 } },
			],
			arches: { x: 0.05, y: 0.84, width: 0.34, height: 0.28, count: 3, color: "#5a3827" },
		}, { grain: 10, vignette: 0.35 }),

		/* Velvet Atelier — cloth, not photographs of cloth. */
		"velvet-atelier/hero": velvet([[0, "#1a0508"], [0.35, "#4c0d18"], [0.7, "#8e2233"], [1, "#e7a7a0"]], 1.1, 5, -0.9),
		"velvet-atelier/nocturne": velvet([[0, "#03050d"], [0.4, "#0e1733"], [0.75, "#2b3f78"], [1, "#a9b9e8"]], 0.5, 6, -0.6),
		"velvet-atelier/emerald": velvet([[0, "#020a07"], [0.4, "#0b2e22"], [0.75, "#1f6a4f"], [1, "#9fdcbc"]], 1.9, 4, -1.2),
		"velvet-atelier/ivory": silk([[0, "#6f6254"], [0.45, "#c9b9a3"], [0.8, "#ece2d2"], [1, "#fbf6ee"]], 0.8, 6, -0.7, 40),
		"velvet-atelier/gold": silk([[0, "#2b1c07"], [0.4, "#7a5317"], [0.75, "#c8973f"], [1, "#fbe3a6"]], 2.3, 5, -0.9, 30),
		"velvet-atelier/rose": velvet([[0, "#1d0b0e"], [0.4, "#5b2a31"], [0.75, "#b0707a"], [1, "#f4d3d2"]], 0.2, 5, -0.5),

		/* Starlight Kingdom — the park after dark. */
		"starlight-kingdom/hero": (ctx, w, h, r) => {
			const noise = makeNoise(r);
			vGrad(ctx, w, h, [[0, "#05061a"], [0.55, "#1a1850"], [0.8, "#5a2f78"], [1, "#e0719a"]], 0, h * 0.72);
			milkyWay(ctx, w, h, r, noise, -0.45);
			stars(ctx, w, h * 0.7, r, 700);
			firework(ctx, w * 0.2, h * 0.24, w * 0.08, "#ffcf6e", r);
			firework(ctx, w * 0.78, h * 0.18, w * 0.06, "#7fd8ff", r);
			firework(ctx, w * 0.62, h * 0.3, w * 0.045, "#ff7ab6", r);
			const ys = ridge(noise, w, h * 0.72, h * 0.06, 2 / w, 3);
			fillRidge(ctx, w, h, ys, "#1b1238");
			castle(ctx, w, h, { x: 0.5, y: 0.73, scale: 0.34, color: "#0d0a22", windows: "#ffd38a" });
			const ys2 = ridge(noise, w, h * 0.78, h * 0.04, 3 / w, 8);
			fillRidge(ctx, w, h, ys2, "#07061a");
			trees(ctx, w, ys2, r, { spacing: 30, height: h * 0.06 }, "#07061a");
			// lake
			const wy = h * 0.8;
			const src = ctx.getImageData(0, 0, w, h);
			const dst = ctx.getImageData(0, 0, w, h);
			for (let y = Math.floor(wy); y < h; y++) {
				for (let x = 0; x < w; x++) {
					const off = noise.n2(x * 0.004, y * 0.08) * 22;
					const sy = clamp(Math.round(2 * wy - y + off - h * 0.06), 0, h - 1);
					const si = (sy * w + x) * 4;
					const di = (y * w + x) * 4;
					const c = mix([src.data[si], src.data[si + 1], src.data[si + 2]], [6, 6, 26], 0.62 + ((y - wy) / (h - wy)) * 0.3);
					dst.data[di] = c[0];
					dst.data[di + 1] = c[1];
					dst.data[di + 2] = c[2];
				}
			}
			ctx.putImageData(dst, 0, 0);
			finish(ctx, w, h, r, { grain: 10, vignette: 0.45 });
		},
		"starlight-kingdom/harbor": F(L, {
			horizon: 0.6,
			sky: [[0, "#0a1030"], [0.6, "#27407a"], [1, "#6fb3c9"]],
			stars: 260,
			haze: "#4f86a8",
			layers: [{ base: 0.58, amp: 0.04, freq: 2, color: "#0f1a38", haze: 0.3 }],
			water: { y: 0.6, tint: "#0a1a38" },
		}, { grain: 10, vignette: 0.45 }),
		"starlight-kingdom/lanterns": (ctx, w, h, r) => {
			const noise = makeNoise(r);
			vGrad(ctx, w, h, [[0, "#0b0a1e"], [0.7, "#2a1740"], [1, "#6a2f4f"]]);
			for (let i = 0; i < 4; i++) {
				const col = ["#1f1435", "#170f2a", "#100a1f", "#07050f"][i];
				const ys = ridge(noise, w, h * (0.55 + i * 0.12), h * 0.08, 2 / w, 4 + i);
				fillRidge(ctx, w, h, ys, col);
				trees(ctx, w, ys, r, { spacing: 34 - i * 5, height: h * (0.08 + i * 0.07) }, col);
			}
			for (let i = 0; i < 120; i++) {
				const x = r() * w;
				const y = h * (0.05 + Math.pow(r(), 1.3) * 0.7);
				const s = 3 + Math.pow(r(), 3) * 14;
				glow(ctx, x, y, s * 5, "#ffb347", 0.35);
				ctx.fillStyle = "#ffd89a";
				ctx.fillRect(x - s / 2, y - s * 0.7, s, s * 1.3);
			}
			finish(ctx, w, h, r, { grain: 10, vignette: 0.45 });
		},
		"starlight-kingdom/citadel": (ctx, w, h, r) => {
			const noise = makeNoise(r);
			vGrad(ctx, w, h, [[0, "#140d33"], [0.5, "#43307a"], [0.85, "#e59a8a"], [1, "#ffd6a6"]]);
			stars(ctx, w, h * 0.45, r, 200);
			shade(ctx, w, h, (x, y, c) => {
				const n = noise.fbm(x / w * 2.5, y / h * 7, 5);
				const a = smooth(0.0, 0.35, n) * 0.5 * smooth(0.3, 0.9, y / h);
				return mix(c, [255, 220, 214], a);
			});
			castle(ctx, w, h, { x: 0.5, y: 0.7, scale: 0.42, color: "#1c1238", windows: "#ffe0a0" });
			vGrad(ctx, w, h * 0, [[0, "#000"]]);
			ctx.fillStyle = "#120b26";
			ctx.fillRect(0, h * 0.7, w, h * 0.3);
			finish(ctx, w, h, r, { grain: 10, vignette: 0.45 });
		},
		"starlight-kingdom/show": (ctx, w, h, r) => {
			vGrad(ctx, w, h, [[0, "#020312"], [1, "#1c1236"]]);
			stars(ctx, w, h * 0.6, r, 200);
			[["#ffcf6e", 0.3, 0.3, 0.14], ["#7fd8ff", 0.7, 0.24, 0.12], ["#ff7ab6", 0.52, 0.42, 0.1], ["#b6ff9a", 0.16, 0.5, 0.07], ["#ffffff", 0.86, 0.46, 0.06]].forEach(
				([c, x, y, s]) => firework(ctx, w * x, h * y, w * s, c, r)
			);
			const noise = makeNoise(r);
			const ys = ridge(noise, w, h * 0.86, h * 0.04, 2 / w, 3);
			fillRidge(ctx, w, h, ys, "#05040e");
			castle(ctx, w, h, { x: 0.5, y: 0.88, scale: 0.22, color: "#05040e" });
			finish(ctx, w, h, r, { grain: 12, vignette: 0.4 });
		},

		/* Aurora Studio — the name, taken literally. */
		"aurora/hero": F(aurora, {
			sky: [[0, "#040914"], [0.7, "#0b1a2e"], [1, "#12324a"]],
			stars: 500,
			ribbons: [
				{ y: 0.66, wave: 0.28, height: 0.55, color: "#35ffb8", top: "#6a4dff", alpha: 0.85 },
				{ y: 0.5, wave: 0.3, height: 0.4, color: "#2fd6ff", top: "#c24dff", alpha: 0.5 },
			],
			ground: { y: 0.93, amp: 0.05, color: "#02050a" },
		}, { grain: 8, vignette: 0.35 }),
		"aurora/teams": F(field, { scale: 1.2, warp: 2.4, palette: [[0, "#0a1b2e"], [0.4, "#1e5d78"], [0.7, "#39d0a6"], [1, "#e8fff4"]] }, { grain: 10, vignette: 0.2 }),
		"aurora/categories": F(field, { scale: 1.6, warp: 2, palette: [[0, "#1a0e2e"], [0.45, "#5b3a9e"], [0.75, "#ff8a6b"], [1, "#fff0d8"]] }, { grain: 10, vignette: 0.2 }),
		"aurora/locations": F(field, { scale: 1, warp: 3, palette: [[0, "#081421"], [0.45, "#1d4a8a"], [0.8, "#7fc6ff"], [1, "#f2f9ff"]] }, { grain: 10, vignette: 0.2 }),
		"aurora/story": F(aurora, {
			sky: [[0, "#0c0a22"], [1, "#1b2a4a"]],
			stars: 200,
			ribbons: [
				{ y: 0.82, wave: 0.35, height: 0.7, color: "#ff7ad9", top: "#5a3dff", alpha: 0.6 },
				{ y: 0.7, wave: 0.3, height: 0.55, color: "#35ffb8", top: "#3a7bff", alpha: 0.7 },
			],
		}, { grain: 8, vignette: 0.3 }),

		/* Luna Bloom — soft, luminous, never a stock photo of a bump. */
		"luna-bloom/hero": F(bloom, {
			bg: [[0, "#f3dfe0"], [0.5, "#f7e9e3"], [1, "#e8d9ef"]],
			x: 0.5, y: 0.62,
			moon: [0.72, 0.2, 0.07],
			rings: [
				{ r: 0.5, n: 11, color: "#e9a9b5" },
				{ r: 0.36, n: 9, color: "#f2c3c3" },
				{ r: 0.22, n: 7, color: "#f8dccd" },
			],
		}, { grain: 7, vignette: 0.15 }),
		"luna-bloom/journal-1": F(bloom, {
			bg: [[0, "#e8ddd0"], [1, "#f6efe6"]],
			x: 0.3, y: 0.7, rot: 0.3,
			rings: [{ r: 0.6, n: 7, color: "#d99c8a" }, { r: 0.38, n: 6, color: "#efc2a6" }],
		}, { grain: 7, vignette: 0.15 }),
		"luna-bloom/journal-2": F(bloom, {
			bg: [[0, "#dfe3ee"], [1, "#f1eef6"]],
			x: 0.66, y: 0.38, moon: [0.2, 0.2, 0.06],
			rings: [{ r: 0.5, n: 12, color: "#a8a6d6" }, { r: 0.3, n: 8, color: "#d4c9ef" }],
		}, { grain: 7, vignette: 0.15 }),
		"luna-bloom/journal-3": F(bloom, {
			bg: [[0, "#e4eadf"], [1, "#f5f3ea"]],
			x: 0.5, y: 0.55, rot: 1.1,
			rings: [{ r: 0.56, n: 5, color: "#9dbb9e" }, { r: 0.4, n: 5, color: "#cfe0c2" }, { r: 0.2, n: 5, color: "#f3e1c4" }],
		}, { grain: 7, vignette: 0.15 }),
		"luna-bloom/room": F(field, { scale: 1.1, warp: 2.2, palette: [[0, "#f0d7d3"], [0.5, "#f7ebe4"], [1, "#dcd2ec"]], contrast: 1.2 }, { grain: 6, vignette: 0.1 }),
		"luna-bloom/event": F(bloom, {
			bg: [[0, "#2b2340"], [1, "#4a3b5e"]],
			x: 0.5, y: 0.9, moon: [0.5, 0.3, 0.09],
			rings: [{ r: 0.46, n: 13, color: "#c98fb1" }, { r: 0.28, n: 9, color: "#f1c7d4" }],
		}, { grain: 8, vignette: 0.3 }),

		/* Ion Forge — the object, lit like a product shot. */
		"ion-forge/hero": F(puck, { bg: ["#0b0d11", "#050608"], accent: "#35e0ff", size: 0.3, particles: true }, { grain: 7, vignette: 0.5 }),
		"ion-forge/alloy": F(brushed, { palette: [[0, "#1a1d22"], [0.5, "#7c848e"], [0.8, "#c9d0d8"], [1, "#f3f6f9"]], slot: 0.72, accent: "#35e0ff" }, { grain: 5, vignette: 0.35 }),
		"ion-forge/graphite": F(brushed, { palette: [[0, "#060708"], [0.5, "#2b2f35"], [0.85, "#5d646d"], [1, "#9aa2ab"]], slot: 0.4, accent: "#ff5a3c" }, { grain: 5, vignette: 0.35 }),
		"ion-forge/detail": F(puck, { bg: ["#e9ecef", "#c9ced4"], accent: "#ff5a3c", size: 0.36 }, { grain: 5, vignette: 0.25 }),

		/* Northbridge — nine editorial abstracts in ink, paper and one red. */
		...Object.fromEntries(
			["contours", "bars", "nodes", "rings", "grid", "waves", "blocks", "orbit", "halftone"].map((m, i) => [
				`tech-disruption/story-${i + 1}`,
				ed(m),
			])
		),
		"tech-disruption/hero": (ctx, w, h, r) => editorial(ctx, w, h, r, { motif: "contours", paper: "#14161b", ink: "#e9e4d8", accent: "#e0533c" }),

		/* Lumen Stream — posters for films that don't exist. */
		"lumen-stream/hero": posterOf({ horizon: 0.58, sky: [[0, "#070814"], [0.7, "#2a1846"], [1, "#e4476b"]], sun: [0.5, 0.56, 0.09, "#ff7a59"], sunFill: "#ff9f6e", sunBands: true, ground: "#0a0a12", motif: "road", accent: "#f2d38a", stars: 220, lift: "#1a0f2a" }),
		"lumen-stream/p1": posterOf({ horizon: 0.6, sky: [[0, "#0b0a1a"], [1, "#e14a6c"]], sun: [0.5, 0.52, 0.2, "#ff9a6b"], sunFill: "#ffb07a", sunBands: true, ground: "#0b0a14", motif: "road", accent: "#ffe6a8" }),
		"lumen-stream/p2": posterOf({ horizon: 0.55, sky: [[0, "#021a24"], [1, "#6fc3c9"]], sun: [0.7, 0.3, 0.06, "#e9fff9"], ground: "#03141c", motif: "sea", accent: "#bff4ff", figure: [0.3, 0.62, 0.12] }),
		"lumen-stream/p3": posterOf({ horizon: 0.72, sky: [[0, "#12051f"], [1, "#6a1b8a"]], ground: "#0a0612", motif: "city", buildings: "#140a22", accent: "#ff4fd8", stars: 60 }),
		"lumen-stream/p4": posterOf({ horizon: 0.5, sky: [[0, "#3a1605"], [1, "#f2a45b"]], sun: [0.3, 0.42, 0.12, "#fff0cc"], ground: "#6a3414", motif: "dunes", accent: "#f7c27e", figure: [0.62, 0.66, 0.1] }),
		"lumen-stream/p5": posterOf({ horizon: 0.62, sky: [[0, "#0c1a14"], [1, "#9dbb8f"]], sun: [0.5, 0.35, 0.05, "#fbffe8"], ground: "#08110c", motif: "forest", accent: "#dff5b8" }),
		"lumen-stream/p6": posterOf({ horizon: 0.66, sky: [[0, "#050a1c"], [1, "#4a6fb3"]], stars: 400, ground: "#0a1024", motif: "peaks", accent: "#cfe0ff", figure: [0.5, 0.7, 0.06] }),
		"lumen-stream/p7": posterOf({ horizon: 0.7, sky: [[0, "#1d0303"], [1, "#d8261e"]], sun: [0.5, 0.72, 0.28, "#ff4b2b"], sunFill: "#1a0202", ground: "#0c0101", motif: "city", buildings: "#0c0101", accent: "#ff7a4d" }),
		"lumen-stream/p8": posterOf({ horizon: 0.5, sky: [[0, "#e8e2d4"], [1, "#b9c4c9"]], ground: "#3a4a52", motif: "sea", accent: "#f7f4ec", figure: [0.72, 0.55, 0.14], lift: "#e8e2d4" }),
		"lumen-stream/p9": posterOf({ horizon: 0.64, sky: [[0, "#02040c"], [1, "#133a5a"]], sun: [0.24, 0.2, 0.05, "#e7f1ff"], sunFill: "#e7f1ff", stars: 300, ground: "#030811", motif: "sea", accent: "#6fd0ff" }),
		"lumen-stream/p10": posterOf({ horizon: 0.58, sky: [[0, "#241042"], [1, "#ff8d6b"]], sun: [0.66, 0.5, 0.1, "#ffe1a0"], ground: "#170b26", motif: "peaks", accent: "#ffc38a", figure: [0.3, 0.66, 0.08] }),

		/* Atlas — institutional, warm stone, no people pictured. */
		"atlas/hero": F(colonnade, { stone: ["#d9cdb8", "#bfae92"], lit: "#f1e6d2", mid: "#cbbba0", shadow: "#8f7e64", columns: 6, floor: 0.86 }, { grain: 8, vignette: 0.3 }),
		"atlas/interview": F(bokehRoom, { sky: [[0, "#1c2330"], [0.6, "#3a4250"], [1, "#6a6358"]], lights: ["#ffd9a0", "#ffe9cc", "#9fc3ff", "#ffb88a"], count: 160, frame: "#0e1116" }, { grain: 10, vignette: 0.45 }),
		"atlas/report": (ctx, w, h, r) => editorial(ctx, w, h, r, { motif: "waves", paper: "#f3efe6", ink: "#1f2a37", accent: "#9b7a3c" }),
		"atlas/markets": (ctx, w, h, r) => editorial(ctx, w, h, r, { motif: "bars", paper: "#f3efe6", ink: "#1f2a37", accent: "#9b7a3c" }),
	};

	/* Where each piece goes and how big it is. Paths are relative to
	   cases/library. Seeds are fixed so a re-render is byte-stable enough to
	   diff by eye. */
	const S = (slug, name, w, h) => ({ piece: `${slug}/${name}`, out: `${slug}/assets/img/${name}.jpg`, w, h });
	const manifest = [
		S("ishq-escape", "hero", 2400, 1400),
		S("ishq-escape", "forest", 1200, 1500),
		S("ishq-escape", "ocean", 1200, 1500),
		S("ishq-escape", "heritage", 1200, 1500),
		S("ishq-escape", "villa-1", 1400, 1000),
		S("ishq-escape", "villa-2", 1400, 1000),
		S("ishq-escape", "villa-3", 1400, 1000),
		S("velvet-atelier", "hero", 1400, 1800),
		S("velvet-atelier", "nocturne", 1000, 1300),
		S("velvet-atelier", "emerald", 1000, 1300),
		S("velvet-atelier", "ivory", 1000, 1300),
		S("velvet-atelier", "gold", 1400, 900),
		S("velvet-atelier", "rose", 1000, 1300),
		S("starlight-kingdom", "hero", 2400, 1400),
		S("starlight-kingdom", "harbor", 1200, 900),
		S("starlight-kingdom", "lanterns", 1200, 900),
		S("starlight-kingdom", "citadel", 1200, 900),
		S("starlight-kingdom", "show", 2000, 1100),
		S("aurora", "hero", 2400, 1300),
		S("aurora", "teams", 1200, 900),
		S("aurora", "categories", 1200, 900),
		S("aurora", "locations", 1200, 900),
		S("aurora", "story", 1600, 1100),
		S("luna-bloom", "hero", 1400, 1700),
		S("luna-bloom", "journal-1", 1000, 1250),
		S("luna-bloom", "journal-2", 1000, 1250),
		S("luna-bloom", "journal-3", 1000, 1250),
		S("luna-bloom", "room", 1200, 800),
		S("luna-bloom", "event", 1600, 1000),
		S("ion-forge", "hero", 1600, 1600),
		S("ion-forge", "alloy", 1200, 900),
		S("ion-forge", "graphite", 1200, 900),
		S("ion-forge", "detail", 1200, 1200),
		...Array.from({ length: 9 }, (_, i) => S("tech-disruption", `story-${i + 1}`, 1200, 800)),
		S("tech-disruption", "hero", 2400, 1000),
		S("lumen-stream", "hero", 2400, 1200),
		...Array.from({ length: 10 }, (_, i) => S("lumen-stream", `p${i + 1}`, 600, 900)),
		S("atlas", "hero", 2400, 1300),
		S("atlas", "interview", 1600, 900),
		S("atlas", "report", 1200, 800),
		S("atlas", "markets", 1200, 800),
	];

	const hash = (s) => [...s].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) | 0, 7);

	const paint = (canvas, entry) => {
		canvas.width = entry.w;
		canvas.height = entry.h;
		const ctx = canvas.getContext("2d", { willReadFrequently: true });
		pieces[entry.piece](ctx, entry.w, entry.h, mulberry(hash(entry.piece)));
	};

	window.CASE_ART = { manifest, paint, pieces };
})();
