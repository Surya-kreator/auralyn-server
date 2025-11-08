// test-mongo.js
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const messageSchema = new mongoose.Schema({
  phoneNumberId: String,
  from: String,
  text: String,
  timestamp: String,
});
const Message = mongoose.model("Message", messageSchema);

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("✅ MongoDB connected");

    // Test insert
    const msg = await Message.create({
      phoneNumberId: "880470321807593",
      from: "919876543210",
      text: "Hello test",
      timestamp: Date.now().toString(),
    });
    console.log("Saved message:", msg);

    // Test fetch
    const messages = await Message.find({ phoneNumberId: "880470321807593" });
    console.log("Fetched messages:", messages);
    process.exit();
  })
  .catch(err => console.error(err));
