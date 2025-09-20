import supabase from "../config/supabase.js";

export const getBusinessAnalytics = async (req, res) => {
  try {
    const businessId = req.params.businessId;
    const { period = "30" } = req.query;

    console.log(`📊 Getting analytics for business: ${businessId}, period: ${period} days`);

    // Verify business ownership
    const { data: business, error: businessError } = await supabase
      .from("businesses")
      .select("id, name")
      .eq("id", businessId)
      .eq("owner_id", req.user.uid)
      .single();

    if (businessError || !business) {
      return res.status(403).json({
        error: "Access denied to this business",
        code: "BUSINESS_ACCESS_DENIED",
      });
    }

    // Date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    // Get reviews analytics
    const { data: reviews, error: reviewsError } = await supabase
      .from("reviews")
      .select("rating, created_at, source, is_verified")
      .eq("business_id", businessId)
      .gte("created_at", startDate.toISOString())
      .order("created_at", { ascending: true });

    if (reviewsError) throw reviewsError;

    // Get QR code analytics
    const { data: qrData } = await supabase
      .from("qr_codes")
      .select("scan_count")
      .eq("business_id", businessId)
      .single();

    // Process analytics data
    const analytics = {
      period: `${period} days`,
      business: {
        id: business.id,
        name: business.name,
      },
      overview: {
        totalReviews: reviews.length,
        averageRating:
          reviews.length > 0
            ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
            : 0,
        qrScans: qrData?.scan_count || 0,
        verifiedReviews: reviews.filter((r) => r.is_verified).length,
      },
      ratingDistribution: [1, 2, 3, 4, 5].map((rating) => ({
        rating,
        count: reviews.filter((r) => r.rating === rating).length,
        percentage:
          reviews.length > 0
            ? ((reviews.filter((r) => r.rating === rating).length / reviews.length) * 100).toFixed(1)
            : 0,
      })),
      sourceDistribution: reviews.reduce((acc, review) => {
        acc[review.source] = (acc[review.source] || 0) + 1;
        return acc;
      }, {}),
      dailyStats: [],
    };

    // Daily stats
    const dailyMap = {};
    reviews.forEach((review) => {
      const date = review.created_at.split("T")[0];
      if (!dailyMap[date]) {
        dailyMap[date] = { date, reviews: 0, totalRating: 0 };
      }
      dailyMap[date].reviews++;
      dailyMap[date].totalRating += review.rating;
    });

    analytics.dailyStats = Object.values(dailyMap).map((day) => ({
      date: day.date,
      reviews: day.reviews,
      averageRating: (day.totalRating / day.reviews).toFixed(1),
    }));

    console.log("✅ Analytics data processed");
    res.json({ analytics });
  } catch (error) {
    console.error("❌ Analytics error:", error);
    res.status(500).json({
      error: "Failed to retrieve analytics",
      code: "ANALYTICS_FETCH_FAILED",
    });
  }
};

export const exportAnalyticsCSV = async (req, res) => {
  try {
    const businessId = req.params.businessId;
    console.log("📥 Exporting CSV for business:", businessId);

    // Verify business ownership
    const { data: business } = await supabase
      .from("businesses")
      .select("id, name")
      .eq("id", businessId)
      .eq("owner_id", req.user.uid)
      .single();

    if (!business) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Get reviews data
    const { data: reviews, error } = await supabase
      .from("reviews")
      .select(
        "customer_name, customer_email, rating, review_text, source, created_at, is_verified"
      )
      .eq("business_id", businessId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    // CSV content
    const headers = ["Date", "Customer Name", "Email", "Rating", "Review Text", "Source", "Verified"];
    const csvRows = [
      headers.join(","),
      ...reviews.map((review) =>
        [
          new Date(review.created_at).toLocaleDateString(),
          `"${review.customer_name || "Anonymous"}"`,
          `"${review.customer_email || "N/A"}"`,
          review.rating,
          `"${(review.review_text || "").replace(/"/g, '""')}"`,
          review.source,
          review.is_verified ? "Yes" : "No",
        ].join(",")
      ),
    ];

    const csvContent = csvRows.join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${business.name}_reviews_${new Date().toISOString().split("T")[0]}.csv"`
    );

    console.log("✅ CSV export completed");
    res.send(csvContent);
  } catch (error) {
    console.error("❌ CSV export error:", error);
    res.status(500).json({
      error: "Failed to export CSV",
      code: "CSV_EXPORT_FAILED",
    });
  }
};
