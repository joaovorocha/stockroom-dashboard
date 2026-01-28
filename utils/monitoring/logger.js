/**
 * Logging Configuration for System Health Monitoring
 * Uses Winston for structured logging with file rotation
 */

const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const config = require('./config');

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta)}`;
    }
    return msg;
  })
);

// Create transports
const transports = [];

// Console transport (always enabled in development)
if (process.env.NODE_ENV !== 'production') {
  transports.push(
    new winston.transports.Console({
      format: consoleFormat,
      level: config.logging.level
    })
  );
}

// File transport - Combined logs
transports.push(
  new DailyRotateFile({
    filename: path.join(config.logging.directory, 'combined-%DATE%.log'),
    datePattern: config.logging.datePattern,
    maxFiles: config.logging.maxFiles,
    maxSize: config.logging.maxSize,
    format: logFormat,
    level: 'info'
  })
);

// File transport - Error logs
transports.push(
  new DailyRotateFile({
    filename: path.join(config.logging.directory, 'error-%DATE%.log'),
    datePattern: config.logging.datePattern,
    maxFiles: config.logging.maxFiles,
    maxSize: config.logging.maxSize,
    format: logFormat,
    level: 'error'
  })
);

// File transport - Metrics logs (separate for easier parsing)
transports.push(
  new DailyRotateFile({
    filename: path.join(config.logging.directory, 'metrics-%DATE%.log'),
    datePattern: config.logging.datePattern,
    maxFiles: config.logging.maxFiles,
    maxSize: config.logging.maxSize,
    format: logFormat,
    level: 'debug'
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  transports,
  exitOnError: false
});

// Add helper methods for specific log types
logger.metric = (message, data) => {
  logger.debug(message, { type: 'metric', ...data });
};

logger.alert = (message, data) => {
  logger.warn(message, { type: 'alert', ...data });
};

logger.event = (message, data) => {
  logger.info(message, { type: 'event', ...data });
};

logger.security = (message, data) => {
  logger.warn(message, { type: 'security', ...data });
};

module.exports = logger;
