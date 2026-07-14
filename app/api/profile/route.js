import { NextResponse } from "next/server";
import { getUserFromRequest } from "../../../lib/getUserFromRequest";
import UserModel from "../../../models/User";

export async function GET(request) {
  try {
    const authUser = getUserFromRequest(request);
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const User = await UserModel();
    const user = await User.findOne({ email: authUser.email }, "name email avatar lastSeen").lean();
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    return NextResponse.json({ user });
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const authUser = getUserFromRequest(request);
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { avatar } = await request.json();
    if (!avatar) return NextResponse.json({ error: "Avatar is required" }, { status: 400 });
    // Limit to ~500KB base64
    if (avatar.length > 700000) return NextResponse.json({ error: "Image too large (max ~500KB)" }, { status: 400 });
    const User = await UserModel();
    const user = await User.findOneAndUpdate(
      { email: authUser.email },
      { avatar },
      { new: true, select: "name email avatar lastSeen" }
    ).lean();
    return NextResponse.json({ user });
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
