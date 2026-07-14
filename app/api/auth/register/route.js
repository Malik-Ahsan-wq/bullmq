import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import connection from "../../../../lib/redis";
import { generateToken } from "../../../../lib/auth";
import { logAudit } from "../../../../lib/audit";
import UserModel from "../../../../models/User";

export async function POST(request) {
  try {
    const { name, email, password } = await request.json();

    if (!name || !email || !password) {
      await logAudit(request, {
        action: "user.register.failed",
        details: { reason: "missing_fields", email },
        statusCode: 400,
      });
      return NextResponse.json(
        { error: "All fields are required" },
        { status: 400 }
      );
    }

    const existingUser = await connection.get(`user:email:${email}`);
    if (existingUser) {
      await logAudit(request, {
        action: "user.register.failed",
        email,
        details: { reason: "already_exists" },
        statusCode: 409,
      });
      return NextResponse.json(
        { error: "User already exists" },
        { status: 409 }
      );
    }

    const userId = await connection.incr("user:id_counter");

    const hashedPassword = await bcrypt.hash(password, 10);

    await connection.hset(`user:${userId}`, {
      id: userId.toString(),
      name,
      email,
      password: hashedPassword,
    });

    await connection.set(`user:email:${email}`, userId.toString());

    // Sync user to MongoDB so they can use projects and chat
    try {
      const User = await UserModel();
      await User.findOneAndUpdate(
        { email },
        { name, email, redisUserId: userId },
        { upsert: true, new: true }
      );
    } catch (mongoErr) {
      console.error("MongoDB user sync error:", mongoErr);
    }

    const token = generateToken({ id: userId, email });

    await logAudit(request, {
      userId,
      email,
      action: "user.registered",
      resourceType: "user",
      resourceId: userId,
      details: { name },
      statusCode: 200,
    });

    return NextResponse.json({
      message: "User registered successfully",
      token,
      user: { id: userId, name, email },
    });
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
