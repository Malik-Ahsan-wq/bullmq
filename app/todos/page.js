"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function TodosPage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [members, setMembers] = useState([]);
  const [todos, setTodos] = useState([]);
  const [newTodo, setNewTodo] = useState("");
  const [assignTo, setAssignTo] = useState("");
  const [todoStatus, setTodoStatus] = useState("");

  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDesc, setNewProjectDesc] = useState("");
  const [projectStatus, setProjectStatus] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteStatus, setInviteStatus] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [emailStatus, setEmailStatus] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    const userData = localStorage.getItem("user");

    if (!token || !userData) {
      router.push("/");
      return;
    }

    setUser(JSON.parse(userData));
    fetchProjects(token);
  }, [router]);

  useEffect(() => {
    if (selectedProject) {
      const token = localStorage.getItem("token");
      fetchMembers(token, selectedProject);
      fetchTodos(token, selectedProject);
    }
  }, [selectedProject]);

  const fetchProjects = async (token) => {
    try {
      const res = await fetch("/api/projects", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setProjects(data.projects);
        if (data.projects.length > 0) {
          setSelectedProject(data.projects[0].id);
        } else {
          setLoading(false);
        }
      }
    } catch (err) {
      console.error("Failed to fetch projects:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMembers = async (token, projectId) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/members`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setMembers(data.members);
      }
    } catch (err) {
      console.error("Failed to fetch members:", err);
    }
  };

  const fetchTodos = async (token, projectId) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/todos`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setTodos(data.todos);
      }
    } catch (err) {
      console.error("Failed to fetch todos:", err);
    }
  };

  const addTodo = async (e) => {
    e.preventDefault();
    if (!newTodo.trim() || !selectedProject) return;

    setTodoStatus("Adding...");
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`/api/projects/${selectedProject}/todos`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          text: newTodo,
          assignedTo: assignTo || null,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setTodos([data.todo, ...todos]);
        setNewTodo("");
        setAssignTo("");
        setTodoStatus("Task added!");
        setTimeout(() => setTodoStatus(""), 2000);
      } else {
        setTodoStatus(data.error || "Failed to add task");
      }
    } catch (err) {
      setTodoStatus("Network error");
    }
  };

  const toggleTodo = async (id, done) => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`/api/projects/${selectedProject}/todos`, {
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
      const res = await fetch(
        `/api/projects/${selectedProject}/todos?id=${id}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (res.ok) {
        setTodos(todos.filter((t) => t.id !== id));
      }
    } catch (err) {
      console.error("Failed to delete todo:", err);
    }
  };

  const reassignTodo = async (todoId, newAssigneeId) => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`/api/projects/${selectedProject}/todos`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: todoId,
          assignedTo: newAssigneeId || null,
        }),
      });

      if (res.ok) {
        fetchTodos(token, selectedProject);
      }
    } catch (err) {
      console.error("Failed to reassign todo:", err);
    }
  };

  const createProject = async (e) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    setProjectStatus("Creating...");
    const token = localStorage.getItem("token");
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newProjectName,
          description: newProjectDesc,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setProjectStatus(`Project "${data.project.name}" created!`);
        setNewProjectName("");
        setNewProjectDesc("");
        fetchProjects(token);
      } else {
        setProjectStatus(data.error || "Failed to create project");
      }
    } catch (err) {
      setProjectStatus("Network error");
    }
  };

  const sendInvite = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !selectedProject) return;

    setInviteStatus("Sending invite...");
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`/api/projects/${selectedProject}/invite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email: inviteEmail }),
      });

      const data = await res.json();
      if (res.ok) {
        setInviteStatus(`Invite sent to ${inviteEmail}!`);
        setInviteEmail("");
        setTimeout(() => setInviteStatus(""), 3000);
      } else {
        setInviteStatus(data.error || "Failed to send invite");
      }
    } catch (err) {
      setInviteStatus("Network error");
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
          <h1>Task Manager</h1>
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

        <div className="project-selector">
          <label>Select Project:</label>
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
          >
            {projects.length === 0 ? (
              <option value="">No projects available</option>
            ) : (
              projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))
            )}
          </select>
        </div>

        {selectedProject && (
          <>
            <div className="add-todo-section">
              <form className="add-todo" onSubmit={addTodo}>
                <input
                  type="text"
                  value={newTodo}
                  onChange={(e) => setNewTodo(e.target.value)}
                  placeholder="Add a new task..."
                />
                <select value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.email})
                    </option>
                  ))}
                </select>
                <button type="submit">Add</button>
              </form>
              {todoStatus && (
                <div className={todoStatus.includes("!") ? "success-msg" : "error"}>
                  {todoStatus}
                </div>
              )}
            </div>

            {todos.length === 0 ? (
              <p style={{ textAlign: "center", color: "#999", padding: "20px" }}>
                No tasks yet. Add one above!
              </p>
            ) : (
              <ul className="todo-list">
                {todos.map((todo) => (
                  <li
                    key={todo.id}
                    className={`todo-item ${todo.done ? "done" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={todo.done}
                      onChange={() => toggleTodo(todo.id, todo.done)}
                    />
                    <div className="todo-content">
                      <span className="todo-text">{todo.text}</span>
                      <div className="todo-meta">
                        {todo.assignedTo ? (
                          <span className="assigned-badge">
                            Assigned to: {todo.assignedTo.name}
                          </span>
                        ) : (
                          <span className="unassigned-badge">Unassigned</span>
                        )}
                        {todo.createdBy && (
                          <span className="created-by">
                            Created by: {todo.createdBy.name}
                          </span>
                        )}
                      </div>
                    </div>
                    {todo.isOwner && (
                      <select
                        className="reassign-select"
                        value={todo.assignedTo?.id || ""}
                        onChange={(e) => reassignTodo(todo.id, e.target.value)}
                      >
                        <option value="">Unassigned</option>
                        {members.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    )}
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
          </>
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

        <div className="invite-section">
          <h2>Projects & Invites</h2>

          <div className="invite-panels">
            <div className="invite-panel">
              <h3>Create Project</h3>
              {projectStatus && (
                <div className={projectStatus.includes("created") ? "success-msg" : "error"}>
                  {projectStatus}
                </div>
              )}
              <form className="invite-form" onSubmit={createProject}>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Project name"
                  required
                />
                <input
                  type="text"
                  value={newProjectDesc}
                  onChange={(e) => setNewProjectDesc(e.target.value)}
                  placeholder="Description (optional)"
                />
                <button type="submit" className="btn-create-project">
                  Create Project
                </button>
              </form>
            </div>

            <div className="invite-panel">
              <h3>Invite to Project</h3>
              {inviteStatus && (
                <div className={inviteStatus.includes("sent") ? "success-msg" : "error"}>
                  {inviteStatus}
                </div>
              )}
              {projects.length === 0 ? (
                <p className="no-projects">No projects yet. Create one first.</p>
              ) : (
                <form className="invite-form" onSubmit={sendInvite}>
                  <select
                    value={selectedProject}
                    onChange={(e) => setSelectedProject(e.target.value)}
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="Email to invite"
                    required
                  />
                  <button type="submit" className="btn-send-invite">
                    Send Invite
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
