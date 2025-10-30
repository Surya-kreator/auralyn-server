import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import axios from "axios";

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ===== MongoDB Connection =====
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// ===== User Schema =====
const userSchema = new mongoose.Schema({
  userId: String, // Your Flutter app user ID
  accessToken: String,
  phoneNumberId: String,
  wabaId: String,
  connectedAt: Date,
});

const User = mongoose.model("User", userSchema);

// ===== Root Route =====
app.get("/", (req, res) => {
  res.send("🚀 Auralyn WhatsApp API Server Running");
});

// ===== Webhook Verification =====
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token === process.env.VERIFY_TOKEN) {
    console.log("✅ Webhook verified!");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ===== Webhook for Receiving Messages =====
app.post("/webhook", (req, res) => {
  console.log("📩 Incoming WhatsApp message:", JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

// ===== Connect WhatsApp for a User =====
app.post("/connect-whatsapp", async (req, res) => {
  try {
    const { userId } = req.body;

    // Normally OAuth flow here; using permanent token
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.PHONE_NUMBER_ID;
    const wabaId = process.env.WABA_ID;

    // Save or update user in MongoDB
    const user = await User.findOneAndUpdate(
      { userId },
      { accessToken, phoneNumberId, wabaId, connectedAt: new Date() },
      { upsert: true, new: true }
    );

    res.json({ success: true, message: "WhatsApp connected", user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Failed to connect WhatsApp" });
  }
});

// ===== Send WhatsApp Message =====
app.post("/send", async (req, res) => {
  try {
    const { userId, to, message } = req.body;

    const user = await User.findOne({ userId });
    if (!user) return res.status(404).json({ error: "User not found" });

    const response = await axios.post(
      `https://graph.facebook.com/v20.0/${user.phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: message },
      },
      {
        headers: {
          Authorization: `Bearer ${user.accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.json({ success: true, data: response.data });
  } catch (err) {
    console.error("❌ Send error:", err.response?.data || err);
    res.status(500).json({ error: "Failed to send message" });
  }
});

// ===== Start Server =====
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
