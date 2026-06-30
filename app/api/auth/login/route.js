import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import connection from "../../../../lib/redis";
import { generateToken } from "../../../../lib/auth";

export async function POST(request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const userId = await connection.get(`user:email:${email}`);
    if (!userId) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    const user = await connection.hgetall(`user:${userId}`);
    if (!user || !user.password) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    const token = generateToken({ id: parseInt(userId), email: user.email });

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
