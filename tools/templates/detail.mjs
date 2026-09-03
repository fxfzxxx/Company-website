import { esc, head, header, contact, footer, scripts } from "./chrome.mjs";

export const renderDetail = (ctx, cases, index) => {
	const { ui, loc, root } = ctx;
	const t = ui.det;
	const item = cases[index];
	const c = item.det[loc];
	const nextItem = cases[(index + 1) % cases.length];
	const next = nextItem.lib[loc];

	const block = (num, title, inner) => `			<div class="yt-block">
				<div class="yt-block-side">
					<div class="yt-block-num">${num}</div>
					<h2 class="yt-block-title">${esc(title)}</h2>
				</div>
				<div class="yt-block-body">
${inner}
				</div>
			</div>`;

	return `${head({
		ctx,
		title: `${c.title} — Yonder Tech`,
		description: c.lede,
		image: item.hero,
	})}

<body>
${header(ctx, "library")}

	<main>
		<article>
			<header class="yt-wrap yt-detail-head">
				<div class="yt-crumb">
					<a href="index.html">${esc(t.navLibrary)}</a>
					<span aria-hidden="true">/</span>
					<span class="yt-crumb-current">${esc(c.crumb)}</span>
				</div>
				<div class="yt-detail-title-row">
					<h1 class="yt-detail-h1">${esc(c.title)}</h1>
					<p class="yt-detail-lede">${esc(c.lede)}</p>
				</div>
			</header>

			<section class="yt-wrap">
				<div class="yt-facts">
${c.facts
	.map(
		(f) => `					<div>
						<div class="yt-fact-label">${esc(f.label)}</div>
						<div class="yt-fact-value">${esc(f.value)}</div>
					</div>`
	)
	.join("\n")}
				</div>
			</section>

			<figure class="yt-detail-hero grayscale">
				<img src="${esc(item.hero)}" alt="${esc(c.title)}" width="2000" height="1333" />
			</figure>

			<section class="yt-wrap yt-detail-body">
${block(
	"01",
	t.brief,
	`					<p>${esc(c.brief)}</p>
					<p>${esc(c.briefTwo)}</p>`
)}

${block(
	"02",
	t.approach,
	`					<div class="yt-dec-list">
${c.decisions
	.map(
		(text, i) => `						<div class="yt-dec">
							<span class="yt-dec-num">0${i + 1}</span>
							<p>${esc(text)}</p>
						</div>`
	)
	.join("\n")}
					</div>`
)}

${block("03", t.outcome, `					<p>${esc(c.outcome)}</p>`)}
			</section>

			<section class="yt-wrap yt-delivered">
				<div class="yt-eyebrow">${esc(t.delivered)}</div>
				<div class="yt-specs">
${c.specs
	.map(
		(s) => `					<div class="yt-spec">
						<div class="yt-spec-figure">${esc(s.figure)}</div>
						<div class="yt-spec-label">${esc(s.label)}</div>
						<div class="yt-spec-note">${esc(s.note)}</div>
					</div>`
	)
	.join("\n")}
				</div>
				<p class="yt-note">${esc(t.note)}</p>
			</section>

			<section class="yt-wrap yt-live">
				<div class="yt-live-inner">
					<div class="yt-live-col">
						<h2 class="yt-live-title">${esc(t.liveTitle)}</h2>
						<p class="yt-live-body">${esc(t.liveBody)}</p>
					</div>
					<a class="yt-btn-solid yt-btn-solid-lg hv6" href="${root}cases/library/${esc(item.slug)}/index.html"
						data-no-spa target="_blank" rel="noopener">${esc(t.openLive)}</a>
				</div>
			</section>

			<section class="yt-wrap yt-next">
				<div class="yt-next-label">${esc(t.next)}</div>
				<a class="yt-next-row hv5" href="${esc(nextItem.slug)}.html">
					<span class="yt-next-num">${esc(nextItem.num)}</span>
					<span class="yt-next-body">
						<span class="yt-meta">${esc(nextItem.det[loc].crumb)}</span>
						<span class="yt-next-title">${esc(next.title)}</span>
					</span>
					<span class="yt-next-read">${esc(t.read)} <span class="yt-arrow" aria-hidden="true">→</span></span>
				</a>
			</section>

${contact(ctx, { lines: [t.ctaTitle], body: t.ctaBody, withForm: false })}
		</article>
	</main>

${footer(ctx)}
${scripts(ctx)}
</body>

</html>
`;
};
