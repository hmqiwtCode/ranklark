/**
 * Apple App Store data sources: URL builders + pure parsers, one file per endpoint.
 *
 * Everything under packages/core is SHARED by the Next.js server and the browser extension, so it must stay
 * free of Node APIs, database access and network calls (it bundles into an MV3 service worker).
 * Adding a source = add `apple/<source>.ts` exporting `xxxUrl()` + `parseXxx()`, re-export it here,
 * and add a fixture test in `test/`.
 */
export * from "./catalog";
export * from "./hints";
export * from "./itunes";
export * from "./pacing";
export * from "./search-page";
export * from "./storefronts";
