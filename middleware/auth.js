import { auth } from "../config/firebase.js";
import supabase from "../config/supabase.js";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import slowDown from "express-slow-down";

// Enhanced rate limiting with Redis-like storage for production
const rateLimitStore = new Map();
const suspiciousIPs = new Map();
const failedAttempts = new Map();

// Production-grade rate limiting
export const createRateLimit = (
  maxRequests = 100,
  windowMs = 15 * 60 * 1000,
  message = "Too many requests"
) => {
  return rateLimit({
    windowMs,
    max: maxRequests,
    message: {
      error: message,
      code: "RATE_LIMIT_EXCEEDED",
      retryAfter: Math.ceil(windowMs / 1000),
    },
    standardHeaders: true,
    legacyHeaders: false,

    // ✅ Safe IP generator (handles IPv6 correctly)
    keyGenerator: (req, res) => ipKeyGenerator(req),

    // Custom handler for rate limit exceeded
    handler: (req, res) => {
      const ip = ipKeyGenerator(req); // <-- safe here too
      console.log(`🚨 Rate limit exceeded for IP: ${ip}`);

      res.status(429).json({
        error: message,
        code: "RATE_LIMIT_EXCEEDED",
        retryAfter: Math.ceil(windowMs / 1000),
        timestamp: new Date().toISOString(),
      });
    },
  });
};


// Slow down middleware for additional protection
export const createSlowDown = (delayAfter = 10, delayMs = 1000) => {
  return slowDown({
    windowMs: 15 * 60 * 1000, // 15 minutes
    delayAfter,
    delayMs,
    maxDelayMs: 10000, // Maximum delay of 10 seconds
  });
};

// IP Blacklist middleware
const blacklistedIPs = new Set();

export const ipBlacklist = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  
  if (blacklistedIPs.has(ip)) {
    console.log(`🚫 Blocked request from blacklisted IP: ${ip}`);
    return res.status(403).json({
      error: "Access denied",
      code: "IP_BLACKLISTED",
    });
  }
  
  // Check for suspicious activity
  const suspiciousCount = suspiciousIPs.get(ip) || 0;
  if (suspiciousCount > 20) {
    blacklistedIPs.add(ip);
    console.log(`🚨 IP ${ip} added to blacklist due to suspicious activity`);
    return res.status(403).json({
      error: "Access denied due to suspicious activity",
      code: "IP_SUSPICIOUS_BLOCKED",
    });
  }
  
  next();
};

