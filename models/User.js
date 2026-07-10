import mongoose from "mongoose";
import connectDB from "../lib/mongodb";

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    redisUserId: {
      type: Number,
      default: null,
    },
    fcmToken: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

UserSchema.index({ email: 1 }, { unique: true });

async function UserModel() {
  await connectDB();
  return mongoose.models.User || mongoose.model("User", UserSchema);
}

export default UserModel;
