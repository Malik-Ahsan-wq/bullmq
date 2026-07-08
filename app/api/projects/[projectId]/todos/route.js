import { NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../../lib/getUserFromRequest";
import UserModel from "../../../../../models/User";
import ProjectModel from "../../../../../models/Project";
import ProjectMemberModel from "../../../../../models/ProjectMember";
import TodoModel from "../../../../../models/Todo";
import ProjectStatsModel from "../../../../../models/ProjectStats";
import deadlineQueue from "../../../../../lib/deadlineQueue";

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
    console.log(`[Stats] saved _id:${result._id} project:${projectId} total:${total} completed:${completed} pending:${total - completed} overdue:${overdue} members:${members.length}`);
    return result;
  } catch (err) {
    console.error(`[Stats] ERROR saving stats for project ${projectId}:`, err);
  }
}

async function verifyProjectAccess(projectId, userEmail) {
  const User = await UserModel();
  const Project = await ProjectModel();
  const ProjectMember = await ProjectMemberModel();

  const project = await Project.findById(projectId);
  if (!project) return { error: "Project not found", status: 404 };

  const user = await User.findOne({ email: userEmail });
  if (!user) return { error: "User not found", status: 404 };

  const membership = await ProjectMember.findOne({
    projectId,
    userId: user._id,
  });
  if (!membership) {
    return { error: "You are not a member of this project", status: 403 };
  }

  return { user, project, membership };
}

function canCreateTask(role) {
  return ["owner", "co-owner"].includes(role);
}

function canEditTask(role, todo, userId) {
  if (role === "owner") return true;
  if (role === "co-owner") return true;
  if (todo.createdBy.toString() === userId.toString()) return true;
  if (todo.assignedTo && todo.assignedTo.toString() === userId.toString()) return true;
  return false;
}

function canDeleteTask(role, todo, userId) {
  if (role === "owner") return true;
  if (role === "co-owner") return true;
  if (todo.createdBy.toString() === userId.toString()) return true;
  return false;
}

function canAssignTask(role) {
  return ["owner", "co-owner"].includes(role);
}

function canReassignTask(role) {
  return ["owner", "co-owner"].includes(role);
}

/**
 * Schedules a delayed BullMQ job to send a deadline reminder email
 * when the deadline arrives. Returns the job ID for storage in the todo.
 */
async function scheduleDeadlineReminder(todo, project, assigneeEmail, creatorEmail) {
  const deadlineTime = new Date(todo.deadline).getTime();
  const delay = Math.max(0, deadlineTime - Date.now());

  const recipientEmail = assigneeEmail || creatorEmail;
  if (!recipientEmail) {
    console.warn(`Cannot schedule deadline reminder: no recipient email for todo ${todo._id}`);
    return null;
  }

  const job = await deadlineQueue.add(
    "sendDeadlineReminder",
    {
      todoId: todo._id.toString(),
      email: recipientEmail,
      taskName: todo.text,
      projectName: project ? project.name : null,
      assigneeName: todo.assignedToName,
      creatorName: project ? project.name : null, // resolved below
      deadline: todo.deadline.toISOString(),
    },
    {
      delay,
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: true,
    }
  );

  console.log(`Scheduled deadline reminder for todo ${todo._id}, job ${job.id}, delay ${delay}ms`);
  return job.id;
}

/**
 * Removes a previously scheduled deadline reminder job from the queue.
 * Silently ignores errors if the job has already been processed or removed.
 */
async function removeDeadlineReminder(jobId) {
  if (!jobId) return;
  try {
    await deadlineQueue.remove(jobId);
    console.log(`Removed deadline reminder job ${jobId}`);
  } catch (err) {
    // Job may have already been processed or removed — this is fine
    console.log(`Could not remove job ${jobId} (may have already been processed): ${err.message}`);
  }
}

