// Global error handler and notification system
window.ErrorHandler = {
  showError(message, duration = 5000) {
    // Remove existing error box if present
    const existing = document.getElementById('globalErrorBox');
    if (existing) existing.remove();

    // Create error box
    const errorBox = document.createElement('div');
    errorBox.id = 'globalErrorBox';
    errorBox.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #ef4444;
      color: white;
      padding: 16px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 9999;
      max-width: 500px;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      word-wrap: break-word;
      animation: slideIn 0.3s ease-out;
    `;
    
    errorBox.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
        <div style="flex: 1;">
          <strong style="display: block; margin-bottom: 4px;">Error</strong>
          <div>${message}</div>
        </div>
        <button onclick="this.parentElement.parentElement.remove()" 
                style="background: none; border: none; color: white; font-size: 20px; cursor: pointer; padding: 0; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">×</button>
      </div>
    `;

    document.body.appendChild(errorBox);

    // Auto-remove after duration
    if (duration > 0) {
      setTimeout(() => {
        if (errorBox.parentElement) errorBox.remove();
      }, duration);
    }
  },

  logError(context, error) {
    console.error(`[${context}]`, error);
    const message = error?.message || error?.error || String(error);
    this.showError(`${context}: ${message}`);
  }
};

// Add CSS animation
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(400px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
`;
document.head.appendChild(style);

// Intercept global fetch errors
const originalFetch = window.fetch;
window.fetch = function(url, options = {}) {
  if (!options.credentials) {
    options.credentials = 'include';
  }
  
  return originalFetch(url, options)
    .catch(error => {
      ErrorHandler.logError('Network Error', error);
      throw error;
    });
};

// Global error event listener
window.addEventListener('error', (event) => {
  console.error('Uncaught error:', event.error);
  ErrorHandler.showError(`Unexpected error: ${event.error?.message || 'Unknown error'}`);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled rejection:', event.reason);
  const message = event.reason?.message || event.reason?.error || String(event.reason);
  ErrorHandler.showError(`Unhandled error: ${message}`);
});
