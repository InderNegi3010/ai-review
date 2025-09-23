// controllers/widgetController.js
import supabase from "../config/supabase.js";

// Create review widget
export const createWidget = async (req, res) => {
  try {
    const { businessId, widgetName, widgetType, displaySettings, filterSettings } = req.body;

    console.log("🎨 Creating widget for business:", businessId);

    // Validate required fields
    if (!businessId || !widgetName) {
      return res.status(400).json({
        error: "Business ID and widget name are required",
        code: "MISSING_FIELDS"
      });
    }

    // Verify business ownership
    const { data: business } = await supabase
      .from("businesses")
      .select("id, name, owner_id")
      .eq("id", businessId)
      .eq("owner_id", req.user.uid)
      .single();

    if (!business) {
      return res.status(403).json({
        error: "Access denied to this business",
        code: "BUSINESS_ACCESS_DENIED"
      });
    }

    // Generate embed code
    const widgetId = `widget_${Date.now()}`;
    const embedCode = generateEmbedCode(widgetId, businessId);

    const widgetData = {
      business_id: businessId,
      widget_name: widgetName,
      widget_type: widgetType || 'basic',
      display_settings: displaySettings || {
        backgroundColor: '#ffffff',
        textColor: '#333333',
        accentColor: '#007bff',
        showCustomerNames: true,
        showDates: true,
        maxReviews: 10,
        showRating: true,
        layout: 'vertical'
      },
      filter_settings: filterSettings || {
        minRating: 1,
        sources: ['api'],
        verifiedOnly: true,
        excludeEmpty: true
      },
      embed_code: embedCode,
      is_active: true
    };

    const { data: widget, error } = await supabase
      .from("review_widgets")
      .insert([widgetData])
      .select()
      .single();

    if (error) {
      console.error("Widget creation error:", error);
      throw error;
    }

    console.log("✅ Widget created successfully:", widget.id);

    res.status(201).json({
      message: "Widget created successfully",
      widget: widget,
      business: {
        id: business.id,
        name: business.name
      }
    });

  } catch (error) {
    console.error("Create widget error:", error);
    res.status(500).json({
      error: "Failed to create widget",
      code: "WIDGET_CREATE_FAILED"
    });
  }
};

// Get business widgets
export const getBusinessWidgets = async (req, res) => {
  try {
    const { businessId } = req.params;
    
    console.log("📋 Getting widgets for business:", businessId);

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
        code: "BUSINESS_ACCESS_DENIED"
      });
    }

    const { data: widgets, error } = await supabase
      .from("review_widgets")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    console.log(`✅ Retrieved ${widgets.length} widgets`);

    res.json({
      widgets,
      business: {
        id: business.id,
        name: business.name
      }
    });

  } catch (error) {
    console.error("Get business widgets error:", error);
    res.status(500).json({
      error: "Failed to retrieve widgets",
      code: "WIDGETS_FETCH_FAILED"
    });
  }
};

// Get single widget
export const getWidget = async (req, res) => {
  try {
    const { widgetId } = req.params;
    
    console.log("🔍 Getting widget:", widgetId);

    const { data: widget, error } = await supabase
      .from("review_widgets")
      .select(`
        *,
        businesses!inner(owner_id, name)
      `)
      .eq("id", widgetId)
      .single();

    if (error || !widget) {
      return res.status(404).json({
        error: "Widget not found",
        code: "WIDGET_NOT_FOUND"
      });
    }

    // Check ownership
    if (widget.businesses.owner_id !== req.user.uid) {
      return res.status(403).json({
        error: "Access denied to this widget",
        code: "WIDGET_ACCESS_DENIED"
      });
    }

    console.log("✅ Widget retrieved successfully");

    res.json({
      widget: {
        ...widget,
        business: widget.businesses
      }
    });

  } catch (error) {
    console.error("Get widget error:", error);
    res.status(500).json({
      error: "Failed to retrieve widget",
      code: "WIDGET_FETCH_FAILED"
    });
  }
};

