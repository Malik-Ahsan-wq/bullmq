import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import connection from "../../../../lib/redis";
import { generateToken } from "../../../../lib/auth";

export async function POST(request) {
  try {
    const { name, email, password } = await request.json();

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "All fields are required" },
        { status: 400 }
      );
    }

    const existingUser = await connection.get(`user:email:${email}`);
    if (existingUser) {
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

    const token = generateToken({ id: userId, email });

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
