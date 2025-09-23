import 'dotenv/config';
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";

// Security and middleware imports
import { createSecurityMiddleware, REQUEST_LIMITS, getSecuritySettings } from "./config/security.js";
import { ipBlacklist, cleanupSecurityData, createRateLimit } from "./middleware/auth.js";

// Route imports
import authRoutes from "./routes/authRoutes.js";
import businessRoutes from "./routes/businessRoutes.js";
import reviewRoutes from "./routes/reviewRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import qrRoutes from "./routes/qrRoutes.js";
import { walletRouter } from "./routes/walletRoutes.js";
import { subscriptionRouter } from "./routes/subscriptionRoutes.js";
import { notificationRouter } from "./routes/notificationRoutes.js";
import { analyticsRouter } from "./routes/analyticsRoutes.js";
import { seoRouter } from "./routes/seoRoutes.js";
import aiChatRoutes from "./routes/aiChatRoutes.js";
import integrationRoutes from "./routes/integrationRoutes.js";
import { invitationRouter } from "./routes/invitationRoutes.js";
import { widgetRouter } from "./routes/widgetRoutes.js";
import { templateRouter } from './routes/templateRoutes.js';

const app = express();
const securitySettings = getSecuritySettings();
const PORT = process.env.PORT || 8000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';

// PRODUCTION SECURITY CONFIGURATION

// Trust proxy for accurate IP detection (essential for production)
app.set('trust proxy', isProduction ? 1 : false);

// Enhanced security headers with Helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https://api.openai.com", "https://generativelanguage.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" }
}));

// Apply additional security middleware
app.use(createSecurityMiddleware());

// IP blacklist protection (before any other processing)
app.use(ipBlacklist);

// RATE LIMITING CONFIGURATION

// Global rate limiting with different tiers
const globalRateLimit = createRateLimit(
  isProduction ? 1000 : 5000, // 1000 req/15min in prod, 5000 in dev
  15 * 60 * 1000,
  "Too many requests from this IP"
);

// Strict rate limiting for sensitive endpoints
const strictRateLimit = createRateLimit(
  isProduction ? 50 : 200, // 50 req/15min in prod, 200 in dev
  15 * 60 * 1000,
  "Rate limit exceeded for sensitive operations"
);

app.use(globalRateLimit);

// CORS CONFIGURATION

const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://localhost:8000'];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (curl, Postman, browser direct hits)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS policy'));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: [
    "Content-Type", 
    "Authorization", 
    "X-Requested-With",
    "X-API-Key",
    "X-Client-Version"
  ],
  exposedHeaders: ["X-Total-Count", "X-Page", "X-Per-Page"],
  maxAge: 86400
}));


// REQUEST PARSING MIDDLEWARE

// Compression with security considerations
app.use(compression({
  threshold: 1024,
  level: 6,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  }
}));

