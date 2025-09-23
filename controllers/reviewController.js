// controllers/reviewController.js
import supabase from "../config/supabase.js";

export const getBusinessReviews = async (req, res) => {
  try {
    const { page = 1, limit = 10, rating, source } = req.query;
    const offset = (page - 1) * limit;

    console.log("🔍 Getting reviews for business:", req.params.businessId);
    console.log("📄 Pagination:", { page, limit, offset });
    console.log("🔍 Filters:", { rating, source });

    // Verify business ownership
    const { data: business, error: businessError } = await supabase
      .from("businesses")
      .select("id, name")
      .eq("id", req.params.businessId)
      .eq("owner_id", req.user.uid)
      .single();

    if (businessError || !business) {
      console.log("❌ Business not found or access denied");
      return res.status(403).json({
        error: "Access denied to this business",
        code: "BUSINESS_ACCESS_DENIED",
      });
    }

    console.log("✅ Business access verified:", business.name);

    // Build query for reviews
    let query = supabase
      .from("reviews")
      .select("*", { count: "exact" })
      .eq("business_id", req.params.businessId)
      .eq("is_verified", true) // Only show verified reviews
      .order("created_at", { ascending: false });

    // Apply filters
    if (rating) {
      query = query.eq("rating", parseInt(rating));
    }

    if (source) {
      query = query.eq("source", source);
    }

    const {
      data: reviews,
      error: reviewsError,
      count,
    } = await query.range(offset, offset + parseInt(limit) - 1);

    if (reviewsError) {
      console.error("❌ Reviews query error:", reviewsError);
      throw reviewsError;
    }

    console.log(`✅ Retrieved ${reviews.length} reviews (${count} total)`);

    res.json({
      reviews: reviews,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count || 0,
        pages: Math.ceil((count || 0) / parseInt(limit)),
      },
      business: {
        id: business.id,
        name: business.name,
      },
    });
  } catch (error) {
    console.error("❌ Get business reviews error:", error);
    res.status(500).json({
      error: "Failed to retrieve reviews",
      code: "REVIEWS_FETCH_FAILED",
    });
  }
};

export const getSingleReview = async (req, res) => {
  try {
    console.log("🔍 Getting single review:", req.params.reviewId);

    const { data: review, error } = await supabase
      .from("reviews")
      .select(
        `
        *,
        businesses!inner(id, name, owner_id)
      `
      )
      .eq("id", req.params.reviewId)
      .single();

    if (error || !review) {
      console.log("❌ Review not found");
      return res.status(404).json({
        error: "Review not found",
        code: "REVIEW_NOT_FOUND",
      });
    }

    // Check business ownership
    if (review.businesses.owner_id !== req.user.uid) {
      console.log("❌ Access denied to review");
      return res.status(403).json({
        error: "Access denied to this review",
        code: "REVIEW_ACCESS_DENIED",
      });
    }

    console.log("✅ Review retrieved successfully");

    res.json({
      review: {
        ...review,
        business: review.businesses,
      },
    });
  } catch (error) {
    console.error("❌ Get single review error:", error);
    res.status(500).json({
      error: "Failed to retrieve review",
      code: "REVIEW_FETCH_FAILED",
    });
  }
};

