/**
 * Global Error Logger
 * Captures JavaScript errors and sends them to the server for logging
 */

(function() {
  'use strict';

  const ERROR_LOG_ENDPOINT = '/api/logs/client-errors';
  const MAX_QUEUE_SIZE = 50;
  const BATCH_INTERVAL = 5000; // Send errors every 5 seconds
  const REQUEST_TIMEOUT = 3000; // 3 seconds timeout for fetch requests
  
  let errorQueue = [];
  let batchTimer = null;
  let isSending = false; // Prevent concurrent sends

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
    if (errorQueue.length === 0 || isSending) return;
    
    isSending = true;
    const batch = errorQueue.splice(0, Math.min(errorQueue.length, 20)); // Limit batch to 20 errors
    
    try {
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
      
      const response = await fetch(ERROR_LOG_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ errors: batch }),
        signal: controller.signal,
        keepalive: true // Helps with page unload reliability
      });
      
      clearTimeout(timeoutId);
      
      // If request failed, put errors back in queue (up to MAX_QUEUE_SIZE)
      if (!response.ok) {
        errorQueue.unshift(...batch.slice(0, MAX_QUEUE_SIZE - errorQueue.length));
      }
    } catch (e) {
      // On failure, put errors back in queue (up to MAX_QUEUE_SIZE)
      // But don't log error to avoid infinite loops
      if (e.name !== 'AbortError') {
        errorQueue.unshift(...batch.slice(0, MAX_QUEUE_SIZE - errorQueue.length));
      }
    } finally {
      isSending = false;
      
      // If there are still errors in queue, schedule another send
      if (errorQueue.length > 0 && !batchTimer) {
        batchTimer = setTimeout(() => {
          sendErrorBatch();
          batchTimer = null;
        }, BATCH_INTERVAL);
      }
    }
  }

  // Queue error for sending
  function queueError(errorData) {
    // Deduplicate identical errors within a short time window
    const isDuplicate = errorQueue.some(err => 
      err.message === errorData.message && 
      err.filename === errorData.filename && 
      err.lineno === errorData.lineno &&
      (Date.now() - new Date(err.timestamp).getTime()) < 1000 // Within 1 second
    );
    
    if (isDuplicate) return; // Skip duplicate errors
    
    errorQueue.push(errorData);
    
    // Limit queue size to prevent memory issues
    while (errorQueue.length > MAX_QUEUE_SIZE) {
      errorQueue.shift();
    }

    // Start batch timer if not already running
    if (!batchTimer && !isSending) {
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
    // Call original console.error first (preserve native behavior)
    originalConsoleError.apply(console, args);
    
    // Log to server (wrapped in try-catch to prevent logger from breaking)
    try {
      const message = args.map(arg => {
        if (typeof arg === 'object' && arg !== null) {
          try {
            // Use shallow stringification to avoid circular references
            return JSON.stringify(arg, getCircularReplacer(), 2);
          } catch (e) {
            return String(arg);
          }
        }
        return String(arg);
      }).join(' ');
      
      // Limit message length to prevent excessive payload
      const truncatedMessage = message.length > 5000 
        ? message.substring(0, 5000) + '... [truncated]'
        : message;
      
      const errorData = formatError({
        message: truncatedMessage
      }, 'console.error');
      
      queueError(errorData);
    } catch (e) {
      // Silently fail - don't let error logger break the app
    }
  };
  
  // Helper to handle circular references in JSON.stringify
  function getCircularReplacer() {
    const seen = new WeakSet();
    return (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      return value;
    };
  }

  // Send any queued errors before page unload
  window.addEventListener('beforeunload', function() {
    if (errorQueue.length > 0) {
      try {
        // Use sendBeacon for more reliable delivery during page unload
        // Limit to 20 most recent errors to stay within beacon size limits (~64KB)
        const recentErrors = errorQueue.slice(-20);
        const blob = new Blob([JSON.stringify({ errors: recentErrors })], { type: 'application/json' });
        
        // sendBeacon returns false if queuing failed
        const sent = navigator.sendBeacon(ERROR_LOG_ENDPOINT, blob);
        
        if (sent) {
          errorQueue = [];
        }
      } catch (e) {
        // Silently fail - page is unloading anyway
      }
    }
    
    // Clear any pending timer
    if (batchTimer) {
      clearTimeout(batchTimer);
      batchTimer = null;
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
