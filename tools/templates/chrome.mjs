/* Shared page chrome: head, header, contact banner, footer.
   Every string that reaches the page goes through esc(). */

export const SITE = "https://yondertech.co.nz";
export const LOCALES = ["en", "zh"];
export const HREFLANG = { en: "en-NZ", zh: "zh-Hans" };

const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ENTITIES[c]);

/* Build context for one page.
   root      — hops back to the repository root, for legacy links and assets
   homeHref  — this locale's homepage
   altHref   — the same page in the other locale
   path      — path from the site root, used for canonical and hreflang  */
export const context = ({ loc, ui, home, depth, path, altPath }) => {
	const other = loc === "en" ? "zh" : "en";
	const root = "../".repeat(depth);
	return {
		loc,
		other,
		ui,
		home,
		root,
		path,
		altPath,
		homeHref: depth === 1 ? "index.html" : `${"../".repeat(depth - 1)}index.html`,
		libraryHref: depth === 1 ? "cases/index.html" : "index.html",
		altHref: `${root}${altPath}`,
		canonical: `${SITE}/${path}`,
	};
};

export const head = ({ ctx, title, description, image, robots }) => {
	const { root, loc, other, path, altPath, home } = ctx;
	const enPath = loc === "en" ? path : altPath;
	const zhPath = loc === "zh" ? path : altPath;
	return `<!DOCTYPE html>
<html lang="${home.htmlLang}">

<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<meta name="description" content="${esc(description)}" />
	<link rel="canonical" href="${SITE}/${path}" />
	<link rel="alternate" hreflang="${HREFLANG.en}" href="${SITE}/${enPath}" />
	<link rel="alternate" hreflang="${HREFLANG.zh}" href="${SITE}/${zhPath}" />
	<link rel="alternate" hreflang="x-default" href="${SITE}/${enPath}" />
	<link rel="icon" href="${root}assets/favicon.svg" type="image/svg+xml" />
	<meta name="theme-color" content="#a8503f" />${robots ? `\n\t<meta name="robots" content="${robots}" />` : ""}
	<meta property="og:type" content="website" />
	<meta property="og:title" content="${esc(title)}" />
	<meta property="og:description" content="${esc(description)}" />
	<meta property="og:url" content="${SITE}/${path}" />
	<meta property="og:site_name" content="Yonder Tech" />
	<meta property="og:image" content="${esc(image)}" />
	<meta property="og:locale" content="${home.ogLocale}" />
	<meta property="og:locale:alternate" content="${other === "zh" ? "zh_CN" : "en_NZ"}" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="${esc(title)}" />
	<meta name="twitter:description" content="${esc(description)}" />
	<title>${esc(title)}</title>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
	<link
		href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;800&family=Noto+Sans+SC:wght@400;500;700&display=swap"
		rel="stylesheet" />
	<link rel="stylesheet" href="${root}assets/design/modernist.css" />
	<link rel="stylesheet" href="${root}assets/design/site.css" />
	<link rel="stylesheet" href="${root}assets/design/locale.css" />
</head>`;
};

export const orgJsonLd = () => `	<script type="application/ld+json">
	{
		"@context": "https://schema.org",
		"@type": "Organization",
		"name": "Yonder Tech",
		"url": "https://yondertech.co.nz/",
		"logo": "https://yondertech.co.nz/assets/favicon.svg",
		"description": "IT enablement and digital consulting across technology strategy, enterprise architecture, system integration, and data intelligence.",
		"address": {
			"@type": "PostalAddress",
			"streetAddress": "Level 18, 100 Queen Street",
			"addressLocality": "Auckland",
			"postalCode": "1010",
			"addressCountry": "NZ"
		},
		"contactPoint": {
			"@type": "ContactPoint",
			"email": "aaronf@yondertech.co.nz",
			"telephone": "+64 22 595 0228",
			"contactType": "customer service"
		}
	}
	</script>`;

/* The nav is six items. Anchors resolve against this locale's homepage, so
   they work from the library and detail pages too. */
export const header = (ctx, current) => {
	const { home, homeHref, libraryHref, loc, altHref } = ctx;
	const n = home.nav;
	const anchor = (id) => (homeHref === "index.html" ? `#${id}` : `${homeHref}#${id}`);
	const links = [
		{ label: n.work, href: anchor("work"), key: "work" },
		{ label: n.library, href: libraryHref, key: "library" },
		{ label: n.capabilities, href: anchor("capabilities"), key: "capabilities" },
		{ label: n.method, href: anchor("method"), key: "method" },
		{ label: n.insights, href: anchor("insights"), key: "insights" },
		{ label: n.contact, href: "#contact", key: "contact" },
	];

	const langLink = (target, label, className) =>
		target === loc
			? `<a class="is-active${className}" href="#" aria-current="true">${esc(label)}</a>`
			: `<a class="${className.trim()}" href="${altHref}" hreflang="${HREFLANG[target]}">${esc(label)}</a>`;

	return `		<div class="yt-header">
			<nav class="nav yt-nav" aria-label="${loc === "zh" ? "主导航" : "Main"}">
				<a class="yt-brand" href="${homeHref}">Yonder.</a>
				<span class="yt-nav-links">
${links
	.map(
		(l) =>
			`					<a href="${l.href}"${l.key === current ? ' aria-current="page"' : ""}>${esc(l.label)}</a>`
	)
	.join("\n")}
				</span>
				<span class="yt-lang">
					${langLink("en", "EN", "")}
					<span aria-hidden="true">/</span>
					${langLink("zh", "中文", " yt-zh")}
				</span>
			</nav>
		</div>`;
};

