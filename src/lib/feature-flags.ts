// Feature flags for Save + History, Journeys, PDF Export
// Set to false to disable each feature

export const ENABLE_SESSION_HISTORY = true;
export const ENABLE_JOURNEYS = true;
export const ENABLE_PDF_EXPORT = true;

/** BrainBit iPad MVP: 3-screen flow (setup → session → done). Does not affect full App or Muse. */
export const BRAINBIT_IPAD_MVP = import.meta.env.VITE_BRAINBIT_IPAD_MVP === 'true';

/** When true, log electrodeStatus changes to console (throttled). */
export const DEBUG_ELECTRODES = false;

/** When true, show on-screen debug overlay for electrode quality on Session Setup. */
export const DEBUG_ELECTRODES_OVERLAY = false;

/** When true, show on-screen debug overlay for live telemetry on Active Session page. */
export const DEBUG_SESSION_TELEMETRY = false;
