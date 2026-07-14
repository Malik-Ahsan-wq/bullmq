import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { getUserFromRequest } from "../../../../lib/getUserFromRequest";
import MessageModel from "../../../../models/Message";
import ProjectMemberModel from "../../../../models/ProjectMember";
import TodoModel from "../../../../models/Todo";
import UserModel from "../../../../models/User";

export async function GET(request, { params }) {
  try {
    const authUser = getUserFromRequest(request);
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { taskId } = await params;

    if (!taskId || !mongoose.Types.ObjectId.isValid(taskId)) {
      return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = 30;

    // Resolve MongoDB user from Redis-based integer id
    const User = await UserModel();
    const dbUser = await User.findOne({ redisUserId: authUser.id }).lean();
    if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const Todo = await TodoModel();
    const task = await Todo.findById(taskId).lean();
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    const ProjectMember = await ProjectMemberModel();
    const member = await ProjectMember.findOne({
      projectId: task.projectId,
      userId: dbUser._id,
    }).lean();
    if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const Message = await MessageModel();
    const total = await Message.countDocuments({ taskId });
    const messages = await Message.find({ taskId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return NextResponse.json({
      messages: messages.reverse(),
      pagination: { page, pages: Math.max(1, Math.ceil(total / limit)), total },
    });
  } catch (err) {
    console.error("Chat GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
