"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

const ChatPanel = dynamic(() => import("../components/ChatPanel"), { ssr: false });

function ChatToast({ toasts, onClose }) {
  if (!toasts.length) return null;
  return (
    <div className="chat-toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`chat-toast${t.exiting ? " chat-toast-exit" : ""}`}>
          <div className="chat-toast-avatar">{t.senderName?.[0]?.toUpperCase() || "?"}</div>
          <div className="chat-toast-body">
            <div className="chat-toast-sender">{t.senderName}</div>
            <div className="chat-toast-task">{t.taskName}</div>
            <div className="chat-toast-preview">{t.preview}</div>
          </div>
          <button className="chat-toast-close" onClick={() => onClose(t.id)}>✕</button>
        </div>
      ))}
    </div>
  );
}

function ConfirmModal({ open, icon, title, message, confirmLabel, confirmClass, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
        {icon && <div className="confirm-icon">{icon}</div>}
        <h3 className="confirm-title">{title}</h3>
        {message && <p className="confirm-message">{message}</p>}
        <div className="confirm-actions">
          <button className="confirm-btn-cancel" onClick={onCancel}>Cancel</button>
          <button className={`confirm-btn-ok ${confirmClass || ""}`} onClick={onConfirm}>{confirmLabel || "Confirm"}</button>
        </div>
      </div>
    </div>
  );
}

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
  const [inviteRateLimitError, setInviteRateLimitError] = useState("");
  const [editingDeadlineId, setEditingDeadlineId] = useState(null);
  const [editingDeadlineValue, setEditingDeadlineValue] = useState("");
  const [deadlineRateLimitError, setDeadlineRateLimitError] = useState("");
  const [stats, setStats] = useState({ total: 0, completed: 0, pending: 0, overdue: 0 });
  const [globalStats, setGlobalStats] = useState({ totalInvites: 0, pendingInvites: 0, acceptedInvites: 0, totalMembers: 0, totalAuditLogs: 0 });

  const [activeTab, setActiveTab] = useState("tasks");
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditPagination, setAuditPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [auditFilter, setAuditFilter] = useState({ action: "", resourceType: "", email: "" });
  const [unreadAuditCount, setUnreadAuditCount] = useState(0);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [taskUnreadMap, setTaskUnreadMap] = useState({});
  const [toasts, setToasts] = useState([]);
  const [confirm, setConfirm] = useState({ open: false, icon: "", title: "", message: "", confirmLabel: "", confirmClass: "", onConfirm: null });
  const [chatTask, setChatTask] = useState(null);
  const activeTabRef = useRef(activeTab);
  const chatTaskRef  = useRef(chatTask);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => { chatTaskRef.current  = chatTask;  }, [chatTask]);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.map((t) => t.id === id ? { ...t, exiting: true } : t));
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 350);
  }, []);

  const handleNotification = useCallback((notif) => {
    // Don't toast if user is already viewing that task's chat
    if (activeTabRef.current === "chat" && chatTaskRef.current?.id === notif.taskId) return;
    const id = `${notif.messageId}-${Date.now()}`;
    setToasts((prev) => [...prev.slice(-3), { ...notif, id }]);
    setTimeout(() => dismissToast(id), 5000);
    // Increment per-task unread
    setTaskUnreadMap((prev) => ({ ...prev, [notif.taskId]: (prev[notif.taskId] || 0) + 1 }));
    setUnreadChatCount((n) => n + 1);
  }, [dismissToast]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const userData = localStorage.getItem("user");
    if (!token || !userData) { router.push("/"); return; }
    setUser(JSON.parse(userData));
    fetchProjects(token);
  }, [router]);

  useEffect(() => {
    if (selectedProject) {
      const token = localStorage.getItem("token");
      fetchMembers(token, selectedProject);
      fetchTodos(token, selectedProject);
      fetchGlobalStats(token, selectedProject);
    }
  }, [selectedProject]);

  const fetchGlobalStats = async (token, projectId) => {
    try {
      const res = await fetch(`/api/stats${projectId ? `?projectId=${projectId}` : ""}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setGlobalStats(data);
        const seen = parseInt(localStorage.getItem("seenAuditCount") || "0");
        setUnreadAuditCount(Math.max(0, data.totalAuditLogs - seen));
      }
    } catch (err) { console.error(err); }
  };

  const fetchProjects = async (token) => {
    try {
      const res = await fetch("/api/projects", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (res.ok) {
        setProjects(data.projects);
        if (data.projects.length > 0) setSelectedProject(data.projects[0].id);
        else setLoading(false);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const fetchMembers = async (token, projectId) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/members`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (res.ok) setMembers(data.members);
    } catch (err) { console.error(err); }
  };

  const fetchTodos = async (token, projectId) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/todos`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (res.ok) { setTodos(data.todos); setUserRole(data.userRole); if (data.stats) setStats(data.stats); }
    } catch (err) { console.error(err); }
  };

  const fetchAuditLogs = async (page = 1) => {
    setAuditLoading(true);
    const token = localStorage.getItem("token");
    const params = new URLSearchParams({ page, limit: 10 });
    if (auditFilter.action) params.set("action", auditFilter.action);
    if (auditFilter.resourceType) params.set("resourceType", auditFilter.resourceType);
    if (auditFilter.email) params.set("email", auditFilter.email);
    try {
      const res = await fetch(`/api/audit?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (res.ok) { setAuditLogs(data.logs); setAuditPagination(data.pagination); }
    } catch (err) { console.error(err); }
    finally { setAuditLoading(false); }
  };

  const addTodo = async (e) => {
    e.preventDefault();
    if (!newTodo.trim() || !selectedProject) return;
    setTodoStatus("Adding...");
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`/api/projects/${selectedProject}/todos`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: newTodo, assignedTo: assignTo || null, deadline: newDeadline || null }),
      });
      const data = await res.json();
      if (res.ok) {
        setTodos([data.todo, ...todos]); setNewTodo(""); setAssignTo(""); setNewDeadline("");
        setTodoStatus("Task added!"); setTimeout(() => setTodoStatus(""), 2000);
      } else if (res.status === 429) { setDeadlineRateLimitError(data.error || "Rate limit reached."); setNewDeadline(""); }
      else setTodoStatus(data.error || "Failed to add task");
    } catch { setTodoStatus("Network error"); }
  };

  const toggleTodo = async (id, done) => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`/api/projects/${selectedProject}/todos`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id, done: !done }),
      });
      if (res.ok) setTodos(todos.map((t) => (t.id === id ? { ...t, done: !done } : t)));
    } catch (err) { console.error(err); }
  };

  const deleteTodo = (id) => {
    const todo = todos.find((t) => t.id === id);
    setConfirm({
      open: true,
      icon: "🗑️",
      title: "Delete task?",
      message: todo ? `"${todo.text}" will be permanently deleted.` : "This task will be permanently deleted.",
      confirmLabel: "Delete",
      confirmClass: "danger",
      onConfirm: async () => {
        closeConfirm();
        const token = localStorage.getItem("token");
        try {
          const res = await fetch(`/api/projects/${selectedProject}/todos?id=${id}`, {
            method: "DELETE", headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) setTodos(todos.filter((t) => t.id !== id));
        } catch (err) { console.error(err); }
      },
    });
  };

  const reassignTodo = async (todoId, newAssigneeId) => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`/api/projects/${selectedProject}/todos`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: todoId, assignedTo: newAssigneeId || null }),
      });
      if (res.ok) fetchTodos(token, selectedProject);
    } catch (err) { console.error(err); }
  };

  const updateDeadline = async (todoId, deadlineValue) => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`/api/projects/${selectedProject}/todos`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: todoId, deadline: deadlineValue || null }),
      });
      if (res.ok) {
        const data = await res.json();
        setTodos(todos.map((t) => (t.id === todoId ? { ...t, deadline: data.todo.deadline } : t)));
        setEditingDeadlineId(null); setEditingDeadlineValue("");
      } else {
        const data = await res.json();
        if (res.status === 429) { setDeadlineRateLimitError(data.error || "Rate limit reached."); setEditingDeadlineId(null); setEditingDeadlineValue(""); }
      }
    } catch (err) { console.error(err); }
  };

  const createProject = async (e) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    setProjectStatus("Creating...");
    const token = localStorage.getItem("token");
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newProjectName, description: newProjectDesc }),
      });
      const data = await res.json();
      if (res.ok) { setProjectStatus(`Project "${data.project.name}" created!`); setNewProjectName(""); setNewProjectDesc(""); fetchProjects(token); }
      else setProjectStatus(data.error || "Failed to create project");
    } catch { setProjectStatus("Network error"); }
  };

  const sendInvite = (e) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !selectedProject) return;
    const projectName = projects.find((p) => p.id === selectedProject)?.name || "this project";
    setConfirm({
      open: true,
      icon: "✉️",
      title: "Send invite?",
      message: `Send a ${inviteRole === "co-owner" ? "Co-owner" : "Viewer"} invite to ${inviteEmail} for "${projectName}"?`,
      confirmLabel: "Send Invite",
      confirmClass: "success",
      onConfirm: async () => {
        closeConfirm();
        setInviteStatus("Sending invite...");
        const token = localStorage.getItem("token");
        try {
          const res = await fetch(`/api/projects/${selectedProject}/invite`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
          });
          const data = await res.json();
          if (res.ok) { setInviteStatus(`Invite sent to ${inviteEmail} as ${inviteRole}!`); setInviteEmail(""); setInviteRole("viewer"); setTimeout(() => setInviteStatus(""), 3000); }
          else if (res.status === 429) { setInviteRateLimitError(data.error || "Rate limit reached."); setInviteEmail(""); }
          else setInviteStatus(data.error || "Failed to send invite");
        } catch { setInviteStatus("Network error"); }
      },
    });
  };

  const closeConfirm = () => setConfirm((c) => ({ ...c, open: false }));

  const handleLogout = () => {
    setConfirm({
      open: true,
      icon: "🚪",
      title: "Log out?",
      message: "You will be signed out of your account.",
      confirmLabel: "Log out",
      confirmClass: "danger",
      onConfirm: () => { localStorage.removeItem("token"); localStorage.removeItem("user"); router.push("/"); },
    });
  };

  const getRoleBadgeClass = (role) => {
    if (role === "owner") return "role-badge owner";
    if (role === "co-owner") return "role-badge co-owner";
    if (role === "viewer") return "role-badge viewer";
    return "role-badge";
  };

  const getRoleLabel = (role) => {
    if (role === "owner") return "Owner";
    if (role === "co-owner") return "Co-owner";
    if (role === "viewer") return "Viewer";
    return role;
  };

  const getDeadlineInfo = (deadline, done) => {
    if (!deadline) return null;
    const now = new Date(), dl = new Date(deadline);
    if (done) return { className: "done", label: formatDeadline(dl) };
    if (now > dl) return { className: "overdue", label: "Overdue" };
    const diffMs = dl.getTime() - now.getTime();
    const diffH = Math.floor(diffMs / (1000 * 60 * 60));
    const diffM = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    if (diffH < 24) return { className: "approaching", label: `In ${diffH}h ${diffM}m` };
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
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  if (loading) return (
    <div className="container"><div className="todo-app"><div className="loading">Loading your workspace...</div></div></div>
  );

  return (
    <div className="container">
      <div className="todo-app">
        <div className="todo-header">
          <h1>Task Manager</h1>
          <div className="user-info">
            <span>{user?.name || user?.email}</span>
            {userRole && <span className={getRoleBadgeClass(userRole)}>{getRoleLabel(userRole)}</span>}
            <button onClick={handleLogout} className="btn btn-secondary" style={{ marginLeft: "10px", width: "auto", padding: "6px 12px" }}>Logout</button>
          </div>
        </div>

        {selectedProject && userRole !== "viewer" && (
          <div className="dashboard-stats">
            <div className="stat-card total">
              <div className="stat-icon">📋</div>
              <div className="stat-info"><span className="stat-value">{stats.total}</span><span className="stat-label">Total Tasks</span></div>
            </div>
            <div className="stat-card completed">
              <div className="stat-icon">✅</div>
              <div className="stat-info"><span className="stat-value">{stats.completed}</span><span className="stat-label">Completed</span></div>
              {stats.total > 0 && <div className="stat-progress"><div className="stat-progress-bar" style={{ width: `${Math.round((stats.completed / stats.total) * 100)}%` }} /></div>}
            </div>
            <div className="stat-card pending">
              <div className="stat-icon">⏳</div>
              <div className="stat-info"><span className="stat-value">{stats.pending}</span><span className="stat-label">Pending</span></div>
            </div>
            <div className="stat-card overdue">
              <div className="stat-icon">🔥</div>
              <div className="stat-info"><span className="stat-value">{stats.overdue}</span><span className="stat-label">Overdue</span></div>
            </div>
          </div>
        )}

        {selectedProject && userRole !== "viewer" && (
          <div className="dashboard-stats global-stats">
            <div className="stat-card stat-members">
              <div className="stat-icon">👥</div>
              <div className="stat-info"><span className="stat-value">{globalStats.totalMembers}</span><span className="stat-label">Total Members</span></div>
            </div>
            <div className="stat-card stat-invites">
              <div className="stat-icon">✉️</div>
              <div className="stat-info"><span className="stat-value">{globalStats.totalInvites}</span><span className="stat-label">Total Invites</span></div>
            </div>
            <div className="stat-card stat-invites-pending">
              <div className="stat-icon">⏰</div>
              <div className="stat-info"><span className="stat-value">{globalStats.pendingInvites}</span><span className="stat-label">Pending Invites</span></div>
            </div>
            <div className="stat-card stat-audit">
              <div className="stat-icon">🔍</div>
              <div className="stat-info"><span className="stat-value">{globalStats.totalAuditLogs}</span><span className="stat-label">Audit Logs</span></div>
            </div>
          </div>
        )}

        <div className="tabs">
          <button className={`tab${activeTab === "tasks" ? " active" : ""}`} onClick={() => setActiveTab("tasks")}>Tasks</button>
          {userRole !== "viewer" && (
            <button className={`tab${activeTab === "projects" ? " active" : ""}`} onClick={() => setActiveTab("projects")}>Projects & Invites</button>
          )}
          {userRole !== "viewer" && (
            <button className={`tab${activeTab === "audit" ? " active" : ""}`} onClick={() => { setActiveTab("audit"); fetchAuditLogs(1); localStorage.setItem("seenAuditCount", globalStats.totalAuditLogs.toString()); setUnreadAuditCount(0); }}>
              Audit Logs
              {unreadAuditCount > 0 && <span className="notif-badge">{unreadAuditCount > 99 ? "99+" : unreadAuditCount}</span>}
            </button>
          )}
          <button className={`tab${activeTab === "chat" ? " active" : ""}`} onClick={() => { setActiveTab("chat"); setUnreadChatCount(0); }}>
            💬 Chat
            {unreadChatCount > 0 && <span className="notif-badge">{unreadChatCount > 99 ? "99+" : unreadChatCount}</span>}
          </button>
          <ChatToast toasts={toasts} onClose={dismissToast} />
        </div>

        {activeTab === "tasks" && (
          <>
            <div className="project-selector">
              <label>Select Project:</label>
              <select value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)}>
                {projects.length === 0 ? <option value="">No projects available</option> : projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            {selectedProject && (
              <>
                {userRole !== "viewer" && (
                  <div className="add-todo-section">
                    <form className="add-todo" onSubmit={addTodo}>
                      <input type="text" value={newTodo} onChange={(e) => setNewTodo(e.target.value)} placeholder="Add a new task..." />
                      <select value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
                        <option value="">Unassigned</option>
                        {members.map((m) => <option key={m.id} value={m.id}>{m.name} ({getRoleLabel(m.role)})</option>)}
                      </select>
                      <input type="datetime-local" value={newDeadline} onChange={(e) => setNewDeadline(e.target.value)} className="deadline-input" title="Set deadline (optional)" />
                      <button type="submit">Add</button>
                    </form>
                    {todoStatus && <div className={todoStatus.includes("!") ? "success-msg" : "error"}>{todoStatus}</div>}
                  </div>
                )}

                {userRole === "viewer" && (
                  <div className="viewer-notice">You are a Viewer — showing only your assigned tasks.</div>
                )}

                {todos.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-icon">&#128203;</div>
                    <p className="empty-state-text">No tasks yet.{userRole !== "viewer" && " Create your first task above!"}</p>
                  </div>
                ) : (
                  <ul className="todo-list">
                    {todos.map((todo) => (
                      <li key={todo.id} className={`todo-item ${todo.done ? "done" : ""}`}>
                        {todo.canEdit
                          ? <input type="checkbox" checked={todo.done} onChange={() => toggleTodo(todo.id, todo.done)} />
                          : <input type="checkbox" checked={todo.done} disabled />}
                        <div className="todo-content">
                          <span className="todo-text">{todo.text}</span>
                          <div className="todo-meta">
                            {todo.assignedTo ? <span className="assigned-badge">Assigned to: {todo.assignedTo.name}</span> : <span className="unassigned-badge">Unassigned</span>}
                            {todo.deadline && (() => { const info = getDeadlineInfo(todo.deadline, todo.done); return info ? <span className={`deadline-badge ${info.className}`}>{info.label}</span> : null; })()}
                            {todo.canEdit && (
                              <button className="deadline-edit-btn" onClick={() => { if (editingDeadlineId === todo.id) { setEditingDeadlineId(null); setEditingDeadlineValue(""); } else { setEditingDeadlineId(todo.id); setEditingDeadlineValue(toDatetimeLocal(todo.deadline)); } }} title="Edit deadline">
                                {editingDeadlineId === todo.id ? "Cancel" : "Deadline"}
                              </button>
                            )}
                            {todo.createdBy && <span className="created-by">Created by: {todo.createdBy.name}</span>}
                          </div>
                          {editingDeadlineId === todo.id && (
                            <div className="deadline-inline-edit">
                              <input type="datetime-local" value={editingDeadlineValue} onChange={(e) => setEditingDeadlineValue(e.target.value)} className="deadline-input-inline" />
                              <button className="btn-save-deadline" onClick={() => updateDeadline(todo.id, editingDeadlineValue)}>Save</button>
                              {todo.deadline && <button className="btn-clear-deadline" onClick={() => updateDeadline(todo.id, "")}>Clear</button>}
                            </div>
                          )}
                        </div>
                        {todo.canAssign && (
                          <select className="reassign-select" value={todo.assignedTo?.id || ""} onChange={(e) => reassignTodo(todo.id, e.target.value)}>
                            <option value="">Unassigned</option>
                            {members.map((m) => <option key={m.id} value={m.id}>{m.name} ({getRoleLabel(m.role)})</option>)}
                          </select>
                        )}
                        <div className="todo-actions">
                          {todo.canDelete && <button className="btn btn-danger" onClick={() => deleteTodo(todo.id)}>Delete</button>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </>
        )}

        {activeTab === "projects" && userRole !== "viewer" && (
          <div className="invite-section">
            <h2>Projects & Invites</h2>
            <div className="invite-panels">
              <div className="invite-panel">
                <h3>Create Project</h3>
                {projectStatus && <div className={projectStatus.includes("created") ? "success-msg" : "error"}>{projectStatus}</div>}
                <form className="invite-form" onSubmit={createProject}>
                  <input type="text" value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} placeholder="Project name" required />
                  <input type="text" value={newProjectDesc} onChange={(e) => setNewProjectDesc(e.target.value)} placeholder="Description (optional)" />
                  <button type="submit" className="btn-create-project">Create Project</button>
                </form>
              </div>
              <div className="invite-panel">
                <h3>Invite to Project</h3>
                {inviteStatus && <div className={inviteStatus.includes("sent") ? "success-msg" : "error"}>{inviteStatus}</div>}
                {projects.length === 0 ? <p className="no-projects">No projects yet. Create one first.</p> : (
                  <form className="invite-form" onSubmit={sendInvite}>
                    <select value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)}>
                      {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="Email to invite" required />
                    <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                      <option value="viewer">Viewer (can only view)</option>
                      <option value="co-owner">Co-owner (can manage tasks)</option>
                    </select>
                    <button type="submit" className="btn-send-invite">Send Invite</button>
                  </form>
                )}
              </div>
            </div>
            <div className="members-section">
              <h3>Project Members</h3>
              {members.length === 0 ? <p className="no-projects">No members yet.</p> : (
                <div className="members-list">
                  {members.map((m) => (
                    <div key={m.id} className="member-item">
                      <span className="member-name">{m.name}</span>
                      <span className="member-email">{m.email}</span>
                      <span className={getRoleBadgeClass(m.role)}>{getRoleLabel(m.role)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "chat" && (
          <div className="chat-tab-layout">
            <div className="chat-task-list">
              <div className="chat-task-list-header">Conversations</div>
              {todos.length === 0 ? (
                <div className="chat-task-empty">No tasks in this project.</div>
              ) : (
                todos.map((t) => {
                  const tUnread = taskUnreadMap[t.id] || 0;
                  return (
                    <button
                      key={t.id}
                      className={`chat-task-item${chatTask?.id === t.id ? " active" : ""}`}
                      onClick={() => {
                        setChatTask(t);
                        setTaskUnreadMap((prev) => { const n = { ...prev }; delete n[t.id]; return n; });
                        setUnreadChatCount((c) => Math.max(0, c - (taskUnreadMap[t.id] || 0)));
                      }}
                    >
                      <span className={`chat-task-dot${t.done ? " done" : ""}`} />
                      <span className="chat-task-item-text">{t.text}</span>
                      {tUnread > 0 && <span className="chat-task-unread">{tUnread > 99 ? "99+" : tUnread}</span>}
                    </button>
                  );
                })
              )}
            </div>
            <div className="chat-panel-wrap">
              <ChatPanel
                task={chatTask}
                user={user}
                isActive={activeTab === "chat"}
                onUnreadChange={(n) => { if (activeTab !== "chat") setUnreadChatCount(n); }}
                onNotification={handleNotification}
              />
            </div>
          </div>
        )}

        {activeTab === "audit" && userRole !== "viewer" && (
          <div className="audit-section">
            <div className="audit-filters">
              <input type="text" placeholder="Filter by action..." value={auditFilter.action} onChange={(e) => setAuditFilter((f) => ({ ...f, action: e.target.value }))} />
              <select value={auditFilter.resourceType} onChange={(e) => setAuditFilter((f) => ({ ...f, resourceType: e.target.value }))}>
                <option value="">All types</option>
                <option value="todo">Todo</option>
                <option value="project">Project</option>
                <option value="user">User</option>
                <option value="invite">Invite</option>
              </select>
              <input type="text" placeholder="Filter by email..." value={auditFilter.email} onChange={(e) => setAuditFilter((f) => ({ ...f, email: e.target.value }))} />
              <button className="btn-audit-search" onClick={() => fetchAuditLogs(1)}>Search</button>
            </div>
            {auditLoading ? (
              <div className="loading">Loading audit logs...</div>
            ) : auditLogs.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🔍</div>
                <p className="empty-state-text">No audit logs found.</p>
              </div>
            ) : (
              <>
                <div className="audit-table-wrap">
                  <table className="audit-table">
                    <thead>
                      <tr><th>Time</th><th>Action</th><th>Type</th><th>User</th><th>Details</th></tr>
                    </thead>
                    <tbody>
                      {auditLogs.map((log) => (
                        <tr key={log._id}>
                          <td className="audit-time">{new Date(log.createdAt).toLocaleString()}</td>
                          <td><span className="audit-action-badge">{log.action}</span></td>
                          <td><span className="audit-type-badge">{log.resourceType}</span></td>
                          <td className="audit-user">{log.email || log.userId}</td>
                          <td className="audit-details">{log.details ? JSON.stringify(log.details) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="audit-pagination">
                  <button disabled={auditPagination.page <= 1} onClick={() => fetchAuditLogs(auditPagination.page - 1)}>← Prev</button>
                  <div className="audit-page-numbers">
                    {Array.from({ length: auditPagination.pages }, (_, i) => i + 1).map((p) => (
                      <button
                        key={p}
                        className={`audit-page-btn${auditPagination.page === p ? " active" : ""}`}
                        onClick={() => fetchAuditLogs(p)}
                      >{p}</button>
                    ))}
                  </div>
                  <button disabled={auditPagination.page >= auditPagination.pages} onClick={() => fetchAuditLogs(auditPagination.page + 1)}>Next →</button>
                </div>
              </>
            )}
          </div>
        )}

        {deadlineRateLimitError && (
          <div className="rate-limit-overlay" onClick={() => setDeadlineRateLimitError("")}>
            <div className="rate-limit-modal" onClick={(e) => e.stopPropagation()}>
              <div className="rate-limit-icon">🚫</div>
              <h3>Deadline Rate Limit Reached</h3>
              <p>{deadlineRateLimitError}</p>
              <button className="rate-limit-close" onClick={() => setDeadlineRateLimitError("")}>Dismiss</button>
            </div>
          </div>
        )}
        {inviteRateLimitError && (
          <div className="rate-limit-overlay" onClick={() => setInviteRateLimitError("")}>
            <div className="rate-limit-modal" onClick={(e) => e.stopPropagation()}>
              <div className="rate-limit-icon">🚫</div>
              <h3>Invite Rate Limit Reached</h3>
              <p>{inviteRateLimitError}</p>
              <button className="rate-limit-close" onClick={() => setInviteRateLimitError("")}>Dismiss</button>
            </div>
          </div>
        )}

        <ConfirmModal
          open={confirm.open}
          icon={confirm.icon}
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          confirmClass={confirm.confirmClass}
          onConfirm={confirm.onConfirm}
          onCancel={closeConfirm}
        />
      </div>
    </div>
  );
}
