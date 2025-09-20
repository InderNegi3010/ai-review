// controllers/businessController.js
import supabase from "../config/supabase.js";
import crypto from "crypto";

// Function to generate API key
const generateApiKey = () => {
  const randomBytes = crypto.randomBytes(24);
  return 'biz_' + randomBytes.toString('base64url');
};

// Function to ensure API key is unique
const generateUniqueApiKey = async () => {
  let apiKey;
  let isUnique = false;
  let attempts = 0;
  const maxAttempts = 10;

  while (!isUnique && attempts < maxAttempts) {
    apiKey = generateApiKey();
    
    // Check if this API key already exists
    const { data, error } = await supabase
      .from("businesses")
      .select("id")
      .eq("api_key", apiKey)
      .single();

    if (error && error.code === 'PGRST116') {
      // PGRST116 means no rows found, so API key is unique
      isUnique = true;
    } else if (error) {
      throw new Error(`Error checking API key uniqueness: ${error.message}`);
    }
    
    attempts++;
  }

  if (!isUnique) {
    throw new Error("Could not generate unique API key after multiple attempts");
  }

  return apiKey;
};

export const registerBusiness = async (req, res) => {
  try {
    const { name, address, category, description, phone, website } = req.body;

    console.log("🏪 Business registration attempt by user:", req.user.uid);
    console.log("📋 Business data:", { name, address, category });

    // Validate required fields
    if (!name) {
      return res.status(400).json({ 
        error: "Business name is required",
        code: "NAME_REQUIRED"
      });
    }

    // Generate unique API key
    console.log("🔑 Generating unique API key...");
    const apiKey = await generateUniqueApiKey();
    console.log("✅ API key generated:", apiKey.substring(0, 10) + "...");

    const businessData = {
      owner_id: req.user.uid,
      name: name.trim(),
      location: address || null,
      category: category || "Other",
      description: description || null,
      phone: phone || null,
      website: website || null,
      api_key: apiKey, // Explicitly set the API key
      rating: 0.0,
      total_reviews: 0,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    console.log("💾 Inserting business into database...");
    
    const { data, error } = await supabase
      .from("businesses")
      .insert([businessData])
      .select(`
        id,
        owner_id,
        name,
        location,
        category,
        description,
        phone,
        website,
        api_key,
        rating,
        total_reviews,
        is_active,
        created_at,
        updated_at
      `)
      .single();

    if (error) {
      console.error("❌ Database error:", error);
      throw new Error(`Database error: ${error.message}`);
    }

    console.log("✅ Business created successfully:", data.id);

    res.status(201).json({
      message: "Business registered successfully",
      business: data,
    });

  } catch (error) {
    console.error("❌ Business registration error:", error);
    
    res.status(500).json({ 
      error: error.message || "Business registration failed",
      code: "BUSINESS_REGISTRATION_FAILED"
    });
  }
};

export const getBusinessById = async (req, res) => {
  try {
    const businessId = req.params.id;
    console.log("🔍 Getting business:", businessId, "for user:", req.user.uid);

    const { data, error } = await supabase
      .from("businesses")
      .select("*")
      .eq("id", businessId)
      .eq("owner_id", req.user.uid)
      .single();

    if (error) {
      console.error("❌ Database error:", error);
      
      if (error.code === 'PGRST116') {
        return res.status(404).json({ 
          error: "Business not found or you don't have access to it",
          code: "BUSINESS_NOT_FOUND"
        });
      }
      
      throw error;
    }

    if (!data) {
      return res.status(404).json({ 
        error: "Business not found",
        code: "BUSINESS_NOT_FOUND"
      });
    }

    console.log("✅ Business retrieved successfully");

    res.json({ business: data });

  } catch (error) {
    console.error("❌ Get business error:", error);
    res.status(500).json({ 
      error: "Failed to retrieve business",
      code: "BUSINESS_FETCH_FAILED"
    });
  }
};

export const updateBusiness = async (req, res) => {
  try {
    const businessId = req.params.id;
    const { name, location, category, description, phone, website } = req.body;

    console.log("📝 Updating business:", businessId, "for user:", req.user.uid);

    // Prepare updates object
    const updates = {
      updated_at: new Date().toISOString(),
    };

    if (name !== undefined) updates.name = name.trim();
    if (location !== undefined) updates.location = location;
    if (category !== undefined) updates.category = category;
    if (description !== undefined) updates.description = description;
    if (phone !== undefined) updates.phone = phone;
    if (website !== undefined) updates.website = website;

    // Remove updated_at from the check since we always want to update it
    const hasUpdates = Object.keys(updates).length > 1;

    if (!hasUpdates) {
      return res.status(400).json({
        error: "No valid fields to update",
        code: "NO_UPDATES"
      });
    }

    const { data, error } = await supabase
      .from("businesses")
      .update(updates)
      .eq("id", businessId)
      .eq("owner_id", req.user.uid)
      .select("*")
      .single();

    if (error) {
      console.error("❌ Update error:", error);
      
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          error: "Business not found or you don't have access to it",
          code: "BUSINESS_NOT_FOUND"
        });
      }
      
      throw error;
    }

    console.log("✅ Business updated successfully");

    res.json({ 
      message: "Business updated successfully", 
      business: data 
    });

  } catch (error) {
    console.error("❌ Update business error:", error);
    res.status(500).json({ 
      error: "Failed to update business",
      code: "BUSINESS_UPDATE_FAILED"
    });
  }
};

