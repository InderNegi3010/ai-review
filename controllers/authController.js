// controllers/authController.js
import { auth } from "../config/firebase.js";
import supabase from "../config/supabase.js";

export const signup = async (req, res) => {
  try {
    const { email, password, name, phone } = req.body;

    console.log("🔍 Signup attempt for:", email);

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password are required",
        code: "MISSING_FIELDS",
      });
    }

    // Check if user already exists in Supabase
    console.log("🔍 Checking if user already exists in Supabase...");
    const { data: existingUser } = await supabase
      .from("users")
      .select("id, email, firebase_uid")
      .eq("email", email)
      .single();

    if (existingUser) {
      console.log("❌ User already exists in Supabase");
      return res.status(400).json({
        error: "User already exists",
        code: "USER_EXISTS",
      });
    }

    // Create user in Firebase
    console.log("🔥 Creating Firebase user...");
    const firebaseUser = await auth.createUser({
      email,
      password,
      displayName: name,
    });

    console.log("✅ Firebase user created with UID:", firebaseUser.uid);

    // Create user in Supabase
    console.log("💾 Creating Supabase user record...");
    const { data: supabaseUser, error: supabaseError } = await supabase
      .from("users")
      .insert([
        {
          firebase_uid: firebaseUser.uid,
          email: firebaseUser.email,
          name: name || null,
          phone: phone || null,
          role: "client",
        },
      ])
      .select("id, firebase_uid, email, name, role, created_at")
      .single();

    if (supabaseError) {
      console.error("❌ Supabase error:", supabaseError);
      console.error("❌ Error details:", {
        code: supabaseError.code,
        message: supabaseError.message,
        details: supabaseError.details,
      });
      
      // Cleanup: delete Firebase user if Supabase insert failed
      try {
        await auth.deleteUser(firebaseUser.uid);
        console.log("🧹 Cleaned up Firebase user");
      } catch (cleanupError) {
        console.error("⚠️ Failed to cleanup Firebase user:", cleanupError);
      }
      
      throw new Error(`Database error: ${supabaseError.message}`);
    }

    console.log("✅ Supabase user created with UUID:", supabaseUser.id);
    console.log("🎯 User data:", {
      supabase_id: supabaseUser.id,
      firebase_uid: supabaseUser.firebase_uid,
      email: supabaseUser.email,
    });

    // Generate custom token for immediate login
    const customToken = await auth.createCustomToken(firebaseUser.uid, {
      role: supabaseUser.role,
      supabase_id: supabaseUser.id, // Include Supabase ID in custom claims
    });

    res.status(201).json({
      message: "User created successfully",
      user: {
        id: supabaseUser.id, // Supabase UUID
        firebase_uid: firebaseUser.uid, // Firebase UID
        email: firebaseUser.email,
        name: supabaseUser.name,
        role: supabaseUser.role,
        created_at: supabaseUser.created_at,
      },
      customToken,
    });

  } catch (error) {
    console.error("Signup error:", error);

    // Handle specific Firebase errors
    if (error.code === "auth/email-already-exists") {
      return res.status(400).json({
        error: "Email already registered with Firebase",
        code: "EMAIL_EXISTS",
      });
    }

    if (error.code === "auth/invalid-email") {
      return res.status(400).json({
        error: "Invalid email format",
        code: "INVALID_EMAIL",
      });
    }

    if (error.code === "auth/weak-password") {
      return res.status(400).json({
        error: "Password should be at least 6 characters",
        code: "WEAK_PASSWORD",
      });
    }

    res.status(500).json({
      error: "Signup failed",
      code: "SIGNUP_FAILED",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const signupWithCredentials = async (req, res) => {
  try {
    const { email, password, name, phone, role = "client" } = req.body;

    console.log("🔍 Signup with credentials for:", email);

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password are required",
        code: "MISSING_FIELDS",
      });
    }

    // Create user in Firebase first
    const firebaseUser = await auth.createUser({
      email,
      password,
      displayName: name,
      emailVerified: false,
    });

    console.log("✅ Firebase user created:", firebaseUser.uid);

    // Create user in Supabase
    const { data: supabaseUser, error: supabaseError } = await supabase
      .from("users")
      .insert([
        {
          firebase_uid: firebaseUser.uid,
          email: firebaseUser.email,
          name: name || null,
          phone: phone || null,
          role: role,
        },
      ])
      .select("id, firebase_uid, email, name, role")
      .single();

    if (supabaseError) {
      console.error("❌ Supabase error:", supabaseError);
      
      // Cleanup Firebase user
      try {
        await auth.deleteUser(firebaseUser.uid);
      } catch (cleanupError) {
        console.error("⚠️ Failed to cleanup Firebase user:", cleanupError);
      }
      
      throw new Error(`Database error: ${supabaseError.message}`);
    }

    // Generate email verification link
    const emailVerificationLink = await auth.generateEmailVerificationLink(email);

    res.status(201).json({
      message: "User created successfully",
      user: {
        id: supabaseUser.id,
        firebase_uid: firebaseUser.uid,
        email: firebaseUser.email,
        name: supabaseUser.name,
        role: supabaseUser.role,
      },
      emailVerificationLink, // In production, send this via email
    });

  } catch (error) {
    console.error("Signup with credentials error:", error);
    res.status(500).json({
      error: "Signup failed",
      code: "SIGNUP_FAILED",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log("🔍 Login attempt for:", email);

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password are required",
        code: "MISSING_FIELDS",
      });
    }

    // Get user by email from Firebase
    const firebaseUser = await auth.getUserByEmail(email);
    console.log("✅ Firebase user found:", firebaseUser.uid);

    // Get user data from Supabase
    const { data: supabaseUser, error: supabaseError } = await supabase
      .from("users")
      .select("id, firebase_uid, email, name, role")
      .eq("firebase_uid", firebaseUser.uid)
      .single();

    if (supabaseError || !supabaseUser) {
      console.error("❌ User not found in Supabase:", supabaseError);
      return res.status(404).json({
        error: "User not found in database",
        code: "USER_NOT_FOUND",
      });
    }

    // Generate custom token with additional claims
    const customToken = await auth.createCustomToken(firebaseUser.uid, {
      role: supabaseUser.role,
      supabase_id: supabaseUser.id,
    });

    console.log("✅ Login successful for user:", supabaseUser.id);

    res.json({
      message: "Login successful",
      user: {
        id: supabaseUser.id,
        firebase_uid: firebaseUser.uid,
        email: firebaseUser.email,
        name: supabaseUser.name,
        role: supabaseUser.role,
      },
      customToken,
    });

  } catch (error) {
    console.error("Login error:", error);

    if (error.code === "auth/user-not-found") {
      return res.status(404).json({
        error: "User not found",
        code: "USER_NOT_FOUND",
      });
    }

    res.status(500).json({
      error: "Login failed",
      code: "LOGIN_FAILED",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const logout = async (req, res) => {
  try {
    // Revoke all refresh tokens for the user
    await auth.revokeRefreshTokens(req.user.firebase_uid);
    console.log("✅ Tokens revoked for user:", req.user.uid);
    
    res.json({ 
      message: "Logout successful",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ 
      error: "Logout failed",
      code: "LOGOUT_FAILED"
    });
  }
};

export const getProfile = async (req, res) => {
  try {
    console.log("🔍 Getting profile for user:", req.user.uid);
    
    const { data: user, error } = await supabase
      .from("users")
      .select("id, email, name, phone, role, photo_url, created_at, updated_at")
      .eq("id", req.user.uid)
      .single();

    if (error) {
      console.error("❌ Profile fetch error:", error);
      throw error;
    }

    if (!user) {
      return res.status(404).json({
        error: "User profile not found",
        code: "PROFILE_NOT_FOUND"
      });
    }

    console.log("✅ Profile fetched successfully");
    
    res.json({ 
      user: {
        ...user,
        firebase_uid: req.user.firebase_uid, // Include Firebase UID
      }
    });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ 
      error: "Failed to fetch profile",
      code: "PROFILE_FETCH_FAILED"
    });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const { name, phone, photo_url } = req.body;

    console.log("🔍 Updating profile for user:", req.user.uid);

    // Validate and prepare updates
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (phone !== undefined) updates.phone = phone;
    if (photo_url !== undefined) updates.photo_url = photo_url;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ 
        error: "No valid fields to update",
        code: "NO_UPDATES"
      });
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", req.user.uid)
      .select()
      .single();

    if (error) {
      console.error("❌ Profile update error:", error);
      throw error;
    }

    console.log("✅ Profile updated successfully");

    res.json({ 
      message: "Profile updated successfully", 
      user: data 
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ 
      error: "Failed to update profile",
      code: "PROFILE_UPDATE_FAILED"
    });
  }
};

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        error: "Email is required",
        code: "EMAIL_REQUIRED"
      });
    }

    console.log("🔍 Password reset request for:", email);

    // Generate password reset link
    const link = await auth.generatePasswordResetLink(email);

    console.log("✅ Password reset link generated");

    // TODO: Send email with reset link using your email service
    // For now, return success without the link (security)
    res.json({
      message: "Password reset link sent to your email",
      // resetLink: link, // Don't send this in production!
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    
    if (error.code === "auth/user-not-found") {
      return res.status(404).json({ 
        error: "No user found with this email",
        code: "USER_NOT_FOUND"
      });
    }
    
    res.status(500).json({ 
      error: "Failed to send reset link",
      code: "RESET_LINK_FAILED"
    });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { oobCode, newPassword } = req.body;

    if (!oobCode || !newPassword) {
      return res.status(400).json({ 
        error: "Reset code and new password are required",
        code: "MISSING_FIELDS"
      });
    }

    console.log("🔍 Password reset attempt with code");

    // Verify and apply the password reset
    const email = await auth.verifyPasswordResetCode(oobCode);
    await auth.confirmPasswordReset(oobCode, newPassword);

    console.log("✅ Password reset successful for:", email);

    res.json({ 
      message: "Password reset successful",
      email: email
    });
  } catch (error) {
    console.error("Reset password error:", error);
    
    if (error.code === "auth/invalid-action-code" || error.code === "auth/expired-action-code") {
      return res.status(400).json({ 
        error: "Invalid or expired reset code",
        code: "INVALID_RESET_CODE"
      });
    }
    
    if (error.code === "auth/weak-password") {
      return res.status(400).json({ 
        error: "Password should be at least 6 characters",
        code: "WEAK_PASSWORD"
      });
    }
    
    res.status(500).json({ 
      error: "Failed to reset password",
      code: "PASSWORD_RESET_FAILED"
    });
  }
};

export const verifyEmail = async (req, res) => {
  try {
    const { oobCode } = req.body;

    if (!oobCode) {
      return res.status(400).json({ 
        error: "Verification code is required",
        code: "CODE_REQUIRED"
      });
    }

    console.log("🔍 Email verification attempt");

    // Apply the email verification
    const email = await auth.checkActionCode(oobCode);
    await auth.applyActionCode(oobCode);

    console.log("✅ Email verified successfully for:", email.data.email);

    res.json({ 
      message: "Email verified successfully",
      email: email.data.email
    });
  } catch (error) {
    console.error("Email verification error:", error);
    
    if (error.code === "auth/invalid-action-code" || error.code === "auth/expired-action-code") {
      return res.status(400).json({ 
        error: "Invalid or expired verification code",
        code: "INVALID_VERIFICATION_CODE"
      });
    }
    
    res.status(500).json({ 
      error: "Failed to verify email",
      code: "EMAIL_VERIFICATION_FAILED"
    });
  }
};