// Update widget
export const updateWidget = async (req, res) => {
  try {
    const { widgetId } = req.params;
    const { widgetName, widgetType, displaySettings, filterSettings, isActive } = req.body;

    console.log("📝 Updating widget:", widgetId);

    // Verify widget ownership
    const { data: widget, error: widgetError } = await supabase
      .from("review_widgets")
      .select(`
        id,
        businesses!inner(owner_id)
      `)
      .eq("id", widgetId)
      .single();

    if (widgetError || !widget) {
      return res.status(404).json({
        error: "Widget not found",
        code: "WIDGET_NOT_FOUND"
      });
    }

    if (widget.businesses.owner_id !== req.user.uid) {
      return res.status(403).json({
        error: "Access denied",
        code: "WIDGET_ACCESS_DENIED"
      });
    }

    // Prepare updates
    const updates = { updated_at: new Date().toISOString() };
    
    if (widgetName !== undefined) updates.widget_name = widgetName;
    if (widgetType !== undefined) updates.widget_type = widgetType;
    if (displaySettings !== undefined) updates.display_settings = displaySettings;
    if (filterSettings !== undefined) updates.filter_settings = filterSettings;
    if (typeof isActive === 'boolean') updates.is_active = isActive;

    const { data: updatedWidget, error: updateError } = await supabase
      .from("review_widgets")
      .update(updates)
      .eq("id", widgetId)
      .select()
      .single();

    if (updateError) throw updateError;

    console.log("✅ Widget updated successfully");

    res.json({
      message: "Widget updated successfully",
      widget: updatedWidget
    });

  } catch (error) {
    console.error("Update widget error:", error);
    res.status(500).json({
      error: "Failed to update widget",
      code: "WIDGET_UPDATE_FAILED"
    });
  }
};

// Display widget publicly (for embedding)
export const displayWidget = async (req, res) => {
  try {
    const { businessId, widgetId } = req.params;
    
    console.log(`🌐 Displaying widget ${widgetId} for business ${businessId}`);

    // Get widget and business data
    const { data: widget, error: widgetError } = await supabase
      .from("review_widgets")
      .select(`
        *,
        businesses!inner(id, name, is_active)
      `)
      .eq("id", widgetId)
      .eq("business_id", businessId)
      .eq("is_active", true)
      .single();

    if (widgetError || !widget) {
      return res.status(404).json({
        error: "Widget not found or inactive",
        code: "WIDGET_NOT_FOUND"
      });
    }

    if (!widget.businesses.is_active) {
      return res.status(404).json({
        error: "Business is inactive",
        code: "BUSINESS_INACTIVE"
      });
    }

    // Get reviews based on widget filters
    let reviewsQuery = supabase
      .from("reviews")
      .select("id, customer_name, rating, review_text, created_at, source")
      .eq("business_id", businessId)
      .eq("is_verified", true)
      .order("created_at", { ascending: false });

    // Apply widget filters
    const filters = widget.filter_settings || {};
    
    if (filters.minRating) {
      reviewsQuery = reviewsQuery.gte("rating", filters.minRating);
    }
    
    if (filters.sources && filters.sources.length > 0) {
      reviewsQuery = reviewsQuery.in("source", filters.sources);
    }
    
    if (filters.excludeEmpty) {
      reviewsQuery = reviewsQuery.not("review_text", "is", null);
      reviewsQuery = reviewsQuery.neq("review_text", "");
    }

    // Limit reviews
    const maxReviews = widget.display_settings?.maxReviews || 10;
    reviewsQuery = reviewsQuery.limit(maxReviews);

    const { data: reviews, error: reviewsError } = await reviewsQuery;

    if (reviewsError) throw reviewsError;

    // Update view count
    await supabase
      .from("review_widgets")
      .update({ 
        views_count: (widget.views_count || 0) + 1,
        updated_at: new Date().toISOString()
      })
      .eq("id", widgetId);

    console.log(`✅ Widget displayed with ${reviews.length} reviews`);

    // Return widget data for rendering
    res.json({
      widget: {
        id: widget.id,
        name: widget.widget_name,
        type: widget.widget_type,
        displaySettings: widget.display_settings,
        business: {
          id: widget.businesses.id,
          name: widget.businesses.name
        }
      },
      reviews: reviews.map(review => ({
        id: review.id,
        customerName: widget.display_settings?.showCustomerNames ? review.customer_name : 'Anonymous',
        rating: review.rating,
        reviewText: review.review_text,
        createdAt: widget.display_settings?.showDates ? review.created_at : null,
        source: review.source
      }))
    });

  } catch (error) {
    console.error("Display widget error:", error);
    res.status(500).json({
      error: "Failed to display widget",
      code: "WIDGET_DISPLAY_FAILED"
    });
  }
};

