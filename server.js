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

// ===== Schemas =====
const messageSchema = new mongoose.Schema({
  phoneNumberId: String,
  from: String,
  text: String,
  timestamp: String,
});
const Message = mongoose.model("Message", messageSchema);

const userSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  accessToken: String,
  phoneNumberId: String,
  wabaId: String,
  connectedAt: Date,
});
const User = mongoose.model("User", userSchema);

// ===== MongoDB Connection =====
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// ===== Routes =====

// Root
app.get("/", (req, res) => res.send("🚀 Auralyn WhatsApp API Server Running"));

// Webhook verification
app.get("/webhook", (req, res) => {
  const { "hub.mode": mode, "hub.verify_token": token, "hub.challenge": challenge } = req.query;
  if (mode && token === process.env.VERIFY_TOKEN) {
    console.log("✅ Webhook verified!");
    res.status(200).send(challenge);
  } else res.sendStatus(403);
});

// Webhook to receive messages
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;
    if (body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
      const message = body.entry[0].changes[0].value.messages[0];
      const metadata = body.entry[0].changes[0].value.metadata;

      await Message.create({
        phoneNumberId: metadata.phone_number_id,
        from: message.from,
        text: message.text?.body || "",
        timestamp: message.timestamp,
      });
      console.log("✅ Message saved to DB");
    }
    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Webhook error:", err);
    res.sendStatus(500);
  }
});

// Fetch messages by phoneNumberId
app.get("/messages/:phoneNumberId", async (req, res) => {
  try {
    const messages = await Message.find({ phoneNumberId: req.params.phoneNumberId }).sort({ timestamp: -1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// OAuth login
app.get("/auth/login", (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).send("Missing userId");

  const redirectUri = encodeURIComponent(process.env.META_REDIRECT_URI);
  const authUrl = `https://www.facebook.com/v20.0/dialog/oauth?client_id=${process.env.META_APP_ID}&redirect_uri=${redirectUri}&state=${userId}&scope=whatsapp_business_management,whatsapp_business_messaging,business_management`;
  console.log("🔗 Redirecting user to Meta OAuth:", authUrl);
  res.redirect(authUrl);
});

// OAuth callback
app.get("/auth/callback", async (req, res) => {
  const { code, state } = req.query; // state = userId
  if (!code || !state) return res.status(400).send("Missing code or state");

  try {
    const tokenResponse = await axios.get(
      `https://graph.facebook.com/v20.0/oauth/access_token?client_id=${process.env.META_APP_ID}&client_secret=${process.env.META_APP_SECRET}&redirect_uri=${process.env.META_REDIRECT_URI}&code=${code}`
    );
    const accessToken = tokenResponse.data.access_token;

    const businessResponse = await axios.get(
      `https://graph.facebook.com/v20.0/me?fields=id,name,accounts&access_token=${accessToken}`
    );
    const wabaId = businessResponse.data.id;
    const phoneNumberId = process.env.PHONE_NUMBER_ID || "YOUR_PHONE_NUMBER_ID";

    await User.findOneAndUpdate(
      { userId: state },
      { accessToken, wabaId, phoneNumberId, connectedAt: new Date() },
      { upsert: true, new: true }
    );

    console.log(`✅ User ${state} connected successfully`);
    res.send("<h2>✅ WhatsApp connected successfully!</h2><p>You can close this tab.</p>");
  } catch (err) {
    console.error("❌ OAuth callback error:", err.response?.data || err.message);
    res.status(500).send("OAuth callback failed.");
  }
});

// Check user status
app.get("/user-status/:userId", async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.params.userId });
    res.json({ connected: !!user?.accessToken });
  } catch (err) {
    res.status(500).json({ connected: false });
  }
});

// Send WhatsApp message
app.post("/send", async (req, res) => {
  try {
    const { userId, to, message } = req.body;
    const user = await User.findOne({ userId });
    if (!user) return res.status(404).json({ error: "User not found" });

    const response = await axios.post(
      `https://graph.facebook.com/v20.0/${user.phoneNumberId}/messages`,
      { messaging_product: "whatsapp", to, type: "text", text: { body: message } },
      { headers: { Authorization: `Bearer ${user.accessToken}`, "Content-Type": "application/json" } }
    );

    res.json({ success: true, data: response.data });
  } catch (err) {
    console.error("❌ Send error:", err.response?.data || err);
    res.status(500).json({ error: "Failed to send message" });
  }
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
