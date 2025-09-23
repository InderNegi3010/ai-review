// controllers/adminController.js
import supabase from "../config/supabase.js";

// Get all users
export const getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, role, search } = req.query;
    const offset = (page - 1) * limit;

    console.log("👥 Getting all users - Admin:", req.user.uid);

    let query = supabase
      .from("users")
      .select(
        "id, firebase_uid, email, name, phone, photo_url, role, created_at, updated_at, email_verified, phone_verified, last_login",
        { count: "exact" }
      )
      .order("created_at", { ascending: false });

    if (role) query = query.eq("role", role);

    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data, error, count } = await query.range(
      offset,
      offset + limit - 1
    );

    if (error) {
      console.error("❌ Users fetch error:", error);
      throw error;
    }

    console.log(`✅ Retrieved ${data.length} users`);

    res.json({
      users: data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("❌ Get all users error:", error);
    res.status(500).json({
      error: "Failed to retrieve users",
      code: "USERS_FETCH_FAILED",
    });
  }
};

// Update user
export const updateUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const { name, email, role, phone, photo_url } = req.body;

    console.log("📝 Updating user:", userId, "by admin:", req.user.uid);

    // Prepare updates
    const updates = {
      updated_at: new Date().toISOString(),
    };

    if (name !== undefined) updates.name = name;
    if (email !== undefined) updates.email = email;
    if (role !== undefined) updates.role = role;
    if (phone !== undefined) updates.phone = phone;
    if (photo_url !== undefined) updates.photo_url = photo_url;

    const { data, error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", userId)
      .select(
        "id, firebase_uid, email, name, phone, photo_url, role, updated_at"
      )
      .single();

    if (error) {
      console.error("❌ User update error:", error);
      throw error;
    }

    if (!data) {
      return res.status(404).json({
        error: "User not found",
        code: "USER_NOT_FOUND",
      });
    }

    console.log("✅ User updated successfully");

    res.json({
      message: "User updated successfully",
      user: data,
    });
  } catch (error) {
    console.error("❌ Update user error:", error);
    res.status(500).json({
      error: "Failed to update user",
      code: "USER_UPDATE_FAILED",
    });
  }
};

// Get all reviews
export const getAllReviews = async (req, res) => {
  try {
    const { page = 1, limit = 10, rating, platform, business_id } = req.query;
    const offset = (page - 1) * limit;

    console.log("💬 Getting all reviews - Admin:", req.user.uid);

    let query = supabase
      .from("reviews")
      .select(
        `
        *,
        businesses!inner(id, name, owner_id),
        businesses.users!inner(id, name, email)
      `,
        { count: "exact" }
      )
      .order("created_at", { ascending: false });

    if (rating) query = query.eq("rating", rating);
    if (platform) query = query.eq("platform", platform);
    if (business_id) query = query.eq("business_id", business_id);

    const { data, error, count } = await query.range(
      offset,
      offset + limit - 1
    );

    if (error) {
      console.error("❌ Reviews fetch error:", error);
      throw error;
    }

    console.log(`✅ Retrieved ${data.length} reviews`);

    res.json({
      reviews: data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("❌ Get all reviews error:", error);
    res.status(500).json({
      error: "Failed to retrieve reviews",
      code: "REVIEWS_FETCH_FAILED",
    });
  }
};

// Get all payments
export const getAllPayments = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, payment_method } = req.query;
    const offset = (page - 1) * limit;

    console.log("💳 Getting all payments - Admin:", req.user.uid);

    let query = supabase
      .from("payments")
      .select(
        `
        *,
        users!inner(id, name, email)
      `,
        { count: "exact" }
      )
      .order("created_at", { ascending: false });

    if (status) query = query.eq("status", status);
    if (payment_method) query = query.eq("payment_method", payment_method);

    const { data, error, count } = await query.range(
      offset,
      offset + limit - 1
    );

    if (error) {
      console.error("❌ Payments fetch error:", error);
      throw error;
    }

    console.log(`✅ Retrieved ${data.length} payments`);

    res.json({
      payments: data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("❌ Get all payments error:", error);
    res.status(500).json({
      error: "Failed to retrieve payments",
      code: "PAYMENTS_FETCH_FAILED",
    });
  }
};

// Get all businesses
export const getAllBusinesses = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      category,
      subscription_status,
      is_active,
    } = req.query;
    const offset = (page - 1) * limit;

    console.log("🏢 Getting all businesses - Admin:", req.user.uid);

    let query = supabase
      .from("businesses")
      .select(
        `
        *,
        users!inner(id, name, email)
      `,
        { count: "exact" }
      )
      .order("created_at", { ascending: false });

    if (category) query = query.eq("category", category);
    if (subscription_status)
      query = query.eq("subscription_status", subscription_status);
    if (is_active !== undefined)
      query = query.eq("is_active", is_active === "true");

    const { data, error, count } = await query.range(
      offset,
      offset + limit - 1
    );

    if (error) {
      console.error("❌ Businesses fetch error:", error);
      throw error;
    }

    console.log(`✅ Retrieved ${data.length} businesses`);

    res.json({
      businesses: data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("❌ Get all businesses error:", error);
    res.status(500).json({
      error: "Failed to retrieve businesses",
      code: "BUSINESSES_FETCH_FAILED",
    });
  }
};

