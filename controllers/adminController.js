import supabase from "../config/supabase.js";

// Get all users
export const getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, role, search } = req.query;
    const offset = (page - 1) * limit;

    let query = supabase
      .from("users")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    if (role) query = query.eq("role", role);

    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data, error, count } = await query.range(offset, offset + limit - 1);

    if (error) throw error;

    res.json({
      users: data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update user
export const updateUser = async (req, res) => {
  try {
    const { name, email, role, phone } = req.body;

    const { data, error } = await supabase
      .from("users")
      .update({
        name,
        email,
        role,
        phone,
        updated_at: new Date().toISOString(),
      })
      .eq("id", req.params.id)
      .select()
      .single();

    if (error) throw error;

    res.json({ message: "User updated successfully", user: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get all reviews
export const getAllReviews = async (req, res) => {
  try {
    const { page = 1, limit = 10, rating, platform } = req.query;
    const offset = (page - 1) * limit;

    let query = supabase
      .from("reviews")
      .select(
        `
        *,
        businesses(name, owner_id),
        users!businesses(name, email)
      `,
        { count: "exact" }
      )
      .order("created_at", { ascending: false });

    if (rating) query = query.eq("rating", rating);
    if (platform) query = query.eq("platform", platform);

    const { data, error, count } = await query.range(offset, offset + limit - 1);

    if (error) throw error;

    res.json({
      reviews: data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get all payments
export const getAllPayments = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const offset = (page - 1) * limit;

    let query = supabase
      .from("payments")
      .select(
        `
        *,
        users(name, email)
      `,
        { count: "exact" }
      )
      .order("created_at", { ascending: false });

    if (status) query = query.eq("status", status);

    const { data, error, count } = await query.range(offset, offset + limit - 1);

    if (error) throw error;

    res.json({
      payments: data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get all businesses
export const getAllBusinesses = async (req, res) => {
  try {
    const { page = 1, limit = 10, category } = req.query;
    const offset = (page - 1) * limit;

    let query = supabase
      .from("businesses")
      .select(
        `
        *,
        users(name, email)
      `,
        { count: "exact" }
      )
      .order("created_at", { ascending: false });

    if (category) query = query.eq("category", category);

    const { data, error, count } = await query.range(offset, offset + limit - 1);

    if (error) throw error;

    res.json({
      businesses: data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
