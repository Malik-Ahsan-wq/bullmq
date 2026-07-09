import { NextResponse } from "next/server";
import { getUserFromRequest } from "../../../lib/getUserFromRequest";
import InviteModel from "../../../models/Invite";
import ProjectMemberModel from "../../../models/ProjectMember";
import AuditLogModel from "../../../models/AuditLog";
import UserModel from "../../../models/User";

export async function GET(request) {
  try {
    const authUser = getUserFromRequest(request);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId") || null;

    const Invite = await InviteModel();
    const ProjectMember = await ProjectMemberModel();
    const AuditLog = await AuditLogModel();
    const User = await UserModel();

    const user = await User.findOne({ email: authUser.email });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const memberships = await ProjectMember.find({ userId: user._id }).lean();
    const projectIds = memberships.map((m) => m.projectId);

    const inviteFilter = projectId ? { projectId } : { projectId: { $in: projectIds } };
    const memberFilter = projectId ? { projectId } : { projectId: { $in: projectIds } };

    const [totalInvites, pendingInvites, acceptedInvites, totalMembers, totalAuditLogs] =
      await Promise.all([
        Invite.countDocuments(inviteFilter),
        Invite.countDocuments({ ...inviteFilter, status: "pending" }),
        Invite.countDocuments({ ...inviteFilter, status: "accepted" }),
        ProjectMember.countDocuments(memberFilter),
        AuditLog.countDocuments({}),
      ]);

    return NextResponse.json({
      totalInvites,
      pendingInvites,
      acceptedInvites,
      totalMembers,
      totalAuditLogs,
    });
  } catch (error) {
    console.error("Stats error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