// Enhanced authentication middleware with security features
export const authenticateToken = async (req, res, next) => {
  const startTime = Date.now();
  const ip = req.ip || req.connection.remoteAddress;
  
  try {
    // Extract token from Authorization header
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    console.log(`🔍 Auth attempt from IP: ${ip}`);

    // Check if token exists
    if (!token) {
      console.log("❌ No token provided");
      trackFailedAttempt(ip, "NO_TOKEN");
      return res.status(401).json({
        error: "Access token required",
        code: "TOKEN_MISSING",
        timestamp: new Date().toISOString(),
      });
    }

    // Enhanced token format validation
    if (!isValidJWTFormat(token)) {
      console.log("❌ Invalid token format");
      trackFailedAttempt(ip, "INVALID_FORMAT");
      return res.status(401).json({
        error: "Invalid token format",
        code: "TOKEN_INVALID_FORMAT",
        timestamp: new Date().toISOString(),
      });
    }

    console.log("🔐 Verifying Firebase ID token...");

    // Verify the Firebase ID token with enhanced error handling
    const decodedToken = await auth.verifyIdToken(token, true); // checkRevoked = true
    console.log("✅ Token verified successfully");
    console.log(`👤 Firebase UID: ${decodedToken.uid}`);

    // Additional token validation
    if (!isTokenValid(decodedToken)) {
      console.log("❌ Token validation failed");
      trackFailedAttempt(ip, "TOKEN_INVALID");
      return res.status(401).json({
        error: "Invalid token claims",
        code: "TOKEN_CLAIMS_INVALID",
        timestamp: new Date().toISOString(),
      });
    }

    // Get user data with enhanced security
    const userData = await auth.getUser(decodedToken.uid);
    console.log("✅ Firebase user data retrieved");

    // Check if user is disabled or deleted
    if (userData.disabled) {
      console.log("❌ User account is disabled");
      return res.status(403).json({
        error: "Account is disabled",
        code: "ACCOUNT_DISABLED",
        timestamp: new Date().toISOString(),
      });
    }

    // Enhanced Supabase user lookup with caching consideration
    let user = await getSupabaseUser(userData.uid, userData.email || decodedToken.email);

    if (!user) {
      console.log("❌ User not found in database");
      return res.status(404).json({
        error: "User not found in database",
        code: "USER_NOT_FOUND_DB",
        timestamp: new Date().toISOString(),
      });
    }

    // Check if user account is active
    if (user.role === 'inactive' || user.is_suspended) {
      console.log("❌ User account is inactive or suspended");
      return res.status(403).json({
        error: "Account is inactive or suspended",
        code: "ACCOUNT_INACTIVE",
        timestamp: new Date().toISOString(),
      });
    }

    // Update last login time
    await updateLastLogin(user.id);

    // Reset failed attempts on successful auth
    failedAttempts.delete(ip);

    // Attach enhanced user data to request
    req.user = {
      uid: user.id, // Supabase UUID
      firebase_uid: userData.uid, // Firebase UID
      email: userData.email || user.email,
      role: user.role,
      emailVerified: userData.emailVerified || user.email_verified,
      lastLogin: new Date().toISOString(),
      ip: ip,
      userAgent: req.headers['user-agent'],
    };

    // Log successful authentication
    const duration = Date.now() - startTime;
    console.log(`✅ User authenticated successfully in ${duration}ms`);
    console.log(`🎯 User ID: ${req.user.uid}, Role: ${req.user.role}`);

    next();

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ Authentication failed in ${duration}ms:`, error.message);
    
    // Track failed attempt
    trackFailedAttempt(ip, error.code || "AUTH_ERROR");

    // Enhanced error responses
    const errorResponse = handleAuthError(error);
    return res.status(errorResponse.status).json({
      ...errorResponse,
      timestamp: new Date().toISOString(),
    });
  }
};

// Enhanced role-based access control
export const requireRole = (allowedRoles, options = {}) => {
  return async (req, res, next) => {
    const { strictMode = false, logAccess = true } = options;
    
    try {
      if (!req.user) {
        console.log("❌ No user found in request");
        return res.status(401).json({
          error: "Authentication required",
          code: "AUTH_REQUIRED",
          timestamp: new Date().toISOString(),
        });
      }

      if (logAccess) {
        console.log(`🔍 Role check: User ${req.user.uid} (${req.user.role}) requesting access`);
        console.log(`🎯 Required roles: ${allowedRoles.join(', ')}`);
      }

      // Enhanced role checking with hierarchy support
      const hasPermission = checkRolePermission(req.user.role, allowedRoles, strictMode);

      if (!hasPermission) {
        console.log(`❌ Access denied: User ${req.user.uid} lacks required permissions`);
        
        // Log unauthorized access attempt
        await logUnauthorizedAccess(req);
        
        return res.status(403).json({
          error: "Insufficient permissions",
          code: "INSUFFICIENT_PERMISSIONS",
          required: allowedRoles,
          current: req.user.role,
          timestamp: new Date().toISOString(),
        });
      }

      if (logAccess) {
        console.log("✅ Role authorization successful");
      }
      
      next();

    } catch (error) {
      console.error("❌ Role authorization error:", error);
      return res.status(500).json({
        error: "Authorization check failed",
        code: "ROLE_CHECK_FAILED",
        timestamp: new Date().toISOString(),
      });
    }
  };
};

// Enhanced optional authentication
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      console.log("🔍 No token provided for optional auth");
      return next();
    }

    // Quick token format check
    if (!isValidJWTFormat(token)) {
      console.log("🔍 Invalid token format for optional auth");
      return next();
    }

    const decodedToken = await auth.verifyIdToken(token);
    const userData = await auth.getUser(decodedToken.uid);

    const user = await getSupabaseUser(userData.uid, userData.email);

    if (user && user.role !== 'inactive') {
      req.user = {
        uid: user.id,
        firebase_uid: userData.uid,
        email: userData.email || user.email,
        role: user.role,
        emailVerified: userData.emailVerified,
      };
      console.log("✅ Optional auth successful for user:", user.id);
    }

    next();

  } catch (error) {
    console.log("🔍 Optional auth failed, continuing without user:", error.message);
    next();
  }
};

// Helper Functions

function isValidJWTFormat(token) {
  return token && 
         typeof token === 'string' && 
         token.startsWith('eyJ') && 
         token.split('.').length === 3;
}

function isTokenValid(decodedToken) {
  const now = Math.floor(Date.now() / 1000);
  
  // Check expiration
  if (decodedToken.exp <= now) {
    return false;
  }
  
  // Check issued at time (not too far in the future)
  if (decodedToken.iat > now + 60) { // 1 minute tolerance
    return false;
  }
  
  // Check audience and issuer
  if (!decodedToken.aud || !decodedToken.iss) {
    return false;
  }
  
  return true;
}

async function getSupabaseUser(firebaseUid, email) {
  try {
    // Try to find by firebase_uid first
    let { data: user, error } = await supabase
      .from("users")
      .select("id, email, role, firebase_uid, email_verified, is_suspended")
      .eq("firebase_uid", firebaseUid)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    if (!user && email) {
      // Try to find by email and update with firebase_uid
      const { data: existingUser, error: emailError } = await supabase
        .from("users")
        .select("id, email, role, firebase_uid, email_verified, is_suspended")
        .eq("email", email)
        .single();

      if (!emailError && existingUser && !existingUser.firebase_uid) {
        // Update existing user with firebase_uid
        const { data: updatedUser, error: updateError } = await supabase
          .from("users")
          .update({ 
            firebase_uid: firebaseUid,
            updated_at: new Date().toISOString()
          })
          .eq("id", existingUser.id)
          .select("id, email, role, firebase_uid, email_verified, is_suspended")
          .single();

        if (!updateError) {
          user = updatedUser;
        }
      }
    }

    return user;
  } catch (error) {
    console.error("Error getting Supabase user:", error);
    return null;
  }
}

async function updateLastLogin(userId) {
  try {
    await supabase
      .from("users")
      .update({ 
        last_login: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", userId);
  } catch (error) {
    console.error("Error updating last login:", error);
  }
}

function trackFailedAttempt(ip, reason) {
  const attempts = failedAttempts.get(ip) || [];
  attempts.push({
    timestamp: Date.now(),
    reason: reason
  });
  
  // Keep only last 10 attempts
  if (attempts.length > 10) {
    attempts.shift();
  }
  
  failedAttempts.set(ip, attempts);
  
  // Check for brute force patterns
  const recentAttempts = attempts.filter(attempt => 
    Date.now() - attempt.timestamp < 15 * 60 * 1000 // Last 15 minutes
  );
  
  if (recentAttempts.length >= 5) {
    console.log(`🚨 Potential brute force detected from IP: ${ip}`);
    const suspiciousCount = suspiciousIPs.get(ip) || 0;
    suspiciousIPs.set(ip, suspiciousCount + 1);
  }
}

function checkRolePermission(userRole, allowedRoles, strictMode = false) {
  if (allowedRoles.includes(userRole)) {
    return true;
  }
  
  if (!strictMode) {
    // Role hierarchy: admin > manager > client
    const roleHierarchy = {
      'admin': ['admin', 'manager', 'client'],
      'manager': ['manager', 'client'],
      'client': ['client']
    };
    
    const userPermissions = roleHierarchy[userRole] || [userRole];
    return allowedRoles.some(role => userPermissions.includes(role));
  }
  
  return false;
}

async function logUnauthorizedAccess(req) {
  try {
    const logData = {
      user_id: req.user?.uid,
      ip: req.ip,
      user_agent: req.headers['user-agent'],
      path: req.path,
      method: req.method,
      timestamp: new Date().toISOString(),
    };
    
    // Log to your security monitoring system
    console.log('🚨 Unauthorized access attempt:', logData);
    
    // You could also store this in a security_logs table
  } catch (error) {
    console.error('Error logging unauthorized access:', error);
  }
}

function handleAuthError(error) {
  const errorMap = {
    'auth/id-token-expired': {
      status: 401,
      error: "Token has expired",
      code: "TOKEN_EXPIRED",
    },
    'auth/id-token-revoked': {
      status: 401,
      error: "Token has been revoked",
      code: "TOKEN_REVOKED",
    },
    'auth/argument-error': {
      status: 401,
      error: "Invalid token format",
      code: "TOKEN_INVALID",
    },
    'auth/user-not-found': {
      status: 404,
      error: "User not found",
      code: "USER_NOT_FOUND",
    },
    'auth/user-disabled': {
      status: 403,
      error: "User account is disabled",
      code: "ACCOUNT_DISABLED",
    },
  };

  return errorMap[error.code] || {
    status: 401,
    error: "Authentication failed",
    code: "AUTH_FAILED",
    details: process.env.NODE_ENV === 'development' ? error.message : undefined
  };
}

// Cleanup functions for production
export const cleanupSecurityData = () => {
  const now = Date.now();
  const fifteenMinutesAgo = now - (15 * 60 * 1000);
  
  // Clean up old failed attempts
  for (const [ip, attempts] of failedAttempts.entries()) {
    const recentAttempts = attempts.filter(attempt => 
      attempt.timestamp > fifteenMinutesAgo
    );
    
    if (recentAttempts.length === 0) {
      failedAttempts.delete(ip);
    } else {
      failedAttempts.set(ip, recentAttempts);
    }
  }
  
  // Clean up old suspicious IPs (reset count after 1 hour)
  const oneHourAgo = now - (60 * 60 * 1000);
  for (const [ip, firstSuspicious] of suspiciousIPs.entries()) {
    if (firstSuspicious < oneHourAgo) {
      suspiciousIPs.delete(ip);
    }
  }
};

// Export rate limiting functions
export const applyRateLimit = createRateLimit;
export const applySlowDown = createSlowDown;


// Schedule cleanup every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupSecurityData, 5 * 60 * 1000);
}