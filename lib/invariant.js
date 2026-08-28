//#region lib/types/invariant.js
/**
* Package-owned invariant companion for `@deepseek-ai/dsh-web-search-camofox`.
* @module @deepseek-ai/dsh-web-search-camofox/invariant
*/
const PACKAGE_NAME = "@deepseek-ai/dsh-web-search-camofox";
/** Cordis companion plugin name. */
const name = "web-search-camofox-invariant";
/** Service required before the companion can reserve package ownership. */
const inject = ["invariants"];
/**
* No runtime invariant: this package exposes no independent event sequence or mutable data relation
* beyond contracts enforced at the provider boundary (`WebError` codes are surfaced at the seam).
*/
const install = () => {};
/**
* Register this package's invariant companion.
* @param ctx - Cordis context carrying the invariant service.
* @returns the installed registration's disposer after setup succeeds.
*/
const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//#endregion
export { apply, inject, name };

//# sourceMappingURL=invariant.mjs.map