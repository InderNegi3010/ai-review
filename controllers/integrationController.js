// controllers/integrationController.js
import supabase from "../config/supabase.js";

// Setup integration with external platform
export const setupIntegration = async (req, res) => {
  try {
    const { businessId, platform, integrationId, accessToken, refreshToken } =
      req.body;

    console.log(`Setting up ${platform} integration for business:`, businessId);

    // Verify business ownership
    const { data: business } = await supabase
      .from("businesses")
      .select("id, name")
      .eq("id", businessId)
      .eq("owner_id", req.user.uid)
      .single();

    if (!business) {
      return res.status(403).json({
        error: "Access denied to this business",
        code: "BUSINESS_ACCESS_DENIED",
      });
    }

    // Check if integration already exists
    const { data: existingIntegration } = await supabase
      .from("integrations")
      .select("id")
      .eq("business_id", businessId)
      .eq("platform", platform)
      .single();

    let integrationData;

    if (existingIntegration) {
      // Update existing integration
      const { data, error } = await supabase
        .from("integrations")
        .update({
          integration_id: integrationId,
          access_token: accessToken,
          refresh_token: refreshToken,
          status: "active",
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingIntegration.id)
        .select()
        .single();

      if (error) throw error;
      integrationData = data;
    } else {
      // Create new integration
      const { data, error } = await supabase
        .from("integrations")
        .insert([
          {
            business_id: businessId,
            platform: platform,
            integration_id: integrationId,
            access_token: accessToken,
            refresh_token: refreshToken,
            status: "active",
          },
        ])
        .select()
        .single();

      if (error) throw error;
      integrationData = data;
    }

    console.log(`Integration setup completed for ${platform}`);

    res.json({
      message: "Integration setup successfully",
      integration: integrationData,
      business: {
        id: business.id,
        name: business.name,
      },
    });
  } catch (error) {
    console.error("Setup integration error:", error);
    res.status(500).json({
      error: "Failed to setup integration",
      code: "INTEGRATION_SETUP_FAILED",
    });
  }
};

// Fetch reviews from external platform
export const fetchExternalReviews = async (req, res) => {
  try {
    const { businessId, platform } = req.body;

    console.log(`Fetching reviews from ${platform} for business:`, businessId);

    // Verify business ownership
    const { data: business } = await supabase
      .from("businesses")
      .select("id, name")
      .eq("id", businessId)
      .eq("owner_id", req.user.uid)
      .single();

    if (!business) {
      return res.status(403).json({
        error: "Access denied to this business",
        code: "BUSINESS_ACCESS_DENIED",
      });
    }

    // Get integration details
    const { data: integration } = await supabase
      .from("integrations")
      .select("*")
      .eq("business_id", businessId)
      .eq("platform", platform)
      .eq("status", "active")
      .single();

    if (!integration) {
      return res.status(404).json({
        error: `${platform} integration not found or inactive`,
        code: "INTEGRATION_NOT_FOUND",
      });
    }

    // Mock external reviews data (replace with actual API calls)
    const mockReviews = generateMockReviews(platform, business.name);

    // Save fetched reviews to database
    const reviewsToSave = mockReviews.map((review) => ({
      business_id: businessId,
      customer_name: review.customerName,
      customer_email: review.customerEmail,
      rating: review.rating,
      review_text: review.reviewText,
      source: platform,
      external_platform: platform,
      external_review_id: review.externalId,
      is_verified: true,
      metadata: {
        fetched_at: new Date().toISOString(),
        integration_id: integration.id,
      },
    }));

    const { data: savedReviews, error: saveError } = await supabase
      .from("reviews")
      .upsert(reviewsToSave, {
        onConflict: ["business_id", "external_platform", "external_review_id"],
      })
      .select();

    if (saveError) throw saveError;

    // Update last sync time
    await supabase
      .from("integrations")
      .update({ last_sync: new Date().toISOString() })
      .eq("id", integration.id);

    console.log(
      `Fetched and saved ${savedReviews?.length || 0} reviews from ${platform}`
    );

    res.json({
      message: "Reviews fetched successfully",
      reviewsFetched: mockReviews.length,
      reviewsSaved: savedReviews?.length || 0,
      reviews: mockReviews,
      platform: platform,
    });
  } catch (error) {
    console.error("Fetch external reviews error:", error);
    res.status(500).json({
      error: "Failed to fetch external reviews",
      code: "EXTERNAL_REVIEWS_FETCH_FAILED",
    });
  }
};

// Generate mock reviews for different platforms
function generateMockReviews(platform, businessName) {
  const mockData = {
    google_business: [
      {
        externalId: "gb_001",
        customerName: "Sarah Johnson",
        customerEmail: null,
        rating: 5,
        reviewText: `Excellent service at ${businessName}! The staff was friendly and the quality exceeded my expectations. Highly recommend!`,
      },
      {
        externalId: "gb_002",
        customerName: "Mike Wilson",
        customerEmail: null,
        rating: 4,
        reviewText: `Good experience at ${businessName}. Quick service and reasonable prices. Will visit again.`,
      },
      {
        externalId: "gb_003",
        customerName: "Emma Davis",
        customerEmail: null,
        rating: 3,
        reviewText: `Average experience. Nothing special but not bad either. Could improve on customer service.`,
      },
    ],
    facebook: [
      {
        externalId: "fb_001",
        customerName: "John Smith",
        customerEmail: null,
        rating: 5,
        reviewText: `Love this place! ${businessName} always delivers quality service. Been a customer for years.`,
      },
      {
        externalId: "fb_002",
        customerName: "Lisa Brown",
        customerEmail: null,
        rating: 4,
        reviewText: `Great experience overall. The team at ${businessName} is professional and helpful.`,
      },
    ],
    yelp: [
      {
        externalId: "yelp_001",
        customerName: "David Lee",
        customerEmail: null,
        rating: 4,
        reviewText: `Solid choice in the area. ${businessName} provides consistent quality and good value.`,
      },
      {
        externalId: "yelp_002",
        customerName: "Jennifer Taylor",
        customerEmail: null,
        rating: 5,
        reviewText: `Outstanding service! ${businessName} went above and beyond my expectations. Definitely coming back!`,
      },
    ],
  };

  return mockData[platform] || [];
}

// Get business integrations
export const getBusinessIntegrations = async (req, res) => {
  try {
    const businessId = req.params.businessId;

    console.log("Getting integrations for business:", businessId);

    // Verify business ownership
    const { data: business } = await supabase
      .from("businesses")
      .select("id, name")
      .eq("id", businessId)
      .eq("owner_id", req.user.uid)
      .single();

    if (!business) {
      return res.status(403).json({
        error: "Access denied to this business",
        code: "BUSINESS_ACCESS_DENIED",
      });
    }

    const { data: integrations, error } = await supabase
      .from("integrations")
      .select("id, platform, integration_id, status, last_sync, created_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    console.log(`Retrieved ${integrations.length} integrations`);

    res.json({
      business: {
        id: business.id,
        name: business.name,
      },
      integrations: integrations,
      availablePlatforms: [
        "google_business",
        "facebook",
        "linkedin",
        "yelp",
        "tripadvisor",
      ],
    });
  } catch (error) {
    console.error("Get business integrations error:", error);
    res.status(500).json({
      error: "Failed to retrieve integrations",
      code: "INTEGRATIONS_FETCH_FAILED",
    });
  }
};

// Remove integration
export const removeIntegration = async (req, res) => {
  try {
    const integrationId = req.params.integrationId;

    console.log("Removing integration:", integrationId);

    // Verify integration ownership
    const { data: integration, error: fetchError } = await supabase
      .from("integrations")
      .select(
        `
        id, platform,
        businesses!inner(id, name, owner_id)
      `
      )
      .eq("id", integrationId)
      .single();

    if (fetchError || !integration) {
      return res.status(404).json({
        error: "Integration not found",
        code: "INTEGRATION_NOT_FOUND",
      });
    }

    if (integration.businesses.owner_id !== req.user.uid) {
      return res.status(403).json({
        error: "Access denied",
        code: "INTEGRATION_ACCESS_DENIED",
      });
    }

    // Delete integration
    const { error: deleteError } = await supabase
      .from("integrations")
      .delete()
      .eq("id", integrationId);

    if (deleteError) throw deleteError;

    console.log(`Integration removed: ${integration.platform}`);

    res.json({
      message: "Integration removed successfully",
      removedIntegration: {
        id: integration.id,
        platform: integration.platform,
      },
    });
  } catch (error) {
    console.error("Remove integration error:", error);
    res.status(500).json({
      error: "Failed to remove integration",
      code: "INTEGRATION_REMOVE_FAILED",
    });
  }
};

// Update integration status
export const updateIntegrationStatus = async (req, res) => {
  try {
    const integrationId = req.params.integrationId;
    const { status } = req.body;

    console.log(`Updating integration status to: ${status}`);

    if (!["active", "inactive", "error"].includes(status)) {
      return res.status(400).json({
        error: "Invalid status value",
        code: "INVALID_STATUS",
      });
    }

    // Verify integration ownership
    const { data: integration, error: fetchError } = await supabase
      .from("integrations")
      .select(
        `
        id,
        businesses!inner(owner_id)
      `
      )
      .eq("id", integrationId)
      .single();

    if (fetchError || !integration) {
      return res.status(404).json({
        error: "Integration not found",
        code: "INTEGRATION_NOT_FOUND",
      });
    }

    if (integration.businesses.owner_id !== req.user.uid) {
      return res.status(403).json({
        error: "Access denied",
        code: "INTEGRATION_ACCESS_DENIED",
      });
    }

    // Update status
    const { data: updatedIntegration, error: updateError } = await supabase
      .from("integrations")
      .update({
        status: status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", integrationId)
      .select()
      .single();

    if (updateError) throw updateError;

    console.log("Integration status updated successfully");

    res.json({
      message: "Integration status updated successfully",
      integration: updatedIntegration,
    });
  } catch (error) {
    console.error("Update integration status error:", error);
    res.status(500).json({
      error: "Failed to update integration status",
      code: "INTEGRATION_UPDATE_FAILED",
    });
  }
};
