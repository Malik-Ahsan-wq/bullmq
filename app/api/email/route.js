import { NextResponse } from "next/server";
import emailQueue from "../../../lib/queue";
import { verifyToken } from "../../../lib/auth";
import { logAudit } from "../../../lib/audit";

function getUserFromRequest(request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.split(" ")[1];
  return verifyToken(token);
}

export async function POST(request) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { subject, message } = await request.json();
    if (!subject || !message) {
      await logAudit(request, {
        userId: user.id,
        email: user.email,
        action: "email.send.failed",
        details: { reason: "missing_fields" },
        statusCode: 400,
      });
      return NextResponse.json(
        { error: "Subject and message are required" },
        { status: 400 }
      );
    }

    const job = await emailQueue.add(
      "sendEmail",
      {
        email: user.email,
        subject,
        message,
        userId: user.id,
      },
      {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1000,
        },
      }
    );

    await logAudit(request, {
      userId: user.id,
      email: user.email,
      action: "email.queued",
      resourceType: "email",
      details: { subject, jobId: job.id },
      statusCode: 200,
    });

    return NextResponse.json({
      message: "Email job added to queue",
      jobId: job.id,
    });
  } catch (error) {
    console.error("Send email error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
