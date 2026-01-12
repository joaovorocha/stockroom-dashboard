/**
 * Structured Logger
 * 
 * Simple structured logging utility
 * TODO: Replace with Winston or Pino for production
 */

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

const currentLogLevel = process.env.LOG_LEVEL
  ? LOG_LEVELS[process.env.LOG_LEVEL.toUpperCase()] || LOG_LEVELS.INFO
  : (process.env.NODE_ENV === 'production' ? LOG_LEVELS.INFO : LOG_LEVELS.DEBUG);

/**
 * Format log message
 */
function formatLog(level, message, context = {}) {
  const log = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context
  };

  // In development, use pretty printing
  if (process.env.NODE_ENV !== 'production') {
    const emoji = {
      ERROR: '❌',
      WARN: '⚠️',
      INFO: 'ℹ️',
      DEBUG: '🐛'
    }[level] || '';
    
    return `${emoji} [${log.timestamp}] ${level}: ${message}${
      Object.keys(context).length > 0 ? '\n' + JSON.stringify(context, null, 2) : ''
    }`;
  }

  // In production, use JSON format for log aggregation
  return JSON.stringify(log);
}

/**
 * Log error
 */
function error(message, context = {}) {
  if (currentLogLevel >= LOG_LEVELS.ERROR) {
    console.error(formatLog('ERROR', message, context));
  }
}

/**
 * Log warning
 */
function warn(message, context = {}) {
  if (currentLogLevel >= LOG_LEVELS.WARN) {
    console.warn(formatLog('WARN', message, context));
  }
}

/**
 * Log info
 */
function info(message, context = {}) {
  if (currentLogLevel >= LOG_LEVELS.INFO) {
    console.log(formatLog('INFO', message, context));
  }
}

/**
 * Log debug
 */
function debug(message, context = {}) {
  if (currentLogLevel >= LOG_LEVELS.DEBUG) {
    console.log(formatLog('DEBUG', message, context));
  }
}

/**
 * Log HTTP request
 */
function logRequest(req, res) {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO';
    
    const log = {
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip || req.connection.remoteAddress,
      user: req.user ? req.user.employeeId : 'anonymous'
    };

    if (level === 'ERROR') {
      error('HTTP Request', log);
    } else if (level === 'WARN') {
      warn('HTTP Request', log);
    } else {
      // Only log successful requests in debug mode
      debug('HTTP Request', log);
    }
  });
}

/**
 * Request logging middleware
 */
function requestLogger(req, res, next) {
  logRequest(req, res);
  next();
}

/**
 * Log database query
 */
function logQuery(query, params, duration) {
  debug('Database Query', {
    query: query.substring(0, 200) + (query.length > 200 ? '...' : ''),
    params: params ? params.slice(0, 10) : [],
    duration: duration ? `${duration}ms` : undefined
  });
}

/**
 * Log external API call
 */
function logApiCall(service, method, url, statusCode, duration) {
  const level = statusCode >= 500 ? 'ERROR' : statusCode >= 400 ? 'WARN' : 'DEBUG';
  const log = {
    service,
    method,
    url,
    statusCode,
    duration: duration ? `${duration}ms` : undefined
  };

  if (level === 'ERROR') {
    error('External API Call', log);
  } else if (level === 'WARN') {
    warn('External API Call', log);
  } else {
    debug('External API Call', log);
  }
}

/**
 * Log security event
 */
function logSecurityEvent(event, context = {}) {
  warn('Security Event', {
    event,
    ...context
  });
}

/**
 * Log authentication event
 */
function logAuth(event, userId, success, context = {}) {
  info('Authentication Event', {
    event,
    userId,
    success,
    ...context
  });
}

module.exports = {
  error,
  warn,
  info,
  debug,
  logRequest,
  logQuery,
  logApiCall,
  logSecurityEvent,
  logAuth,
  requestLogger
};
