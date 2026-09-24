/* Renders the two images for every Insights article:

     assets/insights/<slug>/cover.jpg        1600 × 900, no text, shared by both locales
     assets/insights/<slug>/figure-en.png    1600 wide, height fitted to the diagram
     assets/insights/<slug>/figure-zh.png

   Covers are editorial abstracts painted by cases/library/_art/art.js; the
   diagrams are drawn by tools/figures/diagram.js from the specs in
   content/insights/figures.json. Needs Playwright (not a site dependency):

     node tools/render-insight-figures.mjs [slug]  */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch, routeFonts, serve } from "./lib/browser.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const only = process.argv[2];

/* One accent per topic, on the site's paper and ink. */
export const TOPIC_ACCENT = {
	ai: "#2f5d8a",
	stack: "#2f6b57",
	design: "#b4452f",
	trends: "#8a6327",
	data: "#5d4a8c",
	strategy: "#192231",
};

const figures = JSON.parse(fs.readFileSync(path.join(ROOT, "content/insights/figures.json"), "utf8"));
const categoryOf = (slug) =>
	/^category:\s*(\S+)/m.exec(fs.readFileSync(path.join(ROOT, "content/insights/en", `${slug}.md`), "utf8"))[1];

const { server, origin } = await serve(ROOT);
const browser = await launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await routeFonts(context);
const page = await context.newPage();
await page.setContent(
	`<!DOCTYPE html><html><head>
	<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;700;800&family=Noto+Sans+SC:wght@400;600;700;800&display=block" />
	<style>body{margin:0}</style></head><body><div id="out"></div>
	<script src="${origin}/cases/library/_art/art.js"></script>
	<script src="${origin}/tools/figures/diagram.js"></script></body></html>`,
	{ waitUntil: "networkidle" }
);
await page.evaluate(async () => {
	for (const f of ["Archivo", "Noto Sans SC"]) for (const w of [400, 600, 700, 800]) await document.fonts.load(`${w} 40px "${f}"`, "Aa中文");
	await document.fonts.ready;
});

const slugs = Object.keys(figures).filter((s) => !only || s === only);
for (const [i, slug] of slugs.entries()) {
	const spec = figures[slug];
	const acc = TOPIC_ACCENT[categoryOf(slug)];
	const dir = path.join(ROOT, "assets/insights", slug);
	fs.mkdirSync(dir, { recursive: true });

	// every third cover is dark, so the index doesn't read as one long page of paper
	const dark = Object.keys(figures).indexOf(slug) % 3 === 2;
	const cover = await page.evaluate(
		({ slug, motif, acc, dark }) => {
			const c = document.createElement("canvas");
			c.width = 1600;
			c.height = 900;
			const ctx = c.getContext("2d", { willReadFrequently: true });
			const r = CASE_ART.mulberry(CASE_ART.hash(`insight/${slug}`));
			CASE_ART.editorial(ctx, 1600, 900, r, {
				motif,
				paper: dark ? "#17181b" : "#efece6",
				ink: dark ? "#e9e5dc" : "#17181b",
				accent: dark ? "#e7b58f" : acc,
			});
			return c.toDataURL("image/jpeg", 0.82);
		},
		{ slug, motif: spec.cover, acc, dark }
	);
	fs.writeFileSync(path.join(dir, "cover.jpg"), Buffer.from(cover.split(",")[1], "base64"));

	for (const loc of ["en", "zh"]) {
		await page.evaluate(
			({ spec, acc, loc }) => {
				const out = document.getElementById("out");
				out.innerHTML = renderDiagram(spec, acc, loc);
				fitDiagram(out.querySelector("svg"));
			},
			{ spec: { type: spec.figure.type, ...spec.figure[loc] }, acc, loc }
		);
		await page.locator("#out svg").screenshot({ path: path.join(dir, `figure-${loc}.png`) });
	}
	console.log(`${String(i + 1).padStart(2)} ${slug}`);
}

await browser.close();
server.close();
