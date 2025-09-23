// config/security.js - Production Security Configuration
import helmet from "helmet";
import cors from "cors";
import compression from "compression";


// Security configuration constants
export const SECURITY_CONFIG = {
  RATE_LIMITS: {
    // Authentication endpoints - very strict
    AUTH_STRICT: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5, // 5 requests per window
      message: "Too many authentication attempts"
    },
    
    // General auth endpoints - moderate
    AUTH_GENERAL: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 20, // 20 requests per window
      message: "Too many requests to authentication endpoints"
    },
    
    // API endpoints - generous
    API_GENERAL: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // 100 requests per window
      message: "Too many API requests"
    },
    
    // File uploads - restrictive
    FILE_UPLOAD: {
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 20, // 20 uploads per hour
      message: "Too many file uploads"
    }
  },
  
  // JWT token settings
  JWT: {
    EXPIRY: '1h',
    REFRESH_EXPIRY: '7d',
    ALGORITHM: 'RS256'
  },
  
  // Session settings
  SESSION: {
    MAX_AGE: 24 * 60 * 60 * 1000, // 24 hours
    SECURE: process.env.NODE_ENV === 'production',
    HTTP_ONLY: true,
    SAME_SITE: 'strict'
  },
  
  // Password requirements
  PASSWORD: {
    MIN_LENGTH: 8,
    REQUIRE_UPPERCASE: true,
    REQUIRE_LOWERCASE: true,
    REQUIRE_NUMBERS: true,
    REQUIRE_SYMBOLS: true,
    MAX_ATTEMPTS: 5,
    LOCKOUT_DURATION: 30 * 60 * 1000 // 30 minutes
  }
};

// Helmet configuration for security headers
export const helmetConfig = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
};

// CORS configuration
export const corsConfig = {
  origin: function (origin, callback) {
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',');
    
    // Allow requests with no origin (mobile apps, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS policy'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'X-API-Key'
  ]
};

// Compression configuration
export const compressionConfig = {
  threshold: 1024, // Only compress if size > 1KB
  level: 6, // Compression level (1-9)
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  }
};

// Security middleware factory
export const createSecurityMiddleware = () => {
  return [
    // Enable trust proxy for accurate IP detection
    (req, res, next) => {
      req.app.set('trust proxy', process.env.NODE_ENV === 'production');
      next();
    },
    
    // Apply helmet security headers
    helmet(helmetConfig),
    
    // Apply CORS policy
    cors(corsConfig),
    
    // Apply compression
    compression(compressionConfig),
    
    // Request logging for security monitoring
    (req, res, next) => {
      const startTime = Date.now();
      const originalSend = res.send;
      
      res.send = function(data) {
        const duration = Date.now() - startTime;
        console.log(`${req.method} ${req.path} - ${res.statusCode} - ${duration}ms - ${req.ip}`);
        originalSend.call(res, data);
      };
      
      next();
    },
    
    // Security headers
    (req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
      next();
    }
  ];
};

// Password validation
export const validatePassword = (password) => {
  const errors = [];
  
  if (!password || password.length < SECURITY_CONFIG.PASSWORD.MIN_LENGTH) {
    errors.push(`Password must be at least ${SECURITY_CONFIG.PASSWORD.MIN_LENGTH} characters long`);
  }
  
  if (SECURITY_CONFIG.PASSWORD.REQUIRE_UPPERCASE && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  
  if (SECURITY_CONFIG.PASSWORD.REQUIRE_LOWERCASE && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  
  if (SECURITY_CONFIG.PASSWORD.REQUIRE_NUMBERS && !/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  
  if (SECURITY_CONFIG.PASSWORD.REQUIRE_SYMBOLS && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }
  
  // Check for common weak passwords
  const weakPasswords = ['password', '123456', 'qwerty', 'admin', 'letmein'];
  if (weakPasswords.includes(password.toLowerCase())) {
    errors.push('Password is too common and weak');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

// Input sanitization
export const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  
  return input
    .trim()
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, ''); // Remove event handlers
};

// API key validation
export const validateApiKey = (apiKey) => {
  if (!apiKey) return { isValid: false, error: 'API key is required' };
  
  if (typeof apiKey !== 'string') {
    return { isValid: false, error: 'API key must be a string' };
  }
  
  // Check API key format (should start with 'biz_' and be base64url)
  if (!apiKey.startsWith('biz_')) {
    return { isValid: false, error: 'Invalid API key format' };
  }
  
  const keyPart = apiKey.substring(4);
  if (keyPart.length < 32) {
    return { isValid: false, error: 'API key too short' };
  }
  
  // Check for valid base64url characters
  if (!/^[A-Za-z0-9_-]+$/.test(keyPart)) {
    return { isValid: false, error: 'Invalid API key characters' };
  }
  
  return { isValid: true };
};

// Request size limits
export const REQUEST_LIMITS = {
  JSON_LIMIT: '10mb',
  URL_ENCODED_LIMIT: '10mb',
  FILE_UPLOAD_LIMIT: '50mb',
  MAX_FILES: 10
};

// Security monitoring
export const securityMonitor = {
  // Track failed attempts per IP
  failedAttempts: new Map(),
  
  // Track suspicious patterns
  suspiciousPatterns: new Map(),
  
  // Log security event
  logSecurityEvent: (type, data) => {
    const event = {
      type,
      timestamp: new Date().toISOString(),
      ...data
    };
    
    console.log('🔒 Security Event:', event);
    
    // In production, send to your security monitoring service
    // Example: SecurityService.logEvent(event);
  },
  
  // Check for brute force attempts
  checkBruteForce: (ip, maxAttempts = 5, windowMs = 15 * 60 * 1000) => {
    const attempts = securityMonitor.failedAttempts.get(ip) || [];
    const now = Date.now();
    
    // Filter recent attempts
    const recentAttempts = attempts.filter(attempt => 
      now - attempt.timestamp < windowMs
    );
    
    if (recentAttempts.length >= maxAttempts) {
      securityMonitor.logSecurityEvent('BRUTE_FORCE_DETECTED', {
        ip,
        attempts: recentAttempts.length,
        window: windowMs
      });
      return true;
    }
    
    return false;
  },
  
  // Record failed attempt
  recordFailedAttempt: (ip, reason) => {
    const attempts = securityMonitor.failedAttempts.get(ip) || [];
    attempts.push({
      timestamp: Date.now(),
      reason
    });
    
    // Keep only last 20 attempts
    if (attempts.length > 20) {
      attempts.shift();
    }
    
    securityMonitor.failedAttempts.set(ip, attempts);
  }
};

// Environment-specific security settings
export const getSecuritySettings = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  
  return {
    // Enable/disable certain security features based on environment
    enableStrictRateLimit: isProduction,
    enableSecurityHeaders: true,
    enableRequestLogging: true,
    enableBruteForceProtection: isProduction,
    enableIPBlacklist: isProduction,
    
    // Cookie settings
    cookieSettings: {
      secure: isProduction,
      httpOnly: true,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    },
    
    // Token settings
    tokenSettings: {
      accessTokenExpiry: '1h',
      refreshTokenExpiry: '7d',
      allowMultipleSessions: false
    }
  };
};