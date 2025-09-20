import supabase from "../config/supabase.js";

export const getSEORankings = async (req, res) => {
  try {
    const businessId = req.params.businessId;
    console.log("🔍 Getting SEO rankings for business:", businessId);

    // Verify ownership
    const { data: business } = await supabase
      .from("businesses")
      .select("id, name, category, location")
      .eq("id", businessId)
      .eq("owner_id", req.user.uid)
      .single();

    if (!business) return res.status(403).json({ error: "Access denied" });

    // Get SEO rankings
    const { data: rankings, error } = await supabase
      .from("seo_rankings")
      .select("*")
      .eq("business_id", businessId)
      .order("tracked_date", { ascending: false })
      .limit(50);

    if (error) throw error;

    // Group & trends
    const keywordRankings = rankings.reduce((acc, ranking) => {
      if (!acc[ranking.keyword]) acc[ranking.keyword] = [];
      acc[ranking.keyword].push(ranking);
      return acc;
    }, {});

    const trends = Object.keys(keywordRankings).map((keyword) => {
      const keywordData = keywordRankings[keyword];
      const latest = keywordData[0];
      const previous = keywordData[1];
      return {
        keyword,
        currentPosition: latest.position,
        previousPosition: previous?.position || null,
        trend: previous
          ? previous.position - latest.position > 0
            ? "up"
            : previous.position - latest.position < 0
            ? "down"
            : "stable"
          : "new",
        searchVolume: latest.search_volume,
        competition: latest.competition_level,
      };
    });

    console.log("✅ SEO rankings retrieved");
    res.json({
      business,
      rankings: trends,
      totalKeywords: trends.length,
      averagePosition:
        trends.length > 0
          ? (trends.reduce((sum, t) => sum + (t.currentPosition || 100), 0) / trends.length).toFixed(
              1
            )
          : 0,
    });
  } catch (error) {
    console.error("❌ SEO rankings error:", error);
    res.status(500).json({ error: "Failed to retrieve SEO rankings", code: "SEO_FETCH_FAILED" });
  }
};

export const analyzeSEO = async (req, res) => {
  try {
    const { businessId, keywords } = req.body;
    console.log("🔍 Analyzing SEO for business:", businessId);

    // Verify ownership
    const { data: business } = await supabase
      .from("businesses")
      .select("*")
      .eq("id", businessId)
      .eq("owner_id", req.user.uid)
      .single();

    if (!business) return res.status(403).json({ error: "Access denied" });

    // Mock analysis
    const mockAnalysis = {
      business: {
        id: business.id,
        name: business.name,
        website: business.website,
        category: business.category,
      },
      suggestions: [
        {
          type: "content",
          priority: "high",
          title: "Optimize Page Titles",
          description: "Include your primary keywords in page titles",
          impact: "High visibility improvement",
        },
        {
          type: "technical",
          priority: "medium",
          title: "Improve Page Speed",
          description: "Optimize images and reduce load time",
          impact: "Better user experience and rankings",
        },
        {
          type: "local",
          priority: "high",
          title: "Google My Business",
          description: "Complete your Google My Business profile",
          impact: "Improved local search visibility",
        },
      ],
      competitorAnalysis: {
        averageRating: 4.2,
        averageReviews: 150,
        topKeywords: ["pizza delivery", "italian restaurant", "best pizza"],
      },
      recommendedKeywords: keywords || [
        `${business.category} in ${business.location}`,
        `best ${business.category}`,
        `${business.name} reviews`,
      ],
    };

    await supabase.from("analytics_data").insert([
      {
        business_id: businessId,
        metric_type: "seo_analysis",
        metric_value: 1,
        metadata: mockAnalysis,
      },
    ]);

    console.log("✅ SEO analysis completed");
    res.json({ message: "SEO analysis completed", analysis: mockAnalysis });
  } catch (error) {
    console.error("❌ SEO analysis error:", error);
    res.status(500).json({ error: "Failed to analyze SEO", code: "SEO_ANALYSIS_FAILED" });
  }
};

export const getTopBusinesses = async (req, res) => {
  try {
    const { region = "all", category = "all" } = req.params;
    console.log(`🏆 Getting top businesses - Region: ${region}, Category: ${category}`);

    let query = supabase
      .from("businesses")
      .select("id, name, location, category, rating, total_reviews, created_at")
      .eq("is_active", true)
      .order("rating", { ascending: false })
      .order("total_reviews", { ascending: false })
      .limit(50);

    if (category !== "all") query = query.ilike("category", `%${category}%`);
    if (region !== "all") query = query.ilike("location", `%${region}%`);

    const { data: businesses, error } = await query;
    if (error) throw error;

    console.log(`✅ Retrieved ${businesses.length} top businesses`);
    res.json({
      region,
      category,
      businesses: businesses.map((business, index) => ({ ...business, rank: index + 1 })),
      totalFound: businesses.length,
    });
  } catch (error) {
    console.error("❌ Get top businesses error:", error);
    res.status(500).json({ error: "Failed to retrieve top businesses", code: "TOP_BUSINESSES_FETCH_FAILED" });
  }
};
