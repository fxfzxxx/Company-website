/* Static site generator for the Modernist pages.
   Reads content/*.json, writes /en and /zh, the root language switch and the
   sitemap. No dependencies: run it with `node tools/build.mjs`. The output is
   committed, so the site still deploys as plain static files.

   The prototype's template runtime (assets/render.js in the handoff) is
   deliberately not ported. Its {{ token }} holes and <sc-if> / <sc-for> tags
   become ordinary interpolation and array methods in tools/templates/. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { context, esc, LOCALES, HREFLANG, SITE } from "./templates/chrome.mjs";
import { renderHome } from "./templates/home.mjs";
import { renderLibrary } from "./templates/library.mjs";
import { renderDetail } from "./templates/detail.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));

const write = (rel, body) => {
	const target = path.join(ROOT, rel);
	fs.mkdirSync(path.dirname(target), { recursive: true });
	fs.writeFileSync(target, body);
	return rel;
};

/* — content ————————————————————————————————————————————————————— */

const cases = read("content/cases.json");
const ui = { en: read("content/ui.en.json"), zh: read("content/ui.zh.json") };
const home = { en: read("content/home.en.json"), zh: read("content/home.zh.json") };

/* — validation ——————————————————————————————————————————————————
   The copy was written independently in each language and must transfer
   whole. A missing decision or an empty string is a build failure, not
   something to notice in review. */

const problems = [];
const require = (value, where) => {
	if (typeof value !== "string" || value.trim() === "") problems.push(`${where}: missing or empty`);
};

for (const c of cases) {
	for (const loc of LOCALES) {
		const lib = c.lib[loc];
		const det = c.det[loc];
		if (!lib || !det) {
			problems.push(`${c.slug}/${loc}: missing lib or det block`);
			continue;
		}
		["meta", "title", "brief", "outcome"].forEach((k) => require(lib[k], `${c.slug}/${loc}/lib.${k}`));
		["crumb", "title", "lede", "brief", "briefTwo", "outcome"].forEach((k) =>
			require(det[k], `${c.slug}/${loc}/det.${k}`)
		);
		if (lib.decisions.length !== 3) problems.push(`${c.slug}/${loc}: lib.decisions is ${lib.decisions.length}, expected 3`);
		if (det.decisions.length !== 3) problems.push(`${c.slug}/${loc}: det.decisions is ${det.decisions.length}, expected 3`);
		if (det.specs.length !== 3) problems.push(`${c.slug}/${loc}: det.specs is ${det.specs.length}, expected 3`);
		require(c.figure[loc], `${c.slug}/${loc}/figure`);
		require(c.measure[loc], `${c.slug}/${loc}/measure`);
	}
	const live = path.join(ROOT, "cases/library", c.slug, "index.html");
	if (!fs.existsSync(live)) problems.push(`${c.slug}: no live concept at cases/library/${c.slug}/index.html`);
}

for (const row of home.en.work.rows) {
	if (!cases.some((c) => c.slug === row.slug)) problems.push(`home.en: work row slug "${row.slug}" is not a case`);
}

if (problems.length) {
	console.error("Build failed:\n" + problems.map((p) => `  - ${p}`).join("\n"));
	process.exit(1);
}

/* — pages ———————————————————————————————————————————————————————— */

const written = [];
const pages = [];

for (const loc of LOCALES) {
	const other = loc === "en" ? "zh" : "en";

	const homeCtx = context({
		loc,
		ui: ui[loc],
		home: home[loc],
		depth: 1,
		path: `${loc}/index.html`,
		altPath: `${other}/index.html`,
	});
	written.push(write(`${loc}/index.html`, renderHome(homeCtx, cases)));
	pages.push({ path: `${loc}/index.html`, loc, priority: loc === "en" ? "1.0" : "0.9", changefreq: "weekly" });

	const libCtx = context({
		loc,
		ui: ui[loc],
		home: home[loc],
		depth: 2,
		path: `${loc}/cases/index.html`,
		altPath: `${other}/cases/index.html`,
	});
	written.push(write(`${loc}/cases/index.html`, renderLibrary(libCtx, cases)));
	pages.push({ path: `${loc}/cases/index.html`, loc, priority: "0.9", changefreq: "weekly" });

	cases.forEach((c, i) => {
		const ctx = context({
			loc,
			ui: ui[loc],
			home: home[loc],
			depth: 2,
			path: `${loc}/cases/${c.slug}.html`,
			altPath: `${other}/cases/${c.slug}.html`,
		});
		written.push(write(`${loc}/cases/${c.slug}.html`, renderDetail(ctx, cases, i)));
		pages.push({ path: `${loc}/cases/${c.slug}.html`, loc, priority: "0.7", changefreq: "monthly" });
	});
}

