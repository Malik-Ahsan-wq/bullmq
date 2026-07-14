"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { io } from "socket.io-client";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";
const EMOJI_LIST = ["😀", "😂", "😍", "🔥", "👍", "🎉", "😢", "😮", "❤️", "🙏"];

let _socket = null;
function getSocket(token) {
  if (_socket && _socket.connected) return _socket;
  if (_socket) _socket.disconnect();
  _socket = io(SOCKET_URL, {
    auth: { token },
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  });
  return _socket;
}

const getToken = () =>
  typeof window !== "undefined" ? localStorage.getItem("token") || "" : "";

// Shared avatar component — shows image if available, else colored initial
export function Avatar({ name, avatar, size = 32, style = {} }) {
  const colors = ["#4f46e5","#7c3aed","#0891b2","#059669","#d97706","#dc2626","#db2777"];
  const color = colors[(name?.charCodeAt(0) || 0) % colors.length];
  if (avatar) {
    return (
      <img
        src={avatar}
        alt={name}
        style={{
          width: size, height: size, minWidth: size, borderRadius: "50%",
          objectFit: "cover", flexShrink: 0, ...style,
        }}
      />
    );
  }
  return (
    <div style={{
      width: size, height: size, minWidth: size, borderRadius: "50%",
      background: color, color: "white",
      fontSize: size * 0.38, fontWeight: 700,
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0, userSelect: "none", ...style,
    }}>
      {name?.[0]?.toUpperCase() || "?"}
    </div>
  );
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateLabel(date) {
  const d = new Date(date);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function formatLastSeen(date) {
  if (!date) return "Last seen: unknown";
  const d = new Date(date);
  const now = new Date();
  const diffMs = now - d;
  const diffM = Math.floor(diffMs / 60000);
  if (diffM < 1) return "Last seen: just now";
  if (diffM < 60) return `Last seen: ${diffM}m ago`;
  const diffH = Math.floor(diffM / 60);
  if (diffH < 24) return `Last seen: ${diffH}h ago`;
  return `Last seen: ${d.toLocaleDateString([], { month: "short", day: "numeric" })}`;
}

export function getGlobalSocket(token) {
  return getSocket(token);
}

export default function ChatPanel({
  task, user, isActive, onUnreadChange, onNotification,
  memberAvatars = {}, // map: mongoId -> { avatar, name }
  onAvatarUpdate,     // callback when we receive userAvatarUpdate
}) {
  const [messages, setMessages]             = useState([]);
  const [input, setInput]                   = useState("");
  const [page, setPage]                     = useState(1);
  const [hasMore, setHasMore]               = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [typingUsers, setTypingUsers]       = useState({});
  const [showEmoji, setShowEmoji]           = useState(false);
  const [unread, setUnread]                 = useState(0);
  const [socketReady, setSocketReady]       = useState(false);
  const [error, setError]                   = useState("");
  const [myMongoId, setMyMongoId]           = useState(null);
  const [myAvatar, setMyAvatar]             = useState(null);
  // online status: mongoId -> true/false
  const [onlineMap, setOnlineMap]           = useState({});
  // lastSeen: mongoId -> ISO string
  const [lastSeenMap, setLastSeenMap]       = useState({});
  // live avatar overrides from socket events
  const [avatarOverrides, setAvatarOverrides] = useState({});

  const socketRef       = useRef(null);
  const bottomRef       = useRef(null);
  const listRef         = useRef(null);
  const typingTimer     = useRef(null);
  const isTypingRef     = useRef(false);
  const isAtBottomRef   = useRef(true);
  const fileInputRef    = useRef(null);
  const taskIdRef       = useRef(null);
  const myMongoIdRef    = useRef(null);
  const globalUnreadRef = useRef(0);

  const taskId = task?.id ? String(task.id) : null;

  useEffect(() => {
    if (isActive) { globalUnreadRef.current = 0; onUnreadChange?.(0); }
  }, [isActive, onUnreadChange]);

  useEffect(() => { myMongoIdRef.current = myMongoId; }, [myMongoId]);

  const resolveMongoId = useCallback(() => {
    if (myMongoIdRef.current) return;
    if (socketRef.current?.connected) socketRef.current.emit("getMyMongoId");
  }, []);

  const loadHistory = useCallback(async (p = 1, prepend = false) => {
    const token = getToken();
    if (!taskId || !token) return;
    setLoadingHistory(true);
    setError("");
    try {
      const res  = await fetch(`/api/chat/${taskId}?page=${p}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await res.text();
      if (!text) { setError("Empty response from server."); return; }
      const data = JSON.parse(text);
      if (!res.ok) { setError(data.error || "Failed to load messages"); return; }
      setMessages((prev) => (prepend ? [...data.messages, ...prev] : data.messages));
      setHasMore(data.pagination.page < data.pagination.pages);
      setPage(p);
      if (!myMongoIdRef.current) resolveMongoId();
    } catch (err) {
      setError("Failed to load chat history: " + err.message);
    } finally {
      setLoadingHistory(false);
    }
  }, [taskId, resolveMongoId]);

  // Mount once — register all socket event handlers
  useEffect(() => {
    const token = getToken();
    if (!token) return;

    const socket = getSocket(token);
    socketRef.current = socket;

    const onConnect = () => {
      setSocketReady(true);
      if (taskIdRef.current) socket.emit("joinTaskRoom", { taskId: taskIdRef.current });
      socket.emit("getMyMongoId");
    };
    const onDisconnect = () => setSocketReady(false);

    const onMyMongoId = ({ mongoId, avatar, lastSeen }) => {
      setMyMongoId(mongoId);
      myMongoIdRef.current = mongoId;
      if (avatar) setMyAvatar(avatar);
      if (lastSeen) setLastSeenMap((p) => ({ ...p, [mongoId]: lastSeen }));
    };

    const onReceiveMessage = (msg) => {
      if (String(msg.taskId) !== taskIdRef.current) return;
      setMessages((prev) => {
        if (prev.some((m) => String(m._id) === String(msg._id))) return prev;
        return [...prev, msg];
      });
      if (!isAtBottomRef.current) setUnread((n) => n + 1);
      if (!isActive) {
        globalUnreadRef.current += 1;
        onUnreadChange?.(globalUnreadRef.current);
      }
      if (myMongoIdRef.current && String(msg.senderId) !== myMongoIdRef.current) {
        socket.emit("messageSeen", { taskId: taskIdRef.current, messageIds: [msg._id] });
      }
    };

    const onNewMessageNotification = (notif) => {
      onNotification?.(notif);
      if (!isActive) {
        globalUnreadRef.current += 1;
        onUnreadChange?.(globalUnreadRef.current);
      }
    };

    const onTyping     = ({ userId, name }) => {
      if (myMongoIdRef.current && userId === myMongoIdRef.current) return;
      setTypingUsers((prev) => ({ ...prev, [userId]: name }));
    };
    const onStopTyping = ({ userId }) =>
      setTypingUsers((prev) => { const n = { ...prev }; delete n[userId]; return n; });

    const onMessageDelivered = ({ messageIds }) => {
      const ids = messageIds.map(String);
      setMessages((prev) => prev.map((m) => ids.includes(String(m._id)) ? { ...m, _delivered: true } : m));
    };
    const onMessageSeen = ({ messageIds, userId }) => {
      if (myMongoIdRef.current && userId === myMongoIdRef.current) return;
      const ids = messageIds.map(String);
      setMessages((prev) => prev.map((m) => ids.includes(String(m._id)) ? { ...m, _seen: true } : m));
    };

    const onUserOnline  = ({ userId }) => setOnlineMap((p) => ({ ...p, [userId]: true }));
    const onUserOffline = ({ userId, lastSeen }) => {
      setOnlineMap((p) => ({ ...p, [userId]: false }));
      if (lastSeen) setLastSeenMap((p) => ({ ...p, [userId]: lastSeen }));
    };
    const onUserAvatarUpdate = ({ userId, avatar }) => {
      setAvatarOverrides((p) => ({ ...p, [userId]: avatar }));
      // Also update own avatar state
      if (myMongoIdRef.current && userId === myMongoIdRef.current) setMyAvatar(avatar);
      onAvatarUpdate?.({ userId, avatar });
    };

    socket.on("connect",                onConnect);
    socket.on("disconnect",             onDisconnect);
    socket.on("myMongoId",              onMyMongoId);
    socket.on("receiveMessage",         onReceiveMessage);
    socket.on("newMessageNotification", onNewMessageNotification);
    socket.on("typing",                 onTyping);
    socket.on("stopTyping",             onStopTyping);
    socket.on("messageDelivered",       onMessageDelivered);
    socket.on("messageSeen",            onMessageSeen);
    socket.on("userOnline",             onUserOnline);
    socket.on("userOffline",            onUserOffline);
    socket.on("userAvatarUpdate",       onUserAvatarUpdate);

    if (socket.connected) {
      setSocketReady(true);
      if (taskIdRef.current) socket.emit("joinTaskRoom", { taskId: taskIdRef.current });
      socket.emit("getMyMongoId");
    }

    return () => {
      socket.off("connect",                onConnect);
      socket.off("disconnect",             onDisconnect);
      socket.off("myMongoId",              onMyMongoId);
      socket.off("receiveMessage",         onReceiveMessage);
      socket.off("newMessageNotification", onNewMessageNotification);
      socket.off("typing",                 onTyping);
      socket.off("stopTyping",             onStopTyping);
      socket.off("messageDelivered",       onMessageDelivered);
      socket.off("messageSeen",            onMessageSeen);
      socket.off("userOnline",             onUserOnline);
      socket.off("userOffline",            onUserOffline);
      socket.off("userAvatarUpdate",       onUserAvatarUpdate);
      clearTimeout(typingTimer.current);
      isTypingRef.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Join/leave task room when task changes
  useEffect(() => {
    const socket = socketRef.current;
    const prevTaskId = taskIdRef.current;
    if (prevTaskId && socket) socket.emit("leaveTaskRoom", { taskId: prevTaskId });

    taskIdRef.current = taskId;
    setMessages([]);
    setUnread(0);
    setTypingUsers({});
    setHasMore(false);
    setPage(1);
    setError("");
    isAtBottomRef.current = true;

    if (!taskId) return;
    if (socket?.connected) socket.emit("joinTaskRoom", { taskId });
    loadHistory(1, false);
  }, [taskId, loadHistory]);

  // Auto-scroll
  useEffect(() => {
    if (isAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      setUnread(0);
    }
  }, [messages]);

  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    isAtBottomRef.current = atBottom;
    if (atBottom) setUnread(0);
  };

  const scrollToBottom = () => {
    isAtBottomRef.current = true;
    setUnread(0);
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const sendMessage = (e) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || !socketRef.current || !taskId) return;
    socketRef.current.emit("sendMessage", { taskId, content: text, type: "text" });
    setInput("");
    stopTypingSignal();
    setShowEmoji(false);
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    if (!socketRef.current || !taskId) return;
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      socketRef.current.emit("typing", { taskId });
    }
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(stopTypingSignal, 2000);
  };

  const stopTypingSignal = () => {
    if (isTypingRef.current && socketRef.current && taskId) {
      isTypingRef.current = false;
      socketRef.current.emit("stopTyping", { taskId });
    }
    clearTimeout(typingTimer.current);
  };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file || !socketRef.current || !taskId) return;
    const isImage = file.type.startsWith("image/");
    const reader = new FileReader();
    reader.onload = () => {
      socketRef.current.emit("sendMessage", {
        taskId, content: file.name,
        type: isImage ? "image" : "file",
        fileUrl: reader.result, fileName: file.name,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const markSeen = () => {
    if (!socketRef.current || !taskId || !myMongoId) return;
    const unseen = messages
      .filter((m) => String(m.senderId) !== myMongoId && !m._seen)
      .map((m) => m._id);
    if (unseen.length) socketRef.current.emit("messageSeen", { taskId, messageIds: unseen });
  };

  // Resolve avatar for a message: socket override > message's stored avatar > memberAvatars prop
  const resolveAvatar = (senderId, storedAvatar, senderName) => {
    const id = String(senderId);
    return avatarOverrides[id] ?? memberAvatars[id]?.avatar ?? storedAvatar ?? null;
  };

  const statusIcon = (msg) => {
    if (!myMongoId || String(msg.senderId) !== myMongoId) return null;
    if (msg._seen)      return <span className="msg-status seen"      title="Seen">✓✓</span>;
    if (msg._delivered) return <span className="msg-status delivered" title="Delivered">✓✓</span>;
    return                     <span className="msg-status sent"      title="Sent">✓</span>;
  };

  // Build the task assignee's online/lastSeen status for the header
  const taskAssigneeId = task?.assignedTo?.id ? String(task.assignedTo.id) : null;
  const isAssigneeOnline = taskAssigneeId ? !!onlineMap[taskAssigneeId] : false;
  const assigneeLastSeen = taskAssigneeId ? lastSeenMap[taskAssigneeId] : null;

  // Group messages with date separators
  const grouped = [];
  let lastDate = null;
  for (const msg of messages) {
    const label = formatDateLabel(msg.createdAt);
    if (label !== lastDate) { grouped.push({ type: "date", label }); lastDate = label; }
    grouped.push({ type: "msg", msg });
  }

  const typingNames = Object.values(typingUsers);

  if (!task) {
    return (
      <div className="chat-empty">
        <span>💬</span>
        <p>Select a task to open its chat.</p>
      </div>
    );
  }

  const taskAvatar = taskAssigneeId
    ? (avatarOverrides[taskAssigneeId] ?? memberAvatars[taskAssigneeId]?.avatar ?? null)
    : null;

  return (
    <div className="chat-panel" onClick={markSeen}>
      {/* Header */}
      <div className="chat-header">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ position: "relative" }}>
            <Avatar name={task.assignedTo?.name || task.text} avatar={taskAvatar} size={38} />
            {taskAssigneeId && (
              <span className={`presence-dot ${isAssigneeOnline ? "online" : "offline"}`} />
            )}
          </div>
          <div className="chat-header-info">
            <span className="chat-task-name">{task.text}</span>
            <span className="chat-subtitle">
              {socketReady ? (
                taskAssigneeId ? (
                  isAssigneeOnline
                    ? <><span className="chat-online-dot" /> Online</>
                    : <><span className="chat-offline-dot" /> {formatLastSeen(assigneeLastSeen)}</>
                ) : (
                  <><span className="chat-online-dot" /> Connected</>
                )
              ) : (
                <><span className="chat-offline-dot" /> Connecting…</>
              )}
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="chat-error-banner">
          ⚠️ {error}
          <button onClick={() => { setError(""); loadHistory(1); }}>Retry</button>
        </div>
      )}

      {hasMore && (
        <button className="chat-load-more" onClick={() => loadHistory(page + 1, true)} disabled={loadingHistory}>
          {loadingHistory ? "Loading…" : "↑ Load older messages"}
        </button>
      )}

      <div className="chat-messages" ref={listRef} onScroll={handleScroll}>
        {loadingHistory && messages.length === 0 && <div className="chat-loading">Loading messages…</div>}
        {!loadingHistory && messages.length === 0 && !error && (
          <div className="chat-no-messages">
            <span style={{ fontSize: 32 }}>👋</span>
            <p>No messages yet. Say hello!</p>
          </div>
        )}

        {grouped.map((item, i) => {
          if (item.type === "date") {
            return (
              <div key={`date-${i}`} className="chat-date-separator">
                <span>{item.label}</span>
              </div>
            );
          }
          const { msg } = item;
          const isMine = myMongoId && String(msg.senderId) === myMongoId;
          const resolvedAvatar = isMine
            ? myAvatar
            : resolveAvatar(msg.senderId, msg.senderAvatar, msg.senderName);

          return (
            <div key={String(msg._id)} className={`chat-msg-row ${isMine ? "mine" : "theirs"}`}>
              {!isMine && (
                <div style={{ position: "relative" }}>
                  <Avatar name={msg.senderName} avatar={resolvedAvatar} size={30} />
                  {onlineMap[String(msg.senderId)] !== undefined && (
                    <span className={`presence-dot presence-dot-sm ${onlineMap[String(msg.senderId)] ? "online" : "offline"}`} />
                  )}
                </div>
              )}
              <div className="chat-bubble-wrap">
                {!isMine && <span className="chat-sender">{msg.senderName}</span>}
                <div className={`chat-bubble ${isMine ? "bubble-mine" : "bubble-theirs"}`}>
                  {msg.type === "image" ? (
                    <img src={msg.fileUrl} alt={msg.fileName} className="chat-img" />
                  ) : msg.type === "file" ? (
                    <a href={msg.fileUrl} download={msg.fileName} className="chat-file-link">
                      📎 {msg.fileName}
                    </a>
                  ) : (
                    <span className="chat-text">{msg.content}</span>
                  )}
                  <div className="chat-meta">
                    <span className="chat-time">{formatTime(msg.createdAt)}</span>
                    {statusIcon(msg)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {typingNames.length > 0 && (
        <div className="chat-typing">
          <div className="typing-avatar-row">
            {Object.entries(typingUsers).map(([uid, uname]) => (
              <Avatar
                key={uid}
                name={uname}
                avatar={avatarOverrides[uid] ?? memberAvatars[uid]?.avatar ?? null}
                size={20}
              />
            ))}
          </div>
          <div className="typing-bubble">
            <span className="typing-dots"><span /><span /><span /></span>
          </div>
          <span className="typing-label">
            {typingNames.join(", ")} {typingNames.length === 1 ? "is" : "are"} typing
          </span>
        </div>
      )}

      {unread > 0 && (
        <button className="chat-unread-badge" onClick={scrollToBottom}>
          ↓ {unread} new message{unread > 1 ? "s" : ""}
        </button>
      )}

      {showEmoji && (
        <div className="chat-emoji-picker">
          {EMOJI_LIST.map((e) => (
            <button key={e} className="emoji-btn" onClick={() => { setInput((p) => p + e); setShowEmoji(false); }}>{e}</button>
          ))}
        </div>
      )}

      <form className="chat-input-bar" onSubmit={sendMessage}>
        <button type="button" className="chat-icon-btn" onClick={() => setShowEmoji((v) => !v)} title="Emoji">😊</button>
        <button type="button" className="chat-icon-btn" onClick={() => fileInputRef.current?.click()} title="Attach file">📎</button>
        <input type="file" ref={fileInputRef} style={{ display: "none" }} onChange={handleFile} />
        <input
          className="chat-input"
          type="text"
          value={input}
          onChange={handleInputChange}
          onBlur={stopTypingSignal}
          placeholder={socketReady ? "Type a message…" : "Connecting…"}
          autoComplete="off"
          disabled={!socketReady}
        />
        <button type="submit" className="chat-send-btn" disabled={!input.trim() || !socketReady}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </form>
    </div>
  );
}
