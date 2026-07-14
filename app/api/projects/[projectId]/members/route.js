import { NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../../lib/getUserFromRequest";
import UserModel from "../../../../../models/User";
import ProjectModel from "../../../../../models/Project";
import ProjectMemberModel from "../../../../../models/ProjectMember";
import { logAudit } from "../../../../../lib/audit";

export async function GET(request, { params }) {
  try {
    const authUser = getUserFromRequest(request);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { projectId } = await params;

    const User = await UserModel();
    const Project = await ProjectModel();
    const ProjectMember = await ProjectMemberModel();

    const project = await Project.findById(projectId);
    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    const currentUser = await User.findOne({ email: authUser.email });
    if (!currentUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const membership = await ProjectMember.findOne({
      projectId,
      userId: currentUser._id,
    });
    if (!membership) {
      return NextResponse.json(
        { error: "You are not a member of this project" },
        { status: 403 }
      );
    }

    const members = await ProjectMember.find({ projectId })
      .populate("userId", "name email avatar lastSeen")
      .lean();

    const formattedMembers = members
      .filter((m) => m.userId)
      .map((m) => ({
        id: m.userId._id,
        name: m.userId.name,
        email: m.userId.email,
        role: m.role,
        avatar: m.userId.avatar || null,
        lastSeen: m.userId.lastSeen || null,
      }));

    await logAudit(request, {
      userId: authUser.id,
      email: authUser.email,
      action: "member.listed",
      resourceType: "project",
      resourceId: projectId,
      details: { count: formattedMembers.length },
      statusCode: 200,
    });

    return NextResponse.json({ members: formattedMembers });
  } catch (error) {
    console.error("Get members error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