/* — root: pick a language, then get out of the way ————————————————
   A stored choice wins, then the browser's own languages, then English.
   Without scripting the noscript refresh sends everyone to English. */

const rootPage = `<!DOCTYPE html>
<html lang="en">

<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>Yonder Tech</title>
	<meta name="robots" content="noindex, follow" />
	<link rel="canonical" href="${SITE}/en/index.html" />
	<link rel="alternate" hreflang="${HREFLANG.en}" href="${SITE}/en/index.html" />
	<link rel="alternate" hreflang="${HREFLANG.zh}" href="${SITE}/zh/index.html" />
	<link rel="alternate" hreflang="x-default" href="${SITE}/en/index.html" />
	<link rel="icon" href="assets/favicon.svg" type="image/svg+xml" />
	<noscript><meta http-equiv="refresh" content="0; url=en/index.html" /></noscript>
	<script>
		(function () {
			var target = "en";
			try {
				var stored = window.localStorage.getItem("yt-lang");
				if (stored === "en" || stored === "zh") {
					target = stored;
				} else {
					var langs = navigator.languages || [navigator.language || ""];
					for (var i = 0; i < langs.length; i++) {
						if (/^zh\\b/i.test(langs[i])) { target = "zh"; break; }
						if (/^[a-z]{2}\\b/i.test(langs[i])) break;
					}
				}
			} catch (e) { /* private mode, or no storage: fall through to English */ }
			window.location.replace(target + "/index.html");
		})();
	</script>
	<style>
		body { margin: 0; display: grid; min-height: 100vh; place-items: center;
			background: #f3f2f2; color: #201e1d; font: 15px/1.6 system-ui, sans-serif; }
		a { color: #713227; }
	</style>
</head>

<body>
	<p><a href="en/index.html">English</a> · <a href="zh/index.html" lang="zh-CN">中文</a></p>
</body>

</html>
`;
written.push(write("index.html", rootPage));

/* — sitemap ——————————————————————————————————————————————————————
   Legacy entries are kept as curated; the generated pages are rewritten each
   build, with hreflang alternates so the pair is understood as one page. */

const sitemapPath = path.join(ROOT, "sitemap.xml");
const existing = fs.readFileSync(sitemapPath, "utf8");
const legacy = existing
	.split("\n")
	.filter((line) => line.includes("<url>"))
	.filter((line) => {
		const loc = /<loc>([^<]+)<\/loc>/.exec(line);
		if (!loc) return false;
		const rel = loc[1].replace(`${SITE}/`, "");
		return rel !== "index.html" && !rel.startsWith("en/") && !rel.startsWith("zh/");
	});

const today = new Date().toISOString().slice(0, 10);
const generated = pages.map((p) => {
	const other = p.loc === "en" ? "zh" : "en";
	const altPath = p.path.replace(new RegExp(`^${p.loc}/`), `${other}/`);
	const alt = (loc, href) =>
		`<xhtml:link rel="alternate" hreflang="${HREFLANG[loc]}" href="${SITE}/${href}" />`;
	const enHref = p.loc === "en" ? p.path : altPath;
	return (
		`\t<url><loc>${SITE}/${p.path}</loc><lastmod>${today}</lastmod>` +
		`<changefreq>${p.changefreq}</changefreq><priority>${p.priority}</priority>` +
		alt("en", p.loc === "en" ? p.path : altPath) +
		alt("zh", p.loc === "zh" ? p.path : altPath) +
		`<xhtml:link rel="alternate" hreflang="x-default" href="${SITE}/${enHref}" /></url>`
	);
});

write(
	"sitemap.xml",
	`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${legacy.join("\n")}

${generated.join("\n")}
</urlset>
`
);
written.push("sitemap.xml");

console.log(`Wrote ${written.length} files:`);
console.log(`  ${pages.length} generated pages (${LOCALES.length} locales x ${1 + 1 + cases.length})`);
console.log(`  index.html (language switch), sitemap.xml (${legacy.length} legacy + ${generated.length} generated)`);
