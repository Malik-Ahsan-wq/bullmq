import { NextResponse } from "next/server";
import InviteModel from "../../../../models/Invite";
import ProjectModel from "../../../../models/Project";
import UserModel from "../../../../models/User";
import ProjectMemberModel from "../../../../models/ProjectMember";

export async function GET(request, { params }) {
  try {
    const { token } = await params;

    const Invite = await InviteModel();
    const Project = await ProjectModel();
    const User = await UserModel();
    const ProjectMember = await ProjectMemberModel();

    const invite = await Invite.findOne({ token }).lean();
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

    const project = await Project.findById(invite.projectId).lean();
    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    const inviter = await User.findById(invite.invitedBy)
      .select("name email")
      .lean();

    const alreadyMember = await ProjectMember.findOne({
      projectId: invite.projectId,
      email: invite.email,
    }).lean();

    return NextResponse.json({
      invite: {
        id: invite._id,
        email: invite.email,
        status: invite.status,
        expiresAt: invite.expiresAt,
      },
      project: {
        id: project._id,
        name: project.name,
        description: project.description,
      },
      inviter: inviter
        ? { name: inviter.name, email: inviter.email }
        : null,
      alreadyMember: !!alreadyMember,
    });
  } catch (error) {
    console.error("Validate invite error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
