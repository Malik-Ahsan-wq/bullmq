import { NextResponse } from "next/server";
import InviteModel from "../../../../models/Invite";
import ProjectModel from "../../../../models/Project";
import UserModel from "../../../../models/User";
import ProjectMemberModel from "../../../../models/ProjectMember";
import TodoModel from "../../../../models/Todo";
import ProjectStatsModel from "../../../../models/ProjectStats";

async function updateProjectStats(projectId) {
  try {
    const Todo = await TodoModel();
    const ProjectStats = await ProjectStatsModel();
    const ProjectMember = await ProjectMemberModel();
    const User = await UserModel();
    const now = new Date();
    const [total, completed, overdue, memberships] = await Promise.all([
      Todo.countDocuments({ projectId }),
      Todo.countDocuments({ projectId, done: true }),
      Todo.countDocuments({ projectId, done: false, deadline: { $lt: now } }),
      ProjectMember.find({ projectId }).lean(),
    ]);
    const userIds = memberships.map((m) => m.userId);
    const users = await User.find({ _id: { $in: userIds } }, "name email").lean();
    const userMap = Object.fromEntries(users.map((u) => [u._id.toString(), u]));
    const members = memberships.map((m) => ({
      userId: m.userId,
      name: userMap[m.userId.toString()]?.name || "",
      email: userMap[m.userId.toString()]?.email || "",
      role: m.role,
    }));
    const result = await ProjectStats.findOneAndUpdate(
      { projectId },
      { $set: { total, completed, pending: total - completed, overdue, lastUpdated: now, members } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log(`[Stats] saved _id:${result._id} project:${projectId} members:${members.length}`);
  } catch (err) {
    console.error(`[Stats] ERROR saving stats for project ${projectId}:`, err);
  }
}

export async function POST(request) {
  try {
    const { token } = await request.json();

    if (!token) {
      return NextResponse.json(
        { error: "Token is required" },
        { status: 400 }
      );
    }

    const Invite = await InviteModel();
    const Project = await ProjectModel();
    const User = await UserModel();
    const ProjectMember = await ProjectMemberModel();

    const invite = await Invite.findOne({ token });
    if (!invite) {
      return NextResponse.json(
        { error: "Invalid invite token" },
        { status: 404 }
      );
    }

    if (invite.status === "accepted") {
      return NextResponse.json(
        { error: "This invite has already been accepted" },
        { status: 410 }
      );
    }

    if (new Date(invite.expiresAt) < new Date()) {
      await Invite.updateOne({ _id: invite._id }, { status: "expired" });
      return NextResponse.json(
        { error: "This invite has expired" },
        { status: 410 }
      );
    }

    const project = await Project.findById(invite.projectId);
    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    let user = await User.findOne({ email: invite.email });
    if (!user) {
      user = await User.create({
        name: invite.email.split("@")[0],
        email: invite.email,
        redisUserId: null,
      });
    }

    const existingMember = await ProjectMember.findOne({
      projectId: invite.projectId,
      userId: user._id,
    });
    if (existingMember) {
      await Invite.updateOne({ _id: invite._id }, { status: "accepted" });
      return NextResponse.json({
        message: "Invite accepted successfully",
        project: {
          id: project._id,
          name: project.name,
        },
      });
    }

    await ProjectMember.create({
      projectId: invite.projectId,
      userId: user._id,
      role: invite.role || "viewer",
    });

    await Invite.updateOne({ _id: invite._id }, { status: "accepted" });
    await updateProjectStats(invite.projectId);

    return NextResponse.json({
      message: "Invite accepted successfully",
      project: {
        id: project._id,
        name: project.name,
      },
    });
  } catch (error) {
    console.error("Accept invite error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