export const addReplyToReview = async (req, res) => {
  try {
    const { reviewId, replyText } = req.body;

    console.log("💬 Adding reply to review:", reviewId);

    // Validate input
    if (!reviewId || !replyText?.trim()) {
      return res.status(400).json({
        error: "Review ID and reply text are required",
        code: "MISSING_FIELDS",
      });
    }

    // Get review and verify ownership
    const { data: review, error: reviewError } = await supabase
      .from("reviews")
      .select(
        `
        id,
        business_id,
        customer_name,
        rating,
        businesses!inner(owner_id, name)
      `
      )
      .eq("id", reviewId)
      .single();

    if (reviewError || !review) {
      console.log("❌ Review not found");
      return res.status(404).json({
        error: "Review not found",
        code: "REVIEW_NOT_FOUND",
      });
    }

    if (review.businesses.owner_id !== req.user.uid) {
      console.log("❌ Access denied to review");
      return res.status(403).json({
        error: "Access denied to this review",
        code: "REVIEW_ACCESS_DENIED",
      });
    }

    // Add reply (using metadata JSON field to store reply)
    const { data: updatedReview, error: updateError } = await supabase
      .from("reviews")
      .update({
        metadata: {
          reply_text: replyText.trim(),
          replied_at: new Date().toISOString(),
          reply_type: "manual",
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", reviewId)
      .select()
      .single();

    if (updateError) {
      console.error("❌ Reply update error:", updateError);
      throw updateError;
    }

    console.log("✅ Reply added successfully");

    res.json({
      message: "Reply added successfully",
      review: updatedReview,
    });
  } catch (error) {
    console.error("❌ Add reply error:", error);
    res.status(500).json({
      error: "Failed to add reply",
      code: "REPLY_ADD_FAILED",
    });
  }
};

export const updateReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { is_verified } = req.body;

    console.log("📝 Updating review:", reviewId);

    // Get review and verify ownership
    const { data: review, error: reviewError } = await supabase
      .from("reviews")
      .select(
        `
        id,
        businesses!inner(owner_id)
      `
      )
      .eq("id", reviewId)
      .single();

    if (reviewError || !review) {
      return res.status(404).json({
        error: "Review not found",
        code: "REVIEW_NOT_FOUND",
      });
    }

    if (review.businesses.owner_id !== req.user.uid) {
      return res.status(403).json({
        error: "Access denied",
        code: "REVIEW_ACCESS_DENIED",
      });
    }

    const updates = { updated_at: new Date().toISOString() };
    if (typeof is_verified === "boolean") {
      updates.is_verified = is_verified;
    }

    const { data: updatedReview, error: updateError } = await supabase
      .from("reviews")
      .update(updates)
      .eq("id", reviewId)
      .select()
      .single();

    if (updateError) throw updateError;

    console.log("✅ Review updated successfully");

    res.json({
      message: "Review updated successfully",
      review: updatedReview,
    });
  } catch (error) {
    console.error("❌ Update review error:", error);
    res.status(500).json({
      error: "Failed to update review",
      code: "REVIEW_UPDATE_FAILED",
    });
  }
};

export const getReviewSummary = async (req, res) => {
  try {
    const businessId = req.params.businessId;
    console.log("📊 Getting review summary for business:", businessId);

    // Verify business ownership
    const { data: business, error: businessError } = await supabase
      .from("businesses")
      .select("id, name, rating, total_reviews")
      .eq("id", businessId)
      .eq("owner_id", req.user.uid)
      .single();

    if (businessError || !business) {
      return res.status(403).json({
        error: "Access denied to this business",
        code: "BUSINESS_ACCESS_DENIED",
      });
    }

    // Get all reviews for rating distribution
    const { data: reviews, error: reviewsError } = await supabase
      .from("reviews")
      .select("rating, source, created_at")
      .eq("business_id", businessId)
      .eq("is_verified", true);

    if (reviewsError) throw reviewsError;

    // Calculate rating distribution
    const ratingDistribution = [1, 2, 3, 4, 5].map((rating) => ({
      rating,
      count: reviews.filter((r) => r.rating === rating).length,
    }));

    // Calculate source distribution
    const sourceDistribution = reviews.reduce((acc, review) => {
      acc[review.source] = (acc[review.source] || 0) + 1;
      return acc;
    }, {});

    // Calculate recent reviews (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentReviews = reviews.filter(
      (r) => new Date(r.created_at) > thirtyDaysAgo
    ).length;

    const totalReviews = reviews.length;
    const averageRating =
      totalReviews > 0
        ? (
            reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
          ).toFixed(1)
        : 0;

    console.log("✅ Review summary calculated");

    res.json({
      business: {
        id: business.id,
        name: business.name,
      },
      summary: {
        totalReviews,
        averageRating: parseFloat(averageRating),
        recentReviews,
        ratingDistribution,
        sourceDistribution,
      },
    });
  } catch (error) {
    console.error("❌ Review summary error:", error);
    res.status(500).json({
      error: "Failed to get review summary",
      code: "SUMMARY_FETCH_FAILED",
    });
  }
};

