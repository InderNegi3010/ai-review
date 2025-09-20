
import 'dotenv/config';
import express from "express";
import cors from "cors";
import { rateLimit, cleanupRateLimit } from "./middleware/auth.js";



// Import routes
import authRoutes from "./routes/authRoutes.js";
import businessRoutes from "./routes/businessRoutes.js";
import reviewRoutes from "./routes/reviewRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import qrRoutes from "./routes/qrRoutes.js";
import walletRoutes from "./routes/walletRoutes.js";
import { subscriptionRouter } from "./routes/subscriptionRoutes.js";
import { notificationRouter } from "./routes/notificationRoutes.js";

import { analyticsRouter } from "./routes/analyticsRoutes.js";
import { seoRouter } from "./routes/seoRoutes.js";

const app = express();
const PORT = process.env.PORT || 8000;


// MIDDLEWARE

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Global rate limiting
app.use(rateLimit(1000, 15 * 60 * 1000)); // 1000 requests per 15 minutes

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});


// HEALTH CHECK ENDPOINT


app.get("/", (req, res) => {
  res.json({
    message: "AI Review Platform API",
    version: "1.0.0",
    status: "running",
    timestamp: new Date().toISOString(),
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
      seo: "/seo"
    }
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || "development"
  });
});


// API ROUTES


// Authentication routes
app.use("/auth", authRoutes);

// Business management routes
app.use("/business", businessRoutes);

// Review management routes  
app.use("/reviews", reviewRoutes);

// Dashboard routes
app.use("/dashboard", dashboardRoutes);

// Admin routes
app.use("/admin", adminRoutes);

// QR code routes
app.use("/qr", qrRoutes);

// Wallet routes
app.use("/wallet", walletRoutes);

// Subscription routes
app.use("/subscription", subscriptionRouter);

// Notification routes
app.use("/notifications", notificationRouter);

// Analytics routes
app.use("/analytics", analyticsRouter);

// SEO routes
app.use("/seo", seoRouter);


// ERROR HANDLING MIDDLEWARE



// 404 handler (Express 5+ safe)
app.use((req, res) => {
  res.status(404).json({
    error: "Endpoint not found",
    code: "ENDPOINT_NOT_FOUND",
    path: req.originalUrl,
    method: req.method,
    availableEndpoints: [
      "GET /",
      "GET /health",
      "POST /auth/signup",
      "POST /auth/login",
      "POST /business/register",
      "GET /business/",
      "POST /reviews/submit",
      "GET /reviews/business/:businessId",
      "GET /subscription/plans",
      "GET /notifications",
      "GET /analytics/:businessId",
      "GET /seo/rank/:businessId"
    ]
  });
});


// Global error handler
app.use((error, req, res, next) => {
  console.error("❌ Global error handler:", {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  res.status(error.status || 500).json({
    error: error.message || "Internal server error",
    code: error.code || "INTERNAL_ERROR",
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
});


// SERVER STARTUP


// Cleanup rate limit store every hour
setInterval(cleanupRateLimit, 60 * 60 * 1000);

// Graceful shutdown handling
const gracefulShutdown = (signal) => {
  console.log(`\n📤 Received ${signal}. Shutting down gracefully...`);
  
  server.close(() => {
    console.log("✅ Server closed successfully");
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.log("⚠️ Forcing server shutdown");
    process.exit(1);
  }, 10000);
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
const server = app.listen(PORT, () => {
  console.log(`🚀 AI Review Platform API running on port ${PORT}`);
  console.log(`📋 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`📚 API docs: http://localhost:${PORT}/`);
  console.log(`⏰ Started at: ${new Date().toISOString()}`);
});

export default app;