const contactForm = (ctx) => {
	const f = ctx.home.contact.form;
	const action = `/${ctx.path}?success=true`;
	return `
				<form class="yt-form" data-contact-form name="contact" method="POST" data-netlify="true"
					netlify-honeypot="bot-field" action="${action}">
					<input type="hidden" name="form-name" value="contact" />
					<input type="hidden" name="bot-field" />
					<span class="yt-form-eyebrow">${esc(f.eyebrow)}</span>
					<div class="yt-form-grid">
						<div class="yt-field">
							<label for="yt-first">${esc(f.firstName)}</label>
							<input class="yt-input" id="yt-first" type="text" name="first_name" autocomplete="given-name" required />
						</div>
						<div class="yt-field">
							<label for="yt-last">${esc(f.lastName)}</label>
							<input class="yt-input" id="yt-last" type="text" name="last_name" autocomplete="family-name" required />
						</div>
						<div class="yt-field yt-field-wide">
							<label for="yt-email">${esc(f.emailLabel)}</label>
							<input class="yt-input" id="yt-email" type="email" name="email" autocomplete="email" required />
						</div>
						<div class="yt-field yt-field-wide">
							<label for="yt-message">${esc(f.message)}</label>
							<textarea class="yt-input" id="yt-message" name="message" rows="4"
								placeholder="${esc(f.messagePlaceholder)}" required></textarea>
						</div>
					</div>
					<div class="yt-form-actions">
						<button class="yt-submit" data-submit type="submit" data-busy="${esc(f.sending)}">${esc(f.submit)}</button>
						<p class="yt-form-msg" data-success role="status" aria-live="polite" hidden>${esc(f.success)}</p>
						<p class="yt-form-msg" data-error role="alert" aria-live="polite" hidden>${esc(f.error)}</p>
					</div>
				</form>`;
};

/* The accent field. Its heading and body come from the homepage copy on the
   homepage and from the library/detail CTA copy elsewhere. */
export const contact = (ctx, { lines, body, withForm }) => {
	const c = ctx.home.contact;
	return `		<section class="yt-contact" id="contact">
			<div class="yt-wrap">
				<h2 class="yt-contact-h2">${lines.map((l) => `<span>${esc(l)}</span>`).join("")}</h2>
				<p class="yt-contact-body">${esc(body)}</p>
				<div class="yt-contact-grid">
					<div>
						<div class="yt-contact-label">${esc(c.email)}</div>
						<a class="yt-contact-link hv3" href="mailto:aaronf@yondertech.co.nz">aaronf@yondertech.co.nz</a>
					</div>
					<div>
						<div class="yt-contact-label">${esc(c.phone)}</div>
						<a class="yt-contact-link hv3" href="tel:+64225950228">+64 22 595 0228</a>
					</div>
					<div>
						<div class="yt-contact-label">${esc(c.office)}</div>
						<div class="yt-contact-addr">${esc(c.officeLine1)}<br />${esc(c.officeLine2)}</div>
					</div>
				</div>${withForm ? contactForm(ctx) : ""}
			</div>
		</section>`;
};

/* The full four-column footer runs on every page: after the redesign it is
   the only route from here to the rest of the site (services, insights,
   about, news), which the six-item nav no longer carries. */
export const footer = (ctx) => {
	const { home, root, libraryHref, altHref } = ctx;
	const f = home.footer;
	const resolve = (href) => {
		if (href === "@library") return libraryHref;
		if (/^(mailto:|tel:|https?:)/.test(href)) return href;
		return `${root}${href}`;
	};

	return `		<footer class="yt-footer">
			<div class="yt-foot-grid">
${f.columns
	.map(
		(col) => `				<div>
					<div class="yt-foot-title">${esc(col.title)}</div>
					<div class="yt-foot-links">${col.links
						.map((l) => `<a href="${esc(resolve(l.href))}">${esc(l.label)}</a>`)
						.join("")}</div>
				</div>`
	)
	.join("\n")}
			</div>
			<div class="yt-foot-bar"></div>
			<div class="yt-foot-legal">
				<span>${esc(f.legal)}</span>
				<span><a href="${altHref}" hreflang="${HREFLANG[ctx.other]}">${esc(f.otherLang)}</a> · ${esc(f.legalLinks)}</span>
			</div>
		</footer>`;
};

export const scripts = (ctx) => `	<script src="${ctx.root}assets/design/site.js"></script>`;
