import supabase from "../config/supabase.js";

// Client Dashboard
export const getClientDashboard = async (req, res) => {
  try {
    // Verify business ownership
    const { data: business } = await supabase
      .from("businesses")
      .select("*")
      .eq("id", req.params.businessId)
      .eq("owner_id", req.user.uid)
      .single();

    if (!business) {
      return res.status(403).json({ error: "Access denied to this business" });
    }

    // Get reviews summary
    const { data: reviews } = await supabase
      .from("reviews")
      .select("rating, reply_type, created_at, reply_text")
      .eq("business_id", req.params.businessId)
      .eq("is_hidden", false);

    // Get wallet balance
    const { data: wallet } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", req.user.uid)
      .single();

    // Calculate metrics
    const totalReviews = reviews?.length || 0;
    const averageRating =
      totalReviews > 0
        ? (reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews).toFixed(1)
        : 0;

    const aiReplies = reviews?.filter((r) => r.reply_type === "ai").length || 0;
    const manualReplies =
      reviews?.filter((r) => r.reply_type === "manual" && r.reply_text).length ||
      0;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentReviews =
      reviews?.filter((r) => new Date(r.created_at) > sevenDaysAgo).length || 0;

    res.json({
      business,
      metrics: {
        totalReviews,
        averageRating: parseFloat(averageRating),
        aiReplies,
        manualReplies,
        recentReviews,
        walletBalance: wallet?.balance || 0,
      },
      recentActivity: reviews?.slice(0, 5) || [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Admin Dashboard
export const getAdminDashboard = async (req, res) => {
  try {
    const { count: totalUsers } = await supabase
      .from("users")
      .select("*", { count: "exact" })
      .eq("role", "client");

    const { count: totalBusinesses } = await supabase
      .from("businesses")
      .select("*", { count: "exact" });

    const { count: totalReviews } = await supabase
      .from("reviews")
      .select("*", { count: "exact" });

    const { data: payments } = await supabase
      .from("payments")
      .select("amount, status, created_at")
      .eq("status", "completed");

    const totalRevenue =
      payments?.reduce((sum, p) => sum + parseFloat(p.amount), 0) || 0;

    const { data: recentPayments } = await supabase
      .from("payments")
      .select(
        `
        *,
        users(name, email)
      `
      )
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(5);

    res.json({
      metrics: {
        totalUsers: totalUsers || 0,
        totalBusinesses: totalBusinesses || 0,
        totalReviews: totalReviews || 0,
        totalRevenue: totalRevenue.toFixed(2),
      },
      recentPayments: recentPayments || [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Revenue Summary
export const getRevenueSummary = async (req, res) => {
  try {
    const { data: payments } = await supabase
      .from("payments")
      .select("amount, created_at, payment_method")
      .eq("status", "completed")
      .order("created_at", { ascending: false });

    const monthlyRevenue = {};
    payments?.forEach((payment) => {
      const month = new Date(payment.created_at).toISOString().slice(0, 7);
      monthlyRevenue[month] = (monthlyRevenue[month] || 0) + parseFloat(payment.amount);
    });

    const paymentMethodStats = {};
    payments?.forEach((payment) => {
      if (!paymentMethodStats[payment.payment_method]) {
        paymentMethodStats[payment.payment_method] = { count: 0, amount: 0 };
      }
      paymentMethodStats[payment.payment_method].count++;
      paymentMethodStats[payment.payment_method].amount += parseFloat(payment.amount);
    });

    res.json({
      monthlyRevenue,
      paymentMethodStats,
      totalTransactions: payments?.length || 0,
      totalRevenue:
        payments?.reduce((sum, p) => sum + parseFloat(p.amount), 0) || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// AI Insights
export const getAIInsights = async (req, res) => {
  try {
    // Verify business ownership
    const { data: business } = await supabase
      .from("businesses")
      .select("*")
      .eq("id", req.params.businessId)
      .eq("owner_id", req.user.uid)
      .single();

    if (!business) {
      return res.status(403).json({ error: "Access denied to this business" });
    }

    const { data: reviews } = await supabase
      .from("reviews")
      .select("rating, review_text, created_at")
      .eq("business_id", req.params.businessId)
      .eq("is_hidden", false)
      .order("created_at", { ascending: false });

    if (!reviews || reviews.length === 0) {
      return res.json({
        insights: [],
        message: "Not enough data for AI insights",
      });
    }

    const insights = [];

    // Rating trend
    const last30Days = reviews.filter((r) => {
      const d = new Date(r.created_at);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      return d > cutoff;
    });

    const avgRatingLast30 =
      last30Days.length > 0
        ? last30Days.reduce((sum, r) => sum + r.rating, 0) / last30Days.length
        : 0;

    const previous30Days = reviews.filter((r) => {
      const d = new Date(r.created_at);
      const sixtyDaysAgo = new Date();
      const thirtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return d > sixtyDaysAgo && d <= thirtyDaysAgo;
    });

    const avgRatingPrevious30 =
      previous30Days.length > 0
        ? previous30Days.reduce((sum, r) => sum + r.rating, 0) /
          previous30Days.length
        : avgRatingLast30;

    if (avgRatingLast30 > avgRatingPrevious30) {
      insights.push({
        type: "positive",
        title: "Rating Improvement",
        description: `Your average rating improved by ${(avgRatingLast30 - avgRatingPrevious30).toFixed(1)} points this month!`,
        action: "Keep up the great work!",
      });
    } else if (avgRatingLast30 < avgRatingPrevious30) {
      insights.push({
        type: "warning",
        title: "Rating Decline",
        description: `Your average rating decreased by ${(avgRatingPrevious30 - avgRatingLast30).toFixed(1)} points this month.`,
        action: "Consider reaching out to recent customers for feedback.",
      });
    }

    // Review volume
    if (last30Days.length > previous30Days.length) {
      insights.push({
        type: "positive",
        title: "Increased Review Activity",
        description: `You received ${last30Days.length - previous30Days.length} more reviews this month!`,
        action: "Great engagement! Keep promoting your QR code.",
      });
    }

    // Low ratings
    const lowRatingReviews = last30Days.filter((r) => r.rating <= 2);
    if (lowRatingReviews.length > 0) {
      insights.push({
        type: "alert",
        title: "Low Rating Alert",
        description: `You have ${lowRatingReviews.length} low-rated reviews (≤2 stars) this month.`,
        action: "Consider responding to these reviews and addressing concerns.",
      });
    }

    res.json({ insights });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
