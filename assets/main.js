(() => {
	const getRootPath = () => {
		const fallback = "/";
		const script =
			document.currentScript || document.querySelector('script[src*="assets/main.js"]');
		if (!script) return fallback;
		try {
			const src = script.getAttribute("src") || "";
			const url = new URL(src, window.location.href);
			const parts = url.pathname.split("/").filter(Boolean);
			const assetsIndex = parts.lastIndexOf("assets");
			if (assetsIndex <= 0) return fallback;
			return `/${parts.slice(0, assetsIndex).join("/")}/`;
		} catch {
			return fallback;
		}
	};

	const rootPath = getRootPath();

	const getBasePath = (pathnameOverride) => {
		const pathname = decodeURIComponent(pathnameOverride || window.location.pathname).replace(/\\/g, "/");
		const pathParts = pathname.split("/").filter(Boolean);
		const currentDirParts =
			pathParts.length > 0 && pathParts[pathParts.length - 1].includes(".")
				? pathParts.slice(0, -1)
				: pathParts;
		const rootParts = rootPath.split("/").filter(Boolean);

		let commonIndex = 0;
		while (
			commonIndex < currentDirParts.length &&
			commonIndex < rootParts.length &&
			currentDirParts[commonIndex] === rootParts[commonIndex]
		) {
			commonIndex += 1;
		}

		const depth = currentDirParts.length - commonIndex;
		return depth <= 0 ? "" : "../".repeat(depth);
	};

	let base = getBasePath();
	const headerTarget = document.querySelector(".site-header") || (() => {
		const wrapper = document.createElement("div");
		wrapper.className = "site-header";
		const page = document.querySelector(".page");
		if (page) {
			page.prepend(wrapper);
		}
		return wrapper;
	})();
	const footerTarget = document.querySelector(".footer") || (() => {
		const wrapper = document.createElement("div");
		wrapper.className = "footer";
		const page = document.querySelector(".page");
		if (page) {
			page.append(wrapper);
		}
		return wrapper;
	})();

	const partialCache = new Map();
	const injectPartial = async (path, target) => {
		if (target?.dataset?.static === "true") {
			return;
		}
		try {
			let template = partialCache.get(path);
			if (!template) {
				const response = await fetch(`${base}${path}`);
				if (!response.ok) {
					console.error("Failed to load partial:", path, response.status);
					return;
				}
				template = await response.text();
				partialCache.set(path, template);
			}
			target.innerHTML = template.replace(/{{base}}/g, base);
			target.dataset.partialLoaded = "true";
		} catch (error) {
			console.error("Failed to load partial:", path, error);
		}
	};

	const refreshPartials = () =>
		Promise.all([
			injectPartial("assets/partials/header.html", headerTarget),
			injectPartial("assets/partials/footer.html", footerTarget),
		]);

	const initScrollBehavior = () => {
		const header = document.querySelector(".site-header");
		if (!header) return;
		let lastScrollY = window.scrollY;
		let ticking = false;

		const onScroll = () => {
			const currentY = window.scrollY;
			const delta = currentY - lastScrollY;

			if (currentY < 10) {
				header.classList.remove("is-hidden");
			} else if (delta > 5) {
				header.classList.add("is-hidden");
			} else if (delta < -5) {
				header.classList.remove("is-hidden");
			}

			lastScrollY = currentY;
			ticking = false;
		};

		window.addEventListener("scroll", () => {
			if (!ticking) {
				window.requestAnimationFrame(onScroll);
				ticking = true;
			}
		});
	};

	const initSpaNavigation = () => {
		const contentTarget = document.querySelector(".page-content");
		if (!contentTarget) return;

		const initCaseLibrary = () => {
			const library = document.querySelector(".case-library");
			if (!library) return;
			const buttons = Array.from(library.querySelectorAll(".filter-btn"));
			const cards = Array.from(library.querySelectorAll(".case-card"));
			if (buttons.length === 0 || cards.length === 0) return;

			const applyFilter = (filter) => {
				cards.forEach((card) => {
					const tags = (card.dataset.tags || "").split(" ").filter(Boolean);
					const matches = filter === "all" || tags.includes(filter);
					card.classList.toggle("is-hidden", !matches);
				});
				buttons.forEach((button) => {
					button.classList.toggle("is-active", button.dataset.filter === filter);
				});
			};

			buttons.forEach((button) => {
				button.addEventListener("click", () => {
					applyFilter(button.dataset.filter || "all");
				});
			});

			applyFilter("all");
		};

		const initCaseViewer = (urlOverride) => {
			const viewer = document.querySelector(".case-viewer");
			if (!viewer) return;
			const frame = viewer.querySelector("iframe");
			const fallback = viewer.querySelector(".case-viewer-fallback");
			const errorText = viewer.querySelector(".case-viewer-error");
			if (!frame) return;
			const resolvedUrl = urlOverride ? new URL(urlOverride, window.location.href) : window.location;
			const params = new URLSearchParams(resolvedUrl.search);
			const casePath = params.get("case") || "";
			const allowedPrefix = "cases/library/";
			let normalized = casePath.trim();
			if (normalized) {
				try {
					const parsed = new URL(normalized, window.location.href);
					normalized = parsed.pathname.replace(/^\/+/, "");
				} catch {
					normalized = normalized.replace(/^\/+/, "");
				}
			}
			if (!normalized.includes(allowedPrefix)) {
				if (errorText) {
					errorText.textContent = "Case path is missing or invalid.";
				}
				return;
			}
			const startIndex = normalized.indexOf(allowedPrefix);
			const trimmed = normalized.slice(startIndex);
			const fullPath = `${rootPath}${trimmed}`;
			frame.src = fullPath;
			if (fallback) {
				fallback.href = fullPath;
			}
		};

		const shouldHandle = (link) => {
			if (!link) return false;
			if (link.target && link.target !== "_self") return false;
			if (link.hasAttribute("download")) return false;
			if (link.dataset.noSpa !== undefined) return false;
			const url = new URL(link.href, window.location.href);
			return url.origin === window.location.origin;
		};

		const loadPage = async (url, pushState = true) => {
			const controller = new AbortController();
			const timeoutId = window.setTimeout(() => controller.abort(), 8000);
			try {
				const response = await fetch(url, {
					headers: { "X-Requested-With": "spa" },
					signal: controller.signal,
				});
				if (!response.ok) {
					window.location.href = url;
					return;
				}
				const html = await response.text();
				const parser = new DOMParser();
				const doc = parser.parseFromString(html, "text/html");
				const newContent = doc.querySelector(".page-content");
				if (!newContent) {
					window.location.href = url;
					return;
				}
				contentTarget.innerHTML = newContent.innerHTML;
				document.title = doc.title || document.title;
				base = getBasePath(new URL(url, window.location.href).pathname);
				await refreshPartials();
				if (pushState) {
					window.history.pushState({ url }, "", url);
				}
				initCaseLibrary();
				initCaseViewer(url);
				window.scrollTo({ top: 0, behavior: "instant" });
			} catch (error) {
				console.error("SPA navigation failed:", error);
				window.location.href = url;
			} finally {
				window.clearTimeout(timeoutId);
			}
		};

		document.addEventListener("click", (event) => {
			const link = event.target.closest("a");
			if (!shouldHandle(link)) return;
			const url = new URL(link.href, window.location.href);
			if (url.hash) return;
			event.preventDefault();
			loadPage(url.href, true);
		});

		window.addEventListener("popstate", (event) => {
			const url = event.state?.url || window.location.href;
			loadPage(url, false);
		});

			initCaseLibrary();
			initCaseViewer();
	};

	refreshPartials().finally(() => {
		initScrollBehavior();
		initSpaNavigation();
	});
})();
