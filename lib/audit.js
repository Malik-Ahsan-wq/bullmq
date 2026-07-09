import AuditLogModel from "../models/AuditLog";

function getClientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }
  return null;
}

export async function logAudit(request, {
  userId = null,
  email = null,
  action,
  resourceType = null,
  resourceId = null,
  details = null,
  statusCode = null,
} = {}) {
  try {
    const AuditLog = await AuditLogModel();
    await AuditLog.create({
      userId: userId ? String(userId) : null,
      email,
      action,
      resourceType,
      resourceId: resourceId ? String(resourceId) : null,
      details,
      ip: getClientIp(request),
      userAgent: request.headers.get("user-agent") || null,
      statusCode,
    });
  } catch (error) {
    console.error("[Audit] Failed to write audit log:", error);
  }
}
