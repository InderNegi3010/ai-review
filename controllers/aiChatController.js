// controllers/aiChatController.js
import supabase from "../config/supabase.js";
import { GoogleGenAI } from '@google/genai';


// Initialize the client with your API key
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// Start new AI conversation
export const startConversation = async (req, res) => {
  try {
    const { businessId, conversationType = 'review_reply' } = req.body;

    console.log("🤖 Starting AI conversation for business:", businessId);

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

    // Create new conversation
    const { data: conversation, error } = await supabase
      .from("ai_conversations")
      .insert([{
        business_id: businessId,
        user_id: req.user.uid,
        conversation_type: conversationType
      }])
      .select()
      .single();

    if (error) throw error;

    // Add welcome message
    const welcomeMessage = {
      conversation_id: conversation.id,
      role: 'assistant',
      content: `Hello! I'm your AI assistant for ${business.name}. I can help you:

1. Generate replies to customer reviews
2. Create AI-generated review suggestions for your business
3. Provide SEO optimization advice
4. Help with social media content

How can I assist you today?`,
      ai_provider: 'ai',
      tokens_used: 0,
      processing_time_ms: 0
    };

    await supabase.from("ai_messages").insert([welcomeMessage]);

    console.log("✅ AI conversation started:", conversation.id);

    res.status(201).json({
      message: "AI conversation started",
      conversation,
      business: {
        id: business.id,
        name: business.name
      }
    });

  } catch (error) {
    console.error("❌ Start conversation error:", error);
    res.status(500).json({
      error: "Failed to start conversation",
      code: "CONVERSATION_START_FAILED"
    });
  }
};

// Send message to AI and get response
export const sendMessage = async (req, res) => {
  try {
    const { conversationId, message, reviewId = null, aiProvider = 'ai' } = req.body;

    console.log("💬 Processing AI message for conversation:", conversationId);

    if (!message || !message.trim()) {
      return res.status(400).json({
        error: "Message is required",
        code: "MESSAGE_REQUIRED"
      });
    }

    // Verify conversation ownership and include conversation_type
    const { data: conversation } = await supabase
      .from("ai_conversations")
      .select(`
        id, business_id, conversation_type,
        businesses(id, name, category, location)
      `)
      .eq("id", conversationId)
      .eq("user_id", req.user.uid)
      .single();

    if (!conversation) {
      return res.status(403).json({
        error: "Access denied to this conversation",
        code: "CONVERSATION_ACCESS_DENIED"
      });
    }

    // Get conversation history
    const { data: messageHistory } = await supabase
      .from("ai_messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(20); // Last 20 messages for context

    // If reviewId is provided, get review details
    let reviewContext = "";
    if (reviewId) {
      const { data: review } = await supabase
        .from("reviews")
        .select("customer_name, rating, review_text, source, created_at")
        .eq("id", reviewId)
        .single();

      if (review) {
        reviewContext = `\n\nReview Context:
Customer: ${review.customer_name || 'Anonymous'}
Rating: ${review.rating}/5 stars
Review: "${review.review_text}"
Source: ${review.source}
Date: ${new Date(review.created_at).toLocaleDateString()}`;
      }
    }

    // Ensure conversation_type is defined and safe to call replace
    const conversationTypeText = (conversation.conversation_type || "general").replace('_', ' ');

    // Prepare system prompt
    const systemPrompt = `You are an AI assistant for ${conversation.businesses.name}, a ${conversation.businesses.category} business located in ${conversation.businesses.location}.

Your role is to help the business owner with:
1. Creating professional replies to customer reviews
2. Generating AI review suggestions
3. Providing SEO optimization advice
4. Creating social media content

Guidelines for review replies:
- Be professional, friendly, and appreciative
- For positive reviews: Thank the customer and invite them back
- For negative reviews: Apologize, show concern, and offer to resolve issues
- For neutral reviews: Thank them and ask for specific feedback
- Keep replies concise but personal
- Always maintain the business's professional tone

Current conversation context: You're helping with ${conversationTypeText}.${reviewContext}`;

    // Prepare messages for AI
    const messages = [
      { role: "system", content: systemPrompt },
      ...(messageHistory || []),
      { role: "user", content: message.trim() }
    ];

    const startTime = Date.now();
    let aiResponse;
    let tokensUsed = 0;

    try {
      if (aiProvider === 'ai') {
        const completion = await ai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: messages,
          max_tokens: 500,
          temperature: 0.7,
        });

        aiResponse = completion.choices[0].message.content;
        tokensUsed = completion.usage?.total_tokens || 0;

      } else if (aiProvider === 'gemini') {
        return res.status(400).json({
          error: "Gemini integration not implemented",
          code: "PROVIDER_NOT_AVAILABLE"
        });
      }

      const processingTime = Date.now() - startTime;

      // Save user message
      await supabase.from("ai_messages").insert([{
        conversation_id: conversationId,
        role: 'user',
        content: message.trim(),
        review_id: reviewId,
        ai_provider: aiProvider,
        tokens_used: 0,
        processing_time_ms: 0
      }]);

      // Save AI response
      await supabase.from("ai_messages").insert([{
        conversation_id: conversationId,
        role: 'assistant',
        content: aiResponse,
        review_id: reviewId,
        ai_provider: aiProvider,
        tokens_used: tokensUsed,
        processing_time_ms: processingTime
      }]);

      console.log(`✅ AI response generated in ${processingTime}ms using ${tokensUsed} tokens`);

      res.json({
        response: aiResponse,
        tokensUsed,
        processingTime,
        provider: aiProvider
      });

    } catch (aiError) {
      console.error("❌ AI provider error:", aiError);
      
      // Save user message even if AI fails
      await supabase.from("ai_messages").insert([{
        conversation_id: conversationId,
        role: 'user',
        content: message.trim(),
        review_id: reviewId,
        ai_provider: aiProvider,
        tokens_used: 0,
        processing_time_ms: Date.now() - startTime
      }]);

      throw new Error(`AI service error: ${aiError.message}`);
    }

  } catch (error) {
    console.error("❌ Send message error:", error);
    res.status(500).json({
      error: "Failed to process message",
      code: "MESSAGE_PROCESSING_FAILED",
      details: error.message
    });
  }
};


