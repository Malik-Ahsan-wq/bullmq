import { NextResponse } from "next/server";
import connection from "../../../lib/redis";
import { verifyToken } from "../../../lib/auth";
import { logAudit } from "../../../lib/audit";

function getUserFromRequest(request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.split(" ")[1];
  return verifyToken(token);
}

export async function GET(request) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const todoIds = await connection.smembers(`todos:${user.id}`);

    const todos = [];
    for (const id of todoIds) {
      const todo = await connection.hgetall(`todo:${user.id}:${id}`);
      if (todo && todo.id) {
        todos.push({
          id: parseInt(todo.id),
          text: todo.text,
          done: todo.done === "true",
          createdAt: todo.createdAt,
        });
      }
    }

    todos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    await logAudit(request, {
      userId: user.id,
      email: user.email,
      action: "legacy_todo.listed",
      resourceType: "todo",
      details: { count: todos.length },
      statusCode: 200,
    });

    return NextResponse.json({ todos });
  } catch (error) {
    console.error("Get todos error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { text } = await request.json();
    if (!text) {
      await logAudit(request, {
        userId: user.id,
        email: user.email,
        action: "legacy_todo.create.failed",
        details: { reason: "missing_text" },
        statusCode: 400,
      });
      return NextResponse.json(
        { error: "Todo text is required" },
        { status: 400 }
      );
    }

    const todoId = await connection.incr(`todos:id_counter:${user.id}`);

    const todo = {
      id: todoId.toString(),
      text,
      done: "false",
      createdAt: new Date().toISOString(),
    };

    await connection.hset(`todo:${user.id}:${todoId}`, todo);

    await connection.sadd(`todos:${user.id}`, todoId.toString());

    await logAudit(request, {
      userId: user.id,
      email: user.email,
      action: "legacy_todo.created",
      resourceType: "todo",
      resourceId: todoId,
      details: { text },
      statusCode: 200,
    });

    return NextResponse.json({
      message: "Todo created",
      todo: { ...todo, id: todoId, done: false },
    });
  } catch (error) {
    console.error("Create todo error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, text, done } = await request.json();
    if (!id) {
      return NextResponse.json(
        { error: "Todo ID is required" },
        { status: 400 }
      );
    }

    const exists = await connection.exists(`todo:${user.id}:${id}`);
    if (!exists) {
      return NextResponse.json({ error: "Todo not found" }, { status: 404 });
    }

    const updates = {};
    if (text !== undefined) updates.text = text;
    if (done !== undefined) updates.done = done.toString();

    await connection.hset(`todo:${user.id}:${id}`, updates);

    const updatedTodo = await connection.hgetall(`todo:${user.id}:${id}`);

    await logAudit(request, {
      userId: user.id,
      email: user.email,
      action: "legacy_todo.updated",
      resourceType: "todo",
      resourceId: id,
      details: { text: updatedTodo.text, done: updatedTodo.done },
      statusCode: 200,
    });

    return NextResponse.json({
      message: "Todo updated",
      todo: {
        id: parseInt(updatedTodo.id),
        text: updatedTodo.text,
        done: updatedTodo.done === "true",
        createdAt: updatedTodo.createdAt,
      },
    });
  } catch (error) {
    console.error("Update todo error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { error: "Todo ID is required" },
        { status: 400 }
      );
    }

    const exists = await connection.exists(`todo:${user.id}:${id}`);
    if (!exists) {
      return NextResponse.json({ error: "Todo not found" }, { status: 404 });
    }

    const todo = await connection.hgetall(`todo:${user.id}:${id}`);

    await connection.del(`todo:${user.id}:${id}`);
    await connection.srem(`todos:${user.id}`, id);

    await logAudit(request, {
      userId: user.id,
      email: user.email,
      action: "legacy_todo.deleted",
      resourceType: "todo",
      resourceId: id,
      details: { text: todo?.text },
      statusCode: 200,
    });

    return NextResponse.json({ message: "Todo deleted" });
  } catch (error) {
    console.error("Delete todo error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
