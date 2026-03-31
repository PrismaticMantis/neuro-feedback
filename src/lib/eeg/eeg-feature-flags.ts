/**
 * Cross-cutting EEG feature flags (not Muse-specific).
 * Audio engine and device drivers import from here to avoid coupling audio → muse-handler.
 *
 * MuseHandler still re-exports these for backward compatibility.
 */

// When false, PPG modulation and HR session fields are disabled app-wide
export const ENABLE_PPG_MODULATION = true;

export const DEBUG_PPG = false;