// Delete widget
export const deleteWidget = async (req, res) => {
  try {
    const { widgetId } = req.params;
    
    console.log("🗑️ Deleting widget:", widgetId);

    // Verify widget ownership
    const { data: widget, error: widgetError } = await supabase
      .from("review_widgets")
      .select(`
        id, widget_name,
        businesses!inner(owner_id, name)
      `)
      .eq("id", widgetId)
      .single();

    if (widgetError || !widget) {
      return res.status(404).json({
        error: "Widget not found",
        code: "WIDGET_NOT_FOUND"
      });
    }

    if (widget.businesses.owner_id !== req.user.uid) {
      return res.status(403).json({
        error: "Access denied",
        code: "WIDGET_ACCESS_DENIED"
      });
    }

    // Delete widget
    const { error: deleteError } = await supabase
      .from("review_widgets")
      .delete()
      .eq("id", widgetId);

    if (deleteError) throw deleteError;

    console.log("✅ Widget deleted successfully");

    res.json({
      message: "Widget deleted successfully",
      deletedWidget: {
        id: widget.id,
        name: widget.widget_name
      }
    });

  } catch (error) {
    console.error("Delete widget error:", error);
    res.status(500).json({
      error: "Failed to delete widget",
      code: "WIDGET_DELETE_FAILED"
    });
  }
};

// Generate preview of widget
export const previewWidget = async (req, res) => {
  try {
    const { businessId, widgetType, displaySettings, filterSettings } = req.body;

    console.log("👀 Generating widget preview for business:", businessId);

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
        code: "BUSINESS_ACCESS_DENIED"
      });
    }

    // Get sample reviews for preview
    let reviewsQuery = supabase
      .from("reviews")
      .select("customer_name, rating, review_text, created_at")
      .eq("business_id", businessId)
      .eq("is_verified", true)
      .order("created_at", { ascending: false })
      .limit(5);

    // Apply filters if provided
    if (filterSettings?.minRating) {
      reviewsQuery = reviewsQuery.gte("rating", filterSettings.minRating);
    }

    const { data: reviews, error: reviewsError } = await reviewsQuery;
    if (reviewsError) throw reviewsError;

    // Generate preview HTML
    const previewHtml = generateWidgetHtml(
      widgetType || 'basic',
      displaySettings || {},
      reviews || [],
      business.name
    );

    console.log("✅ Widget preview generated");

    res.json({
      preview: {
        html: previewHtml,
        reviews: reviews,
        settings: {
          type: widgetType || 'basic',
          display: displaySettings || {},
          filter: filterSettings || {}
        }
      },
      business: {
        id: business.id,
        name: business.name
      }
    });

  } catch (error) {
    console.error("Preview widget error:", error);
    res.status(500).json({
      error: "Failed to generate widget preview",
      code: "WIDGET_PREVIEW_FAILED"
    });
  }
};