// Get conversation history
export const getConversationHistory = async (req, res) => {
  try {
    const conversationId = req.params.conversationId;
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    console.log("📜 Getting conversation history:", conversationId);

    // Verify access
    const { data: conversation } = await supabase
      .from("ai_conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", req.user.uid)
      .single();

    if (!conversation) {
      return res.status(403).json({
        error: "Access denied",
        code: "CONVERSATION_ACCESS_DENIED"
      });
    }

    // Get messages
    const { data: messages, error, count } = await supabase
      .from("ai_messages")
      .select(`
        id, role, content, ai_provider, tokens_used, 
        processing_time_ms, created_at,
        reviews(id, customer_name, rating, review_text)
      `, { count: "exact" })
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .range(offset, offset + parseInt(limit) - 1);

    if (error) throw error;

    console.log(`✅ Retrieved ${messages.length} messages`);

    res.json({
      messages,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count || 0,
        pages: Math.ceil((count || 0) / parseInt(limit))
      }
    });

  } catch (error) {
    console.error("❌ Get conversation history error:", error);
    res.status(500).json({
      error: "Failed to retrieve conversation history",
      code: "HISTORY_FETCH_FAILED"
    });
  }
};

// Get user's conversations
export const getUserConversations = async (req, res) => {
  try {
    const { businessId } = req.query;

    console.log("📋 Getting user conversations");

    let query = supabase
      .from("ai_conversations")
      .select(`
        id, conversation_type, is_active, created_at, updated_at,
        businesses(id, name, category)
      `)
      .eq("user_id", req.user.uid)
      .eq("is_active", true)
      .order("updated_at", { ascending: false });

    if (businessId) {
      query = query.eq("business_id", businessId);
    }

    const { data: conversations, error } = await query;

    if (error) throw error;

    console.log(`✅ Retrieved ${conversations.length} conversations`);

    res.json({ conversations });

  } catch (error) {
    console.error("❌ Get user conversations error:", error);
    res.status(500).json({
      error: "Failed to retrieve conversations",
      code: "CONVERSATIONS_FETCH_FAILED"
    });
  }
};

