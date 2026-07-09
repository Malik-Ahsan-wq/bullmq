import mongoose from "mongoose";
import connectDB from "../lib/mongodb";

const AuditLogSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      default: null,
    },
    email: {
      type: String,
      default: null,
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    resourceType: {
      type: String,
      default: null,
    },
    resourceId: {
      type: String,
      default: null,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    ip: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },
    statusCode: {
      type: Number,
      default: null,
    },
  },
  { timestamps: true }
);

AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ userId: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });
AuditLogSchema.index({ resourceType: 1, resourceId: 1 });

async function AuditLogModel() {
  await connectDB();
  return mongoose.models.AuditLog || mongoose.model("AuditLog", AuditLogSchema);
}

export default AuditLogModel;
