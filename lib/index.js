import z from "@deepseek-ai/schemastery";
import { WebError } from "@deepseek-ai/dsh-web";
//#region lib/types/constants.js
/**
* Constant defaults shared by the camofox search provider and its plugin. Kept
* in one module so the plugin's `apply` and the provider agree on the same values.
* @module @deepseek-ai/dsh-web-search-camofox/constants
*/
/** Default camofox-browser REST base URL (the container's API port). */
const CAMOFOX_DEFAULT_BASE_URL = "http://localhost:9377";
/** Default camofox user identity. */
const CAMOFOX_DEFAULT_USER_ID = "default-user";
/** Default camofox session key used by this provider. */
const CAMOFOX_DEFAULT_SESSION_KEY = "dsh-web-search";
/** Default search-engine macro. */
const CAMOFOX_DEFAULT_ENGINE = "google";
//#endregion
//#region lib/types/provider.js
/**
* `CamofoxSearchProvider`: a `WebSearchProvider` backed by the camofox-browser
* container (REST on `localhost:9377`). Camofox exposes no search endpoint, so the
* provider drives a headless browser tab: it creates a tab, navigates it to a
* search-engine macro with the query, fetches the rendered accessibility
* snapshot, and parses organic result links, titles, and snippets out of the
* accessibility text tree.
* @module @deepseek-ai/dsh-web-search-camofox/provider
*/
/** Stable id this provider registers under. */
const CAMOFOX_PROVIDER_ID = "camofox";
/** Attribution header sent on every camofox REST request. Bump with the package version. */
const USER_AGENT = "deepseek-harness/0.0.1";
const MACROS = {
	google: "@google_search",
	youtube: "@youtube_search",
	amazon: "@amazon_search",
	reddit: "@reddit_search",
	wikipedia: "@wikipedia_search",
	twitter: "@twitter_search",
	yelp: "@yelp_search",
	spotify: "@spotify_search",
	netflix: "@netflix_search",
	linkedin: "@linkedin_search",
	instagram: "@instagram_search",
	tiktok: "@tiktok_search",
	twitch: "@twitch_search"
};
/** The camofox-backed search provider. Network or parse failures surface as `WEB_PROVIDER_ERROR`. */
var CamofoxSearchProvider = class {
	options;
	id = CAMOFOX_PROVIDER_ID;
	/** The browser tab reused across searches; created lazily on first search. */
	tabId;
	constructor(options) {
		this.options = options;
	}
	available() {
		return isValidBaseUrl(this.options.baseURL);
	}
	async search(request, signal) {
		const numResults = request.maxResults ?? this.options.numResults;
		const tabId = await this.ensureTab(signal);
		await this.navigate(tabId, request.query, signal);
		const sources = parseSources(await this.fetchSnapshot(tabId, signal));
		return {
			sources: numResults !== void 0 ? sources.slice(0, numResults) : sources,
			truncated: false
		};
	}
	/** Create the tab on first use; reuse it for later searches. */
	async ensureTab(signal) {
		if (this.tabId !== void 0) return this.tabId;
		const created = await this.request("/tabs", {
			method: "POST",
			body: {
				userId: this.options.userId,
				sessionKey: this.options.sessionKey
			},
			...signal !== void 0 ? { signal } : {}
		});
		const tabId = typeof created?.tabId === "string" ? created.tabId : void 0;
		if (tabId === void 0 || tabId.length === 0) throw new WebError("camofox did not return a tab id on tab creation", "WEB_PROVIDER_ERROR");
		this.tabId = tabId;
		return tabId;
	}
	/** Navigate the tab to the search-engine macro with the query. */
	async navigate(tabId, query, signal) {
		return this.request("/tabs/" + encodeURIComponent(tabId) + "/navigate", {
			method: "POST",
			body: {
				userId: this.options.userId,
				macro: MACROS[this.options.engine],
				query
			},
			...signal !== void 0 ? { signal } : {}
		});
	}
	/** Fetch the rendered accessibility snapshot for the tab. */
	async fetchSnapshot(tabId, signal) {
		const snapshotResponse = await this.request("/tabs/" + encodeURIComponent(tabId) + "/snapshot?userId=" + encodeURIComponent(this.options.userId) + "&offset=0", {
			method: "GET",
			...signal !== void 0 ? { signal } : {}
		});
		const snapshot = typeof snapshotResponse?.snapshot === "string" ? snapshotResponse.snapshot : void 0;
		if (snapshot === void 0 || snapshot.length === 0) throw new WebError("camofox returned an empty snapshot for the search tab", "WEB_PROVIDER_ERROR");
		return snapshot;
	}
	/** One camofox REST call; non-2xx and network failures throw `WEB_PROVIDER_ERROR`. */
	async request(path, init) {
		let response;
		try {
			response = await fetch(this.options.baseURL + path, {
				method: init.method,
				redirect: "error",
				headers: {
					"accept": "application/json",
					...init.body !== void 0 ? { "content-type": "application/json" } : {},
					"user-agent": USER_AGENT
				},
				...init.body !== void 0 ? { body: JSON.stringify(init.body) } : {},
				...init.signal !== void 0 ? { signal: init.signal } : {}
			});
		} catch (error) {
			if (isAbortError(error)) throw new WebError("camofox search aborted", "WEB_ABORTED", { cause: error });
			throw new WebError("camofox request failed: " + String(error), "WEB_PROVIDER_ERROR", { cause: error });
		}
		if (!response.ok) throw new WebError("camofox API error (HTTP " + response.status + ")", "WEB_PROVIDER_ERROR");
		try {
			return await response.json();
		} catch (error) {
			if (isAbortError(error)) throw new WebError("camofox search aborted", "WEB_ABORTED", { cause: error });
			throw new WebError("camofox returned an unprocessable response body: " + String(error), "WEB_PROVIDER_ERROR", { cause: error });
		}
	}
};
/** True when `baseURL` parses as an absolute URL (a cheap local config check). */
function isValidBaseUrl(baseURL) {
	return URL.canParse(baseURL);
}
/** True for a fetch/`AbortSignal` abort, surfaced as `WEB_ABORTED`. */
function isAbortError(error) {
	return error instanceof DOMException && error.name === "AbortError";
}
/**
* Parse organic search results out of a camofox accessibility snapshot.
*
* The snapshot is an indented accessibility tree. An organic result is a
* `link "…"` node that carries a child `/url:` whose URL is absolute and
* not a search-engine chrome target. Its child `heading "…" [level=3]` is the
* clean title; the `text:`/`emphasis:` lines that follow at the result's own
* indent are concatenated snippet fragments. Chrome links (search-engine
* search/account/preferences endpoints, relative `/search?` URLs, and bare
* `#` anchors) are dropped so only portable, external sources survive.
*
* @param snapshot - the raw accessibility tree text.
* @returns the normalized sources, de-duplicated by URL.
*/
function parseSources(snapshot) {
	const lines = toLines(snapshot);
	const sources = [];
	let current;
	let currentIndent = -1;
	let snippetPieces = [];
	const closeSnippet = () => {
		if (current !== void 0) {
			if (snippetPieces.length > 0) current.snippet = snippetPieces.join(" ").replace(/\s+/g, " ").trim();
			finishSource(sources, current);
			current = void 0;
			snippetPieces = [];
		}
	};
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index];
		const trimmed = line.content;
		if (trimmed.length === 0) continue;
		if (trimmed.startsWith("/url:")) {
			const url = trimmed.slice(5).trim();
			if (current !== void 0 && line.indent > currentIndent && isExternalUrl(url)) {
				if (current.url === "") current.url = url;
			}
			continue;
		}
		const heading = matchHeading3(trimmed);
		if (heading !== void 0) {
			if (current !== void 0 && line.indent > currentIndent && current.title === void 0) current.title = heading;
			continue;
		}
		const piece = matchSnippetPiece(trimmed);
		if (current !== void 0 && line.indent === currentIndent && piece !== void 0) {
			snippetPieces.push(piece);
			continue;
		}
		const link = matchResultLink(trimmed);
		if (link !== void 0) {
			if (current !== void 0 && line.indent <= currentIndent) closeSnippet();
			if (hasOwnUrl(lines, index)) {
				if (current !== void 0) closeSnippet();
				current = {
					url: "",
					title: void 0,
					linkTitle: link.title,
					snippet: void 0
				};
				currentIndent = line.indent;
				snippetPieces = [];
			}
			continue;
		}
		if (current !== void 0 && line.indent <= currentIndent) closeSnippet();
	}
	closeSnippet();
	const seen = /* @__PURE__ */ new Set();
	const result = [];
	for (const source of sources) {
		if (source.url === "" || seen.has(source.url)) continue;
		seen.add(source.url);
		result.push({
			url: source.url,
			...source.title !== void 0 && source.title.length > 0 ? { title: source.title } : {},
			...source.snippet !== void 0 && source.snippet.length > 0 ? { snippet: source.snippet } : {}
		});
	}
	return result;
}
/** Push a finished source, falling back to the cleaned link label for its title. */
function finishSource(sources, source) {
	if ((source.title === void 0 || source.title.length === 0) && source.linkTitle !== void 0) source.title = source.linkTitle;
	sources.push(source);
}
/** Normalize the snapshot into indented tree lines. */
function toLines(snapshot) {
	return snapshot.split("\n").map((raw) => {
		const stripped = raw.replace(/^\s+/, "");
		return {
			indent: raw.length - stripped.length,
			content: stripped.startsWith("- ") ? stripped.slice(2).trim() : stripped.trim()
		};
	});
}
/** Extract "Title" from a level-3 heading node, if this line is one. */
function matchHeading3(content) {
	return content.match(/^'?heading\s+"((?:[^"\\]|\\.)*)"\s+\[level=3\]'?/)?.[1]?.replace(/\\"/g, "\"");
}
/** Derive a candidate result link node, if this line is one. */
function matchResultLink(content) {
	const match = content.match(/^'?link\s+"((?:[^"\\]|\\.)*)"(?:\s*\[e[0-9]+\])?'?:?\s*$/);
	if (!match) return void 0;
	return { title: cleanLinkLabel(match[1] ?? "") };
}
/**
* Derive a title from a link label by dropping the engine's display chrome: the
* trailing " hostname https://domain › path" portion.
*/
function cleanLinkLabel(label) {
	const clipped = label.replace(/\\"/g, "\"").split(/ https?:\/\//)[0].trim();
	return clipped.length > 0 ? clipped : void 0;
}
/**
* True when the result link node has a child `/url:` with an absolute external
* URL at a deeper indent (a real link, not a plain text node). Scans only the
* immediately following lines until the next sibling or ancestor.
*/
function hasOwnUrl(lines, linkIndex) {
	const linkIndent = lines[linkIndex].indent;
	for (let index = linkIndex + 1; index < lines.length; index++) {
		const line = lines[index];
		if (line.indent <= linkIndent) return false;
		if (line.content.startsWith("/url:")) {
			if (isExternalUrl(line.content.slice(5).trim())) return true;
		}
	}
	return false;
}
/** Extract a snippet fragment from a `text:`/`emphasis:` line, if this line is one. */
function matchSnippetPiece(content) {
	return content.match(/^(?:text|emphasis):\s*(.*)$/)?.[1]?.trim();
}
/** True for an absolute http(s) URL that is not a search-engine chrome target. */
function isExternalUrl(url) {
	if (!/^https?:\/\//i.test(url)) return false;
	try {
		const parsed = new URL(url);
		const hostname = parsed.hostname.toLowerCase();
		const path = parsed.pathname;
		return !(hostname === "accounts.google.com" || hostname === "policies.google.com" || hostname === "support.google.com" || hostname.endsWith(".google.com") && (path.startsWith("/search") || path.startsWith("/url") || path.startsWith("/webhp") || path.startsWith("/preferences") || path.startsWith("/setprefs") || path === "/"));
	} catch {
		return false;
	}
}
//#endregion
//#region lib/types/index.js
/**
* `@deepseek-ai/dsh-web-search-camofox`: registers a camofox-backed `WebSearchProvider`
* with `ctx.web`. A function/namespace plugin (NOT a default-export service): a search
* provider does not own the `ctx.web` key — it registers INTO the seam's provider
* registry, exactly as `@deepseek-ai/dsh-web-search-exa` does. The key is owned by
* `@deepseek-ai/dsh-web`.
* @module @deepseek-ai/dsh-web-search-camofox
*/
/** Cordis plugin name used by loader diagnostics. */
const name = "web-search-camofox";
/** The web seam this provider registers into. */
const inject = ["web"];
const Config = z.object({
	baseURL: z.string(),
	userId: z.string(),
	sessionKey: z.string(),
	engine: z.union([
		"google",
		"youtube",
		"amazon",
		"reddit",
		"wikipedia",
		"twitter",
		"yelp",
		"spotify",
		"netflix",
		"linkedin",
		"instagram",
		"tiktok",
		"twitch"
	]),
	numResults: z.number().step(1).min(1)
});
/** Register the camofox search provider with `ctx.web`. */
function apply(ctx, config) {
	ctx.web.registerSearchProvider(new CamofoxSearchProvider({
		baseURL: config.baseURL ?? "http://localhost:9377",
		userId: config.userId ?? "default-user",
		sessionKey: config.sessionKey ?? "dsh-web-search",
		engine: config.engine ?? "google",
		...config.numResults !== void 0 ? { numResults: config.numResults } : {}
	}));
}
//#endregion
export { CAMOFOX_DEFAULT_BASE_URL, CAMOFOX_DEFAULT_ENGINE, CAMOFOX_DEFAULT_SESSION_KEY, CAMOFOX_DEFAULT_USER_ID, CAMOFOX_PROVIDER_ID, CamofoxSearchProvider, Config, apply, inject, name, parseSources };

//# sourceMappingURL=index.mjs.map