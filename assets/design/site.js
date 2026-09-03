/* Yonder Tech — Modernist pages.
   Four behaviours, no framework: header auto-hide, case-library filtering,
   the row accordion, and the contact form's submit handling.

   These pages deliberately do not load assets/main.js: that script is the
   legacy site's SPA shell and would swap this page's body into the old
   chrome. Links from legacy pages into here carry data-no-spa for the same
   reason. */
(() => {
	"use strict";

	/* — header: hide on scroll down, return on scroll up ——————————— */
	const initHeader = () => {
		const header = document.querySelector(".yt-header");
		if (!header) return;
		let lastY = window.scrollY;
		let ticking = false;

		const onScroll = () => {
			const y = window.scrollY;
			const delta = y - lastY;
			if (y < 10) {
				header.classList.remove("is-hidden");
			} else if (delta > 5 && y > 120) {
				header.classList.add("is-hidden");
			} else if (delta < -5) {
				header.classList.remove("is-hidden");
			}
			lastY = y;
			ticking = false;
		};

		window.addEventListener(
			"scroll",
			() => {
				if (ticking) return;
				ticking = true;
				window.requestAnimationFrame(onScroll);
			},
			{ passive: true }
		);
	};

	/* — case library: single-select filter, reflected in the URL ————
	   The filter lives in ?tag= so a filtered view can be linked and
	   survives a reload. */
	const initFilter = () => {
		const bar = document.querySelector("[data-filters]");
		const list = document.querySelector("[data-cases]");
		if (!bar || !list) return;

		const chips = Array.from(bar.querySelectorAll("[data-tag]"));
		const items = Array.from(list.querySelectorAll("[data-tags]"));
		const count = document.querySelector("[data-count]");
		const total = items.length;

		const apply = (tag, pushUrl) => {
			const match = chips.some((chip) => chip.dataset.tag === tag) ? tag : "All";
			let shown = 0;

			items.forEach((item) => {
				const tags = (item.dataset.tags || "").split(",").filter(Boolean);
				const visible = match === "All" || tags.includes(match);
				item.hidden = !visible;
				if (visible) shown += 1;
				if (!visible) collapse(item);
			});

			chips.forEach((chip) => {
				chip.setAttribute("aria-pressed", String(chip.dataset.tag === match));
			});

			if (count) {
				const template =
					shown === total
						? count.getAttribute("data-count-all")
						: count.getAttribute("data-count-some");
				count.textContent = (template || "")
					.replace("{n}", String(shown))
					.replace("{total}", String(total));
			}

			if (pushUrl) {
				const url = new URL(window.location.href);
				if (match === "All") {
					url.searchParams.delete("tag");
				} else {
					url.searchParams.set("tag", match);
				}
				window.history.replaceState(null, "", url.toString());
			}
		};

		chips.forEach((chip) => {
			chip.addEventListener("click", () => apply(chip.dataset.tag, true));
		});

		apply(new URL(window.location.href).searchParams.get("tag") || "All", false);
	};

	/* — case library: row accordion, one row open at a time ————————— */
	const collapse = (item) => {
		const trigger = item.querySelector("[data-toggle]");
		const panel = item.querySelector("[data-panel]");
		if (!trigger || !panel) return;
		trigger.setAttribute("aria-expanded", "false");
		panel.hidden = true;
		const sign = trigger.querySelector("[data-sign]");
		if (sign) sign.textContent = "+";
	};

	const initAccordion = () => {
		const list = document.querySelector("[data-cases]");
		if (!list) return;
		const items = Array.from(list.querySelectorAll("[data-tags]"));

		items.forEach((item) => {
			const trigger = item.querySelector("[data-toggle]");
			const panel = item.querySelector("[data-panel]");
			if (!trigger || !panel) return;

			trigger.addEventListener("click", () => {
				const isOpen = trigger.getAttribute("aria-expanded") === "true";
				items.forEach(collapse);
				if (isOpen) return;
				trigger.setAttribute("aria-expanded", "true");
				panel.hidden = false;
				const sign = trigger.querySelector("[data-sign]");
				if (sign) sign.textContent = "–";
			});
		});
	};

	/* — contact form ————————————————————————————————————————————————
	   Posts to Netlify and returns to this page with ?success=true, which is
	   what renders the confirmation on load. */
	const initForm = () => {
		const form = document.querySelector("[data-contact-form]");
		if (!form) return;

		const success = form.querySelector("[data-success]");
		const error = form.querySelector("[data-error]");
		const button = form.querySelector("[data-submit]");
		const idleLabel = button ? button.textContent : "";
		const busyLabel = button ? button.getAttribute("data-busy") || idleLabel : "";

		if (success && new URL(window.location.href).searchParams.get("success") === "true") {
			success.hidden = false;
		}

		form.addEventListener("submit", async (event) => {
			event.preventDefault();
			if (success) success.hidden = true;
			if (error) error.hidden = true;
			if (button) {
				button.disabled = true;
				button.textContent = busyLabel;
			}

			try {
				const body = new URLSearchParams();
				new FormData(form).forEach((value, key) => body.append(key, String(value)));

				const action = form.getAttribute("action") || window.location.pathname;
				const response = await fetch(action, {
					method: "POST",
					headers: { "Content-Type": "application/x-www-form-urlencoded" },
					body: body.toString(),
				});
				if (!response.ok) throw new Error("Form submission failed");
				window.location.href = action;
			} catch {
				if (error) error.hidden = false;
			} finally {
				if (button) {
					button.disabled = false;
					button.textContent = idleLabel;
				}
			}
		});
	};

	initHeader();
	initFilter();
	initAccordion();
	initForm();
})();
