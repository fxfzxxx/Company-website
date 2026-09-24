import { esc, head, header, contact, footer, scripts, SITE } from "./chrome.mjs";

/* Insights: an index of every article and one page per article, in each
   locale. Articles are Markdown files under content/insights/<loc>/, read
   by build.mjs into { slug, title, dek, category, date, html, minutes }. */

export const CATEGORIES = ["ai", "stack", "design", "trends", "data", "strategy"];

/* — Markdown, the small subset the articles use ———————————————————
   ## and ### headings, paragraphs, - and 1. lists, > quotes, **strong**,
   *em*, `code` and [links](href). Everything is escaped first. */

const inline = (text) =>
	esc(text)
		.replace(/`([^`]+)`/g, "<code>$1</code>")
		.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
		.replace(/\*([^*]+)\*/g, "<em>$1</em>")
		.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');

export const markdown = (source) => {
	const out = [];
	const blocks = source.trim().split(/\n\s*\n/);
	for (const block of blocks) {
		const lines = block.split("\n").map((l) => l.trim());
		const first = lines[0];
		if (first.startsWith("### ")) out.push(`<h3>${inline(first.slice(4))}</h3>`);
		else if (first.startsWith("## ")) out.push(`<h2>${inline(first.slice(3))}</h2>`);
		else if (lines.every((l) => l.startsWith("- ")))
			out.push(`<ul>\n${lines.map((l) => `\t<li>${inline(l.slice(2))}</li>`).join("\n")}\n</ul>`);
		else if (lines.every((l) => /^\d+\. /.test(l)))
			out.push(`<ol>\n${lines.map((l) => `\t<li>${inline(l.replace(/^\d+\. /, ""))}</li>`).join("\n")}\n</ol>`);
		else if (lines.every((l) => l.startsWith(">")))
			out.push(`<blockquote><p>${inline(lines.map((l) => l.replace(/^>\s?/, "")).join(" "))}</p></blockquote>`);
		else out.push(`<p>${inline(lines.join(" "))}</p>`);
	}
	return out.join("\n");
};

/* Reading time: English at 220 words a minute, Chinese at 400 characters. */
export const readingMinutes = (source, loc) => {
	const n = loc === "zh" ? source.replace(/\s/g, "").length / 400 : source.split(/\s+/).length / 220;
	return Math.max(2, Math.round(n));
};

export const formatDate = (iso, loc) => {
	const [y, m, d] = iso.split("-").map(Number);
	if (loc === "zh") return `${y} 年 ${m} 月 ${d} 日`;
	const month = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][m - 1];
	return `${d} ${month} ${y}`;
};

const metaLine = (a, t, loc) =>
	`${esc(formatDate(a.date, loc))} · ${esc(t.minutes.replace("{n}", String(a.minutes)))}`;

/* — index —————————————————————————————————————————————————————————— */

export const renderInsightsIndex = (ctx, articles) => {
	const { ui, loc, root } = ctx;
	const t = ui.ins;

	const chip = (key) =>
		`					<button class="yt-chip hv4" type="button" data-tag="${key}" aria-pressed="${key === "All"}">${esc(key === "All" ? t.all : t.categories[key])}</button>`;

	const row = (a) => `				<a class="yt-ins-row hv5" href="${esc(a.slug)}.html" data-tags="${esc(a.category)}">
					<span class="yt-ins-thumb"><img src="${root}${esc(a.cover)}" alt="" loading="lazy" width="1600" height="900" /></span>
					<span class="yt-ins-body">
						<span class="yt-ins-date">${esc(formatDate(a.date, loc))}</span>
						<span class="yt-meta">${esc(t.categories[a.category])}</span>
						<span class="yt-ins-title">${esc(a.title)}</span>
						<span class="yt-ins-dek">${esc(a.dek)}</span>
					</span>
					<span class="yt-ins-read">${esc(t.minutes.replace("{n}", String(a.minutes)))} <span class="yt-arrow" aria-hidden="true">→</span></span>
				</a>`;

	return `${head({ ctx, title: `${t.kicker} — Yonder Tech`, description: t.lede, image: t.image })}

<body>
${header(ctx, "insights")}

	<main>
		<header class="yt-wrap yt-lib-head">
			<span class="yt-eyebrow">${esc(t.kicker)}</span>
			<div class="yt-lib-title-row">
				<h1 class="yt-lib-h1"><span>${esc(t.h1a)}</span><span>${esc(t.h1b)}</span></h1>
				<p class="yt-lib-lede">${esc(t.lede)}</p>
			</div>
		</header>

		<section class="yt-wrap">
			<div class="yt-filter-bar">
				<div class="yt-filters" data-filters role="group" aria-label="${esc(t.topic)}">
					<span class="yt-filter-label">${esc(t.topic)}</span>
${["All", ...CATEGORIES].map(chip).join("\n")}
				</div>
				<div class="yt-count" data-count data-count-all="${esc(t.countAll)}" data-count-some="${esc(t.countSome)}"
					role="status" aria-live="polite">${esc(t.countAll.replace("{total}", String(articles.length)))}</div>
			</div>
		</section>

		<section class="yt-wrap yt-ins-list">
			<div data-cases>
