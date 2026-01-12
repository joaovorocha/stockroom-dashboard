/**
 * Global Error Logger
 * Captures JavaScript errors and sends them to the server for logging
 */

(function() {
  'use strict';

  const ERROR_LOG_ENDPOINT = '/api/logs/client-errors';
  const MAX_QUEUE_SIZE = 50;
  const BATCH_INTERVAL = 5000; // Send errors every 5 seconds
  
  let errorQueue = [];
  let batchTimer = null;

  // Get basic page context
  function getPageContext() {
    return {
      url: window.location.href,
      pathname: window.location.pathname,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      screenWidth: window.screen.width,
      screenHeight: window.screen.height
    };
  }

  // Format error for logging
  function formatError(error, type = 'error') {
    const context = getPageContext();
    
    return {
      type: type,
      message: error.message || String(error),
      stack: error.stack || null,
      filename: error.filename || error.fileName || null,
      lineno: error.lineno || error.lineNumber || null,
      colno: error.colno || error.columnNumber || null,
      ...context
    };
  }

  // Send errors to server
  async function sendErrorBatch() {
    if (errorQueue.length === 0) return;

    const batch = errorQueue.splice(0, errorQueue.length);
    
    try {
      await fetch(ERROR_LOG_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ errors: batch })
      });
    } catch (e) {
      // Silently fail - don't want error logger to cause errors
      console.warn('Failed to send error logs:', e);
    }
  }

  // Queue error for sending
  function queueError(errorData) {
    errorQueue.push(errorData);
    
    // Limit queue size to prevent memory issues
    if (errorQueue.length > MAX_QUEUE_SIZE) {
      errorQueue.shift();
    }

    // Start batch timer if not already running
    if (!batchTimer) {
      batchTimer = setTimeout(() => {
        sendErrorBatch();
        batchTimer = null;
      }, BATCH_INTERVAL);
    }
  }

  // Capture unhandled errors
  window.addEventListener('error', function(event) {
    const errorData = formatError({
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack
    }, 'error');
    
    queueError(errorData);
  });

  // Capture unhandled promise rejections
  window.addEventListener('unhandledrejection', function(event) {
    const errorData = formatError({
      message: event.reason?.message || String(event.reason),
      stack: event.reason?.stack
    }, 'unhandledRejection');
    
    queueError(errorData);
  });

  // Capture console.error calls
  const originalConsoleError = console.error;
  console.error = function(...args) {
    // Call original console.error
    originalConsoleError.apply(console, args);
    
    // Log to server
    const message = args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg);
        } catch (e) {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');
    
    const errorData = formatError({
      message: message
    }, 'console.error');
    
    queueError(errorData);
  };

  // Send any queued errors before page unload
  window.addEventListener('beforeunload', function() {
    if (errorQueue.length > 0) {
      // Use sendBeacon for more reliable delivery during page unload
      const blob = new Blob([JSON.stringify({ errors: errorQueue })], { type: 'application/json' });
      navigator.sendBeacon(ERROR_LOG_ENDPOINT, blob);
      errorQueue = [];
    }
  });

  // Expose manual error logging
  window.logError = function(message, details = {}) {
    const errorData = formatError({
      message: message,
      ...details
    }, 'manual');
    
    queueError(errorData);
  };

  console.log('[ErrorLogger] Initialized - errors will be automatically logged to server');
})();