// Body parsing with enhanced security
app.use(express.json({ 
  limit: REQUEST_LIMITS.JSON_LIMIT,
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

app.use(express.urlencoded({ 
  limit: REQUEST_LIMITS.URL_ENCODED_LIMIT, 
  extended: true,
  parameterLimit: 100 // Prevent parameter pollution
}));

// SECURITY MIDDLEWARE

// Request sanitization and security headers
app.use((req, res, next) => {
  // Additional security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  // Remove server information
  res.removeHeader('X-Powered-By');
  
  next();
});

// Request logging with security considerations
app.use((req, res, next) => {
  const startTime = Date.now();
  const ip = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('User-Agent') || 'Unknown';
  
  // Log request (sanitize sensitive data)
  const logData = {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    ip: ip,
    userAgent: userAgent.substring(0, 100), // Limit length
    contentLength: req.get('Content-Length') || 0
  };
  
  console.log(`${logData.timestamp} - ${logData.method} ${logData.path} - ${logData.ip}`);
  
  // Track response time
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    if (duration > 5000) { // Log slow requests
      console.warn(`Slow request: ${req.method} ${req.path} - ${duration}ms`);
    }
  });
  
  next();
});

// HEALTH CHECK ENDPOINTS


// Root endpoint with API information
app.get("/", (req, res) => {
  res.json({
    message: "AI Review Platform API",
    version: process.env.API_VERSION || "1.0.0",
    status: "running",
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    security: {
      rateLimiting: "enabled",
      cors: "configured",
      headers: "secured"
    },
    endpoints: {
      auth: "/auth",
      business: "/business", 
      reviews: "/reviews",
      dashboard: "/dashboard",
      admin: "/admin",
      qr: "/qr",
      wallet: "/wallet",
      subscriptions: "/subscription",
      notifications: "/notifications",
      analytics: "/analytics",
      seo: "/seo",
      ai: "/ai",
      integration: "/integration",
      invitations: "/invitations",
      widgets: "/widgets",
      templates: "/templates"
    }
  });
});

app.get("/", (req, res) => {
  res.send("Backend is running")
})

// Detailed health check
app.get("/health", (req, res) => {
  const memoryUsage = process.memoryUsage();
  const uptime = process.uptime();
  
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: {
      seconds: Math.floor(uptime),
      human: `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`
    },
    memory: {
      used: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
      total: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
      external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`
    },
    environment: NODE_ENV,
    version: process.env.API_VERSION || "1.0.0",
    nodeVersion: process.version
  });
});

// Basic status endpoint for load balancers
app.get("/status", (req, res) => {
  res.status(200).send("OK");
});

// API ROUTES WITH SECURITY

// Authentication routes (with strict rate limiting)
app.use("/auth", strictRateLimit, authRoutes);

// Business management routes
app.use("/business", businessRoutes);

// Review management routes  
app.use("/reviews", reviewRoutes);

// Dashboard routes
app.use("/dashboard", dashboardRoutes);

// Admin routes (with additional rate limiting)
app.use("/admin", strictRateLimit, adminRoutes);

// QR code routes
app.use("/qr", qrRoutes);

// Wallet routes
app.use("/wallet", walletRouter);

// Subscription routes
app.use("/subscription", subscriptionRouter);

// Notification routes
app.use("/notifications", notificationRouter);

// Analytics routes
app.use("/analytics", analyticsRouter);

// SEO routes
app.use("/seo", seoRouter);

// AI chat routes
app.use("/ai", aiChatRoutes);

// Integration routes
app.use("/integration", integrationRoutes);

// Invitation routes
app.use("/invitations", invitationRouter);

// Widget routes
app.use("/widgets", widgetRouter);

// Template routes
app.use("/templates", templateRouter);

// WEBHOOK ENDPOINTS

// Separate webhook handling (no auth, but with signature verification)
app.use("/webhooks", express.raw({ type: 'application/json' }), (req, res, next) => {
  console.log(`Webhook received: ${req.path}`);
  next();
});

// ERROR HANDLING MIDDLEWARE

// 404 handler
app.use((req, res) => {
  console.warn(`404 - Endpoint not found: ${req.method} ${req.originalUrl} from ${req.ip}`);
  
  res.status(404).json({
    error: "Endpoint not found",
    code: "ENDPOINT_NOT_FOUND",
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
    suggestion: "Check the API documentation for available endpoints"
  });
});

// Global error handler with security considerations
app.use((error, req, res, next) => {
  const errorId = Date.now().toString(36);
  
  // Log error securely (don't log sensitive data)
  console.error(`Error ${errorId}:`, {
    message: error.message,
    stack: isProduction ? undefined : error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    timestamp: new Date().toISOString()
  });

  // Handle specific error types
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: "Invalid JSON in request body",
      code: "INVALID_JSON",
      errorId,
      timestamp: new Date().toISOString()
    });
  }

  if (error.type === 'entity.too.large') {
    return res.status(413).json({
      error: "Request entity too large",
      code: "REQUEST_TOO_LARGE",
      errorId,
      timestamp: new Date().toISOString()
    });
  }

  if (error.message === 'Not allowed by CORS policy') {
    return res.status(403).json({
      error: "CORS policy violation",
      code: "CORS_ERROR",
      errorId,
      timestamp: new Date().toISOString()
    });
  }

  // Rate limit error
  if (error.status === 429) {
    return res.status(429).json({
      error: "Rate limit exceeded",
      code: "RATE_LIMIT_EXCEEDED",
      retryAfter: error.retryAfter || 900,
      errorId,
      timestamp: new Date().toISOString()
    });
  }

  // Generic error response (don't expose internal details in production)
  const statusCode = error.status || error.statusCode || 500;
  
  res.status(statusCode).json({
    error: isProduction ? "Internal server error" : error.message,
    code: error.code || "INTERNAL_ERROR",
    errorId,
    timestamp: new Date().toISOString(),
    ...(isProduction ? {} : { stack: error.stack })
  });
});

// GRACEFUL SHUTDOWN HANDLING

const gracefulShutdown = (signal) => {
  console.log(`\nReceived ${signal}. Starting graceful shutdown...`);
  
  // Stop accepting new connections
  server.close((err) => {
    if (err) {
      console.error('Error during shutdown:', err);
      process.exit(1);
    }
    
    console.log('HTTP server closed');
    
    // Clean up security data
    cleanupSecurityData();
    
    // Close database connections, clear intervals, etc.
    console.log('Cleanup completed');
    process.exit(0);
  });
  
  // Force shutdown after 30 seconds
  setTimeout(() => {
    console.error('Forced shutdown after 30s timeout');
    process.exit(1);
  }, 30000);
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit in production, just log
  if (isProduction) {
    console.error('Unhandled rejection logged, continuing...');
  } else {
    gracefulShutdown('UNHANDLED_REJECTION');
  }
});

// PERIODIC MAINTENANCE


// Security cleanup every 5 minutes
const securityCleanupInterval = setInterval(() => {
  cleanupSecurityData();
}, 5 * 60 * 1000);

// Memory monitoring (every 10 minutes)
const memoryMonitorInterval = setInterval(() => {
  const memoryUsage = process.memoryUsage();
  const memoryMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
  
  if (memoryMB > 500) { // Alert if memory usage > 500MB
    console.warn(`High memory usage: ${memoryMB}MB`);
  }
}, 10 * 60 * 1000);


// SERVER STARTUP


const server = app.listen(PORT, () => {
  console.log(PORT)
  console.log('='.repeat(60));
  console.log(`🚀 AI Review Platform API Server Started`);
  console.log('='.repeat(60));
  console.log(`📍 Port: ${PORT}`);
  console.log(`🌍 Environment: ${NODE_ENV}`);
  console.log(`🔒 Security: ${isProduction ? 'Production' : 'Development'} mode`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`📚 API docs: http://localhost:${PORT}/`);
  console.log(`⏰ Started at: ${new Date().toISOString()}`);
  console.log(`📊 Memory usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
  console.log('='.repeat(60));
});

// Server configuration
server.timeout = 30000; // 30 seconds timeout
server.keepAliveTimeout = 65000; // Keep alive timeout
server.headersTimeout = 66000; // Headers timeout

// Clean up intervals on shutdown
const cleanup = () => {
  clearInterval(securityCleanupInterval);
  clearInterval(memoryMonitorInterval);
};

process.on('exit', cleanup);
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

export default app;