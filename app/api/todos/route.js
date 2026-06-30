const { NextResponse } = require("next/server");
const connection = require("../../../lib/redis");
const { verifyToken } = require("../../../lib/auth");

function getUserFromRequest(request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.split(" ")[1];
  return verifyToken(token);
}

async function GET(request) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get all todo IDs for this user
    const todoIds = await connection.smembers(`todos:${user.id}`);

    // Get each todo's data
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

    // Sort by newest first
    todos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return NextResponse.json({ todos });
  } catch (error) {
    console.error("Get todos error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function POST(request) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { text } = await request.json();
    if (!text) {
      return NextResponse.json(
        { error: "Todo text is required" },
        { status: 400 }
      );
    }

    // Generate todo ID
    const todoId = await connection.incr(`todos:id_counter:${user.id}`);

    const todo = {
      id: todoId.toString(),
      text,
      done: "false",
      createdAt: new Date().toISOString(),
    };

    // Save todo
    await connection.hset(`todo:${user.id}:${todoId}`, todo);

    // Add todo ID to user's todo set
    await connection.sadd(`todos:${user.id}`, todoId.toString());

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

async function PUT(request) {
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

    // Check if todo exists
    const exists = await connection.exists(`todo:${user.id}:${id}`);
    if (!exists) {
      return NextResponse.json({ error: "Todo not found" }, { status: 404 });
    }

    // Update fields
    const updates = {};
    if (text !== undefined) updates.text = text;
    if (done !== undefined) updates.done = done.toString();

    await connection.hset(`todo:${user.id}:${id}`, updates);

    const updatedTodo = await connection.hgetall(`todo:${user.id}:${id}`);

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

async function DELETE(request) {
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

    // Check if todo exists
    const exists = await connection.exists(`todo:${user.id}:${id}`);
    if (!exists) {
      return NextResponse.json({ error: "Todo not found" }, { status: 404 });
    }

    // Delete todo
    await connection.del(`todo:${user.id}:${id}`);
    await connection.srem(`todos:${user.id}`, id);

    return NextResponse.json({ message: "Todo deleted" });
  } catch (error) {
    console.error("Delete todo error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

module.exports = { GET, POST, PUT, DELETE };