// Helper function to generate embed code
function generateEmbedCode(widgetId, businessId) {
  const baseUrl = process.env.API_BASE_URL || 'http://localhost:8000';
  
  return `<!-- ${widgetId} Review Widget -->
<div id="${widgetId}"></div>
<script>
(function() {
  const widgetId = '${widgetId}';
  const businessId = '${businessId}';
  const apiUrl = '${baseUrl}/widgets/display/' + businessId + '/' + widgetId;
  
  fetch(apiUrl)
    .then(response => response.json())
    .then(data => {
      const container = document.getElementById(widgetId);
      if (container && data.widget && data.reviews) {
        container.innerHTML = renderWidget(data.widget, data.reviews);
      }
    })
    .catch(error => console.error('Widget load error:', error));
    
  function renderWidget(widget, reviews) {
    const settings = widget.displaySettings || {};
    const bgColor = settings.backgroundColor || '#ffffff';
    const textColor = settings.textColor || '#333333';
    const accentColor = settings.accentColor || '#007bff';
    
    let html = '<div style="font-family: Arial, sans-serif; background: ' + bgColor + '; color: ' + textColor + '; padding: 20px; border-radius: 8px; max-width: 400px;">';
    html += '<h3 style="margin: 0 0 15px 0; color: ' + accentColor + ';">' + widget.business.name + ' Reviews</h3>';
    
    reviews.forEach(review => {
      html += '<div style="border-bottom: 1px solid #eee; padding: 15px 0;">';
      html += '<div style="display: flex; align-items: center; margin-bottom: 8px;">';
      html += '<div style="color: ' + accentColor + '; margin-right: 8px;">' + '★'.repeat(review.rating) + '☆'.repeat(5-review.rating) + '</div>';
      if (review.customerName) {
        html += '<strong>' + review.customerName + '</strong>';
      }
      html += '</div>';
      if (review.reviewText) {
        html += '<p style="margin: 0; line-height: 1.4;">' + review.reviewText + '</p>';
      }
      html += '</div>';
    });
    
    html += '</div>';
    return html;
  }
})();
</script>`;
}

// Helper function to generate widget HTML for preview
function generateWidgetHtml(type, settings, reviews, businessName) {
  const bgColor = settings.backgroundColor || '#ffffff';
  const textColor = settings.textColor || '#333333';
  const accentColor = settings.accentColor || '#007bff';
  
  let html = `<div style="font-family: Arial, sans-serif; background: ${bgColor}; color: ${textColor}; padding: 20px; border-radius: 8px; max-width: 400px; border: 1px solid #ddd;">`;
  html += `<h3 style="margin: 0 0 15px 0; color: ${accentColor};">${businessName} Reviews</h3>`;
  
  if (type === 'carousel') {
    html += '<div style="overflow: hidden;">';
    reviews.forEach((review, index) => {
      html += `<div style="border-bottom: 1px solid #eee; padding: 15px 0; ${index > 0 ? 'display: none;' : ''}">`;
      html += generateReviewHtml(review, settings, accentColor);
      html += '</div>';
    });
    html += '<div style="text-align: center; margin-top: 10px;">';
    html += '<button style="background: ' + accentColor + '; color: white; border: none; padding: 5px 10px; margin: 0 5px; border-radius: 3px;">‹</button>';
    html += '<button style="background: ' + accentColor + '; color: white; border: none; padding: 5px 10px; margin: 0 5px; border-radius: 3px;">›</button>';
    html += '</div></div>';
  } else if (type === 'grid') {
    html += '<div style="display: flex; flex-wrap: wrap; gap: 10px;">';
    reviews.forEach(review => {
      html += '<div style="flex: 1 1 45%; border: 1px solid #eee; padding: 10px; border-radius: 4px;">';
      html += generateReviewHtml(review, settings, accentColor);
      html += '</div>';
    });
    html += '</div>';
  } else {
    // Basic vertical layout
    reviews.forEach(review => {
      html += '<div style="border-bottom: 1px solid #eee; padding: 15px 0;">';
      html += generateReviewHtml(review, settings, accentColor);
      html += '</div>';
    });
  }
  
  html += '</div>';
  return html;
}

function generateReviewHtml(review, settings, accentColor) {
  let html = '<div style="display: flex; align-items: center; margin-bottom: 8px;">';
  
  if (settings.showRating !== false) {
    html += `<div style="color: ${accentColor}; margin-right: 8px;">${'★'.repeat(review.rating)}${'☆'.repeat(5-review.rating)}</div>`;
  }
  
  if (settings.showCustomerNames && review.customer_name) {
    html += `<strong>${review.customer_name}</strong>`;
  }
  
  if (settings.showDates && review.created_at) {
    html += `<span style="color: #666; margin-left: auto; font-size: 12px;">${new Date(review.created_at).toLocaleDateString()}</span>`;
  }
  
  html += '</div>';
  
  if (review.review_text) {
    html += `<p style="margin: 0; line-height: 1.4;">${review.review_text}</p>`;
  }
  
  return html;
}