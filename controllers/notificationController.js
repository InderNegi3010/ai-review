// controllers/notificationController.js
import supabase from "../config/supabase.js";

// Get user notifications
export const getNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20, unread_only = false } = req.query;
    const offset = (page - 1) * limit;

    console.log("📬 Getting notifications for user:", req.user.uid);

    let query = supabase
      .from("notifications")
      .select("*", { count: "exact" })
      .eq("user_id", req.user.uid)
      .order("created_at", { ascending: false });

    // Filter for unread only if requested
    if (unread_only === 'true') {
      query = query.eq("is_read", false);
    }

    const { data: notifications, error, count } = await query.range(
      offset,
      offset + parseInt(limit) - 1
    );

    if (error) {
      console.error("❌ Notifications fetch error:", error);
      throw error;
    }

    // Get unread count
    const { count: unreadCount } = await supabase
      .from("notifications")
      .select("*", { count: "exact" })
      .eq("user_id", req.user.uid)
      .eq("is_read", false);

    console.log(`✅ Retrieved ${notifications.length} notifications`);

    res.json({
      notifications,
      unreadCount: unreadCount || 0,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count || 0,
        pages: Math.ceil((count || 0) / parseInt(limit))
      }
    });

  } catch (error) {
    console.error("❌ Get notifications error:", error);
    res.status(500).json({
      error: "Failed to retrieve notifications",
      code: "NOTIFICATIONS_FETCH_FAILED"
    });
  }
};

// Mark notification as read
export const markAsRead = async (req, res) => {
  try {
    const notificationId = req.params.id;
    console.log("📖 Marking notification as read:", notificationId);

    const { data: notification, error } = await supabase
      .from("notifications")
      .update({
        is_read: true,
        read_at: new Date().toISOString()
      })
      .eq("id", notificationId)
      .eq("user_id", req.user.uid)
      .select()
      .single();

    if (error) {
      console.error("❌ Mark as read error:", error);
      throw error;
    }

    if (!notification) {
      return res.status(404).json({
        error: "Notification not found",
        code: "NOTIFICATION_NOT_FOUND"
      });
    }

    console.log("✅ Notification marked as read");

    res.json({
      message: "Notification marked as read",
      notification
    });

  } catch (error) {
    console.error("❌ Mark notification as read error:", error);
    res.status(500).json({
      error: "Failed to mark notification as read",
      code: "NOTIFICATION_READ_FAILED"
    });
  }
};

// Mark all notifications as read
export const markAllAsRead = async (req, res) => {
  try {
    console.log("📖 Marking all notifications as read for user:", req.user.uid);

    const { data: notifications, error } = await supabase
      .from("notifications")
      .update({
        is_read: true,
        read_at: new Date().toISOString()
      })
      .eq("user_id", req.user.uid)
      .eq("is_read", false)
      .select("id");

    if (error) {
      console.error("❌ Mark all as read error:", error);
      throw error;
    }

    console.log(`✅ Marked ${notifications.length} notifications as read`);

    res.json({
      message: "All notifications marked as read",
      count: notifications.length
    });

  } catch (error) {
    console.error("❌ Mark all notifications as read error:", error);
    res.status(500).json({
      error: "Failed to mark all notifications as read",
      code: "NOTIFICATIONS_READ_ALL_FAILED"
    });
  }
};

// Delete notification
export const deleteNotification = async (req, res) => {
  try {
    const notificationId = req.params.id;
    console.log("🗑️ Deleting notification:", notificationId);

    const { data: notification, error } = await supabase
      .from("notifications")
      .delete()
      .eq("id", notificationId)
      .eq("user_id", req.user.uid)
      .select("id, title")
      .single();

    if (error) {
      console.error("❌ Delete notification error:", error);
      throw error;
    }

    if (!notification) {
      return res.status(404).json({
        error: "Notification not found",
        code: "NOTIFICATION_NOT_FOUND"
      });
    }

    console.log("✅ Notification deleted");

    res.json({
      message: "Notification deleted successfully",
      deleted: notification
    });

  } catch (error) {
    console.error("❌ Delete notification error:", error);
    res.status(500).json({
      error: "Failed to delete notification",
      code: "NOTIFICATION_DELETE_FAILED"
    });
  }
};

// Send notification (admin only)
export const sendNotification = async (req, res) => {
  try {
    const { userId, title, message, type = 'info', actionUrl, metadata = {} } = req.body;

    console.log("📤 Sending notification to user:", userId || "all users");

    // Validate required fields
    if (!title || !message) {
      return res.status(400).json({
        error: "Title and message are required",
        code: "MISSING_FIELDS"
      });
    }

    if (userId) {
      // Send to specific user
      const notificationId = await supabase.rpc('create_notification', {
        p_user_id: userId,
        p_title: title,
        p_message: message,
        p_type: type,
        p_action_url: actionUrl,
        p_metadata: metadata
      });

      console.log("✅ Notification sent to user:", userId);

      res.json({
        message: "Notification sent successfully",
        notificationId
      });

    } else {
      // Send to all users
      const { data: users, error: usersError } = await supabase
        .from("users")
        .select("id")
        .neq("role", "admin"); // Don't send to admins

      if (usersError) throw usersError;

      const notifications = users.map(user => ({
        user_id: user.id,
        title,
        message,
        type,
        action_url: actionUrl,
        metadata
      }));

      const { data, error } = await supabase
        .from("notifications")
        .insert(notifications)
        .select("id");

      if (error) throw error;

      console.log(`✅ Notification sent to ${users.length} users`);

      res.json({
        message: "Notification sent to all users",
        count: users.length,
        notificationIds: data.map(n => n.id)
      });
    }

  } catch (error) {
    console.error("❌ Send notification error:", error);
    res.status(500).json({
      error: "Failed to send notification",
      code: "NOTIFICATION_SEND_FAILED"
    });
  }
};