import { lazy } from "react";

// Every admin screen lives in its own hashed chunk. After a deploy the old
// hashes are gone, and a tab opened before the deploy asks for a file that no
// longer exists. The SPA rewrite used to answer that request with index.html
// (200, text/html, cached immutable for a year), so the browser tried to parse
// HTML as a module, React.lazy never resolved, and the route sat on its spinner
// until someone hard-reloaded — the invoice page "just not loading".
//
// vercel.json now 404s missing /assets/* so the failure is honest, and this
// wrapper turns that 404 into one automatic reload: the reload fetches the new
// index.html with the current hashes and the route loads. The timestamp guard
// means a genuinely broken deploy cannot reload us in a loop.

const RETRY_KEY = "cakestyles:chunk-retry-at";
const RETRY_WINDOW_MS = 15000;

const CHUNK_ERROR =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|dynamically imported module/i;

/** True when the failure is "this chunk is gone / offline", not a bug in the page. */
export const isChunkError = (error) =>
  CHUNK_ERROR.test(error?.message || String(error || ""));

// Private-mode browsers and hardened settings can throw on storage access.
const readRetryAt = () => {
  try {
    return Number(sessionStorage.getItem(RETRY_KEY) || 0);
  } catch {
    return 0;
  }
};

const writeRetryAt = (value) => {
  try {
    sessionStorage.setItem(RETRY_KEY, String(value));
  } catch {
    /* storage unavailable — the guard degrades to "always retry once per load" */
  }
};

const clearRetryAt = () => {
  try {
    sessionStorage.removeItem(RETRY_KEY);
  } catch {
    /* nothing to clear */
  }
};

/**
 * Drop-in replacement for React.lazy that survives a deploy landing under an
 * open tab: reloads once, then lets the error surface to ChunkErrorBoundary.
 */
export const lazyRoute = (load) =>
  lazy(() =>
    load().then(
      (module) => {
        // A successful load proves the tab is current again.
        clearRetryAt();
        return module;
      },
      (error) => {
        if (!isChunkError(error)) throw error;

        if (Date.now() - readRetryAt() > RETRY_WINDOW_MS) {
          writeRetryAt(Date.now());
          window.location.reload();
          // Never resolve: the page is being replaced, so keep the spinner up
          // instead of flashing an error for the fraction of a second.
          return new Promise(() => {});
        }

        throw error;
      }
    )
  );
