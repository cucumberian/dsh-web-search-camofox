/**
 * `CamofoxSearchProvider`: a `WebSearchProvider` backed by the camofox-browser
 * container (REST on `localhost:9377`). Camofox exposes no search endpoint, so the
 * provider drives a headless browser tab: it creates a tab, navigates it to a
 * search-engine macro with the query, fetches the rendered accessibility
 * snapshot, and parses organic result links, titles, and snippets out of the
 * accessibility text tree.
 * @module @deepseek-ai/dsh-web-search-camofox/provider
 */
import type { WebSearchProvider, WebSearchRequest, WebSearchResult, WebSearchSource } from '@deepseek-ai/dsh-web';
import type { CamofoxEngine } from './types.ts';
/** Stable id this provider registers under. */
export declare const CAMOFOX_PROVIDER_ID = "camofox";
/** Resolved provider options (the plugin's `apply` supplies constant defaults). */
export interface CamofoxSearchProviderOptions {
    /** camofox-browser REST base URL. */
    baseURL: string;
    /** camofox user identity (a browser profile partition). */
    userId: string;
    /** camofox session key (a browser session partition). */
    sessionKey: string;
    /** Search-engine macro to drive. */
    engine: CamofoxEngine;
    /** Default result count when a request carries no `maxResults`. */
    numResults?: number;
}
/** The camofox-backed search provider. Network or parse failures surface as `WEB_PROVIDER_ERROR`. */
export declare class CamofoxSearchProvider implements WebSearchProvider {
    private readonly options;
    readonly id = "camofox";
    /** The browser tab reused across searches; created lazily on first search. */
    private tabId;
    constructor(options: CamofoxSearchProviderOptions);
    available(): boolean;
    search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult>;
    /** Create the tab on first use; reuse it for later searches. */
    private ensureTab;
    /** Navigate the tab to the search-engine macro with the query. */
    private navigate;
    /** Fetch the rendered accessibility snapshot for the tab. */
    private fetchSnapshot;
    /** One camofox REST call; non-2xx and network failures throw `WEB_PROVIDER_ERROR`. */
    private request;
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
export declare function parseSources(snapshot: string): WebSearchSource[];
//# sourceMappingURL=provider.d.ts.map