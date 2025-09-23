// controllers/invitationController.js
import supabase from "../config/supabase.js";
import crypto from "crypto";

// Send email invitation
export const sendEmailInvitation = async (req, res) => {
  try {
    const { businessId, customerEmail, customerName, templateId, customMessage } = req.body;

    console.log("📧 Sending email invitation for business:", businessId);

    // Validate required fields
    if (!businessId || !customerEmail || !customerName) {
      return res.status(400).json({
        error: "Business ID, customer email, and name are required",
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

    // Generate unique token for review link
    const uniqueToken = crypto.randomBytes(32).toString('base64url');
    const reviewUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/review/${businessId}?token=${uniqueToken}`;

    // Create invitation record
    const invitationData = {
      business_id: businessId,
      customer_email: customerEmail,
      customer_name: customerName,
      invitation_type: 'email',
      status: 'sent',
      unique_token: uniqueToken,
      review_url: reviewUrl,
      metadata: {
        template_id: templateId,
        custom_message: customMessage,
        sent_by: req.user.uid
      }
    };

    const { data: invitation, error: invitationError } = await supabase
      .from("review_invitations")
      .insert([invitationData])
      .select()
      .single();

    if (invitationError) {
      console.error("Database error:", invitationError);
      throw invitationError;
    }

    // Here you would integrate with actual email service (SendGrid, etc.)
    // For now, we'll simulate email sending
    const emailContent = generateEmailContent(business.name, customerName, reviewUrl, customMessage);

    console.log("✅ Email invitation created and sent:", invitation.id);

    res.status(201).json({
      message: "Email invitation sent successfully",
      invitation: invitation,
      emailPreview: emailContent // In production, don't return this
    });

  } catch (error) {
    console.error("Send email invitation error:", error);
    res.status(500).json({
      error: "Failed to send email invitation",
      code: "EMAIL_INVITATION_FAILED"
    });
  }
};

// Send SMS invitation
export const sendSmsInvitation = async (req, res) => {
  try {
    const { businessId, customerPhone, customerName, customMessage } = req.body;

    console.log("📱 Sending SMS invitation for business:", businessId);

    // Validate required fields
    if (!businessId || !customerPhone || !customerName) {
      return res.status(400).json({
        error: "Business ID, customer phone, and name are required",
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

    // Generate unique token
    const uniqueToken = crypto.randomBytes(32).toString('base64url');
    const reviewUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/review/${businessId}?token=${uniqueToken}`;

    // Create invitation record
    const invitationData = {
      business_id: businessId,
      customer_phone: customerPhone,
      customer_name: customerName,
      invitation_type: 'sms',
      status: 'sent',
      unique_token: uniqueToken,
      review_url: reviewUrl,
      metadata: {
        custom_message: customMessage,
        sent_by: req.user.uid
      }
    };

    const { data: invitation, error: invitationError } = await supabase
      .from("review_invitations")
      .insert([invitationData])
      .select()
      .single();

    if (invitationError) throw invitationError;

    // Generate SMS content
    const smsContent = generateSmsContent(business.name, customerName, reviewUrl, customMessage);

    console.log("✅ SMS invitation created and sent:", invitation.id);

    res.status(201).json({
      message: "SMS invitation sent successfully",
      invitation: invitation,
      smsPreview: smsContent
    });

  } catch (error) {
    console.error("Send SMS invitation error:", error);
    res.status(500).json({
      error: "Failed to send SMS invitation",
      code: "SMS_INVITATION_FAILED"
    });
  }
};

// Send bulk invitations
export const sendBulkInvitations = async (req, res) => {
  try {
    const { businessId, invitationType, customers, templateId } = req.body;

    console.log(`📊 Sending bulk ${invitationType} invitations for business:`, businessId);

    if (!businessId || !invitationType || !customers || !Array.isArray(customers)) {
      return res.status(400).json({
        error: "Business ID, invitation type, and customers array are required",
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

    const invitations = [];
    const results = { sent: 0, failed: 0, errors: [] };

    for (const customer of customers) {
      try {
        const uniqueToken = crypto.randomBytes(32).toString('base64url');
        const reviewUrl = `${process.env.FRONTEND_URL}/review/${businessId}?token=${uniqueToken}`;

        const invitationData = {
          business_id: businessId,
          invitation_type: invitationType,
          status: 'sent',
          unique_token: uniqueToken,
          review_url: reviewUrl,
          metadata: {
            template_id: templateId,
            sent_by: req.user.uid,
            bulk_campaign: true
          }
        };

        if (invitationType === 'email') {
          invitationData.customer_email = customer.email;
          invitationData.customer_name = customer.name;
        } else if (invitationType === 'sms') {
          invitationData.customer_phone = customer.phone;
          invitationData.customer_name = customer.name;
        }

        invitations.push(invitationData);
        results.sent++;

      } catch (error) {
        results.failed++;
        results.errors.push({
          customer: customer,
          error: error.message
        });
      }
    }

    // Insert all invitations
    const { data: createdInvitations, error: batchError } = await supabase
      .from("review_invitations")
      .insert(invitations)
      .select();

    if (batchError) throw batchError;

    console.log(`✅ Bulk invitations sent: ${results.sent} successful, ${results.failed} failed`);

    res.status(201).json({
      message: "Bulk invitations processed",
      results: results,
      invitations: createdInvitations
    });

  } catch (error) {
    console.error("Send bulk invitations error:", error);
    res.status(500).json({
      error: "Failed to send bulk invitations",
      code: "BULK_INVITATION_FAILED"
    });
  }
};

// Get invitation history
export const getInvitationHistory = async (req, res) => {
  try {
    const { businessId } = req.params;
    const { page = 1, limit = 20, type, status } = req.query;
    const offset = (page - 1) * limit;

    console.log("📋 Getting invitation history for business:", businessId);

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
      .from("review_invitations")
      .select("*", { count: "exact" })
      .eq("business_id", businessId)
      .order("created_at", { ascending: false });

    if (type) query = query.eq("invitation_type", type);
    if (status) query = query.eq("status", status);

    const { data: invitations, error, count } = await query.range(
      offset,
      offset + parseInt(limit) - 1
    );

    if (error) throw error;

    console.log(`✅ Retrieved ${invitations.length} invitation records`);

    res.json({
      invitations,
      business: {
        id: business.id,
        name: business.name
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count || 0,
        pages: Math.ceil((count || 0) / parseInt(limit))
      }
    });

  } catch (error) {
    console.error("Get invitation history error:", error);
    res.status(500).json({
      error: "Failed to retrieve invitation history",
      code: "INVITATION_HISTORY_FAILED"
    });
  }
};

// Track invitation interaction (open, click, etc.)
export const trackInvitation = async (req, res) => {
  try {
    const { token, action } = req.body;

    console.log(`📊 Tracking invitation action: ${action}`);

    if (!token || !action) {
      return res.status(400).json({
        error: "Token and action are required",
        code: "MISSING_FIELDS"
      });
    }

    const updates = { updated_at: new Date().toISOString() };

    switch (action) {
      case 'opened':
        updates.opened_at = new Date().toISOString();
        updates.status = 'opened';
        break;
      case 'clicked':
        updates.clicked_at = new Date().toISOString();
        updates.status = 'clicked';
        break;
      case 'responded':
        updates.responded_at = new Date().toISOString();
        updates.status = 'responded';
        break;
      default:
        return res.status(400).json({
          error: "Invalid action",
          code: "INVALID_ACTION"
        });
    }

    const { data: invitation, error } = await supabase
      .from("review_invitations")
      .update(updates)
      .eq("unique_token", token)
      .select()
      .single();

    if (error || !invitation) {
      return res.status(404).json({
        error: "Invitation not found",
        code: "INVITATION_NOT_FOUND"
      });
    }

    console.log(`✅ Invitation tracking updated: ${action}`);

    res.json({
      message: "Invitation tracking updated",
      action: action,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Track invitation error:", error);
    res.status(500).json({
      error: "Failed to track invitation",
      code: "INVITATION_TRACKING_FAILED"
    });
  }
};

// Send reminder
export const sendReminder = async (req, res) => {
  try {
    const { invitationId } = req.params;
    const { customMessage } = req.body;

    console.log("🔔 Sending reminder for invitation:", invitationId);

    // Get invitation and verify ownership
    const { data: invitation, error: invitationError } = await supabase
      .from("review_invitations")
      .select(`
        *,
        businesses!inner(owner_id, name)
      `)
      .eq("id", invitationId)
      .single();

    if (invitationError || !invitation) {
      return res.status(404).json({
        error: "Invitation not found",
        code: "INVITATION_NOT_FOUND"
      });
    }

    if (invitation.businesses.owner_id !== req.user.uid) {
      return res.status(403).json({
        error: "Access denied",
        code: "INVITATION_ACCESS_DENIED"
      });
    }

    if (invitation.status === 'responded') {
      return res.status(400).json({
        error: "Customer has already responded",
        code: "ALREADY_RESPONDED"
      });
    }

    // Update reminder count
    const { data: updatedInvitation, error: updateError } = await supabase
      .from("review_invitations")
      .update({
        reminder_count: (invitation.reminder_count || 0) + 1,
        updated_at: new Date().toISOString(),
        metadata: {
          ...invitation.metadata,
          last_reminder_sent: new Date().toISOString(),
          reminder_message: customMessage
        }
      })
      .eq("id", invitationId)
      .select()
      .single();

    if (updateError) throw updateError;

    // Generate reminder content based on invitation type
    let reminderContent;
    if (invitation.invitation_type === 'email') {
      reminderContent = generateReminderEmail(
        invitation.businesses.name,
        invitation.customer_name,
        invitation.review_url,
        customMessage
      );
    } else {
      reminderContent = generateReminderSms(
        invitation.businesses.name,
        invitation.customer_name,
        invitation.review_url,
        customMessage
      );
    }

    console.log("✅ Reminder sent successfully");

    res.json({
      message: "Reminder sent successfully",
      invitation: updatedInvitation,
      reminderContent: reminderContent
    });

  } catch (error) {
    console.error("Send reminder error:", error);
    res.status(500).json({
      error: "Failed to send reminder",
      code: "REMINDER_SEND_FAILED"
    });
  }
};

// Helper functions for content generation
function generateEmailContent(businessName, customerName, reviewUrl, customMessage) {
  return {
    subject: `How was your experience at ${businessName}?`,
    body: `Hi ${customerName},

${customMessage || `Thank you for choosing ${businessName}! We hope you had a great experience.`}

We'd love to hear about your experience. Your feedback helps us serve you better and helps other customers make informed decisions.

Please take a moment to share your review:
${reviewUrl}

Thank you for your time!

Best regards,
${businessName} Team`
  };
}

function generateSmsContent(businessName, customerName, reviewUrl, customMessage) {
  const message = customMessage || `Hi ${customerName}! Thanks for visiting ${businessName}. Please share your experience:`;
  return `${message} ${reviewUrl}`;
}

function generateReminderEmail(businessName, customerName, reviewUrl, customMessage) {
  return {
    subject: `Reminder: Share your ${businessName} experience`,
    body: `Hi ${customerName},

We hope you're doing well! This is a friendly reminder about sharing your recent experience with ${businessName}.

${customMessage || 'Your feedback is valuable to us and helps other customers make informed decisions.'}

Please take a moment to share your review:
${reviewUrl}

Thank you!

${businessName} Team`
  };
}

function generateReminderSms(businessName, customerName, reviewUrl, customMessage) {
  const message = customMessage || `Reminder: Please share your ${businessName} experience`;
  return `${message}: ${reviewUrl}`;
}