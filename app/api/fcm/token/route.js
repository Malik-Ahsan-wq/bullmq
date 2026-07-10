import { NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../lib/getUserFromRequest";
import UserModel from "../../../../models/User";

export async function POST(request) {
  try {
    const authUser = getUserFromRequest(request);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { fcmToken } = await request.json();
    if (!fcmToken) {
      return NextResponse.json({ error: "fcmToken is required" }, { status: 400 });
    }

    const User = await UserModel();
    await User.findOneAndUpdate(
      { email: authUser.email },
      { fcmToken },
      { new: true }
    );

    return NextResponse.json({ message: "FCM token saved" });
  } catch (error) {
    console.error("FCM token save error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
