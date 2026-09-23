/* Renders every piece in cases/library/_art/art.js to a JPEG under each
   case's assets/img/. Needs Playwright (not a site dependency):

     node tools/render-case-art.mjs [piece-prefix]

   The images are committed; run this only when art.js changes. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch, serve } from "./lib/browser.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LIB = path.join(ROOT, "cases/library");
const only = process.argv[2] || "";

const { server, origin } = await serve(ROOT);
const browser = await launch();
const page = await browser.newPage();
await page.goto(`${origin}/cases/library/_art/index.html?headless`);
const manifest = await page.evaluate(() => CASE_ART.manifest);

for (const entry of manifest.filter((e) => e.piece.startsWith(only))) {
	const dataUrl = await page.evaluate((e) => {
		const c = document.createElement("canvas");
		CASE_ART.paint(c, e);
		return c.toDataURL("image/jpeg", 0.86);
	}, entry);
	const out = path.join(LIB, entry.out);
	fs.mkdirSync(path.dirname(out), { recursive: true });
	fs.writeFileSync(out, Buffer.from(dataUrl.split(",")[1], "base64"));
	console.log(`${entry.out}  ${(fs.statSync(out).size / 1024).toFixed(0)} kB`);
}

await browser.close();
server.close();
