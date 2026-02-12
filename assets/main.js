(() => {
	const getBasePath = () => {
		const marker = "/websites/";
		const pathname = decodeURIComponent(window.location.pathname).replace(/\\/g, "/");
		let depth = 0;
		if (pathname.includes(marker)) {
			const subPath = pathname.split(marker).pop() || "";
			const segments = subPath.split("/").filter(Boolean);
			const trailingSlash = subPath.endsWith("/");
			depth = trailingSlash ? segments.length : Math.max(segments.length - 1, 0);
		} else {
			const parts = pathname.split("/").filter(Boolean);
			const trailingSlash = pathname.endsWith("/");
			depth = trailingSlash ? parts.length : Math.max(parts.length - 1, 0);
		}
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

	const injectPartial = async (path, target) => {
		try {
			const response = await fetch(`${base}${path}`);
			if (!response.ok) {
				console.error("Failed to load partial:", path, response.status);
				return;
			}
			const html = await response.text();
			target.innerHTML = html.replace(/{{base}}/g, base);
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
				base = getBasePath();
				await refreshPartials();
				if (pushState) {
					window.history.pushState({ url }, "", url);
				}
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
	};

	refreshPartials().finally(() => {
		initScrollBehavior();
		initSpaNavigation();
	});
})();
