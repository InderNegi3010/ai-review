import supabase from "../config/supabase.js";

export const getWalletBalance = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", req.user.uid)
      .single();

    if (error) throw error;

    res.json({ wallet: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const addFunds = async (req, res) => {
  try {
    const { amount, paymentMethod = "card" } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", req.user.uid)
      .single();

    if (walletError) throw walletError;

    const newBalance = parseFloat(wallet.balance) + parseFloat(amount);

    const { data: updatedWallet, error: updateError } = await supabase
      .from("wallets")
      .update({
        balance: newBalance,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", req.user.uid)
      .select()
      .single();

    if (updateError) throw updateError;

    await supabase.from("payments").insert([
      {
        user_id: req.user.uid,
        amount,
        payment_method: paymentMethod,
        status: "completed",
        transaction_id: `mock_${Date.now()}`,
      },
    ]);

    res.json({
      message: "Funds added successfully",
      wallet: updatedWallet,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
