// controllers/templateController.js
import supabase from "../config/supabase.js";

// Create message template
export const createTemplate = async (req, res) => {
  try {
    const { businessId, templateName, templateType, subject, content, variables } = req.body;

    console.log("📝 Creating template for business:", businessId);

    // Validate required fields
    if (!businessId || !templateName || !templateType || !content) {
      return res.status(400).json({
        error: "Business ID, template name, type, and content are required",
        code: "MISSING_FIELDS"
      });
    }

    if (!['email', 'sms', 'reminder'].includes(templateType)) {
      return res.status(400).json({
        error: "Template type must be email, sms, or reminder",
        code: "INVALID_TEMPLATE_TYPE"
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

    // Check if template name already exists for this business
    const { data: existingTemplate } = await supabase
      .from("message_templates")
      .select("id")
      .eq("business_id", businessId)
      .eq("template_name", templateName)
      .single();

    if (existingTemplate) {
      return res.status(400).json({
        error: "Template name already exists for this business",
        code: "TEMPLATE_NAME_EXISTS"
      });
    }

    const templateData = {
      business_id: businessId,
      template_name: templateName,
      template_type: templateType,
      subject: templateType === 'email' ? subject : null,
      content: content,
      variables: variables || {
        "{{customer_name}}": "Customer's name",
        "{{business_name}}": "Business name",
        "{{review_link}}": "Link to review page"
      },
      is_default: false
    };

    const { data: template, error } = await supabase
      .from("message_templates")
      .insert([templateData])
      .select()
      .single();

    if (error) {
      console.error("Template creation error:", error);
      throw error;
    }

    console.log("✅ Template created successfully:", template.id);

    res.status(201).json({
      message: "Template created successfully",
      template: template,
      business: {
        id: business.id,
        name: business.name
      }
    });

  } catch (error) {
    console.error("Create template error:", error);
    res.status(500).json({
      error: "Failed to create template",
      code: "TEMPLATE_CREATE_FAILED"
    });
  }
};

// Get business templates
export const getBusinessTemplates = async (req, res) => {
  try {
    const { businessId } = req.params;
    const { type } = req.query;

    console.log("📋 Getting templates for business:", businessId);

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

    let query = supabase
      .from("message_templates")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false });

    if (type) {
      query = query.eq("template_type", type);
    }

    const { data: templates, error } = await query;

    if (error) throw error;

    console.log(`✅ Retrieved ${templates.length} templates`);

    res.json({
      templates,
      business: {
        id: business.id,
        name: business.name
      }
    });

  } catch (error) {
    console.error("Get business templates error:", error);
    res.status(500).json({
      error: "Failed to retrieve templates",
      code: "TEMPLATES_FETCH_FAILED"
    });
  }
};

// Get single template
export const getTemplate = async (req, res) => {
  try {
    const { templateId } = req.params;

    console.log("🔍 Getting template:", templateId);

    const { data: template, error } = await supabase
      .from("message_templates")
      .select(`
        *,
        businesses!inner(owner_id, name)
      `)
      .eq("id", templateId)
      .single();

    if (error || !template) {
      return res.status(404).json({
        error: "Template not found",
        code: "TEMPLATE_NOT_FOUND"
      });
    }

    // Check ownership
    if (template.businesses.owner_id !== req.user.uid) {
      return res.status(403).json({
        error: "Access denied to this template",
        code: "TEMPLATE_ACCESS_DENIED"
      });
    }

    console.log("✅ Template retrieved successfully");

    res.json({
      template: {
        ...template,
        business: template.businesses
      }
    });

  } catch (error) {
    console.error("Get template error:", error);
    res.status(500).json({
      error: "Failed to retrieve template",
      code: "TEMPLATE_FETCH_FAILED"
    });
  }
};

// Update template
export const updateTemplate = async (req, res) => {
  try {
    const { templateId } = req.params;
    const { templateName, templateType, subject, content, variables, isDefault } = req.body;

    console.log("📝 Updating template:", templateId);

    // Verify template ownership
    const { data: template, error: templateError } = await supabase
      .from("message_templates")
      .select(`
        id, business_id,
        businesses!inner(owner_id)
      `)
      .eq("id", templateId)
      .single();

    if (templateError || !template) {
      return res.status(404).json({
        error: "Template not found",
        code: "TEMPLATE_NOT_FOUND"
      });
    }

    if (template.businesses.owner_id !== req.user.uid) {
      return res.status(403).json({
        error: "Access denied",
        code: "TEMPLATE_ACCESS_DENIED"
      });
    }

    // Check for name conflicts
    if (templateName) {
      const { data: existingTemplate } = await supabase
        .from("message_templates")
        .select("id")
        .eq("business_id", template.business_id)
        .eq("template_name", templateName)
        .neq("id", templateId)
        .single();

      if (existingTemplate) {
        return res.status(400).json({
          error: "Template name already exists for this business",
          code: "TEMPLATE_NAME_EXISTS"
        });
      }
    }

    // Prepare updates
    const updates = { updated_at: new Date().toISOString() };
    
    if (templateName !== undefined) updates.template_name = templateName;
    if (templateType !== undefined) updates.template_type = templateType;
    if (subject !== undefined) updates.subject = subject;
    if (content !== undefined) updates.content = content;
    if (variables !== undefined) updates.variables = variables;
    if (typeof isDefault === 'boolean') updates.is_default = isDefault;

    const { data: updatedTemplate, error: updateError } = await supabase
      .from("message_templates")
      .update(updates)
      .eq("id", templateId)
      .select()
      .single();

    if (updateError) throw updateError;

    console.log("✅ Template updated successfully");

    res.json({
      message: "Template updated successfully",
      template: updatedTemplate
    });

  } catch (error) {
    console.error("Update template error:", error);
    res.status(500).json({
      error: "Failed to update template",
      code: "TEMPLATE_UPDATE_FAILED"
    });
  }
};

// Delete template
export const deleteTemplate = async (req, res) => {
  try {
    const { templateId } = req.params;

    console.log("🗑️ Deleting template:", templateId);

    // Verify template ownership
    const { data: template, error: templateError } = await supabase
      .from("message_templates")
      .select(`
        id, template_name,
        businesses!inner(owner_id, name)
      `)
      .eq("id", templateId)
      .single();

    if (templateError || !template) {
      return res.status(404).json({
        error: "Template not found",
        code: "TEMPLATE_NOT_FOUND"
      });
    }

    if (template.businesses.owner_id !== req.user.uid) {
      return res.status(403).json({
        error: "Access denied",
        code: "TEMPLATE_ACCESS_DENIED"
      });
    }

    // Delete template
    const { error: deleteError } = await supabase
      .from("message_templates")
      .delete()
      .eq("id", templateId);

    if (deleteError) throw deleteError;

    console.log("✅ Template deleted successfully");

    res.json({
      message: "Template deleted successfully",
      deletedTemplate: {
        id: template.id,
        name: template.template_name
      }
    });

  } catch (error) {
    console.error("Delete template error:", error);
    res.status(500).json({
      error: "Failed to delete template",
      code: "TEMPLATE_DELETE_FAILED"
    });
  }
};

// Duplicate template
export const duplicateTemplate = async (req, res) => {
  try {
    const { templateId } = req.params;
    const { newName } = req.body;

    console.log("📋 Duplicating template:", templateId);

    // Get original template
    const { data: originalTemplate, error: templateError } = await supabase
      .from("message_templates")
      .select(`
        *,
        businesses!inner(owner_id)
      `)
      .eq("id", templateId)
      .single();

    if (templateError || !originalTemplate) {
      return res.status(404).json({
        error: "Template not found",
        code: "TEMPLATE_NOT_FOUND"
      });
    }

    if (originalTemplate.businesses.owner_id !== req.user.uid) {
      return res.status(403).json({
        error: "Access denied",
        code: "TEMPLATE_ACCESS_DENIED"
      });
    }

    const duplicatedName = newName || `${originalTemplate.template_name} - Copy`;

    // Check for name conflicts
    const { data: existingTemplate } = await supabase
      .from("message_templates")
      .select("id")
      .eq("business_id", originalTemplate.business_id)
      .eq("template_name", duplicatedName)
      .single();

    if (existingTemplate) {
      return res.status(400).json({
        error: "Template name already exists",
        code: "TEMPLATE_NAME_EXISTS"
      });
    }

    // Create duplicate
    const duplicateData = {
      business_id: originalTemplate.business_id,
      template_name: duplicatedName,
      template_type: originalTemplate.template_type,
      subject: originalTemplate.subject,
      content: originalTemplate.content,
      variables: originalTemplate.variables,
      is_default: false
    };

    const { data: duplicatedTemplate, error: duplicateError } = await supabase
      .from("message_templates")
      .insert([duplicateData])
      .select()
      .single();

    if (duplicateError) throw duplicateError;

    console.log("✅ Template duplicated successfully");

    res.status(201).json({
      message: "Template duplicated successfully",
      template: duplicatedTemplate
    });

  } catch (error) {
    console.error("Duplicate template error:", error);
    res.status(500).json({
      error: "Failed to duplicate template",
      code: "TEMPLATE_DUPLICATE_FAILED"
    });
  }
};

// Preview template with sample data
export const previewTemplate = async (req, res) => {
  try {
    const { templateId } = req.params;
    const { sampleData } = req.body;

    console.log("👀 Generating template preview:", templateId);

    // Get template
    const { data: template, error: templateError } = await supabase
      .from("message_templates")
      .select(`
        *,
        businesses!inner(owner_id, name)
      `)
      .eq("id", templateId)
      .single();

    if (templateError || !template) {
      return res.status(404).json({
        error: "Template not found",
        code: "TEMPLATE_NOT_FOUND"
      });
    }

    if (template.businesses.owner_id !== req.user.uid) {
      return res.status(403).json({
        error: "Access denied",
        code: "TEMPLATE_ACCESS_DENIED"
      });
    }

    // Default sample data
    const defaultData = {
      "{{customer_name}}": "John Doe",
      "{{business_name}}": template.businesses.name,
      "{{review_link}}": `${process.env.FRONTEND_URL}/review/sample`,
      "{{date}}": new Date().toLocaleDateString(),
      "{{time}}": new Date().toLocaleTimeString()
    };

    const previewData = { ...defaultData, ...(sampleData || {}) };

    // Replace variables in content
    let previewContent = template.content;
    let previewSubject = template.subject;

    Object.keys(previewData).forEach(variable => {
      const value = previewData[variable];
      previewContent = previewContent.replace(new RegExp(variable, 'g'), value);
      if (previewSubject) {
        previewSubject = previewSubject.replace(new RegExp(variable, 'g'), value);
      }
    });

    console.log("✅ Template preview generated");

    res.json({
      preview: {
        type: template.template_type,
        subject: previewSubject,
        content: previewContent,
        variables: template.variables,
        sampleData: previewData
      },
      template: {
        id: template.id,
        name: template.template_name,
        type: template.template_type
      }
    });

  } catch (error) {
    console.error("Preview template error:", error);
    res.status(500).json({
      error: "Failed to generate template preview",
      code: "TEMPLATE_PREVIEW_FAILED"
    });
  }
};

// Set default template
export const setDefaultTemplate = async (req, res) => {
  try {
    const { templateId } = req.params;

    console.log("⭐ Setting default template:", templateId);

    // Get template and verify ownership
    const { data: template, error: templateError } = await supabase
      .from("message_templates")
      .select(`
        id, business_id, template_type,
        businesses!inner(owner_id)
      `)
      .eq("id", templateId)
      .single();

    if (templateError || !template) {
      return res.status(404).json({
        error: "Template not found",
        code: "TEMPLATE_NOT_FOUND"
      });
    }

    if (template.businesses.owner_id !== req.user.uid) {
      return res.status(403).json({
        error: "Access denied",
        code: "TEMPLATE_ACCESS_DENIED"
      });
    }

    // Unset current default for this template type
    await supabase
      .from("message_templates")
      .update({ is_default: false })
      .eq("business_id", template.business_id)
      .eq("template_type", template.template_type);

    // Set new default
    const { data: updatedTemplate, error: updateError } = await supabase
      .from("message_templates")
      .update({ is_default: true })
      .eq("id", templateId)
      .select()
      .single();

    if (updateError) throw updateError;

    console.log("✅ Default template set successfully");

    res.json({
      message: "Default template set successfully",
      template: updatedTemplate
    });

  } catch (error) {
    console.error("Set default template error:", error);
    res.status(500).json({
      error: "Failed to set default template",
      code: "TEMPLATE_DEFAULT_FAILED"
    });
  }
};