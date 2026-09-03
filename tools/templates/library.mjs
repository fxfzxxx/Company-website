import { esc, head, header, contact, footer, scripts } from "./chrome.mjs";

const FILTERS = ["All", "Web", "UI", "Brand", "Product"];

export const renderLibrary = (ctx, cases) => {
	const { ui, loc, root } = ctx;
	const t = ui.lib;

	const chip = (key) => {
		const label = key === "All" ? t.all : ui.tags[key];
		return `					<button class="yt-chip hv4" type="button" data-tag="${esc(key)}" aria-pressed="${key === "All"}">${esc(label)}</button>`;
	};

	const row = (c) => {
		const body = c.lib[loc];
		const tags = c.tags.map((tag) => ui.tags[tag]).join(" / ");
		return `				<div class="yt-lib-item" data-tags="${esc(c.tags.join(","))}">
					<button class="yt-lib-row hv5" type="button" data-toggle aria-expanded="false"
						aria-controls="panel-${esc(c.slug)}">
						<span class="yt-row-num">${esc(c.num)}</span>
						<span class="yt-lib-thumb grayscale">
							<img src="${esc(c.thumb)}" alt="${esc(body.title)}" loading="lazy" width="800" height="600" />
						</span>
						<span class="yt-lib-body">
							<span class="yt-meta">${esc(body.meta)} · ${esc(tags)}</span>
							<span class="yt-lib-title">${esc(body.title)}</span>
						</span>
						<span class="yt-lib-metric">
							<span class="yt-lib-metric-figure">${esc(c.figure[loc])}</span>
							<span class="yt-metric-label">${esc(c.measure[loc])}</span>
						</span>
						<span class="yt-lib-sign" data-sign aria-hidden="true">+</span>
					</button>
					<div class="yt-lib-panel" id="panel-${esc(c.slug)}" data-panel hidden>
						<div>
							<div class="yt-panel-label">${esc(t.brief)}</div>
							<p class="yt-panel-text">${esc(body.brief)}</p>
						</div>
						<div>
							<div class="yt-panel-label">${esc(t.approach)}</div>
							<div class="yt-decisions">
${body.decisions
	.map(
		(text, i) => `								<div class="yt-decision">
									<span class="yt-decision-num">0${i + 1}</span>
									<span class="yt-decision-text">${esc(text)}</span>
								</div>`
	)
	.join("\n")}
							</div>
						</div>
						<div>
							<div class="yt-panel-label">${esc(t.outcome)}</div>
							<p class="yt-panel-text">${esc(body.outcome)}</p>
							<div class="yt-panel-actions">
								<a class="yt-btn-solid hv6" href="${esc(c.slug)}.html">${esc(t.openCase)}</a>
								<a class="yt-link-accent" href="${root}cases/library/${esc(c.slug)}/index.html" data-no-spa
									target="_blank" rel="noopener">${esc(t.openLive)}</a>
							</div>
						</div>
					</div>
				</div>`;
	};

	return `${head({
		ctx,
		title: `${t.kicker} — Yonder Tech`,
		description: t.lede,
		image: cases[0].hero,
	})}

<body>
${header(ctx, "library")}

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
				<div class="yt-filters" data-filters role="group" aria-label="${esc(t.discipline)}">
					<span class="yt-filter-label">${esc(t.discipline)}</span>
${FILTERS.map(chip).join("\n")}
				</div>
				<div class="yt-count" data-count data-count-all="${esc(t.countAll)}" data-count-some="${esc(t.countSome)}"
					role="status" aria-live="polite">${esc(t.countAll.replace("{total}", String(cases.length)))}</div>
			</div>
		</section>

		<section class="yt-wrap yt-lib-list">
			<div data-cases>
${cases.map(row).join("\n")}
			</div>
			<div class="yt-rule"></div>
			<p class="yt-note">${esc(t.note)}</p>
		</section>

${contact(ctx, { lines: [t.ctaTitle], body: t.ctaBody, withForm: false })}
	</main>

${footer(ctx)}
${scripts(ctx)}
</body>

</html>
`;
};
