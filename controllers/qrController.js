import supabase from "../config/supabase.js";
import QRCode from "qrcode";

export const generateQrForBusiness = async (req, res) => {
  try {
    const { data: business } = await supabase
      .from("businesses")
      .select("*")
      .eq("id", req.params.businessId)
      .eq("owner_id", req.user.uid)
      .single();

    if (!business) {
      return res.status(403).json({ error: "Access denied to this business" });
    }

    const reviewPageUrl = `${
      process.env.FRONTEND_URL || "http://localhost:3000"
    }/review/${req.params.businessId}`;

    const qrCodeDataUrl = await QRCode.toDataURL(reviewPageUrl, {
      width: 300,
      margin: 2,
    });

    const { data: existingQR } = await supabase
      .from("qr_codes")
      .select("*")
      .eq("business_id", req.params.businessId)
      .single();

    let qrData;
    if (existingQR) {
      const { data, error } = await supabase
        .from("qr_codes")
        .update({
          qr_url: qrCodeDataUrl,
          review_page_url: reviewPageUrl,
        })
        .eq("business_id", req.params.businessId)
        .select()
        .single();

      if (error) throw error;
      qrData = data;
    } else {
      const { data, error } = await supabase
        .from("qr_codes")
        .insert([
          {
            business_id: req.params.businessId,
            qr_url: qrCodeDataUrl,
            review_page_url: reviewPageUrl,
          },
        ])
        .select()
        .single();

      if (error) throw error;
      qrData = data;
    }

    res.json({
      message: "QR code generated successfully",
      qrCode: qrData,
      business: business,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getQrForBusiness = async (req, res) => {
  try {
    const { data: business } = await supabase
      .from("businesses")
      .select("id")
      .eq("id", req.params.businessId)
      .eq("owner_id", req.user.uid)
      .single();

    if (!business) {
      return res.status(403).json({ error: "Access denied to this business" });
    }

    const { data, error } = await supabase
      .from("qr_codes")
      .select("*")
      .eq("business_id", req.params.businessId)
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({ error: "QR code not found" });
    }

    res.json({ qrCode: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
