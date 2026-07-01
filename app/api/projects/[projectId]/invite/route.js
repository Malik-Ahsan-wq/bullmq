import { NextResponse } from "next/server";
import crypto from "crypto";
import { getUserFromRequest } from "../../../../../lib/getUserFromRequest";
import emailQueue from "../../../../../lib/queue";
import UserModel from "../../../../../models/User";
import ProjectModel from "../../../../../models/Project";
import ProjectMemberModel from "../../../../../models/ProjectMember";
import InviteModel from "../../../../../models/Invite";

export async function POST(request, { params }) {
  try {
    const authUser = getUserFromRequest(request);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { projectId } = await params;
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const User = await UserModel();
    const Project = await ProjectModel();
    const ProjectMember = await ProjectMemberModel();
    const Invite = await InviteModel();

    const project = await Project.findById(projectId);
    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    const inviter = await User.findOne({ email: authUser.email });
    if (!inviter) {
      return NextResponse.json(
        { error: "Inviter not found" },
        { status: 404 }
      );
    }

    const isOwner = project.ownerId.toString() === inviter._id.toString();
    if (!isOwner) {
      return NextResponse.json(
        { error: "Only the project owner can send invites" },
        { status: 403 }
      );
    }

    let invitee = await User.findOne({ email: email.toLowerCase() });
    if (!invitee) {
      invitee = await User.create({
        name: email.split("@")[0],
        email: email.toLowerCase(),
        redisUserId: null,
      });
    }

    const existingMember = await ProjectMember.findOne({
      projectId,
      userId: invitee._id,
    });
    if (existingMember) {
      return NextResponse.json(
        { error: "User is already a member of this project" },
        { status: 409 }
      );
    }

    const existingInvite = await Invite.findOne({
      projectId,
      email: email.toLowerCase(),
      status: "pending",
      expiresAt: { $gt: new Date() },
    });
    if (existingInvite) {
      return NextResponse.json(
        { error: "A pending invite already exists for this email" },
        { status: 409 }
      );
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invite = await Invite.create({
      projectId,
      email: email.toLowerCase(),
      token,
      invitedBy: inviter._id,
      status: "pending",
      expiresAt,
    });

    const job = await emailQueue.add(
      "sendInviteEmail",
      {
        inviteId: invite._id.toString(),
        email: email.toLowerCase(),
        projectName: project.name,
        inviterName: inviter.name,
        token,
        projectId: projectId.toString(),
      },
      {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
      }
    );

    return NextResponse.json({
      message: "Invite sent successfully",
      invite: {
        id: invite._id,
        email: invite.email,
        status: invite.status,
        expiresAt: invite.expiresAt,
      },
      jobId: job.id,
    });
  } catch (error) {
    console.error("Send invite error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