// Update platform settings
export const updateSettings = async (req, res) => {
  try {
    const { settings } = req.body;

    console.log("⚙️ Updating platform settings - Admin:", req.user.uid);

    if (!settings) {
      return res.status(400).json({
        error: "Settings object is required",
        code: "SETTINGS_REQUIRED",
      });
    }

    // Store settings in a settings table or JSON field
    // For now, we'll use a simple approach with metadata
    const { data, error } = await supabase
      .from("platform_settings")
      .upsert({
        id: 1, // Single row for platform settings
        settings: settings,
        updated_by: req.user.uid,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("❌ Settings update error:", error);
      throw error;
    }

    console.log("✅ Platform settings updated");

    res.json({
      message: "Platform settings updated successfully",
      settings: data.settings,
    });
  } catch (error) {
    console.error("❌ Update settings error:", error);
    res.status(500).json({
      error: "Failed to update platform settings",
      code: "SETTINGS_UPDATE_FAILED",
    });
  }
};

// Get platform settings
export const getSettings = async (req, res) => {
  try {
    console.log("⚙️ Getting platform settings - Admin:", req.user.uid);

    const { data, error } = await supabase
      .from("platform_settings")
      .select("settings, updated_at")
      .eq("id", 1)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("❌ Settings fetch error:", error);
      throw error;
    }

    const settings = data?.settings || {
      maintenance_mode: false,
      registration_enabled: true,
      max_businesses_per_user: 5,
      default_subscription: "free",
    };

    console.log("✅ Platform settings retrieved");

    res.json({
      settings,
      updated_at: data?.updated_at,
    });
  } catch (error) {
    console.error("❌ Get settings error:", error);
    res.status(500).json({
      error: "Failed to retrieve platform settings",
      code: "SETTINGS_FETCH_FAILED",
    });
  }
};

// Delete user (soft delete by deactivating)
export const deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;
    console.log("🗑️ Deactivating user:", userId, "by admin:", req.user.uid);

    // Soft delete by updating is_active to false
    const { data, error } = await supabase
      .from("users")
      .update({
        role: "inactive",
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId)
      .select("id, name, email")
      .single();

    if (error) {
      console.error("❌ User deletion error:", error);
      throw error;
    }

    if (!data) {
      return res.status(404).json({
        error: "User not found",
        code: "USER_NOT_FOUND",
      });
    }

    console.log("✅ User deactivated successfully");

    res.json({
      message: "User deactivated successfully",
      user: data,
    });
  } catch (error) {
    console.error("❌ Delete user error:", error);
    res.status(500).json({
      error: "Failed to deactivate user",
      code: "USER_DELETE_FAILED",
    });
  }
};
