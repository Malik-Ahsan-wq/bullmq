"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function TodosPage() {
  const [todos, setTodos] = useState([]);
  const [newTodo, setNewTodo] = useState("");
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [emailStatus, setEmailStatus] = useState("");
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("token");
    const userData = localStorage.getItem("user");

    if (!token || !userData) {
      router.push("/");
      return;
    }

    setUser(JSON.parse(userData));
    fetchTodos(token);
  }, [router]);

  const fetchTodos = async (token) => {
    try {
      const res = await fetch("/api/todos", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setTodos(data.todos);
      }
    } catch (err) {
      console.error("Failed to fetch todos:", err);
    } finally {
      setLoading(false);
    }
  };

  const addTodo = async (e) => {
    e.preventDefault();
    if (!newTodo.trim()) return;

    const token = localStorage.getItem("token");
    try {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text: newTodo }),
      });

      const data = await res.json();
      if (res.ok) {
        setTodos([data.todo, ...todos]);
        setNewTodo("");
      }
    } catch (err) {
      console.error("Failed to add todo:", err);
    }
  };

  const toggleTodo = async (id, done) => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch("/api/todos", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id, done: !done }),
      });

      if (res.ok) {
        setTodos(
          todos.map((t) => (t.id === id ? { ...t, done: !done } : t))
        );
      }
    } catch (err) {
      console.error("Failed to toggle todo:", err);
    }
  };

  const deleteTodo = async (id) => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`/api/todos?id=${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        setTodos(todos.filter((t) => t.id !== id));
      }
    } catch (err) {
      console.error("Failed to delete todo:", err);
    }
  };

  const sendEmail = async (e) => {
    e.preventDefault();
    setEmailStatus("Sending...");

    const token = localStorage.getItem("token");
    try {
      const res = await fetch("/api/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ subject: emailSubject, message: emailMessage }),
      });

      const data = await res.json();
      if (res.ok) {
        setEmailStatus(`Email queued! Job ID: ${data.jobId}`);
        setEmailSubject("");
        setEmailMessage("");
      } else {
        setEmailStatus(data.error || "Failed to send email");
      }
    } catch (err) {
      setEmailStatus("Network error");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/");
  };

  if (loading) {
    return (
      <div className="container">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="todo-app">
        <div className="todo-header">
          <h1>My Todos</h1>
          <div className="user-info">
            <span>{user?.name || user?.email}</span>
            <button
              onClick={handleLogout}
              className="btn btn-secondary"
              style={{ marginLeft: "10px", width: "auto", padding: "6px 12px" }}
            >
              Logout
            </button>
          </div>
        </div>

        <form className="add-todo" onSubmit={addTodo}>
          <input
            type="text"
            value={newTodo}
            onChange={(e) => setNewTodo(e.target.value)}
            placeholder="Add a new todo..."
          />
          <button type="submit">Add</button>
        </form>

        {todos.length === 0 ? (
          <p style={{ textAlign: "center", color: "#999", padding: "20px" }}>
            No todos yet. Add one above!
          </p>
        ) : (
          <ul className="todo-list">
            {todos.map((todo) => (
              <li key={todo.id} className={`todo-item ${todo.done ? "done" : ""}`}>
                <input
                  type="checkbox"
                  checked={todo.done}
                  onChange={() => toggleTodo(todo.id, todo.done)}
                />
                <span className="todo-text">{todo.text}</span>
                <div className="todo-actions">
                  <button
                    className="btn btn-danger"
                    onClick={() => deleteTodo(todo.id)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="email-section">
          <h2>Send Email Notification</h2>
          {emailStatus && (
            <div className={emailStatus.includes("queued") ? "success-msg" : "error"}>
              {emailStatus}
            </div>
          )}
          <form className="email-form" onSubmit={sendEmail}>
            <input
              type="text"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              placeholder="Email subject"
              required
            />
            <textarea
              value={emailMessage}
              onChange={(e) => setEmailMessage(e.target.value)}
              placeholder="Email message"
              required
            />
            <button type="submit">Send Email</button>
          </form>
        </div>
      </div>
    </div>
  );
}
