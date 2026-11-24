import { Component } from "react";

/**
 * Last line of defence for a route whose chunk could not be loaded.
 *
 * Without this, a rejected lazy import throws during render and React unmounts
 * the whole tree — the staff member sees a blank white page with no hint that a
 * reload fixes it. lazyRoute() already retries once; if we still land here the
 * tab is genuinely out of date, so the only useful action is a reload.
 */
export default class ChunkErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Keep the details in the console for support; the UI stays human.
    console.error("Route failed to load:", error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const message = String(error?.message || error || "");
    const stale = /dynamically imported module|Importing a module script failed|Loading chunk/i.test(message);

    return (
      <div className="flex min-h-screen items-center justify-center bg-cream-50 px-5">
        <div className="w-full max-w-md rounded-2xl border border-wine-100 bg-white p-7 text-center">
          <h1 className="text-lg font-semibold text-cocoa-900">
            {stale ? "This page didn't load" : "Something went wrong"}
          </h1>
          <p className="mt-2 text-sm text-cocoa-500">
            {stale
              ? "The site was updated while this tab was open, so part of the page is out of date. Reloading fixes it — nothing you saved is affected."
              : "The page hit an unexpected error. Reloading usually clears it."}
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-xl bg-wine-700 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-wine-800"
            >
              Reload page
            </button>
            <a
              href="/admin"
              className="rounded-xl border border-wine-200 px-5 py-2.5 text-sm font-medium text-wine-700 transition-colors hover:bg-wine-50"
            >
              Go to dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }
}