// Generate AI review suggestions for a business
export const generateReviewSuggestions = async (req, res) => {
  try {
    const { businessId, serviceName, count = 6 } = req.body;

    console.log("💡 Generating AI review suggestions for business:", businessId);

    // Verify business ownership
    const { data: business } = await supabase
      .from("businesses")
      .select("*")
      .eq("id", businessId)
      .eq("owner_id", req.user.uid)
      .single();

    if (!business) {
      return res.status(403).json({ 
        error: "Access denied",
        code: "BUSINESS_ACCESS_DENIED"
      });
    }

    const prompt = `Generate ${count} realistic customer review examples for ${business.name}, a ${business.category} business in ${business.location}.

Service/Product: ${serviceName || 'general service'}
Business Description: ${business.description || 'No description provided'}

Create diverse reviews with:
- Mix of ratings (mostly 4-5 stars, some 3 stars)
- Varied review lengths (short to medium)
- Different customer perspectives
- Realistic language and scenarios
- Specific details about the service/product

Format each review as JSON with: rating, reviewText, sentiment

Return only valid JSON array.`;

    try {
      const completion = await ai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1000,
        temperature: 0.8,
      });

      const aiResponse = completion.choices[0].message.content;
      let suggestions;

      try {
        suggestions = JSON.parse(aiResponse);
      } catch (parseError) {
        // Fallback if AI doesn't return valid JSON
        suggestions = [
          {
            rating: 5,
            reviewText: "Excellent service! Highly recommend this business.",
            sentiment: "positive"
          },
          {
            rating: 4,
            reviewText: "Good experience overall. Will come back again.",
            sentiment: "positive"
          },
          {
            rating: 3,
            reviewText: "Average service. Nothing special but not bad either.",
            sentiment: "neutral"
          }
        ];
      }

      // Save suggestions to database
      const suggestionsToSave = suggestions.map(suggestion => ({
        business_id: businessId,
        service_name: serviceName || 'general',
        rating: suggestion.rating,
        review_text: suggestion.reviewText,
        sentiment: suggestion.sentiment,
        ai_provider: 'ai'
      }));

      await supabase.from("ai_review_suggestions").insert(suggestionsToSave);

      console.log(`✅ Generated ${suggestions.length} review suggestions`);

      res.json({
        message: "Review suggestions generated successfully",
        suggestions,
        business: {
          id: business.id,
          name: business.name
        }
      });

    } catch (aiError) {
      console.error("❌ AI generation error:", aiError);
      throw new Error(`Failed to generate suggestions: ${aiError.message}`);
    }

  } catch (error) {
    console.error("❌ Generate suggestions error:", error);
    res.status(500).json({
      error: "Failed to generate review suggestions",
      code: "SUGGESTIONS_GENERATION_FAILED"
    });
  }
};

// Close conversation
export const closeConversation = async (req, res) => {
  try {
    const conversationId = req.params.conversationId;

    console.log("🔒 Closing conversation:", conversationId);

    const { data, error } = await supabase
      .from("ai_conversations")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", conversationId)
      .eq("user_id", req.user.uid)
      .select()
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({
        error: "Conversation not found",
        code: "CONVERSATION_NOT_FOUND"
      });
    }

    console.log("✅ Conversation closed");

    res.json({
      message: "Conversation closed successfully",
      conversation: data
    });

  } catch (error) {
    console.error("❌ Close conversation error:", error);
    res.status(500).json({
      error: "Failed to close conversation",
      code: "CONVERSATION_CLOSE_FAILED"
    });
  }
};