/**
 * Environment Variable Validation Utility
 * 
 * Validates that required environment variables are set at startup
 * Provides helpful error messages when configuration is incomplete
 */

const requiredEnvVars = [
  'NODE_ENV',
  'PORT',
  'SESSION_SECRET'
];

const conditionalEnvVars = {
  // If using PostgreSQL
  database: {
    condition: () => process.env.DATABASE_URL || process.env.DB_HOST,
    vars: ['DATABASE_URL'] // Or DB_HOST, DB_NAME, DB_USER, DB_PASSWORD
  },
  
  // If using UPS email import
  upsEmail: {
    condition: () => process.env.GMAIL_USER,
    vars: ['GMAIL_USER', 'GMAIL_APP_PASSWORD']
  }
};

const recommendedEnvVars = [
  'APP_BASE_URL',
  'FORCE_HTTPS'
];

/**
 * Validate environment variables
 * @param {Object} options - Validation options
 * @param {boolean} options.exitOnError - Exit process if validation fails
 * @param {boolean} options.warnOnMissing - Warn about missing recommended vars
 * @returns {Object} Validation result
 */
function validateEnvironment(options = {}) {
  const {
    exitOnError = true,
    warnOnMissing = true
  } = options;

  const errors = [];
  const warnings = [];
  const info = [];

  // Check required variables
  for (const varName of requiredEnvVars) {
    if (!process.env[varName]) {
      errors.push(`Missing required environment variable: ${varName}`);
    } else {
      // Validate specific variables
      if (varName === 'SESSION_SECRET' && process.env[varName].length < 32) {
        warnings.push('SESSION_SECRET should be at least 32 characters long for security');
      }
      if (varName === 'NODE_ENV' && !['development', 'production', 'test'].includes(process.env[varName])) {
        warnings.push(`NODE_ENV should be 'development', 'production', or 'test' (got: ${process.env[varName]})`);
      }
    }
  }

  // Check recommended variables
  if (warnOnMissing) {
    for (const varName of recommendedEnvVars) {
      if (!process.env[varName]) {
        warnings.push(`Recommended environment variable not set: ${varName}`);
      }
    }
  }

  // Check conditional variables
  for (const [feature, config] of Object.entries(conditionalEnvVars)) {
    if (config.condition()) {
      for (const varName of config.vars) {
        if (!process.env[varName]) {
          warnings.push(`${feature} is enabled but ${varName} is not set`);
        }
      }
    }
  }

  // Production-specific checks
  if (process.env.NODE_ENV === 'production') {
    const weakSecrets = [
      'your-random-secret-here-change-this',
      'secret',
      'password',
      'changeme',
      'default',
      '12345678',
      'secretkey'
    ];
    
    const secretLower = (process.env.SESSION_SECRET || '').toLowerCase();
    if (weakSecrets.includes(secretLower)) {
      errors.push('SESSION_SECRET must be changed from default/weak value in production');
    }
    
    if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length < 32) {
      errors.push('SESSION_SECRET must be at least 32 characters in production');
    }
    
    if (!process.env.FORCE_HTTPS || process.env.FORCE_HTTPS !== 'true') {
      warnings.push('FORCE_HTTPS should be enabled in production');
    }
    if (!process.env.APP_BASE_URL) {
      warnings.push('APP_BASE_URL should be set in production for email links');
    }
  }

  // Log results
  if (errors.length > 0) {
    console.error('\n❌ Environment Configuration Errors:');
    errors.forEach(err => console.error(`  - ${err}`));
    console.error('\n📋 Please check your .env file or environment variables');
    console.error('📄 See .env.example for a template\n');
    
    if (exitOnError) {
      process.exit(1);
    }
  }

  if (warnings.length > 0 && warnOnMissing) {
    console.warn('\n⚠️  Environment Configuration Warnings:');
    warnings.forEach(warn => console.warn(`  - ${warn}`));
    console.warn('');
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log('✅ Environment configuration validated successfully');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    info
  };
}

/**
 * Get sanitized environment info (for debugging, without secrets)
 */
function getEnvironmentInfo() {
  const sensitiveKeys = [
    'SECRET',
    'PASSWORD',
    'TOKEN',
    'KEY',
    'PRIVATE',
    'CREDENTIALS'
  ];

  const info = {
    nodeVersion: process.version,
    nodeEnv: process.env.NODE_ENV,
    platform: process.platform,
    arch: process.arch
  };

  const configuredVars = [];
  const allEnvVars = Object.keys(process.env).filter(key => 
    !key.startsWith('npm_') && 
    !key.startsWith('VSCODE_') &&
    !['PATH', 'PWD', 'HOME', 'USER', 'SHELL'].includes(key)
  );

  for (const key of allEnvVars) {
    const isSensitive = sensitiveKeys.some(sensitive => key.toUpperCase().includes(sensitive));
    
    if (isSensitive) {
      configuredVars.push({
        name: key,
        configured: !!process.env[key],
        value: '***REDACTED***'
      });
    } else {
      configuredVars.push({
        name: key,
        configured: true,
        value: process.env[key]
      });
    }
  }

  info.configuredVars = configuredVars;
  
  return info;
}

/**
 * Check if running in production
 */
function isProduction() {
  return process.env.NODE_ENV === 'production';
}

/**
 * Check if running in development
 */
function isDevelopment() {
  return process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
}

/**
 * Check if running in test mode
 */
function isTest() {
  return process.env.NODE_ENV === 'test';
}

module.exports = {
  validateEnvironment,
  getEnvironmentInfo,
  isProduction,
  isDevelopment,
  isTest
};