export async function GET(request, { params }) {
  try {
    const authUser = getUserFromRequest(request);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { projectId } = await params;
    const access = await verifyProjectAccess(projectId, authUser.email);
    if (access.error) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status }
      );
    }

    const Todo = await TodoModel();
    const role = access.membership.role;

    let todos;
    if (role === "viewer") {
      todos = await Todo.find({ projectId })
        .populate("assignedTo", "name email")
        .populate("assignedBy", "name email")
        .populate("createdBy", "name email")
        .sort({ createdAt: -1 })
        .lean();
    } else {
      todos = await Todo.find({
        projectId,
        $or: [
          { assignedTo: null },
          { assignedTo: access.user._id },
          { createdBy: access.user._id },
          { assignedBy: access.user._id },
        ],
      })
        .populate("assignedTo", "name email")
        .populate("assignedBy", "name email")
        .populate("createdBy", "name email")
        .sort({ createdAt: -1 })
        .lean();
    }

    const formattedTodos = todos.map((t) => ({
      id: t._id,
      text: t.text,
      done: t.done,
      assignedTo: t.assignedTo
        ? { id: t.assignedTo._id, name: t.assignedTo.name, email: t.assignedTo.email }
        : null,
      assignedToName: t.assignedToName,
      assignedBy: t.assignedBy
        ? { id: t.assignedBy._id, name: t.assignedBy.name }
        : null,
      createdBy: t.createdBy
        ? { id: t.createdBy._id, name: t.createdBy.name }
        : null,
      deadline: t.deadline ? new Date(t.deadline).toISOString() : null,
      userRole: role,
      canEdit: canEditTask(role, t, access.user._id),
      canDelete: canDeleteTask(role, t, access.user._id),
      canAssign: canAssignTask(role),
      createdAt: t.createdAt,
    }));

    const saved = await updateProjectStats(projectId);
    const stats = saved
      ? { total: saved.total, completed: saved.completed, pending: saved.pending, overdue: saved.overdue, lastUpdated: saved.lastUpdated }
      : { total: 0, completed: 0, pending: 0, overdue: 0, lastUpdated: null };

    return NextResponse.json({ todos: formattedTodos, userRole: role, stats });
  } catch (error) {
    console.error("Get project todos error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request, { params }) {
  try {
    const authUser = getUserFromRequest(request);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { projectId } = await params;
    const access = await verifyProjectAccess(projectId, authUser.email);
    if (access.error) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status }
      );
    }

    if (!canCreateTask(access.membership.role)) {
      return NextResponse.json(
        { error: "Viewers cannot create tasks" },
        { status: 403 }
      );
    }

    const { text, assignedTo, deadline } = await request.json();
    if (!text) {
      return NextResponse.json(
        { error: "Todo text is required" },
        { status: 400 }
      );
    }

    let parsedDeadline = null;
    if (deadline) {
      const d = new Date(deadline);
      if (isNaN(d.getTime())) {
        return NextResponse.json(
          { error: "Invalid deadline date" },
          { status: 400 }
        );
      }
      parsedDeadline = d;
    }

    const Todo = await TodoModel();
    const User = await UserModel();

    let assignedToUser = null;
    let assignedToName = null;

    if (assignedTo) {
      if (!canAssignTask(access.membership.role)) {
        return NextResponse.json(
          { error: "You don't have permission to assign tasks" },
          { status: 403 }
        );
      }
      assignedToUser = await User.findById(assignedTo);
      if (!assignedToUser) {
        return NextResponse.json(
          { error: "Assigned user not found" },
          { status: 404 }
        );
      }
      assignedToName = assignedToUser.name;
    }

    const todo = await Todo.create({
      projectId,
      text,
      done: false,
      assignedTo: assignedToUser ? assignedToUser._id : null,
      assignedToName,
      assignedBy: assignedToUser ? access.user._id : null,
      createdBy: access.user._id,
      deadline: parsedDeadline,
    });

    // Schedule a deadline reminder job if a deadline was provided
    let deadlineJobId = null;
    if (parsedDeadline) {
      const assigneeEmail = assignedToUser ? assignedToUser.email : null;
      deadlineJobId = await scheduleDeadlineReminder(
        todo,
        access.project,
        assigneeEmail,
        authUser.email
      );
      if (deadlineJobId) {
        await Todo.updateOne({ _id: todo._id }, { deadlineJobId });
      }
    }

    await updateProjectStats(projectId);

    return NextResponse.json({
      message: "Todo created",
      todo: {
        id: todo._id,
        text: todo.text,
        done: todo.done,
        assignedTo: assignedToUser
          ? { id: assignedToUser._id, name: assignedToUser.name, email: assignedToUser.email }
          : null,
        assignedToName: todo.assignedToName,
        assignedBy: assignedToUser
          ? { id: access.user._id, name: access.user.name }
          : null,
        createdBy: { id: access.user._id, name: access.user.name },
        deadline: todo.deadline ? todo.deadline.toISOString() : null,
        userRole: access.membership.role,
        canEdit: true,
        canDelete: true,
        canAssign: canAssignTask(access.membership.role),
        createdAt: todo.createdAt,
      },
    });
  } catch (error) {
    console.error("Create project todo error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(request, { params }) {
  try {
    const authUser = getUserFromRequest(request);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { projectId } = await params;
    const access = await verifyProjectAccess(projectId, authUser.email);
    if (access.error) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status }
      );
    }

    const { id, text, done, assignedTo, deadline } = await request.json();
    if (!id) {
      return NextResponse.json(
        { error: "Todo ID is required" },
        { status: 400 }
      );
    }

    const Todo = await TodoModel();
    const User = await UserModel();

    const todo = await Todo.findOne({ _id: id, projectId });
    if (!todo) {
      return NextResponse.json({ error: "Todo not found" }, { status: 404 });
    }

    if (!canEditTask(access.membership.role, todo, access.user._id)) {
      return NextResponse.json(
        { error: "You don't have permission to edit this todo" },
        { status: 403 }
      );
    }

    if (text !== undefined) todo.text = text;
    if (done !== undefined) todo.done = done;

    // Track whether the deadline changed so we can manage the reminder job
    const oldDeadline = todo.deadline;
    const oldJobId = todo.deadlineJobId;
    let deadlineChanged = false;

    if (deadline !== undefined) {
      if (deadline === null) {
        todo.deadline = null;
        deadlineChanged = oldDeadline !== null;
      } else {
        const d = new Date(deadline);
        if (isNaN(d.getTime())) {
          return NextResponse.json(
            { error: "Invalid deadline date" },
            { status: 400 }
          );
        }
        deadlineChanged = !oldDeadline || d.getTime() !== new Date(oldDeadline).getTime();
        todo.deadline = d;
      }
    }

    if (assignedTo !== undefined) {
      if (!canReassignTask(access.membership.role)) {
        return NextResponse.json(
          { error: "You don't have permission to reassign tasks" },
          { status: 403 }
        );
      }
      if (assignedTo === null) {
        todo.assignedTo = null;
        todo.assignedToName = null;
        todo.assignedBy = null;
      } else {
        const assignee = await User.findById(assignedTo);
        if (!assignee) {
          return NextResponse.json(
            { error: "Assigned user not found" },
            { status: 404 }
          );
        }
        todo.assignedTo = assignee._id;
        todo.assignedToName = assignee.name;
        todo.assignedBy = access.user._id;
      }
    }

    await todo.save();

    // --- Deadline reminder job management ---

    // 1. If task is now completed, remove any existing reminder
    if (done === true && oldJobId) {
      await removeDeadlineReminder(oldJobId);
      todo.deadlineJobId = null;
    }

    // 2. If deadline changed, remove old job and schedule new one if needed
    if (deadlineChanged) {
      if (oldJobId) {
        await removeDeadlineReminder(oldJobId);
        todo.deadlineJobId = null;
      }
      if (todo.deadline) {
        const assigneeEmail = todo.assignedTo
          ? (await User.findById(todo.assignedTo))?.email
          : null;
        const newJobId = await scheduleDeadlineReminder(
          todo,
          access.project,
          assigneeEmail,
          authUser.email
        );
        if (newJobId) {
          todo.deadlineJobId = newJobId;
        }
      }
      // Save the updated deadlineJobId back to the database
      if (todo.deadlineJobId !== oldJobId) {
        await Todo.updateOne({ _id: todo._id }, { deadlineJobId: todo.deadlineJobId });
      }
    }

    await updateProjectStats(projectId);

    return NextResponse.json({
      message: "Todo updated",
      todo: {
        id: todo._id,
        text: todo.text,
        done: todo.done,
        assignedTo: todo.assignedTo
          ? { id: todo.assignedTo, name: todo.assignedToName }
          : null,
        assignedToName: todo.assignedToName,
        assignedBy: todo.assignedBy
          ? { id: todo.assignedBy, name: access.user.name }
          : null,
        createdBy: { id: todo.createdBy, name: access.user.name },
        deadline: todo.deadline ? todo.deadline.toISOString() : null,
        userRole: access.membership.role,
        canEdit: canEditTask(access.membership.role, todo, access.user._id),
        canDelete: canDeleteTask(access.membership.role, todo, access.user._id),
        canAssign: canAssignTask(access.membership.role),
        createdAt: todo.createdAt,
      },
    });
  } catch (error) {
    console.error("Update project todo error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    const authUser = getUserFromRequest(request);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { projectId } = await params;
    const access = await verifyProjectAccess(projectId, authUser.email);
    if (access.error) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { error: "Todo ID is required" },
        { status: 400 }
      );
    }

    const Todo = await TodoModel();

    const todo = await Todo.findOne({ _id: id, projectId });
    if (!todo) {
      return NextResponse.json({ error: "Todo not found" }, { status: 404 });
    }

    if (!canDeleteTask(access.membership.role, todo, access.user._id)) {
      return NextResponse.json(
        { error: "You don't have permission to delete this todo" },
        { status: 403 }
      );
    }

    // Remove any pending deadline reminder job before deleting the todo
    if (todo.deadlineJobId) {
      await removeDeadlineReminder(todo.deadlineJobId);
    }

    await Todo.deleteOne({ _id: id });
    await updateProjectStats(projectId);

    return NextResponse.json({ message: "Todo deleted" });
  } catch (error) {
    console.error("Delete project todo error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
