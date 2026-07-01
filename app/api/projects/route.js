import { NextResponse } from "next/server";
import { getUserFromRequest } from "../../../lib/getUserFromRequest";
import UserModel from "../../../models/User";
import ProjectModel from "../../../models/Project";
import ProjectMemberModel from "../../../models/ProjectMember";

export async function GET(request) {
  try {
    const authUser = getUserFromRequest(request);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const User = await UserModel();
    const Project = await ProjectModel();
    const ProjectMember = await ProjectMemberModel();

    const user = await User.findOne({ email: authUser.email });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const memberships = await ProjectMember.find({ userId: user._id })
      .populate("projectId", "name description")
      .populate("userId", "name email")
      .lean();

    const projects = memberships.map((m) => ({
      id: m.projectId._id,
      name: m.projectId.name,
      description: m.projectId.description,
      role: m.role,
      createdAt: m.projectId.createdAt,
    }));

    return NextResponse.json({ projects });
  } catch (error) {
    console.error("Get projects error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const authUser = getUserFromRequest(request);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name, description } = await request.json();
    if (!name) {
      return NextResponse.json(
        { error: "Project name is required" },
        { status: 400 }
      );
    }

    const User = await UserModel();
    const Project = await ProjectModel();
    const ProjectMember = await ProjectMemberModel();

    let user = await User.findOne({ email: authUser.email });
    if (!user) {
      user = await User.create({
        name: authUser.name || authUser.email.split("@")[0],
        email: authUser.email,
        redisUserId: authUser.id,
      });
    }

    const project = await Project.create({
      name,
      description: description || "",
      ownerId: user._id,
    });

    await ProjectMember.create({
      projectId: project._id,
      userId: user._id,
      role: "owner",
    });

    return NextResponse.json({
      message: "Project created",
      project: {
        id: project._id,
        name: project.name,
        description: project.description,
      },
    });
  } catch (error) {
    console.error("Create project error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