export const submitPublicReview = async (req, res) => {
  try {
    const { businessId, customerName, customerEmail, rating, reviewText } =
      req.body;

    console.log("📝 Public review submission for business:", businessId);

    // Validate required fields
    if (!businessId || !customerName || !rating) {
      return res.status(400).json({
        error: "Business ID, customer name, and rating are required",
        code: "MISSING_FIELDS",
      });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        error: "Rating must be between 1 and 5",
        code: "INVALID_RATING",
      });
    }

    // Verify business exists and is active
    const { data: business, error: businessError } = await supabase
      .from("businesses")
      .select("id, name, is_active")
      .eq("id", businessId)
      .single();

    if (businessError || !business) {
      console.log("❌ Business not found");
      return res.status(404).json({
        error: "Business not found",
        code: "BUSINESS_NOT_FOUND",
      });
    }

    if (!business.is_active) {
      return res.status(400).json({
        error: "Business is not accepting reviews",
        code: "BUSINESS_INACTIVE",
      });
    }

    // Create review
    const reviewData = {
      business_id: businessId,
      customer_name: customerName.trim(),
      customer_email: customerEmail?.trim() || null,
      rating: parseInt(rating),
      review_text: reviewText?.trim() || null,
      source: "api", // Since it's coming through your API
      is_verified: true, // Auto-verify API submissions
      external_platform: null, // 👈 ensure null
      external_review_id: null, // 👈 ensure null
      metadata: {
        submitted_via: "public_api",
        ip_address: req.ip || "unknown",
      },
    };

    const { data: newReview, error: insertError } = await supabase
      .from("reviews")
      .insert([reviewData])
      .select()
      .single();

    if (insertError) {
      console.error("❌ Review insert error:", insertError);
      throw insertError;
    }

    console.log("✅ Public review submitted successfully:", newReview.id);

    res.status(201).json({
      message: "Review submitted successfully",
      review: newReview,
      business: {
        id: business.id,
        name: business.name,
      },
    });
  } catch (error) {
    console.error("❌ Submit public review error:", error);
    res.status(500).json({
      error: "Failed to submit review",
      code: "REVIEW_SUBMIT_FAILED",
    });
  }
};

export const deleteReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    console.log("🗑️ Deleting review:", reviewId);

    // Get review and verify ownership
    const { data: review, error: reviewError } = await supabase
      .from("reviews")
      .select(
        `
        id,
        customer_name,
        businesses!inner(owner_id, name)
      `
      )
      .eq("id", reviewId)
      .single();

    if (reviewError || !review) {
      return res.status(404).json({
        error: "Review not found",
        code: "REVIEW_NOT_FOUND",
      });
    }

    if (review.businesses.owner_id !== req.user.uid) {
      return res.status(403).json({
        error: "Access denied",
        code: "REVIEW_ACCESS_DENIED",
      });
    }

    // Delete the review
    const { error: deleteError } = await supabase
      .from("reviews")
      .delete()
      .eq("id", reviewId);

    if (deleteError) throw deleteError;

    console.log("✅ Review deleted successfully");

    res.json({
      message: "Review deleted successfully",
      deletedReview: {
        id: review.id,
        customer_name: review.customer_name,
      },
    });
  } catch (error) {
    console.error("❌ Delete review error:", error);
    res.status(500).json({
      error: "Failed to delete review",
      code: "REVIEW_DELETE_FAILED",
    });
  }
};
