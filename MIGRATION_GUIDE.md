# Applying Best Practices - Migration Guide

This guide shows how to update existing routes to use the new utilities.

## Before and After Examples

### Example 1: Basic Route with Error Handling

#### Before (Vulnerable to errors)
```javascript
router.get('/users/:id', async (req, res) => {
  const user = await db.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
  res.json(user.rows[0]);
});
```

#### After (With proper error handling)
```javascript
const { asyncHandler, NotFoundError } = require('../middleware/error-handler');
const logger = require('../utils/logger');

router.get('/users/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  logger.debug('Fetching user', { userId: id });
  
  const user = await db.query('SELECT * FROM users WHERE id = $1', [id]);
  
  if (user.rows.length === 0) {
    throw new NotFoundError('User');
  }
  
  res.json({ success: true, data: user.rows[0] });
}));
```

### Example 2: POST Route with Input Validation

#### Before (Vulnerable to XSS and injection)
```javascript
router.post('/feedback', async (req, res) => {
  const { message, category } = req.body;
  
  await db.query(
    'INSERT INTO feedback (message, category, user_id) VALUES ($1, $2, $3)',
    [message, category, req.user.id]
  );
  
  res.json({ success: true });
});
```

#### After (With sanitization and validation)
```javascript
const { asyncHandler, ValidationError } = require('../middleware/error-handler');
const { sanitizeHtml, sanitizeObjectKeys } = require('../utils/sanitize');
const logger = require('../utils/logger');

router.post('/feedback', asyncHandler(async (req, res) => {
  // Whitelist allowed fields
  const input = sanitizeObjectKeys(req.body, ['message', 'category']);
  
  // Validate required fields
  if (!input.message || !input.category) {
    throw new ValidationError('Message and category are required');
  }
  
  // Sanitize inputs
  const message = sanitizeHtml(input.message);
  const category = sanitizeHtml(input.category);
  
  // Validate category
  const validCategories = ['bug', 'feature', 'improvement', 'other'];
  if (!validCategories.includes(category)) {
    throw new ValidationError('Invalid category', {
      allowedCategories: validCategories
    });
  }
  
  // Validate message length
  if (message.length < 10 || message.length > 1000) {
    throw new ValidationError('Message must be between 10 and 1000 characters');
  }
  
  await db.query(
    'INSERT INTO feedback (message, category, user_id, created_at) VALUES ($1, $2, $3, NOW())',
    [message, category, req.user.id]
  );
  
  logger.info('Feedback submitted', {
    userId: req.user.id,
    category
  });
  
  res.json({ success: true, message: 'Feedback submitted successfully' });
}));
```

### Example 3: Search Endpoint with SQL Injection Prevention

#### Before (Vulnerable to SQL injection in LIKE queries)
```javascript
router.get('/search', async (req, res) => {
  const { query } = req.query;
  const results = await db.query(
    `SELECT * FROM products WHERE name LIKE '%${query}%'`
  );
  res.json(results.rows);
});
```

#### After (Safe from SQL injection)
```javascript
const { asyncHandler, ValidationError } = require('../middleware/error-handler');
const { sanitizeSql, sanitizeInteger } = require('../utils/sanitize');

router.get('/search', asyncHandler(async (req, res) => {
  const { q, limit, offset } = req.query;
  
  // Validate search query
  if (!q || typeof q !== 'string') {
    throw new ValidationError('Search query is required');
  }
  
  if (q.length < 2) {
    throw new ValidationError('Search query must be at least 2 characters');
  }
  
  // Sanitize for SQL LIKE query
  const searchTerm = sanitizeSql(q.trim());
  
  // Sanitize pagination parameters
  const limitNum = sanitizeInteger(limit, { min: 1, max: 100 }) || 20;
  const offsetNum = sanitizeInteger(offset, { min: 0 }) || 0;
  
  // Use parameterized query (safe from injection)
  const results = await db.query(
    'SELECT id, name, description FROM products WHERE name ILIKE $1 LIMIT $2 OFFSET $3',
    [`%${searchTerm}%`, limitNum, offsetNum]
  );
  
  res.json({
    success: true,
    data: results.rows,
    pagination: {
      limit: limitNum,
      offset: offsetNum,
      total: results.rows.length
    }
  });
}));
```

### Example 4: File Upload with Path Traversal Prevention

#### Before (Vulnerable to path traversal)
```javascript
router.post('/upload', async (req, res) => {
  const { filename } = req.body;
  const filePath = path.join(uploadsDir, filename);
  
  // Save file...
  res.json({ path: filePath });
});
```

#### After (Safe from path traversal)
```javascript
const { asyncHandler, ValidationError } = require('../middleware/error-handler');
const { sanitizeFilePath } = require('../utils/sanitize');
const logger = require('../utils/logger');
const path = require('path');

router.post('/upload', asyncHandler(async (req, res) => {
  const { filename } = req.body;
  
  // Sanitize filename to prevent path traversal
  const safeFilename = sanitizeFilePath(filename);
  
  if (!safeFilename) {
    throw new ValidationError('Invalid filename');
  }
  
  // Ensure file is in allowed directory
  const filePath = path.join(uploadsDir, safeFilename);
  const normalizedPath = path.normalize(filePath);
  
  if (!normalizedPath.startsWith(uploadsDir)) {
    logger.logSecurityEvent('Path traversal attempt', {
      userId: req.user.id,
      filename,
      attemptedPath: normalizedPath
    });
    throw new ValidationError('Invalid file path');
  }
  
  // Save file...
  
  res.json({
    success: true,
    filename: safeFilename
  });
}));
```

