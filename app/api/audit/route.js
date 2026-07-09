import { NextResponse } from "next/server";
import { getUserFromRequest } from "../../../lib/getUserFromRequest";
import AuditLogModel from "../../../models/AuditLog";

export async function GET(request) {
  try {
    const authUser = getUserFromRequest(request);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50")));
    const action = searchParams.get("action") || null;
    const resourceType = searchParams.get("resourceType") || null;
    const userId = searchParams.get("userId") || null;
    const email = searchParams.get("email") || null;
    const startDate = searchParams.get("startDate") || null;
    const endDate = searchParams.get("endDate") || null;

    const AuditLog = await AuditLogModel();

    const filter = {};

    if (action) {
      filter.action = { $regex: action, $options: "i" };
    }
    if (resourceType) {
      filter.resourceType = resourceType;
    }
    if (userId) {
      filter.userId = String(userId);
    }
    if (email) {
      filter.email = { $regex: email, $options: "i" };
    }
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        filter.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.createdAt.$lte = new Date(endDate);
      }
    }

    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    return NextResponse.json({
      logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get audit logs error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
