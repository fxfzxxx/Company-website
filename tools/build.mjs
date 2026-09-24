/* Static site generator for the Modernist pages.
   Reads content/*.json and the Markdown articles in content/insights/<loc>/,
   writes /en and /zh, the root language switch and the sitemap. To publish an
   article, add <slug>.md to both content/insights/en and content/insights/zh
   (same slug, date and category) and rebuild. No dependencies: run it with `node tools/build.mjs`. The output is
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
import { CATEGORIES, markdown, readingMinutes, renderArticle, renderInsightsIndex } from "./templates/insights.mjs";

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

/* Articles: content/insights/<loc>/<slug>.md, each opening with a front
   matter block of title, dek, category and date. Newest first. */
const readArticles = (loc) => {
	const dir = path.join(ROOT, "content/insights", loc);
	return fs
		.readdirSync(dir)
		.filter((f) => f.endsWith(".md"))
		.map((f) => {
			const raw = fs.readFileSync(path.join(dir, f), "utf8");
			const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw);
			if (!m) throw new Error(`content/insights/${loc}/${f}: no front matter`);
			const meta = Object.fromEntries(
				m[1].split("\n").map((line) => {
					const i = line.indexOf(":");
					return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
				})
			);
			return {
				slug: f.replace(/\.md$/, ""),
				...meta,
				html: markdown(m[2]),
				minutes: readingMinutes(m[2], loc),
			};
		})
		.sort((a, b) => b.date.localeCompare(a.date));
};
const articles = { en: readArticles("en"), zh: readArticles("zh") };

/* Each article's two images: a cover and a diagram, rendered by
   tools/render-insight-figures.mjs from content/insights/figures.json. */
const figures = read("content/insights/figures.json");
// width and height straight from the PNG header, for the img attributes
const pngSize = (rel) => {
	const file = path.join(ROOT, rel);
	if (!fs.existsSync(file)) return { width: 1600, height: 1000 };
	const b = fs.readFileSync(file);
	return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
};
for (const loc of LOCALES) {
	for (const a of articles[loc]) {
		const f = figures[a.slug];
		if (!f) continue;
		a.cover = `assets/insights/${a.slug}/cover.jpg`;
		const src = `assets/insights/${a.slug}/figure-${loc}.png`;
		a.figure = { src, title: f.figure[loc].title, caption: f.figure[loc].caption, ...pngSize(src) };
	}
}

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

for (const a of articles.en) {
	const zh = articles.zh.find((x) => x.slug === a.slug);
	if (!zh) problems.push(`insights/${a.slug}: no Chinese version`);
	else if (zh.date !== a.date || zh.category !== a.category) problems.push(`insights/${a.slug}: date or category differs between locales`);
	for (const x of [a, zh].filter(Boolean)) {
		["title", "dek", "date"].forEach((k) => require(x[k], `insights/${x.slug}.${k}`));
		if (!CATEGORIES.includes(x.category)) problems.push(`insights/${x.slug}: unknown category "${x.category}"`);
		if (!/^\d{4}-\d{2}-\d{2}$/.test(x.date || "")) problems.push(`insights/${x.slug}: date must be YYYY-MM-DD`);
	}
}
for (const a of articles.en) {
	if (!figures[a.slug]) {
		problems.push(`insights/${a.slug}: no entry in content/insights/figures.json`);
		continue;
	}
	for (const file of ["cover.jpg", "figure-en.png", "figure-zh.png"]) {
		if (!fs.existsSync(path.join(ROOT, "assets/insights", a.slug, file)))
			problems.push(`insights/${a.slug}: assets/insights/${a.slug}/${file} missing — run tools/render-insight-figures.mjs`);
	}
}
if (articles.zh.length !== articles.en.length) problems.push("insights: the two locales have different article counts");

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
	written.push(write(`${loc}/index.html`, renderHome(homeCtx, cases, articles[loc])));
	pages.push({ path: `${loc}/index.html`, loc, priority: loc === "en" ? "1.0" : "0.9", changefreq: "weekly" });

	const libCtx = context({
		loc,
		ui: ui[loc],
		home: home[loc],
		depth: 2,
		path: `${loc}/cases/index.html`,
		altPath: `${other}/cases/index.html`,
		section: "cases",
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
			section: "cases",
		});
		written.push(write(`${loc}/cases/${c.slug}.html`, renderDetail(ctx, cases, i)));
		pages.push({ path: `${loc}/cases/${c.slug}.html`, loc, priority: "0.7", changefreq: "monthly" });
	});

	const insCtx = context({
		loc,
		ui: ui[loc],
		home: home[loc],
		depth: 2,
		path: `${loc}/insights/index.html`,
		altPath: `${other}/insights/index.html`,
		section: "insights",
	});
	written.push(write(`${loc}/insights/index.html`, renderInsightsIndex(insCtx, articles[loc])));
	pages.push({ path: `${loc}/insights/index.html`, loc, priority: "0.8", changefreq: "weekly" });

	articles[loc].forEach((a, i) => {
		const ctx = context({
			loc,
			ui: ui[loc],
			home: home[loc],
			depth: 2,
			path: `${loc}/insights/${a.slug}.html`,
			altPath: `${other}/insights/${a.slug}.html`,
			section: "insights",
		});
		written.push(write(`${loc}/insights/${a.slug}.html`, renderArticle(ctx, articles[loc], i)));
		pages.push({ path: `${loc}/insights/${a.slug}.html`, loc, priority: "0.6", changefreq: "yearly", lastmod: a.date });
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
			background: #f2f0ec; color: #17181b; font: 15px/1.6 system-ui, sans-serif; }
		a { color: #566576; }
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
		if (rel === "index.html" || rel.startsWith("en/") || rel.startsWith("zh/")) return false;
		// pages deleted from the repository drop out of the sitemap
		const file = rel === "" || rel.endsWith("/") ? `${rel}index.html` : rel;
		return fs.existsSync(path.join(ROOT, file));
	});

const today = new Date().toISOString().slice(0, 10);
const generated = pages.map((p) => {
	const other = p.loc === "en" ? "zh" : "en";
	const altPath = p.path.replace(new RegExp(`^${p.loc}/`), `${other}/`);
	const alt = (loc, href) =>
		`<xhtml:link rel="alternate" hreflang="${HREFLANG[loc]}" href="${SITE}/${href}" />`;
	const enHref = p.loc === "en" ? p.path : altPath;
	return (
		`\t<url><loc>${SITE}/${p.path}</loc><lastmod>${p.lastmod || today}</lastmod>` +
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
console.log(`  ${pages.length} generated pages (${LOCALES.length} locales x ${1 + 1 + cases.length} + ${1 + articles.en.length} insights)`);
console.log(`  index.html (language switch), sitemap.xml (${legacy.length} legacy + ${generated.length} generated)`);
