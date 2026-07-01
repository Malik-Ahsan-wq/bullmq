import { NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../../lib/getUserFromRequest";
import UserModel from "../../../../../models/User";
import ProjectModel from "../../../../../models/Project";
import ProjectMemberModel from "../../../../../models/ProjectMember";
import TodoModel from "../../../../../models/Todo";

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
      deadline: t.deadline ? t.deadline.toISOString() : null,
      userRole: role,
      canEdit: canEditTask(role, t, access.user._id),
      canDelete: canDeleteTask(role, t, access.user._id),
      canAssign: canAssignTask(role),
      createdAt: t.createdAt,
    }));

    return NextResponse.json({ todos: formattedTodos, userRole: role });
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

    if (deadline !== undefined) {
      if (deadline === null) {
        todo.deadline = null;
      } else {
        const d = new Date(deadline);
        if (isNaN(d.getTime())) {
          return NextResponse.json(
            { error: "Invalid deadline date" },
            { status: 400 }
          );
        }
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

    await Todo.deleteOne({ _id: id });

    return NextResponse.json({ message: "Todo deleted" });
  } catch (error) {
    console.error("Delete project todo error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