export const getMyBusinesses = async (req, res) => {
  try {
    console.log("📊 Getting businesses for user:", req.user.uid);

    const { data, error } = await supabase
      .from("businesses")
      .select("*")
      .eq("owner_id", req.user.uid)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("❌ Database error:", error);
      throw error;
    }

    console.log(`✅ Retrieved ${data.length} businesses`);

    res.json({ 
      businesses: data,
      count: data.length
    });

  } catch (error) {
    console.error("❌ Get businesses error:", error);
    res.status(500).json({ 
      error: "Failed to retrieve businesses",
      code: "BUSINESSES_FETCH_FAILED"
    });
  }
};

export const deleteBusiness = async (req, res) => {
  try {
    const businessId = req.params.id;
    console.log("🗑️ Deleting business:", businessId, "for user:", req.user.uid);

    const { data, error } = await supabase
      .from("businesses")
      .delete()
      .eq("id", businessId)
      .eq("owner_id", req.user.uid)
      .select("id, name")
      .single();

    if (error) {
      console.error("❌ Delete error:", error);
      
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          error: "Business not found or you don't have access to it",
          code: "BUSINESS_NOT_FOUND"
        });
      }
      
      throw error;
    }

    console.log("✅ Business deleted successfully:", data.name);

    res.json({
      message: "Business deleted successfully",
      deleted_business: data
    });

  } catch (error) {
    console.error("❌ Delete business error:", error);
    res.status(500).json({ 
      error: "Failed to delete business",
      code: "BUSINESS_DELETE_FAILED"
    });
  }
};

export const regenerateApiKey = async (req, res) => {
  try {
    const businessId = req.params.id;
    console.log("🔄 Regenerating API key for business:", businessId);

    // Generate new unique API key
    const newApiKey = await generateUniqueApiKey();

    const { data, error } = await supabase
      .from("businesses")
      .update({ 
        api_key: newApiKey,
        updated_at: new Date().toISOString()
      })
      .eq("id", businessId)
      .eq("owner_id", req.user.uid)
      .select("id, name, api_key")
      .single();

    if (error) {
      console.error("❌ API key regeneration error:", error);
      
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          error: "Business not found or you don't have access to it",
          code: "BUSINESS_NOT_FOUND"
        });
      }
      
      throw error;
    }

    console.log("✅ API key regenerated successfully");

    res.json({
      message: "API key regenerated successfully",
      business: data
    });

  } catch (error) {
    console.error("❌ API key regeneration error:", error);
    res.status(500).json({ 
      error: "Failed to regenerate API key",
      code: "API_KEY_REGEN_FAILED"
    });
  }
};