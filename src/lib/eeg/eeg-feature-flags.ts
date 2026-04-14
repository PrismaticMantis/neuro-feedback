/**
 * Cross-cutting EEG feature flags (not Muse-specific).
 * Audio engine and device drivers import from here to avoid coupling audio → muse-handler.
 *
 * MuseHandler still re-exports these for backward compatibility.
 */

// When false, PPG modulation and HR session fields are disabled app-wide
export const ENABLE_PPG_MODULATION = true;

export const DEBUG_PPG = false;

/**
 * When true, `createEegDevice('athena_bridge')` and `VITE_EEG_DEVICE_KIND=athena_bridge` are allowed.
 * Requires relay (`npm run athena-bridge`) and iOS sender; does not affect Muse 2.
 */
export const ENABLE_ATHENA_BRIDGE_EEG_DEVICE =
  import.meta.env.VITE_ENABLE_ATHENA_BRIDGE_EEG_DEVICE === 'true';
