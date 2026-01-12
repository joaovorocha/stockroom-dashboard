/**
 * Error Handling Middleware
 * 
 * Centralized error handling for Express routes
 * Provides consistent error responses and logging
 */

/**
 * Custom error class for application errors
 */
class AppError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true; // Distinguish from programming errors
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Common error types
 */
class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, details);
    this.name = 'ValidationError';
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401);
    this.name = 'AuthenticationError';
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403);
    this.name = 'AuthorizationError';
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404);
    this.name = 'NotFoundError';
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409);
    this.name = 'ConflictError';
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429);
    this.name = 'RateLimitError';
  }
}

/**
 * Async route handler wrapper
 * Catches errors from async functions and passes to error handler
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Error logging function
 * Log errors appropriately based on severity
 */
function logError(err, req) {
  const errorInfo = {
    message: err.message,
    stack: err.stack,
    statusCode: err.statusCode || 500,
    method: req.method,
    url: req.originalUrl || req.url,
    ip: req.ip || req.connection.remoteAddress,
    user: req.user ? req.user.employeeId : 'anonymous',
    timestamp: new Date().toISOString()
  };

  // Only log stack traces for server errors (5xx)
  if (err.statusCode >= 500 || !err.statusCode) {
    console.error('[ERROR]', JSON.stringify(errorInfo, null, 2));
  } else {
    // Client errors (4xx) - just log message
    console.warn('[WARN]', JSON.stringify({
      message: err.message,
      statusCode: err.statusCode,
      url: req.originalUrl || req.url,
      user: req.user ? req.user.employeeId : 'anonymous'
    }));
  }

  // TODO: Send to external error tracking service (Sentry, etc.)
}

/**
 * Main error handling middleware
 * Must be registered last, after all routes
 */
function errorHandler(err, req, res, next) {
  // If headers already sent, delegate to Express default error handler
  if (res.headersSent) {
    return next(err);
  }

  // Log the error
  logError(err, req);

  // Determine status code
  const statusCode = err.statusCode || 500;
  
  // Determine if this is a production environment
  const isProduction = process.env.NODE_ENV === 'production';

  // Build error response
  const errorResponse = {
    success: false,
    error: {
      message: err.message || 'Internal server error',
      statusCode: statusCode
    }
  };

  // Add details for validation errors
  if (err.details) {
    errorResponse.error.details = err.details;
  }

  // In development, include stack trace
  if (!isProduction) {
    errorResponse.error.stack = err.stack;
    errorResponse.error.type = err.name;
  }

  // For 500 errors in production, use generic message
  if (isProduction && statusCode === 500) {
    errorResponse.error.message = 'An unexpected error occurred';
  }

  // Send error response
  res.status(statusCode).json(errorResponse);
}

/**
 * 404 Not Found handler
 * Should be registered before error handler, after all routes
 */
function notFoundHandler(req, res, next) {
  const err = new NotFoundError('Endpoint');
  err.message = `Cannot ${req.method} ${req.originalUrl || req.url}`;
  next(err);
}

/**
 * Database error handler
 * Converts database-specific errors to AppError
 */
function handleDatabaseError(err) {
  // PostgreSQL error codes
  if (err.code === '23505') {
    // Unique violation
    return new ConflictError('Resource already exists');
  }
  
  if (err.code === '23503') {
    // Foreign key violation
    return new ValidationError('Related resource not found');
  }
  
  if (err.code === '22P02') {
    // Invalid text representation
    return new ValidationError('Invalid data format');
  }

  if (err.code === '23502') {
    // Not null violation
    return new ValidationError('Required field missing');
  }

  // Default database error
  return new AppError('Database error', 500);
}

/**
 * Validation error formatter
 * Formats validation errors consistently
 */
function formatValidationErrors(errors) {
  if (Array.isArray(errors)) {
    return errors.map(err => ({
      field: err.field || err.param || 'unknown',
      message: err.message || err.msg || 'Validation failed'
    }));
  }
  
  if (typeof errors === 'object' && errors !== null) {
    return Object.keys(errors).map(key => ({
      field: key,
      message: errors[key]
    }));
  }
  
  return [{ field: 'unknown', message: 'Validation failed' }];
}

module.exports = {
  // Error classes
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  
  // Middleware
  asyncHandler,
  errorHandler,
  notFoundHandler,
  
  // Utilities
  handleDatabaseError,
  formatValidationErrors,
  logError
};
