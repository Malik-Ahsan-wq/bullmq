import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import connection from "../../../../lib/redis";
import { generateToken } from "../../../../lib/auth";
import { logAudit } from "../../../../lib/audit";

export async function POST(request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      await logAudit(request, {
        action: "user.login.failed",
        email,
        details: { reason: "missing_fields" },
        statusCode: 400,
      });
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const userId = await connection.get(`user:email:${email}`);
    if (!userId) {
      await logAudit(request, {
        email,
        action: "user.login.failed",
        details: { reason: "invalid_credentials" },
        statusCode: 401,
      });
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    const user = await connection.hgetall(`user:${userId}`);
    if (!user || !user.password) {
      await logAudit(request, {
        email,
        action: "user.login.failed",
        details: { reason: "invalid_credentials" },
        statusCode: 401,
      });
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      await logAudit(request, {
        userId,
        email,
        action: "user.login.failed",
        details: { reason: "wrong_password" },
        statusCode: 401,
      });
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    const token = generateToken({ id: parseInt(userId), email: user.email });

    await logAudit(request, {
      userId,
      email: user.email,
      action: "user.logged_in",
      resourceType: "user",
      resourceId: userId,
      statusCode: 200,
    });

    return NextResponse.json({
      message: "Login successful",
      token,
      user: { id: parseInt(userId), name: user.name, email: user.email },
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
