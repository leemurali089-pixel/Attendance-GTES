/**
 * Chooses live dashboard aggregates (DashboardQueries) vs packaged demo fallback (DASH_DATA).
 * Set window.__GTES_DASH_LIVE = false to force demo data for UI testing.
 */
(function (global) {
  function useLive() {
    if (global.__GTES_DASH_LIVE === false) return false;
    if (typeof global.DashboardQueries === "undefined" || typeof global.DashboardQueries.buildLiveDataset !== "function") return false;
    return true;
  }

  /**
   * @param {string} scope - 'all' | 'gst' | 'plain'
   * @param {object} demoFallback - shape matching DASH_DATA[scope]
   */
  function getDashboardData(scope, demoFallback, opts) {
    try {
      if (!useLive()) return demoFallback;
      return global.DashboardQueries.buildLiveDataset(scope || "all", opts || {});
    } catch (e) {
      console.warn("[DashboardAdapter] live dataset failed, using demo fallback:", e && e.message);
      return demoFallback;
    }
  }

  global.DashboardAdapter = {
    useLive,
    getDashboardData,
  };
})(typeof window !== "undefined" ? window : globalThis);