### Example 5: External API Call with Logging

#### Before (No logging, poor error handling)
```javascript
router.get('/external-data', async (req, res) => {
  const response = await axios.get('https://api.example.com/data');
  res.json(response.data);
});
```

#### After (With logging and error handling)
```javascript
const { asyncHandler, AppError } = require('../middleware/error-handler');
const logger = require('../utils/logger');
const axios = require('axios');

router.get('/external-data', asyncHandler(async (req, res) => {
  const startTime = Date.now();
  
  try {
    const response = await axios.get('https://api.example.com/data', {
      timeout: 5000
    });
    
    const duration = Date.now() - startTime;
    
    logger.logApiCall(
      'ExampleAPI',
      'GET',
      '/data',
      response.status,
      duration
    );
    
    res.json({
      success: true,
      data: response.data
    });
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.logApiCall(
      'ExampleAPI',
      'GET',
      '/data',
      error.response?.status || 0,
      duration
    );
    
    if (error.response) {
      // API returned error response
      throw new AppError(
        `External API error: ${error.response.statusText}`,
        502
      );
    } else if (error.request) {
      // No response received
      throw new AppError('External API timeout', 504);
    } else {
      // Request setup error
      throw new AppError('External API request failed', 500);
    }
  }
}));
```

## Step-by-Step Migration Process

### 1. Identify Routes to Update
Priority order:
1. Authentication routes (login, register, password reset)
2. Data modification routes (POST, PUT, DELETE)
3. User input routes (search, filters, forms)
4. File operations
5. External API integrations
6. Read-only routes (GET)

### 2. Add Error Handling
- Wrap all async route handlers with `asyncHandler()`
- Replace generic errors with specific error classes
- Add validation before database/API calls

### 3. Add Input Sanitization
- Sanitize all user inputs
- Validate data types and ranges
- Whitelist allowed fields

### 4. Add Logging
- Replace `console.log()` with appropriate logger function
- Log important events (auth, errors, security)
- Log external API calls with timing

### 5. Standardize Responses
```javascript
// Success response
res.json({
  success: true,
  data: { ... }
});

// Error responses handled by error middleware
throw new ValidationError('Error message');
```

### 6. Test Each Route
- Test with valid inputs
- Test with invalid inputs
- Test with malicious inputs (XSS, SQL injection attempts)
- Test error scenarios

## Common Patterns

### Pattern 1: ID Parameter Validation
```javascript
const { sanitizeInteger } = require('../utils/sanitize');

const id = sanitizeInteger(req.params.id, { min: 1 });
if (!id) {
  throw new ValidationError('Invalid ID');
}
```

### Pattern 2: Pagination
```javascript
const { sanitizeInteger } = require('../utils/sanitize');

const page = sanitizeInteger(req.query.page, { min: 1 }) || 1;
const limit = sanitizeInteger(req.query.limit, { min: 1, max: 100 }) || 20;
const offset = (page - 1) * limit;
```

### Pattern 3: Date Range Validation
```javascript
const { sanitizeDate } = require('../utils/sanitize');
const { ValidationError } = require('../middleware/error-handler');

const startDate = sanitizeDate(req.query.startDate);
const endDate = sanitizeDate(req.query.endDate);

if (!startDate || !endDate) {
  throw new ValidationError('Valid start and end dates required');
}

if (new Date(startDate) > new Date(endDate)) {
  throw new ValidationError('Start date must be before end date');
}
```

### Pattern 4: Email Validation
```javascript
const { sanitizeEmail } = require('../utils/sanitize');
const { ValidationError } = require('../middleware/error-handler');

const email = sanitizeEmail(req.body.email);
if (!email) {
  throw new ValidationError('Valid email address required');
}
```

## Quick Reference

### Import Statements
```javascript
// Error handling
const { 
  asyncHandler, 
  ValidationError, 
  NotFoundError,
  AuthorizationError 
} = require('../middleware/error-handler');

// Sanitization
const {
  sanitizeHtml,
  sanitizeEmail,
  sanitizeInteger,
  sanitizeObjectKeys
} = require('../utils/sanitize');

// Logging
const logger = require('../utils/logger');
```

### Error Response Structure
All errors return:
```json
{
  "success": false,
  "error": {
    "message": "Error description",
    "statusCode": 400,
    "details": { /* optional */ }
  }
}
```

In development, also includes:
```json
{
  "error": {
    ...,
    "stack": "...",
    "type": "ValidationError"
  }
}
```

## Checklist for Each Route

- [ ] Wrap with `asyncHandler()`
- [ ] Sanitize all user inputs
- [ ] Validate required fields
- [ ] Validate data types and ranges
- [ ] Use parameterized SQL queries
- [ ] Use specific error classes
- [ ] Add appropriate logging
- [ ] Return standardized responses
- [ ] Test with invalid inputs
- [ ] Test error scenarios
