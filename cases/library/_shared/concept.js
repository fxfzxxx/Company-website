/* Shared behaviour for the case library concepts. Small on purpose: scroll
   reveals, a header that firms up once the page moves, and tab groups. Each
   concept's own look lives entirely in its assets/styles.css. */

(() => {
	const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

	/* [data-reveal] fades up once when it enters the viewport. Children of a
	   [data-stagger] parent get increasing delays. */
	document.querySelectorAll("[data-stagger]").forEach((group) => {
		[...group.children].forEach((el, i) => {
			el.setAttribute("data-reveal", "");
			el.style.setProperty("--d", `${i * 70}ms`);
		});
	});
	const items = document.querySelectorAll("[data-reveal]");
	if (reduce || !("IntersectionObserver" in window)) {
		items.forEach((el) => el.classList.add("is-in"));
	} else {
		const io = new IntersectionObserver(
			(entries) =>
				entries.forEach((e) => {
					if (e.isIntersecting) {
						e.target.classList.add("is-in");
						io.unobserve(e.target);
					}
				}),
			{ rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
		);
		items.forEach((el) => io.observe(el));
	}

	/* The header gets .is-scrolled after the first 24px. */
	const header = document.querySelector("[data-header]");
	if (header) {
		const onScroll = () => header.classList.toggle("is-scrolled", scrollY > 24);
		addEventListener("scroll", onScroll, { passive: true });
		onScroll();
	}

	/* [data-tabs]: buttons with data-tab="x" show the [data-panel="x"] inside
	   the same group and hide its siblings. */
	document.querySelectorAll("[data-tabs]").forEach((group) => {
		const tabs = group.querySelectorAll("[data-tab]");
		const panels = group.querySelectorAll("[data-panel]");
		const show = (key) => {
			tabs.forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === key)));
			panels.forEach((p) => (p.hidden = p.dataset.panel !== key));
		};
		tabs.forEach((t) => t.addEventListener("click", () => show(t.dataset.tab)));
		const first = [...tabs].find((t) => t.getAttribute("aria-selected") === "true") || tabs[0];
		if (first) show(first.dataset.tab);
	});

	/* [data-toggle-group]: exclusive pressed state for chip rows. */
	document.querySelectorAll("[data-toggle-group]").forEach((group) => {
		group.addEventListener("click", (e) => {
			const btn = e.target.closest("button");
			if (!btn || !group.contains(btn)) return;
			group.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
		});
	});
})();
