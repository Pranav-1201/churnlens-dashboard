/**
 * Build-time switches that describe the deployment this bundle was built for.
 *
 * READ_ONLY mirrors the API's CHURNLENS_ENV=production behaviour: the server refuses to
 * train or accept uploads, so the interface must not offer to. The server stays the
 * authority (it answers 403); this flag only stops the UI from showing controls that
 * can never work.
 */
export const READ_ONLY: boolean = import.meta.env.VITE_READ_ONLY === "true";
