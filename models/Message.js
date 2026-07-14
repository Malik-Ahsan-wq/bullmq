import mongoose from "mongoose";
import connectDB from "../lib/mongodb";

const MessageSchema = new mongoose.Schema(
  {
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: "Todo", required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    senderName: { type: String, required: true },
    senderAvatar: { type: String, default: null },
    content: { type: String, default: "" },
    type: { type: String, enum: ["text", "image", "file", "emoji"], default: "text" },
    fileUrl: { type: String, default: null },
    fileName: { type: String, default: null },
    deliveredTo: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    seenBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

MessageSchema.index({ taskId: 1, createdAt: -1 });

async function MessageModel() {
  await connectDB();
  return mongoose.models.Message || mongoose.model("Message", MessageSchema);
}

export default MessageModel;
