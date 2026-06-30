const { NextResponse } = require("next/server");
const bcrypt = require("bcryptjs");
const connection = require("../../../../lib/redis");
const { generateToken } = require("../../../../lib/auth");

async function POST(request) {
  try {
    const { name, email, password } = await request.json();

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "All fields are required" },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await connection.get(`user:email:${email}`);
    if (existingUser) {
      return NextResponse.json(
        { error: "User already exists" },
        { status: 409 }
      );
    }

    // Generate user ID
    const userId = await connection.incr("user:id_counter");

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Store user in Redis
    await connection.hset(`user:${userId}`, {
      id: userId.toString(),
      name,
      email,
      password: hashedPassword,
    });

    // Store email -> ID mapping for login lookup
    await connection.set(`user:email:${email}`, userId.toString());

    // Generate token
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

module.exports = { POST };
