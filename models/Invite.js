import mongoose from "mongoose";
import connectDB from "../lib/mongodb";

const InviteSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "expired"],
      default: "pending",
    },
    role: {
      type: String,
      enum: ["co-owner", "viewer"],
      default: "viewer",
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

InviteSchema.index({ token: 1 }, { unique: true });
InviteSchema.index({ projectId: 1, email: 1 });
InviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

async function InviteModel() {
  await connectDB();
  return mongoose.models.Invite || mongoose.model("Invite", InviteSchema);
}

export default InviteModel;
