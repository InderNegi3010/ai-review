// middleware/auth.js
import { auth } from "../config/firebase.js";
import supabase from "../config/supabase.js";

export const authenticateToken = async (req, res, next) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    console.log("🔍 Auth Header received:", authHeader ? "Present" : "Missing");
    console.log("🔍 Token extracted:", token ? `${token.substring(0, 30)}...` : "No token");

    // Check if token exists
    if (!token) {
      console.log("❌ No token provided");
      return res.status(401).json({
        error: "Access token required",
        code: "TOKEN_MISSING",
      });
    }

    // Validate token format (Firebase ID tokens should start with 'eyJ')
    if (!token.startsWith('eyJ')) {
      console.log("❌ Invalid token format - doesn't start with 'eyJ'");
      return res.status(401).json({
        error: "Invalid token format - must be a valid JWT",
        code: "TOKEN_INVALID_FORMAT",
      });
    }

    console.log("🔐 Attempting to verify Firebase ID token...");

    // Verify the Firebase ID token
    const decodedToken = await auth.verifyIdToken(token);
    console.log("✅ Token verified successfully");
    console.log("👤 Firebase UID:", decodedToken.uid);
    console.log("📧 Email:", decodedToken.email);

    // Get additional user data from Firebase
    const userData = await auth.getUser(decodedToken.uid);
    console.log("✅ Firebase user data retrieved");

    // Check if user exists in Supabase by firebase_uid first
    console.log("🔍 Checking if user exists in Supabase by firebase_uid...");
    let { data: user, error: userError } = await supabase
      .from("users")
      .select("id, email, role, firebase_uid")
      .eq("firebase_uid", userData.uid)
      .single();

    if (userError && userError.code !== 'PGRST116') {
      // PGRST116 is "no rows returned" which is expected for new users
      console.error("❌ Supabase query error:", userError);
      throw new Error(`Database error: ${userError.message}`);
    }

    if (!user) {
      console.log("👤 User not found by firebase_uid, checking by email...");
      
      // Check if user exists by email (for existing users without firebase_uid)
      const { data: existingUser, error: emailError } = await supabase
        .from("users")
        .select("id, email, role, firebase_uid")
        .eq("email", userData.email || decodedToken.email)
        .single();

      if (emailError && emailError.code !== 'PGRST116') {
        console.error("❌ Email query error:", emailError);
        throw new Error(`Database error: ${emailError.message}`);
      }

      if (existingUser && !existingUser.firebase_uid) {
        console.log("👤 Found existing user by email, updating with firebase_uid...");
        
        // Update existing user with firebase_uid
        const { data: updatedUser, error: updateError } = await supabase
          .from("users")
          .update({ 
            firebase_uid: userData.uid,
            email: userData.email || decodedToken.email // Update email if needed
          })
          .eq("id", existingUser.id)
          .select("id, email, role, firebase_uid")
          .single();

        if (updateError) {
          console.error("❌ Error updating user with firebase_uid:", updateError);
          throw new Error(`Failed to update user: ${updateError.message}`);
        }

        user = updatedUser;
        console.log("✅ Existing user updated with firebase_uid:", user.id);

      } else if (existingUser && existingUser.firebase_uid) {
        console.log("⚠️ User exists with different firebase_uid - potential duplicate");
        throw new Error("User exists with different Firebase account");
        
      } else {
        console.log("👤 User not found anywhere, creating new user...");
        
        // Create completely new user
        const { data: newUser, error: createError } = await supabase
          .from("users")
          .insert([
            {
              firebase_uid: userData.uid,
              email: userData.email || decodedToken.email,
              role: decodedToken.role || "client",
            },
          ])
          .select("id, email, role, firebase_uid")
          .single();

        if (createError) {
          console.error("❌ Error creating user in Supabase:", createError);
          throw new Error(`Failed to create user: ${createError.message}`);
        }

        user = newUser;
        console.log("✅ New user created with ID:", user.id);
      }
    } else {
      console.log("✅ Existing user found with ID:", user.id);
    }

    // Attach user data to request
    req.user = {
      uid: user.id, // Supabase UUID (for database operations)
      firebase_uid: userData.uid, // Firebase UID (for Firebase operations)
      email: userData.email || user.email,
      role: user.role,
    };

    console.log("✅ User authenticated and attached to request");
    console.log("🎯 User ID for DB operations:", req.user.uid);

    next();

  } catch (error) {
    console.error("❌ Authentication error:", error);

    // Handle specific Firebase Auth errors
    if (error.code === "auth/id-token-expired") {
      return res.status(401).json({
        error: "Token has expired",
        code: "TOKEN_EXPIRED",
      });
    }

    if (error.code === "auth/argument-error") {
      return res.status(401).json({
        error: "Invalid token format",
        code: "TOKEN_INVALID",
      });
    }

    if (error.code === "auth/id-token-revoked") {
      return res.status(401).json({
        error: "Token has been revoked",
        code: "TOKEN_REVOKED",
      });
    }

    // Generic error response
    return res.status(401).json({
      error: "Authentication failed",
      code: "AUTH_FAILED",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const requireRole = (allowedRoles) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        console.log("❌ No user found in request");
        return res.status(401).json({
          error: "Authentication required",
          code: "AUTH_REQUIRED",
        });
      }

      console.log(`🔍 Checking role authorization for user: ${req.user.uid}`);
      console.log(`👤 User role: ${req.user.role}`);
      console.log(`🎯 Required roles: ${allowedRoles.join(', ')}`);

      // Check if user has required role
      if (!allowedRoles.includes(req.user.role)) {
        console.log("❌ Insufficient permissions");
        return res.status(403).json({
          error: "Insufficient permissions",
          code: "INSUFFICIENT_PERMISSIONS",
          required: allowedRoles,
          current: req.user.role,
        });
      }

      console.log("✅ Role authorization successful");
      next();

    } catch (error) {
      console.error("❌ Role authorization error:", error);
      return res.status(500).json({
        error: "Authorization check failed",
        code: "ROLE_CHECK_FAILED",
      });
    }
  };
};

