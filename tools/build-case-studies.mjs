/* Writes cases/library/<slug>/project.html for the nine web concepts from
   content/cases.json, so the in-concept case study always says what the
   site's case page says. Each page wears its concept's own tokens
   (assets/styles.css) over the shared layout in _shared/base.css.

   node tools/build-case-studies.mjs */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cases = JSON.parse(fs.readFileSync(path.join(ROOT, "content/cases.json"), "utf8"));

/* The concept's brand name and the fonts its stylesheet expects. */
export const CONCEPTS = {
	"luna-bloom": { name: "Luna Bloom", theme: "#f7efe9", fonts: "Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500&family=DM+Sans:wght@400;500;600" },
	"ion-forge": { name: "Ion Forge", theme: "#07080a", fonts: "Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500" },
	"velvet-atelier": { name: "Velvet Atelier", theme: "#120708", fonts: "Bodoni+Moda:opsz,wght@6..96,400;6..96,500&family=Manrope:wght@400;500;600" },
	"ishq-escape": { name: "Ishq Escape", theme: "#f5efe6", fonts: "Cormorant+Garamond:wght@400;500;600&family=Jost:wght@400;500" },
	"starlight-kingdom": { name: "Starlight Kingdom", theme: "#0a0920", fonts: "Marcellus&family=Outfit:wght@400;500;600" },
	aurora: { name: "Aurora Studio", theme: "#050b14", fonts: "Instrument+Serif:ital@0;1&family=Instrument+Sans:wght@400;500;600" },
	"tech-disruption": { name: "Northbridge Capital", theme: "#f4f1ea", fonts: "Source+Serif+4:opsz,wght@8..60,400;8..60,600&family=IBM+Plex+Sans:wght@400;500;600" },
	"lumen-stream": { name: "Lumen Stream", theme: "#07070c", fonts: "Sora:wght@400;500;600;700&family=Inter:wght@400;500" },
	atlas: { name: "Atlas Capital", theme: "#f3efe6", fonts: "Playfair+Display:wght@400;500;600&family=Inter:wght@400;500;600" },
};

const esc = (s) =>
	String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const page = (item, next) => {
	const cfg = CONCEPTS[item.slug];
	const d = item.det.en;
	const url = `https://yondertech.co.nz/cases/library/${item.slug}/project.html`;
	const desc = `${d.title} ${d.lede}`;
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<meta name="description" content="${esc(desc)}" />
	<link rel="canonical" href="${url}" />
	<link rel="icon" href="../../../assets/favicon.svg" type="image/svg+xml" />
	<meta name="theme-color" content="${cfg.theme}" />
	<meta property="og:type" content="article" />
	<meta property="og:title" content="${esc(cfg.name)} · Case study" />
	<meta property="og:description" content="${esc(desc)}" />
	<meta property="og:url" content="${url}" />
	<meta property="og:image" content="https://yondertech.co.nz/cases/library/${item.slug}/assets/hero.jpg" />
	<meta property="og:site_name" content="Yonder Tech" />
	<meta name="twitter:card" content="summary_large_image" />
	<title>${esc(cfg.name)} · Case study</title>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
	<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${cfg.fonts}&display=swap" />
	<link rel="stylesheet" href="../_shared/base.css" />
	<link rel="stylesheet" href="assets/styles.css" />
</head>
<body class="study">
	<header class="cs-bar">
		<strong>${esc(cfg.name)}</strong>
		<nav aria-label="Case">
			<a href="index.html">Live concept</a>
			<a href="project.html" aria-current="page">Case study</a>
			<a href="../../../en/cases/index.html" target="_top">Case library</a>
		</nav>
	</header>

	<main class="wrap">
		<header class="cs-head">
			<p class="cs-kicker">${esc(d.crumb)}</p>
			<h1 class="cs-title">${esc(d.title)}</h1>
			<p class="cs-lede">${esc(d.lede)}</p>
		</header>

		<figure class="cs-shot" data-reveal>
			<img src="assets/hero.jpg" width="2000" height="1333" alt="The ${esc(cfg.name)} concept homepage." />
		</figure>

		<dl class="cs-facts">
${d.facts.map((f) => `			<div><dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd></div>`).join("\n")}
		</dl>

		<section class="cs-section" data-reveal>
			<h2><span>01</span>The brief</h2>
			<div>
				<p>${esc(d.brief)}</p>
				<p>${esc(d.briefTwo)}</p>
			</div>
		</section>

		<section class="cs-section" data-reveal>
			<h2><span>02</span>Design decisions</h2>
			<ol class="cs-decisions">
${d.decisions.map((x) => `				<li>${esc(x)}</li>`).join("\n")}
			</ol>
		</section>

		<section class="cs-section" data-reveal>
			<h2><span>03</span>Outcome</h2>
			<div><p>${esc(d.outcome)}</p></div>
		</section>

		<div class="cs-specs" data-stagger>
${d.specs.map((s) => `			<div><strong>${esc(s.figure)}</strong><span>${esc(s.label)}</span><small>${esc(s.note)}</small></div>`).join("\n")}
		</div>

		<p class="cs-note">A concept project designed in-house by Yonder Tech, not a client engagement. Figures describe the delivered design system, not commercial results.</p>

		<section class="cs-end" data-reveal>
			<h2>See it working, not described.</h2>
			<a href="index.html">Open the live concept <span aria-hidden="true">→</span></a>
		</section>

		<footer class="cs-foot">
			<span>Designed by <a href="../../../en/index.html" target="_top">Yonder Tech</a> · ${esc(item.year)}</span>
			<span>Next: <a href="../${next.slug}/project.html">${esc(CONCEPTS[next.slug].name)}</a></span>
		</footer>
	</main>
	<script src="../_shared/concept.js"></script>
</body>
</html>
`;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const web = cases.filter((c) => CONCEPTS[c.slug]);
	web.forEach((item, i) => {
		const next = web[(i + 1) % web.length];
		const out = path.join(ROOT, "cases/library", item.slug, "project.html");
		fs.writeFileSync(out, page(item, next));
		console.log(path.relative(ROOT, out));
	});
}
