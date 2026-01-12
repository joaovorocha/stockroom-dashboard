// Global fetch interceptor to ensure credentials are always included
(function() {
  const originalFetch = window.fetch;
  window.fetch = function(url, options = {}) {
    // Always include credentials for same-origin requests
    if (!options.credentials) {
      options.credentials = 'include';
    }
    return originalFetch(url, options);
  };
})();