// Optional authentication middleware (for public endpoints that can benefit from user context)
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      console.log("🔍 No token provided for optional auth - continuing without user");
      return next();
    }

    // Try to authenticate, but don't fail if it doesn't work
    const decodedToken = await auth.verifyIdToken(token);
    const userData = await auth.getUser(decodedToken.uid);

    // Get user from Supabase
    const { data: user } = await supabase
      .from("users")
      .select("id, email, role")
      .eq("firebase_uid", userData.uid)
      .single();

    if (user) {
      req.user = {
        uid: user.id,
        firebase_uid: userData.uid,
        email: userData.email,
        role: user.role,
      };
      console.log("✅ Optional auth successful for user:", user.id);
    }

    next();

  } catch (error) {
    console.log("🔍 Optional auth failed, continuing without user:", error.message);
    // Continue without authentication for optional auth
    next();
  }
};

// Rate limiting middleware
const rateLimitStore = new Map();

export const rateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  return (req, res, next) => {
    const key = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();

    if (!rateLimitStore.has(key)) {
      rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }

    const userLimit = rateLimitStore.get(key);

    if (now > userLimit.resetTime) {
      userLimit.count = 1;
      userLimit.resetTime = now + windowMs;
      return next();
    }

    if (userLimit.count >= maxRequests) {
      return res.status(429).json({
        error: "Too many requests",
        code: "RATE_LIMIT_EXCEEDED",
        retryAfter: Math.ceil((userLimit.resetTime - now) / 1000),
      });
    }

    userLimit.count++;
    next();
  };
};

// Cleanup old rate limit entries (call this periodically)
export const cleanupRateLimit = () => {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (now > value.resetTime) {
      rateLimitStore.delete(key);
    }
  }
};