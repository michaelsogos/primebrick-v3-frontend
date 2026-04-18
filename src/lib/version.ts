import pkg from '../../package.json';

/** Shell semver from `frontend/package.json` (no Vite `define`; works in dev, SSR, and build). */
export const APP_VERSION = pkg.version;

