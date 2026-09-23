/* Photographs each web concept for the case library: assets/hero.jpg
   (2000 × 1333, the case page and the in-concept case study) and
   assets/thumb.jpg (800 × 600, the library grid). Needs Playwright:

     node tools/render-case-stills.mjs [slug]

   Run after changing a concept's index.html or styles. */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch, routeFonts, serve } from "./lib/browser.mjs";
import { CONCEPTS } from "./build-case-studies.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const only = process.argv[2];

const shots = [
	{ file: "hero.jpg", width: 1500, height: 1000, scale: 2000 / 1500 },
	{ file: "thumb.jpg", width: 1200, height: 900, scale: 800 / 1200 },
];

const { server, origin } = await serve(ROOT);
const browser = await launch();

for (const slug of Object.keys(CONCEPTS).filter((s) => !only || s === only)) {
	for (const shot of shots) {
		const context = await browser.newContext({
			viewport: { width: shot.width, height: shot.height },
			deviceScaleFactor: shot.scale,
			reducedMotion: "reduce",
		});
		await routeFonts(context);
		const page = await context.newPage();
		await page.goto(`${origin}/cases/library/${slug}/index.html`, { waitUntil: "networkidle" });
		await page.evaluate(() => document.fonts.ready);
		await page.waitForTimeout(300);
		const out = path.join(ROOT, "cases/library", slug, "assets", shot.file);
		await page.screenshot({ path: out, type: "jpeg", quality: 84 });
		console.log(path.relative(ROOT, out));
		await context.close();
	}
}

await browser.close();
server.close();
