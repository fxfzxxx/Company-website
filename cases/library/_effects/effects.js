/*
 * Shared showcase effects driver — Inspira UI-inspired, no dependencies.
 *
 * Declarative: add fx-* classes in markup and this wires them up on load.
 *   .fx-meteors[data-meteors="20"]   diagonal streaks across the section
 *   .fx-sparkles[data-sparkles="60"] twinkling starfield
 *   .fx-spotlight                    cursor-following glow
 *   .fx-tilt[data-tilt="8"]          3D tilt toward the cursor
 *   .fx-aurora                       drifting gradient blobs (layer injected)
 *
 * Effects that are purely decorative are skipped entirely when the visitor
 * prefers reduced motion.
 */
(() => {
	const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	const rand = (min, max) => Math.random() * (max - min) + min;

	const initAurora = () => {
		document.querySelectorAll(".fx-aurora").forEach((host) => {
			if (host.querySelector(":scope > .fx-aurora-layer")) return;
			const layer = document.createElement("div");
			layer.className = "fx-aurora-layer";
			layer.setAttribute("aria-hidden", "true");
			host.prepend(layer);
		});
	};

	const initMeteors = () => {
		if (reduceMotion) return;
		document.querySelectorAll(".fx-meteors").forEach((host) => {
			if (host.querySelector(":scope > .fx-meteor")) return;
			const count = Number(host.dataset.meteors) || 14;
			const frag = document.createDocumentFragment();
			for (let i = 0; i < count; i += 1) {
				const meteor = document.createElement("span");
				meteor.className = "fx-meteor";
				meteor.setAttribute("aria-hidden", "true");
				meteor.style.left = `${rand(10, 110)}%`;
				meteor.style.animationDelay = `${rand(0, 8).toFixed(2)}s`;
				meteor.style.animationDuration = `${rand(4, 9).toFixed(2)}s`;
				frag.appendChild(meteor);
			}
			host.prepend(frag);
		});
	};

	const initSparkles = () => {
		if (reduceMotion) return;
		document.querySelectorAll(".fx-sparkles").forEach((host) => {
			if (host.querySelector(":scope > .fx-sparkle-field")) return;
			const count = Number(host.dataset.sparkles) || 50;
			const field = document.createElement("div");
			field.className = "fx-sparkle-field";
			field.setAttribute("aria-hidden", "true");
			for (let i = 0; i < count; i += 1) {
				const dot = document.createElement("span");
				const size = rand(1, 3).toFixed(2);
				dot.className = "fx-sparkle";
				dot.style.width = `${size}px`;
				dot.style.height = `${size}px`;
				dot.style.left = `${rand(0, 100).toFixed(2)}%`;
				dot.style.top = `${rand(0, 100).toFixed(2)}%`;
				dot.style.animationDelay = `${rand(0, 5).toFixed(2)}s`;
				dot.style.animationDuration = `${rand(2.5, 6).toFixed(2)}s`;
				dot.style.setProperty("--fx-sparkle-peak", rand(0.35, 1).toFixed(2));
				field.appendChild(dot);
			}
			host.prepend(field);
		});
	};

	const initSpotlight = () => {
		document.querySelectorAll(".fx-spotlight").forEach((card) => {
			if (card.dataset.fxSpotlight === "true") return;
			card.dataset.fxSpotlight = "true";
			card.addEventListener("pointermove", (event) => {
				const rect = card.getBoundingClientRect();
				card.style.setProperty("--fx-x", `${event.clientX - rect.left}px`);
				card.style.setProperty("--fx-y", `${event.clientY - rect.top}px`);
			});
		});
	};

	const initTilt = () => {
		if (reduceMotion) return;
		document.querySelectorAll(".fx-tilt").forEach((card) => {
			if (card.dataset.fxTilt === "true") return;
			card.dataset.fxTilt = "true";
			const max = Number(card.dataset.tilt) || 6;

			card.addEventListener("pointermove", (event) => {
				if (event.pointerType === "touch") return;
				const rect = card.getBoundingClientRect();
				const px = (event.clientX - rect.left) / rect.width - 0.5;
				const py = (event.clientY - rect.top) / rect.height - 0.5;
				card.classList.add("is-tilting");
				card.style.setProperty("--fx-ry", `${(px * max).toFixed(2)}deg`);
				card.style.setProperty("--fx-rx", `${(-py * max).toFixed(2)}deg`);
			});

			const reset = () => {
				card.classList.remove("is-tilting");
				card.style.setProperty("--fx-ry", "0deg");
				card.style.setProperty("--fx-rx", "0deg");
			};
			card.addEventListener("pointerleave", reset);
			card.addEventListener("blur", reset, true);
		});
	};

	const init = () => {
		document.body.classList.add("fx-scope");
		initAurora();
		initMeteors();
		initSparkles();
		initSpotlight();
		initTilt();
	};

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", init, { once: true });
	} else {
		init();
	}
})();
