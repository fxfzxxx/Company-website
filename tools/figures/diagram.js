/* Insight diagrams: one SVG per article and locale, drawn from a small spec
   in content/insights/figures.json. Runs in the browser, where text can be
   measured with the real fonts, and is photographed to PNG by
   tools/render-insight-figures.mjs.

   The look follows the site: paper ground, ink rules at 2px, no radius, no
   shadow, one accent colour per topic. */

(function () {
	const W = 1600;
	const H = 1000;
	const M = 88; // outer margin
	const PAPER = "#f2f0ec";
	const INK = "#17181b";
	const MUTED = "#5d6975";
	const RULE = "rgba(23,24,27,0.38)";
	const SURFACE = "#e5e2dc";

	let FONT = "Archivo";
	// type is sized for the figure being read at about 960px wide
	const FS = 1.3;
	const canvas = document.createElement("canvas").getContext("2d");
	const measure = (text, size, weight = 400) => {
		canvas.font = `${weight} ${size}px "${FONT}", "Noto Sans SC", sans-serif`;
		return canvas.measureText(text).width;
	};

	/* Wrap by words, or by characters for Chinese. */
	const wrap = (text, width, size, weight = 400) => {
		if (!text) return [];
		// CJK breaks between characters; Latin runs inside it stay whole
		const tokens = text.match(/[\u3000-\u303f\u3400-\u9fff\uff00-\uffef]|[^\s\u3000-\u303f\u3400-\u9fff\uff00-\uffef]+|\s+/g) || [];
		const lines = [];
		let line = "";
		for (const tok of tokens) {
			const next = line + tok;
			if (measure(next.trim(), size, weight) > width && line.trim()) {
				lines.push(line.trim());
				line = tok.trimStart();
			} else line = next;
		}
		if (line.trim()) lines.push(line.trim());
		// keep CJK punctuation off the start of a line
		for (let i = 1; i < lines.length; i++) {
			if (/^[，。、；：！？）」』》]/.test(lines[i])) {
				lines[i - 1] += lines[i][0];
				lines[i] = lines[i].slice(1);
			}
		}
		return lines.filter(Boolean);
	};

	const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

	/* A block of wrapped text; returns [svg, height]. */
	const text = (str, x, y, width, { size = 28, weight = 400, fill = INK, lh = 1.3, anchor = "start" } = {}) => {
		size = Math.round(size * FS);
		const lines = wrap(str, width, size, weight);
		const svg = lines
			.map(
				(l, i) =>
					`<text x="${x}" y="${y + size + i * size * lh}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(l)}</text>`
			)
			.join("");
		return [svg, lines.length ? size + (lines.length - 1) * size * lh + size * 0.3 : 0];
	};

	const rect = (x, y, w, h, fill, stroke = INK, sw = 2) =>
		`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
	const line = (x1, y1, x2, y2, stroke = INK, sw = 2, extra = "") =>
		`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}" ${extra}/>`;
	const arrow = (x1, y1, x2, y2, stroke = INK) =>
		line(x1, y1, x2, y2, stroke, 2.5, `marker-end="url(#${stroke === INK ? "arrow" : "arrow-acc"})"`);

	const num = (i) => String(i + 1).padStart(2, "0");

	/* — types ——————————————————————————————————————————————————————— */

	const types = {
		/* Steps left to right. */
		flow(s, acc, top) {
			const n = s.steps.length;
			const gap = n > 3 ? 44 : 64;
			const bw = (W - 2 * M - gap * (n - 1)) / n;
			const pad = 28;
			const ts = n > 3 ? 32 : 36;
			const ns = n > 3 ? 23 : 26;
			const parts = s.steps.map((st) => {
				const [, h1] = text(st.t, 0, 0, bw - 2 * pad, { size: ts, weight: 800, lh: 1.15 });
				const [, h2] = text(st.n, 0, 0, bw - 2 * pad, { size: ns, lh: 1.4 });
				return [h1, h2];
			});
			const bh = Math.max(300, ...parts.map(([h1, h2]) => 84 + h1 + 16 + h2 + pad));
			const y = top + (H - M - top - bh) / 2;
			let out = "";
			s.steps.forEach((st, i) => {
				const x = M + i * (bw + gap);
				const hot = s.highlight === i;
				out += rect(x, y, bw, bh, hot ? acc : "#fbfaf7", hot ? acc : INK);
				out += `<text x="${x + pad}" y="${y + 58}" font-size="${Math.round(22 * FS)}" font-weight="600" fill="${hot ? "rgba(255,255,255,0.75)" : acc}" letter-spacing="2">${num(i)}</text>`;
				const [t1, h1] = text(st.t, x + pad, y + 76, bw - 2 * pad, { size: ts, weight: 800, fill: hot ? "#fff" : INK, lh: 1.15 });
				const [t2] = text(st.n, x + pad, y + 76 + h1 + 16, bw - 2 * pad, { size: ns, fill: hot ? "rgba(255,255,255,0.86)" : MUTED, lh: 1.4 });
				out += t1 + t2;
				if (i < n - 1) out += arrow(x + bw + 8, y + bh / 2, x + bw + gap - 10, y + bh / 2);
			});
			return out;
		},

		/* Stacked bands, top to bottom. */
		layers(s, acc, top) {
			const n = s.items.length;
			const gap = 12;
			const avail = H - M - top;
			const bh = Math.min(150, (avail - gap * (n - 1)) / n);
			const total = n * bh + (n - 1) * gap;
			let y = top + (avail - total) / 2;
			let out = "";
			const lw = 520;
			s.items.forEach((it, i) => {
				const hot = s.highlight === i;
				out += rect(M, y, W - 2 * M, bh, hot ? acc : i % 2 ? "#fbfaf7" : SURFACE, hot ? acc : INK);
				const size = bh < 100 ? 30 : 36;
				const [t1, h1] = text(it.t, M + 32, 0, lw - 40, { size, weight: 800, fill: hot ? "#fff" : INK, lh: 1.15 });
				out += `<g transform="translate(0 ${y + (bh - h1) / 2 - 4})">${t1}</g>`;
				const [t2, h2] = text(it.n, M + lw + 20, 0, W - 2 * M - lw - 60, { size: bh < 100 ? 24 : 27, fill: hot ? "rgba(255,255,255,0.88)" : MUTED, lh: 1.35 });
				out += `<g transform="translate(0 ${y + (bh - h2) / 2 - 2})">${t2}</g>`;
				y += bh + gap;
			});
			return out;
		},

		/* Two options side by side, row by row. The second column is the one
		   the article argues for, unless good: 0. */
		compare(s, acc, top) {
			const good = s.good ?? 1;
			const kw = 380;
			const cw = (W - 2 * M - kw) / 2;
			const rows = s.rows.length;
			const hh = 96;
			const rh = Math.min(140, (H - M - top - hh) / rows);
			let y = top + (H - M - top - hh - rows * rh) / 2;
			let out = "";
			s.cols.forEach((c, i) => {
				const x = M + kw + i * cw;
				const hot = i === good;
				out += rect(x, y, cw, hh, hot ? acc : SURFACE, hot ? acc : INK);
				const [t] = text(c, x + 28, y + 22, cw - 56, { size: 34, weight: 800, fill: hot ? "#fff" : INK });
				out += t;
			});
			y += hh;
			s.rows.forEach((r) => {
				out += line(M, y, W - M, y, RULE, 2);
				const [k, kh] = text(r.k, M, 0, kw - 40, { size: 27, weight: 600, fill: INK, lh: 1.25 });
				out += `<g transform="translate(0 ${y + (rh - kh) / 2 - 4})">${k}</g>`;
				[r.a, r.b].forEach((v, i) => {
					const x = M + kw + i * cw;
					const [t, th] = text(v, x + 28, 0, cw - 56, { size: 27, fill: i === good ? INK : MUTED, weight: i === good ? 600 : 400, lh: 1.3 });
					out += `<g transform="translate(0 ${y + (rh - th) / 2 - 4})">${t}</g>`;
				});
				y += rh;
			});
			out += line(M, y, W - M, y, INK, 2);
			return out;
		},

		/* 2 × 2 with axes; q is [top-left, top-right, bottom-left, bottom-right]. */
		matrix(s, acc, top) {
			const lx = M + 90;
			const size = Math.min(W - lx - M, H - M - top - 70);
			const gw = W - lx - M;
			const cw = gw / 2;
			const ch = size / 2;
			const y0 = top;
			let out = "";
			s.q.forEach((q, i) => {
				const x = lx + (i % 2) * cw;
				const y = y0 + Math.floor(i / 2) * ch;
				const hot = s.hot === i;
				out += rect(x, y, cw, ch, hot ? acc : i === 0 || i === 3 ? "#fbfaf7" : SURFACE, INK);
				const [t1, h1] = text(q.t, x + 32, y + 26, cw - 64, { size: 36, weight: 800, fill: hot ? "#fff" : INK, lh: 1.15 });
				const [t2] = text(q.n, x + 32, y + 26 + h1 + 14, cw - 64, { size: 26, fill: hot ? "rgba(255,255,255,0.88)" : MUTED, lh: 1.4 });
				out += t1 + t2;
			});
			// axes
			const by = y0 + size;
			out += arrow(lx, by + 36, W - M, by + 36);
			out += `<text x="${lx}" y="${by + 72}" font-size="${Math.round(24 * FS)}" fill="${MUTED}">${esc(s.x[0])}</text>`;
			out += `<text x="${W - M}" y="${by + 72}" font-size="${Math.round(24 * FS)}" fill="${MUTED}" text-anchor="end">${esc(s.x[1])}</text>`;
			out += `<text x="${lx + gw / 2}" y="${by + 72}" font-size="${Math.round(24 * FS)}" font-weight="700" fill="${INK}" text-anchor="middle">${esc(s.xLabel)}</text>`;
			out += arrow(lx - 40, by, lx - 40, y0);
			out += `<text transform="translate(${lx - 56} ${y0 + size / 2}) rotate(-90)" font-size="${Math.round(24 * FS)}" font-weight="700" fill="${INK}" text-anchor="middle">${esc(s.yLabel)}</text>`;
			out += `<text transform="translate(${lx - 56} ${by}) rotate(-90)" font-size="${Math.round(22 * FS)}" fill="${MUTED}">${esc(s.y[0])}</text>`;
			out += `<text transform="translate(${lx - 56} ${y0}) rotate(-90)" font-size="${Math.round(22 * FS)}" fill="${MUTED}" text-anchor="end">${esc(s.y[1])}</text>`;
			return out;
		},

		/* Columns of numbered cards; shade: true darkens left to right. */
		cards(s, acc, top) {
			const n = s.items.length;
			const gap = 28;
			const cw = (W - 2 * M - gap * (n - 1)) / n;
			const hs = s.items.map((it) => {
				const [, h1] = text(it.t, 0, 0, cw - 60, { size: n > 3 ? 32 : 36, weight: 800, lh: 1.15 });
				const [, h2] = text(it.n, 0, 0, cw - 60, { size: n > 3 ? 24 : 27, lh: 1.42 });
				return 110 + h1 + 18 + h2 + 40;
			});
			const chh = Math.min(H - M - top, Math.max(320, ...hs));
			top += (H - M - top - chh) / 2;
			let out = "";
			s.items.forEach((it, i) => {
				const x = M + i * (cw + gap);
				const t = s.shade ? i / (n - 1) : 0;
				const hot = s.shade ? t > 0.99 : s.highlight === i;
				const fill = s.shade ? (t < 0.01 ? "#fbfaf7" : t < 0.99 ? SURFACE : acc) : hot ? acc : "#fbfaf7";
				out += rect(x, top, cw, chh, fill, hot ? acc : INK);
				out += line(x, top, x + cw, top, hot ? acc : acc, 8);
				const label = it.k || num(i);
				out += `<text x="${x + 30}" y="${top + 74}" font-size="${it.k ? 26 : 48}" font-weight="800" fill="${hot ? "#fff" : acc}">${esc(label)}</text>`;
				const [t1, h1] = text(it.t, x + 30, top + 110, cw - 60, { size: n > 3 ? 32 : 36, weight: 800, fill: hot ? "#fff" : INK, lh: 1.15 });
				const [t2] = text(it.n, x + 30, top + 110 + h1 + 18, cw - 60, { size: n > 3 ? 24 : 27, fill: hot ? "rgba(255,255,255,0.88)" : MUTED, lh: 1.42 });
				out += t1 + t2;
			});
			return out;
		},

		/* One centre, many spokes. */
		hub(s, acc, top) {
			const cx = W / 2;
			const cy = top + (H - M - top) / 2;
			const n = s.items.length;
			const rx = 590;
			const ry = 290;
			const bw = 360;
			const bh = 136;
			let out = "";
			const pos = s.items.map((_, i) => {
				const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
				return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
			});
			pos.forEach(([x, y]) => (out += line(cx, cy, x, y, RULE, 2)));
			s.items.forEach((it, i) => {
				const [x, y] = pos[i];
				out += rect(x - bw / 2, y - bh / 2, bw, bh, "#fbfaf7", INK);
				const [t1, h1] = text(it.t, x, 0, bw - 30, { size: 27, weight: 800, anchor: "middle", lh: 1.1 });
				const [t2, h2] = it.n ? text(it.n, x, 0, bw - 30, { size: 21, fill: MUTED, anchor: "middle", lh: 1.2 }) : ["", 0];
				const th = h1 + (h2 ? h2 + 2 : 0);
				out += `<g transform="translate(0 ${y - th / 2 - 4})">${t1}<g transform="translate(0 ${h1 + 2})">${t2}</g></g>`;
			});
			const cw = 400;
			const chh = 170;
			out += rect(cx - cw / 2, cy - chh / 2, cw, chh, acc, acc);
			const [c1, ch1] = text(s.center, cx, 0, cw - 40, { size: 40, weight: 800, fill: "#fff", anchor: "middle", lh: 1.1 });
			const [c2, ch2] = s.centerNote ? text(s.centerNote, cx, 0, cw - 40, { size: 22, fill: "rgba(255,255,255,0.85)", anchor: "middle" }) : ["", 0];
			const tot = ch1 + (ch2 ? ch2 + 6 : 0);
			out += `<g transform="translate(0 ${cy - tot / 2 - 4})">${c1}<g transform="translate(0 ${ch1 + 6})">${c2}</g></g>`;
			return out;
		},

		/* A type scale specimen: sizes grow by a fixed ratio. */
		typescale(s, acc, top) {
			let y = top + 10;
			let out = "";
			const sizes = s.rows.map((_, i) => Math.round(s.base * FS * Math.pow(s.ratio, s.rows.length - 1 - i)));
			s.rows.forEach((r, i) => {
				const size = sizes[i];
				out += line(M, y, W - M, y, RULE, 2);
				out += `<text x="${M}" y="${y + 44}" font-size="${Math.round(22 * FS)}" font-weight="700" fill="${acc}" letter-spacing="1.5">${esc(r.label.toUpperCase())}</text>`;
				out += `<text x="${M}" y="${y + 80}" font-size="${Math.round(20 * FS)}" fill="${MUTED}">${Math.round(size / FS)}px</text>`;
				out += `<text x="${M + 300}" y="${y + 20 + size * 0.95}" font-size="${size}" font-weight="${r.weight || 800}" fill="${INK}" letter-spacing="${size > 60 ? -1.5 : 0}">${esc(r.sample)}</text>`;
				y += Math.max(96, size * 1.22 + 28);
			});
			out += line(M, y, W - M, y, INK, 2);
			return out;
		},

		/* Horizontal bars with values. */
		bars(s, acc, top) {
			const n = s.items.length;
			const lw = 470;
			const maxW = W - 2 * M - lw - 150;
			const max = s.max || Math.max(...s.items.map((i) => i.v));
			const rh = Math.min(118, (H - M - top - 60) / n);
			let y = top + 10;
			let out = "";
			s.items.forEach((it, i) => {
				const hot = s.highlight === i;
				const [t, th] = text(it.t, M, 0, lw - 40, { size: 28, weight: 700, lh: 1.15 });
				out += `<g transform="translate(0 ${y + (rh - th) / 2 - 6})">${t}</g>`;
				const bw = Math.max(6, (it.v / max) * maxW);
				out += `<rect x="${M + lw}" y="${y + rh * 0.2}" width="${bw}" height="${rh * 0.6}" fill="${hot || it.hot ? acc : "#b9bdc0"}"/>`;
				out += `<text x="${M + lw + bw + 18}" y="${y + rh / 2 + 10}" font-size="${Math.round(28 * FS)}" font-weight="800" fill="${INK}">${esc(it.label ?? it.v)}</text>`;
				y += rh;
			});
			out += line(M + lw, top, M + lw, y + 4, INK, 2);
			if (s.note) out += `<text x="${M + lw}" y="${y + 50}" font-size="${Math.round(22 * FS)}" fill="${MUTED}">${esc(s.note)}</text>`;
			return out;
		},

		/* Milestones on a line. */
		timeline(s, acc, top) {
			const n = s.points.length;
			const y = top + (H - M - top) / 2;
			const x0 = M + 20;
			const x1 = W - M - 20;
			let out = arrow(M, y, W - M + 4, y, INK);
			const step = (x1 - x0 - 120) / (n - 1);
			const cw = Math.min(330, step - 24);
			s.points.forEach((p, i) => {
				const x = x0 + 60 + i * step;
				const hot = s.highlight === i;
				out += `<rect x="${x - 12}" y="${y - 12}" width="24" height="24" fill="${hot ? acc : PAPER}" stroke="${hot ? acc : INK}" stroke-width="3"/>`;
				const above = i % 2 === 0;
				const tx = Math.min(Math.max(x - cw / 2, M), W - M - cw);
				const [k] = text(p.k, tx, 0, cw, { size: 23, weight: 700, fill: acc });
				const [t1, h1] = text(p.t, tx, 0, cw, { size: 31, weight: 800, lh: 1.15 });
				const [t2, h2] = text(p.n, tx, 0, cw, { size: 23, fill: MUTED, lh: 1.35 });
				const block = 34 + h1 + 10 + h2;
				const by = above ? y - 44 - block : y + 44;
				out += line(x, above ? y - 16 : y + 16, x, above ? y - 36 : y + 36, RULE, 2);
				out += `<g transform="translate(0 ${by})">${k}<g transform="translate(0 34)">${t1}</g><g transform="translate(0 ${34 + h1 + 10})">${t2}</g></g>`;
			});
			return out;
		},

		/* A loop of steps around a centre label. */
		cycle(s, acc, top) {
			const cx = W / 2;
			const cy = top + (H - M - top) / 2;
			const n = s.items.length;
			const rx = 540;
			const ry = 300;
			const bw = 380;
			const bh = 124;
			let out = `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${RULE}" stroke-width="2" stroke-dasharray="10 10"/>`;
			const pts = s.items.map((_, i) => {
				const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
				return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, a];
			});
			pts.forEach(([, , a]) => {
				const a2 = a + (Math.PI * 2) / n / 2;
				const x = cx + Math.cos(a2) * rx;
				const y = cy + Math.sin(a2) * ry;
				const tx = -Math.sin(a2) * rx;
				const ty = Math.cos(a2) * ry;
				const l = Math.hypot(tx, ty);
				out += arrow(x - (tx / l) * 30, y - (ty / l) * 30, x + (tx / l) * 30, y + (ty / l) * 30, acc);
			});
			s.items.forEach((it, i) => {
				const [x, y] = pts[i];
				const hot = s.highlight === i;
				out += rect(x - bw / 2, y - bh / 2, bw, bh, hot ? acc : "#fbfaf7", hot ? acc : INK);
				const [t1, h1] = text(it.t, x, 0, bw - 36, { size: 27, weight: 800, fill: hot ? "#fff" : INK, anchor: "middle", lh: 1.15 });
				out += `<g transform="translate(0 ${y - h1 / 2 - 4})">${t1}</g>`;
			});
			if (s.center) {
				const [c, ch] = text(s.center, cx, 0, 420, { size: 34, weight: 800, fill: acc, anchor: "middle", lh: 1.15 });
				out += `<g transform="translate(0 ${cy - ch / 2 - 4})">${c}</g>`;
			}
			return out;
		},

		/* Rows of a two-part bar: how much has moved from a to b. */
		split(s, acc, top) {
			const n = s.rows.length;
			const lw = 360;
			const bw = W - 2 * M - lw;
			const rh = Math.min(128, (H - M - top - 80) / n);
			let y = top + 64;
			let out = "";
			out += `<rect x="${M + lw}" y="${top + 8}" width="22" height="22" fill="${INK}"/><text x="${M + lw + 34}" y="${top + 28}" font-size="${Math.round(23 * FS)}" fill="${INK}">${esc(s.a)}</text>`;
			const bx = M + lw + 60 + measure(s.a, Math.round(23 * FS)) + 20;
			out += `<rect x="${bx}" y="${top + 8}" width="22" height="22" fill="${acc}"/><text x="${bx + 34}" y="${top + 28}" font-size="${Math.round(23 * FS)}" fill="${INK}">${esc(s.b)}</text>`;
			s.rows.forEach((r) => {
				const [t, th] = text(r.t, M, 0, lw - 40, { size: 27, weight: 700, lh: 1.15 });
				out += `<g transform="translate(0 ${y + (rh - th) / 2 - 6})">${t}</g>`;
				const nw = bw * r.v;
				out += `<rect x="${M + lw}" y="${y + rh * 0.18}" width="${bw - nw}" height="${rh * 0.64}" fill="${INK}"/>`;
				out += `<rect x="${M + lw + bw - nw}" y="${y + rh * 0.18}" width="${nw}" height="${rh * 0.64}" fill="${acc}"/>`;
				y += rh;
			});
			return out;
		},

		/* Two lists under headings. */
		lists(s, acc, top) {
			const gap = 56;
			const cw = (W - 2 * M - gap) / 2;
			let out = "";
			s.cols.forEach((c, i) => {
				const x = M + i * (cw + gap);
				const hot = i === (s.good ?? 1);
				out += rect(x, top, cw, 96, hot ? acc : SURFACE, hot ? acc : INK);
				const [h] = text(c.h, x + 30, top + 22, cw - 60, { size: 34, weight: 800, fill: hot ? "#fff" : INK });
				out += h;
				let y = top + 130;
				c.items.forEach((it) => {
					out += `<rect x="${x + 4}" y="${y + 12}" width="12" height="12" fill="${hot ? acc : INK}"/>`;
					const [t, th] = text(it, x + 36, y - 6, cw - 50, { size: 28, fill: hot ? INK : MUTED, weight: hot ? 600 : 400, lh: 1.3 });
					out += t;
					y += th + 30;
				});
			});
			return out;
		},
	};

	/* Render one figure. spec: the locale's figure block; acc: topic colour. */
	/* Pull the body up under the title and trim the canvas to fit it, so a
	   short diagram is not floating in a tall frame. Call once it is in the DOM. */
	window.fitDiagram = (svg) => {
		const g = svg.querySelector("[data-body]");
		const top = Number(g.dataset.top);
		const bb = g.getBBox();
		const shift = Math.max(0, bb.y - top);
		g.setAttribute("transform", `translate(0 ${-shift})`);
		const h = Math.ceil(Math.max(bb.y + bb.height - shift + M, 560));
		svg.setAttribute("height", h);
		svg.setAttribute("viewBox", `0 0 ${W} ${h}`);
		svg.querySelector("rect").setAttribute("height", h);
		return h;
	};

	window.renderDiagram = (spec, acc, loc) => {
		FONT = loc === "zh" ? "Noto Sans SC" : "Archivo";
		let top = M;
		let head = "";
		if (spec.title) {
			const [t, th] = text(spec.title, M, M - 34, W - 2 * M, { size: 40, weight: 800, lh: 1.15 });
			head = t + line(M, M + th - 4, M + 90, M + th - 4, acc, 6);
			top = M + th + 56;
		}
		const body = types[spec.type](spec, acc, top);
		return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}, 'Noto Sans SC', sans-serif">
<defs>${["arrow", "arrow-acc"].map((id, i) => `<marker id="${id}" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="9" markerHeight="9" orient="auto"><path d="M0 0 12 6 0 12z" fill="${i ? acc : INK}"/></marker>`).join("")}</defs>
<rect width="${W}" height="${H}" fill="${PAPER}"/>${head}<g data-body data-top="${top}">${body}</g></svg>`;
	};
})();
