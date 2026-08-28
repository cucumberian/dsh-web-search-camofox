/**
 * `@deepseek-ai/dsh-web-search-camofox`: registers a camofox-backed `WebSearchProvider`
 * with `ctx.web`. A function/namespace plugin (NOT a default-export service): a search
 * provider does not own the `ctx.web` key — it registers INTO the seam's provider
 * registry, exactly as `@deepseek-ai/dsh-web-search-exa` does. The key is owned by
 * `@deepseek-ai/dsh-web`.
 * @module @deepseek-ai/dsh-web-search-camofox
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { CamofoxEngine } from './types.ts';
export { CAMOFOX_DEFAULT_BASE_URL, CAMOFOX_DEFAULT_ENGINE, CAMOFOX_DEFAULT_SESSION_KEY, CAMOFOX_DEFAULT_USER_ID, } from './constants.ts';
export { CAMOFOX_PROVIDER_ID, CamofoxSearchProvider, parseSources, } from './provider.ts';
export type { CamofoxSearchProviderOptions } from './provider.ts';
export type { CamofoxEngine } from './types.ts';
/** Cordis plugin name used by loader diagnostics. */
export declare const name = "web-search-camofox";
/** The web seam this provider registers into. */
export declare const inject: string[];
/** Plugin config (all optional — `apply` fills constant defaults). */
export interface Config {
    /** camofox-browser REST base URL. Defaults to `http://localhost:9377`. */
    baseURL?: string;
    /** camofox user identity. Defaults to `default-user`. */
    userId?: string;
    /** camofox session key. Defaults to `dsh-web-search`. */
    sessionKey?: string;
    /** Search-engine macro to drive. Defaults to `google`. */
    engine?: CamofoxEngine;
    /** Default result count when a request carries no `maxResults`. Omitted = none. */
    numResults?: number;
}
export declare const Config: z<Config>;
/** Register the camofox search provider with `ctx.web`. */
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=index.d.ts.map