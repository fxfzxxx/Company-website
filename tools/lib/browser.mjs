/* Finds a Playwright install for the render scripts: a local or global
   package, whichever resolves. PLAYWRIGHT_CHROMIUM points at a specific
   browser binary when the bundled one is not downloaded. */

import { execFileSync, execSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const load = async () => {
	try {
		return await import("playwright");
	} catch {
		const globalRoot = execSync("npm root -g").toString().trim();
		return import(path.join(globalRoot, "playwright/index.mjs"));
	}
};

export const launch = async (opts = {}) => {
	const { chromium } = await load();
	const executablePath = process.env.PLAYWRIGHT_CHROMIUM || undefined;
	return chromium.launch({ executablePath, ...opts });
};

/* Behind a CONNECT-only proxy the browser cannot reach Google Fonts, so
   fetch them with curl (which honours HTTPS_PROXY) and cache on disk. */
export const routeFonts = async (context) => {
	if (!process.env.HTTPS_PROXY) return;
	const cache = path.join(os.tmpdir(), "case-font-cache");
	fs.mkdirSync(cache, { recursive: true });
	await context.route(/fonts\.(googleapis|gstatic)\.com/, async (route) => {
		const url = route.request().url();
		const file = path.join(cache, crypto.createHash("md5").update(url).digest("hex"));
		if (!fs.existsSync(file)) execFileSync("curl", ["-sf", "-A", "Mozilla/5.0 Chrome/140", "-o", file, url]);
		await route.fulfill({
			body: fs.readFileSync(file),
			headers: { "content-type": url.includes("googleapis") ? "text/css" : "font/woff2", "access-control-allow-origin": "*" },
		});
	});
};

/* A static server rooted at the repository, on a free port. */
export const serve = async (root) => {
	const http = await import("node:http");
	const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png" };
	const server = http.createServer((req, res) => {
		let file = path.join(root, decodeURIComponent(req.url.split("?")[0]));
		if (file.endsWith("/")) file += "index.html";
		fs.readFile(file, (err, body) => {
			if (err) return res.writeHead(404).end();
			res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" }).end(body);
		});
	});
	await new Promise((r) => server.listen(0, "127.0.0.1", r));
	return { server, origin: `http://127.0.0.1:${server.address().port}` };
};
