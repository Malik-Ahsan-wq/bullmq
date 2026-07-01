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
  const [newDeadline, setNewDeadline] = useState("");
  const [todoStatus, setTodoStatus] = useState("");
  const [userRole, setUserRole] = useState("");

  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDesc, setNewProjectDesc] = useState("");
  const [projectStatus, setProjectStatus] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [inviteStatus, setInviteStatus] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [emailStatus, setEmailStatus] = useState("");
  const [editingDeadlineId, setEditingDeadlineId] = useState(null);
  const [editingDeadlineValue, setEditingDeadlineValue] = useState("");

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
        setUserRole(data.userRole);
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
          deadline: newDeadline || null,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setTodos([data.todo, ...todos]);
        setNewTodo("");
        setAssignTo("");
        setNewDeadline("");
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

  const updateDeadline = async (todoId, deadlineValue) => {
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
          deadline: deadlineValue || null,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setTodos(todos.map((t) => (t.id === todoId ? { ...t, deadline: data.todo.deadline } : t)));
        setEditingDeadlineId(null);
        setEditingDeadlineValue("");
      }
    } catch (err) {
      console.error("Failed to update deadline:", err);
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
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });

      const data = await res.json();
      if (res.ok) {
        setInviteStatus(`Invite sent to ${inviteEmail} as ${inviteRole}!`);
        setInviteEmail("");
        setInviteRole("viewer");
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

  const getRoleBadgeClass = (role) => {
    switch (role) {
      case "owner": return "role-badge owner";
      case "co-owner": return "role-badge co-owner";
      case "viewer": return "role-badge viewer";
      default: return "role-badge";
    }
  };

  const getRoleLabel = (role) => {
    switch (role) {
      case "owner": return "Owner";
      case "co-owner": return "Co-owner";
      case "viewer": return "Viewer";
      default: return role;
    }
  };

  const getDeadlineInfo = (deadline, done) => {
    if (!deadline) return null;
    const now = new Date();
    const dl = new Date(deadline);
    if (done) {
      return { className: "done", label: formatDeadline(dl) };
    }
    if (now > dl) {
      return { className: "overdue", label: "Overdue" };
    }
    const diffMs = dl.getTime() - now.getTime();
    const diffH = Math.floor(diffMs / (1000 * 60 * 60));
    const diffM = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    if (diffH < 24) {
      return { className: "approaching", label: `In ${diffH}h ${diffM}m` };
    }
    return { className: "on-track", label: formatDeadline(dl) };
  };

  const formatDeadline = (date) => {
    const d = new Date(date);
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const year = d.getFullYear();
    const hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    const h12 = hours % 12 || 12;
    return `${month}/${day}/${year} ${h12}:${minutes} ${ampm}`;
  };

  const toDatetimeLocal = (isoString) => {
    if (!isoString) return "";
    const d = new Date(isoString);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  if (loading) {
    return (
      <div className="container">
        <div className="todo-app">
          <div className="loading">Loading your workspace...</div>
        </div>
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
            {userRole && (
              <span className={getRoleBadgeClass(userRole)}>
                {getRoleLabel(userRole)}
              </span>
            )}
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
            {userRole !== "viewer" && (
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
                        {m.name} ({getRoleLabel(m.role)})
                      </option>
                    ))}
                  </select>
                  <input
                    type="datetime-local"
                    value={newDeadline}
                    onChange={(e) => setNewDeadline(e.target.value)}
                    className="deadline-input"
                    title="Set deadline (optional)"
                  />
                  <button type="submit">Add</button>
                </form>
                {todoStatus && (
                  <div className={todoStatus.includes("!") ? "success-msg" : "error"}>
                    {todoStatus}
                  </div>
                )}
              </div>
            )}

            {userRole === "viewer" && (
              <div className="viewer-notice">
                You are a Viewer. You can only view tasks.
              </div>
            )}

            {todos.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">&#128203;</div>
                <p className="empty-state-text">
                  No tasks yet.
                  {userRole !== "viewer" && " Create your first task above!"}
                </p>
              </div>
            ) : (
              <ul className="todo-list">
                {todos.map((todo) => (
                  <li
                    key={todo.id}
                    className={`todo-item ${todo.done ? "done" : ""}`}
                  >
                    {todo.canEdit ? (
                      <input
                        type="checkbox"
                        checked={todo.done}
                        onChange={() => toggleTodo(todo.id, todo.done)}
                      />
                    ) : (
                      <input
                        type="checkbox"
                        checked={todo.done}
                        disabled
                      />
                    )}
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
                        {todo.deadline && (() => {
                          const info = getDeadlineInfo(todo.deadline, todo.done);
                          return info ? (
                            <span className={`deadline-badge ${info.className}`}>
                              {info.label}
                            </span>
                          ) : null;
                        })()}
                        {todo.canEdit && (
                          <button
                            className="deadline-edit-btn"
                            onClick={() => {
                              if (editingDeadlineId === todo.id) {
                                setEditingDeadlineId(null);
                                setEditingDeadlineValue("");
                              } else {
                                setEditingDeadlineId(todo.id);
                                setEditingDeadlineValue(toDatetimeLocal(todo.deadline));
                              }
                            }}
                            title="Edit deadline"
                          >
                            {editingDeadlineId === todo.id ? "Cancel" : "Deadline"}
                          </button>
                        )}
                        {todo.createdBy && (
                          <span className="created-by">
                            Created by: {todo.createdBy.name}
                          </span>
                        )}
                      </div>
                      {editingDeadlineId === todo.id && (
                        <div className="deadline-inline-edit">
                          <input
                            type="datetime-local"
                            value={editingDeadlineValue}
                            onChange={(e) => setEditingDeadlineValue(e.target.value)}
                            className="deadline-input-inline"
                          />
                          <button
                            className="btn-save-deadline"
                            onClick={() => updateDeadline(todo.id, editingDeadlineValue)}
                          >
                            Save
                          </button>
                          {todo.deadline && (
                            <button
                              className="btn-clear-deadline"
                              onClick={() => updateDeadline(todo.id, "")}
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    {todo.canAssign && (
                      <select
                        className="reassign-select"
                        value={todo.assignedTo?.id || ""}
                        onChange={(e) => reassignTodo(todo.id, e.target.value)}
                      >
                        <option value="">Unassigned</option>
                        {members.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} ({getRoleLabel(m.role)})
                          </option>
                        ))}
                      </select>
                    )}
                    <div className="todo-actions">
                      {todo.canDelete && (
                        <button
                          className="btn btn-danger"
                          onClick={() => deleteTodo(todo.id)}
                        >
                          Delete
                        </button>
                      )}
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
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                  >
                    <option value="viewer">Viewer (can only view)</option>
                    <option value="co-owner">Co-owner (can manage tasks)</option>
                  </select>
                  <button type="submit" className="btn-send-invite">
                    Send Invite
                  </button>
                </form>
              )}
            </div>
          </div>

          <div className="members-section">
            <h3>Project Members</h3>
            {members.length === 0 ? (
              <p className="no-projects">No members yet.</p>
            ) : (
              <div className="members-list">
                {members.map((m) => (
                  <div key={m.id} className="member-item">
                    <span className="member-name">{m.name}</span>
                    <span className="member-email">{m.email}</span>
                    <span className={getRoleBadgeClass(m.role)}>
                      {getRoleLabel(m.role)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
