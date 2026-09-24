import { esc, head, header, contact, footer, scripts, orgJsonLd } from "./chrome.mjs";
import { latestCards } from "./insights.mjs";

export const renderHome = (ctx, cases, articles) => {
	const { home, root, libraryHref } = ctx;
	const thumbFor = (slug) => cases.find((c) => c.slug === slug);

	/* The first case leads, image and copy side by side; the rest sit
	   under it as a row of three. The whole card is the link. */
	const workCard = (row, index) => {
		const c = thumbFor(row.slug);
		return `				<a class="yt-case${index === 0 ? " yt-case-lead" : ""}" href="cases/${esc(row.slug)}.html">
					<div class="yt-case-media">
						<img src="${esc(c.thumb)}" alt="${esc(row.alt)}" loading="lazy" width="800" height="600" />
					</div>
					<div class="yt-case-body">
						<div class="yt-meta"><span class="yt-case-num">${esc(row.num)}</span>${esc(row.meta)}</div>
						<h3 class="yt-h3 yt-case-title">${esc(row.title)}</h3>
						<p class="yt-case-text">${esc(row.body)}</p>
						<div class="yt-case-metric">
							<span class="yt-case-figure">${esc(row.figure)}</span>
							<span class="yt-case-measure">${esc(row.measure)}</span>
						</div>
					</div>
				</a>`;
	};

	return `${head({
		ctx,
		title: home.title,
		description: home.description,
		image: home.method.photo,
	})}
${orgJsonLd()}

<body>
${header(ctx, "work")}

	<main>
		<section class="yt-hero-band">
			<div class="yt-hero-globe" id="yt-globe"></div>
			<div class="yt-hero-scrim" aria-hidden="true"></div>
			<div class="yt-wrap yt-hero">
				<span class="yt-eyebrow">${esc(home.hero.eyebrow)}</span>
				<h1 class="yt-h1">${home.hero.lines.map((l) => `<span>${esc(l)}</span>`).join("")}</h1>
				<p class="yt-lede">${esc(home.hero.lede)}</p>
				<div class="yt-btn-row">
					<a class="yt-link hv1" href="#work">${esc(home.hero.primary)} <span class="yt-arrow" aria-hidden="true">↓</span></a>
					<a class="yt-link yt-link-muted hv2" href="#capabilities">${esc(home.hero.secondary)}</a>
				</div>
			</div>
		</section>

		<section class="yt-wrap yt-work" id="work">
			<div class="yt-head-row">
				<div>
					<span class="yt-eyebrow">${esc(home.work.eyebrow)}</span>
					<h2 class="yt-h2">${esc(home.work.heading)}</h2>
					<p class="yt-head-lede">${esc(home.work.lede)}</p>
				</div>
				<a class="yt-link yt-link-nowrap hv1" href="${libraryHref}">${esc(home.work.link)} <span class="yt-arrow" aria-hidden="true">→</span></a>
			</div>

			<div class="yt-case-grid">
${home.work.rows.map((row, i) => workCard(row, i)).join("\n")}
			</div>

			<p class="yt-note">${esc(home.work.note)}</p>
		</section>

		<section class="yt-stats-band">
			<div class="yt-wrap yt-stats">
${home.stats
	.map(
		(s) => `				<div>
					<div class="yt-stat-figure">${esc(s.figure)}</div>
					<div class="yt-stat-label">${esc(s.label)}</div>
				</div>`
	)
	.join("\n")}
			</div>
		</section>

		<section class="yt-wrap yt-section yt-cap-section" id="capabilities">
			<div class="yt-cap-intro">
				<span class="yt-eyebrow">${esc(home.capabilities.eyebrow)}</span>
				<h2 class="yt-h2 yt-cap-heading">${esc(home.capabilities.heading)}</h2>
			</div>
			<div class="yt-cap-grid">
${home.capabilities.items
	.map(
		(item) => `				<div class="yt-cap">
					<div class="yt-cap-num">${esc(item.num)}</div>
					<h3>${esc(item.title)}</h3>
					<p>${esc(item.body)}</p>
				</div>`
	)
	.join("\n")}
			</div>
		</section>

		<section class="yt-method-band" id="method">
			<div class="yt-wrap yt-section yt-method">
				<div class="yt-method-col">
					<span class="yt-eyebrow">${esc(home.method.eyebrow)}</span>
					<h2 class="yt-h2 yt-h2-sub yt-method-heading">${esc(home.method.heading)}</h2>
					<div class="yt-steps">
${home.method.steps
	.map(
		(step) => `						<div class="yt-step">
							<div class="yt-step-num">${esc(step.num)}</div>
							<div>
								<div class="yt-step-title">${esc(step.title)}</div>
								<p>${esc(step.body)}</p>
							</div>
						</div>`
	)
	.join("\n")}
					</div>
				</div>
				<figure class="yt-method-figure grayscale">
					<img src="${esc(home.method.photo)}" alt="${esc(home.method.photoAlt)}" loading="lazy" width="1400" height="1750" />
				</figure>
			</div>
		</section>

		<section id="insights">
			<div class="yt-wrap yt-section">
				<div class="yt-head-row">
					<div>
						<span class="yt-eyebrow">${esc(home.insights.eyebrow)}</span>
						<h2 class="yt-h2 yt-h2-sub">${esc(home.insights.heading)}</h2>
					</div>
					<a class="yt-link yt-link-nowrap hv1" href="insights/index.html">${esc(home.insights.link)} <span class="yt-arrow" aria-hidden="true">→</span></a>
				</div>
				<div class="yt-cards">
${latestCards(ctx, articles)}
				</div>
			</div>
		</section>

${contact(ctx, { lines: home.contact.lines, body: home.contact.body, withForm: true })}
	</main>

${footer(ctx)}
	<script type="importmap">
		{
			"imports": {
				"three": "${root}assets/vendor/three/three.module.min.js",
				"three/addons/": "${root}assets/vendor/three/addons/"
			}
		}
	</script>
	<script type="module">
		/* The globe is a quarter of a megabyte of renderer before it draws a
		   pixel, so it is imported only once the hero is actually on screen —
		   a visitor who lands and scrolls straight past never pays for it. */
		const mount = document.getElementById("yt-globe");
		if (mount) {
			const start = async () => {
				try {
					const { createEarth } = await import("${root}cases/library/earth/earth.js");
					const view = await createEarth(mount, {
						background: 0x05070d,
						stars: true,
						starField: { brightness: 3, size: 1.6 },
						offset: { x: 0.2, minWidth: 861 },
						arcs: 26,
						spin: 0.036,
						mapSize: 1024,
						landSize: 2048,
						segments: 96,
						camera: { fov: 26, distance: 7.1 },
						bloom: { strength: 0.34, radius: 0.7, threshold: 0.8 },
						grain: 0.02,
						vignette: 0.55,
					});
					mount.dataset.ready = "true";
					window.addEventListener("pagehide", () => view.dispose(), { once: true });
				} catch (error) {
					console.error(error);
				}
			};
			if ("IntersectionObserver" in window) {
				const watcher = new IntersectionObserver((entries, observer) => {
					if (entries.some((entry) => entry.isIntersecting)) {
						observer.disconnect();
						start();
					}
				}, { rootMargin: "300px" });
				watcher.observe(mount);
			} else {
				start();
			}
		}
	</script>
${scripts(ctx)}
</body>

</html>
`;
};