${articles.map(row).join("\n")}
			</div>
		</section>

${contact(ctx, { lines: [ui.det.ctaTitle], body: ui.det.ctaBody, withForm: false })}
	</main>

${footer(ctx)}
${scripts(ctx)}
</body>

</html>
`;
};

/* — article ————————————————————————————————————————————————————————— */

export const renderArticle = (ctx, articles, index) => {
	const { ui, loc, path, root } = ctx;
	const t = ui.ins;
	const a = articles[index];

	// three more: same topic first, then the most recent of the rest
	const others = articles.filter((x) => x.slug !== a.slug);
	const related = [...others.filter((x) => x.category === a.category), ...others.filter((x) => x.category !== a.category)].slice(0, 3);

	const ld = {
		"@context": "https://schema.org",
		"@type": "Article",
		headline: a.title,
		description: a.dek,
		datePublished: a.date,
		image: [`${SITE}/${a.cover}`, `${SITE}/${a.figure.src}`],
		inLanguage: loc === "zh" ? "zh-Hans" : "en-NZ",
		mainEntityOfPage: `${SITE}/${path}`,
		author: { "@type": "Organization", name: "Yonder Tech", url: `${SITE}/` },
		publisher: { "@type": "Organization", name: "Yonder Tech", logo: { "@type": "ImageObject", url: `${SITE}/assets/brand/lockup.svg` } },
	};

	// the diagram goes before the second section heading, closing the first section
	const figure = `<figure class="yt-prose-figure">
	<a href="${root}${esc(a.figure.src)}" target="_blank" rel="noopener"><img src="${root}${esc(a.figure.src)}" alt="${esc(a.figure.title)}" loading="lazy" width="${a.figure.width}" height="${a.figure.height}" /></a>
	<figcaption>${esc(a.figure.caption)}</figcaption>
</figure>`;
	const h2s = [...a.html.matchAll(/^<h2>/gm)];
	const at = h2s.length > 1 ? h2s[1].index : a.html.length;
	const body = `${a.html.slice(0, at)}${figure}\n${a.html.slice(at)}`;

	return `${head({ ctx, title: `${a.title} — Yonder Tech`, description: a.dek, image: `${SITE}/${a.cover}` })}

<body>
${header(ctx, "insights")}

	<main>
		<article class="yt-article">
			<header class="yt-wrap yt-detail-head">
				<div class="yt-crumb">
					<a href="index.html">${esc(t.kicker)}</a>
					<span aria-hidden="true">/</span>
					<span class="yt-crumb-current">${esc(t.categories[a.category])}</span>
				</div>
				<h1 class="yt-article-h1">${esc(a.title)}</h1>
				<p class="yt-article-dek">${esc(a.dek)}</p>
				<div class="yt-article-meta">
					<span>${esc(t.by)}</span>
					<span><time datetime="${a.date}">${esc(formatDate(a.date, loc))}</time> · ${esc(t.minutes.replace("{n}", String(a.minutes)))}</span>
				</div>
			</header>

			<figure class="yt-wrap yt-article-cover">
				<img src="${root}${esc(a.cover)}" alt="" width="1600" height="900" />
			</figure>

			<div class="yt-wrap">
				<div class="yt-prose">
${body
	.split("\n")
	.map((l) => `					${l}`)
	.join("\n")}
				</div>
			</div>

			<section class="yt-wrap yt-ins-more">
				<div class="yt-head-row">
					<div><span class="yt-eyebrow">${esc(t.related)}</span></div>
					<a class="yt-link yt-link-nowrap hv1" href="index.html">${esc(t.allLink)} <span class="yt-arrow" aria-hidden="true">→</span></a>
				</div>
				<div class="yt-cards">
${related
	.map(
		(r) => `					<a class="card" href="${esc(r.slug)}.html">
						<div class="card-kicker">${esc(t.categories[r.category])}</div>
						<h3 class="card-title">${esc(r.title)}</h3>
						<p class="card-body">${esc(r.dek)}</p>
						<div class="card-meta">${metaLine(r, t, loc)}</div>
					</a>`
	)
	.join("\n")}
				</div>
			</section>
		</article>

${contact(ctx, { lines: [ui.det.ctaTitle], body: ui.det.ctaBody, withForm: false })}
	</main>

	<script type="application/ld+json">
${JSON.stringify(ld, null, "\t")
	.split("\n")
	.map((l) => `\t${l}`)
	.join("\n")}
	</script>
${footer(ctx)}
${scripts(ctx)}
</body>

</html>
`;
};

/* The homepage's Insights cards: the three newest articles. */
export const latestCards = (ctx, articles) => {
	const { ui, loc } = ctx;
	const t = ui.ins;
	return articles
		.slice(0, 3)
		.map(
			(a) => `					<a class="card" href="insights/${esc(a.slug)}.html">
						<div class="card-kicker">${esc(t.categories[a.category])}</div>
						<h3 class="card-title">${esc(a.title)}</h3>
						<p class="card-body">${esc(a.dek)}</p>
						<div class="card-meta">${metaLine(a, t, loc)}</div>
					</a>`
		)
		.join("\n");
};
