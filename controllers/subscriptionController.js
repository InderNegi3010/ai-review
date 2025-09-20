// controllers/subscriptionController.js
import supabase from "../config/supabase.js";

// Get all subscription plans
export const getSubscriptionPlans = async (req, res) => {
  try {
    console.log("📋 Getting subscription plans");

    const { data: plans, error } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("is_active", true)
      .order("price", { ascending: true });

    if (error) {
      console.error("❌ Error fetching plans:", error);
      throw error;
    }

    console.log(`✅ Retrieved ${plans.length} subscription plans`);

    res.json({
      plans,
      currency: "USD"
    });

  } catch (error) {
    console.error("❌ Get subscription plans error:", error);
    res.status(500).json({
      error: "Failed to retrieve subscription plans",
      code: "PLANS_FETCH_FAILED"
    });
  }
};

// Subscribe to a plan
export const subscribe = async (req, res) => {
  try {
    const { planId, paymentMethod = "stripe" } = req.body;

    console.log("💳 User subscribing to plan:", planId);

    if (!planId) {
      return res.status(400).json({
        error: "Plan ID is required",
        code: "PLAN_ID_REQUIRED"
      });
    }

    // Get the plan details
    const { data: plan, error: planError } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("id", planId)
      .eq("is_active", true)
      .single();

    if (planError || !plan) {
      return res.status(404).json({
        error: "Subscription plan not found",
        code: "PLAN_NOT_FOUND"
      });
    }

    // Check if user already has an active subscription
    const { data: existingSubscription } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", req.user.uid)
      .eq("status", "active")
      .single();

    if (existingSubscription) {
      return res.status(400).json({
        error: "You already have an active subscription",
        code: "SUBSCRIPTION_EXISTS"
      });
    }

    // Calculate subscription period
    const startDate = new Date();
    const endDate = new Date(startDate);
    
    if (plan.billing_interval === "yearly") {
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
      endDate.setMonth(endDate.getMonth() + 1);
    }

    // Create subscription
    const subscriptionData = {
      user_id: req.user.uid,
      plan_id: planId,
      status: "active",
      current_period_start: startDate.toISOString(),
      current_period_end: endDate.toISOString(),
      external_subscription_id: `mock_${Date.now()}`, // In production, use real payment gateway ID
      metadata: {
        payment_method: paymentMethod,
        plan_name: plan.name,
        billing_interval: plan.billing_interval
      }
    };

    const { data: subscription, error: subscriptionError } = await supabase
      .from("subscriptions")
      .insert([subscriptionData])
      .select(`
        *,
        subscription_plans(*)
      `)
      .single();

    if (subscriptionError) {
      console.error("❌ Subscription creation error:", subscriptionError);
      throw subscriptionError;
    }

    // If not free plan, create a payment record
    if (plan.price > 0) {
      await supabase.from("payments").insert([
        {
          user_id: req.user.uid,
          amount: plan.price,
          payment_method: paymentMethod,
          payment_gateway: paymentMethod,
          transaction_id: `sub_${Date.now()}`,
          status: "completed",
          metadata: {
            subscription_id: subscription.id,
            plan_name: plan.name
          }
        }
      ]);
    }

    // Create notification
    await supabase.rpc('create_notification', {
      p_user_id: req.user.uid,
      p_title: 'Subscription Activated',
      p_message: `Your ${plan.name} subscription has been activated successfully!`,
      p_type: 'success',
      p_metadata: { subscription_id: subscription.id }
    });

    console.log("✅ Subscription created successfully:", subscription.id);

    res.status(201).json({
      message: "Subscription created successfully",
      subscription,
      plan
    });

  } catch (error) {
    console.error("❌ Subscribe error:", error);
    res.status(500).json({
      error: "Failed to create subscription",
      code: "SUBSCRIPTION_CREATE_FAILED"
    });
  }
};

// Get user's current subscription
export const getCurrentSubscription = async (req, res) => {
  try {
    console.log("🔍 Getting current subscription for user:", req.user.uid);

    const { data: subscription, error } = await supabase
      .from("subscriptions")
      .select(`
        *,
        subscription_plans(*)
      `)
      .eq("user_id", req.user.uid)
      .eq("status", "active")
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    if (!subscription) {
      // Return free plan as default
      const { data: freePlan } = await supabase
        .from("subscription_plans")
        .select("*")
        .eq("name", "Free")
        .single();

      return res.json({
        subscription: null,
        plan: freePlan,
        message: "No active subscription - using free plan"
      });
    }

    console.log("✅ Current subscription retrieved");

    res.json({
      subscription,
      plan: subscription.subscription_plans
    });

  } catch (error) {
    console.error("❌ Get current subscription error:", error);
    res.status(500).json({
      error: "Failed to retrieve subscription",
      code: "SUBSCRIPTION_FETCH_FAILED"
    });
  }
};

// Cancel subscription
export const cancelSubscription = async (req, res) => {
  try {
    const subscriptionId = req.params.id;
    console.log("❌ Cancelling subscription:", subscriptionId);

    // Get subscription and verify ownership
    const { data: subscription, error: fetchError } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("id", subscriptionId)
      .eq("user_id", req.user.uid)
      .single();

    if (fetchError || !subscription) {
      return res.status(404).json({
        error: "Subscription not found",
        code: "SUBSCRIPTION_NOT_FOUND"
      });
    }

    if (subscription.status !== "active") {
      return res.status(400).json({
        error: "Subscription is not active",
        code: "SUBSCRIPTION_NOT_ACTIVE"
      });
    }

    // Update subscription to cancel at period end
    const { data: updatedSubscription, error: updateError } = await supabase
      .from("subscriptions")
      .update({
        cancel_at_period_end: true,
        status: "cancelled",
        updated_at: new Date().toISOString()
      })
      .eq("id", subscriptionId)
      .select()
      .single();

    if (updateError) {
      console.error("❌ Subscription cancellation error:", updateError);
      throw updateError;
    }

    // Create notification
    await supabase.rpc('create_notification', {
      p_user_id: req.user.uid,
      p_title: 'Subscription Cancelled',
      p_message: 'Your subscription has been cancelled and will expire at the end of the current billing period.',
      p_type: 'warning',
      p_metadata: { subscription_id: subscriptionId }
    });

    console.log("✅ Subscription cancelled successfully");

    res.json({
      message: "Subscription cancelled successfully",
      subscription: updatedSubscription
    });

  } catch (error) {
    console.error("❌ Cancel subscription error:", error);
    res.status(500).json({
      error: "Failed to cancel subscription",
      code: "SUBSCRIPTION_CANCEL_FAILED"
    });
  }
};