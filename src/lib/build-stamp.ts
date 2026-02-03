/**
 * Build stamp - shows build date/time for cache verification.
 * Updates on each build to confirm UI changes are deployed.
 */

// Build timestamp - injected at build time via vite.config.ts define
declare const __BUILD_TIME__: string;
export const BUILD_STAMP = `Build: ${typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
