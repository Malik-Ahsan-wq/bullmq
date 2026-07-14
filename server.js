require("dotenv").config({ path: ".env.local" });
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/todo-app";
const JWT_SECRET = process.env.JWT_SECRET || "todo-app-secret-key-123";
const PORT = process.env.SOCKET_PORT || 3001;

// ── MongoDB connection ───────────────────────────────────────────────────────
mongoose.connect(MONGO_URI, { bufferCommands: false })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => { console.error("MongoDB error:", err); process.exit(1); });

// ── Schemas ──────────────────────────────────────────────────────────────────
const MessageSchema = new mongoose.Schema(
  {
    taskId:      { type: mongoose.Schema.Types.ObjectId, required: true },
    senderId:    { type: mongoose.Schema.Types.ObjectId, required: true },
    senderName:  { type: String, required: true },
    senderAvatar: { type: String, default: null },
    content:     { type: String, default: "" },
    type:        { type: String, enum: ["text", "image", "file", "emoji"], default: "text" },
    fileUrl:     { type: String, default: null },
    fileName:    { type: String, default: null },
    deliveredTo: [mongoose.Schema.Types.ObjectId],
    seenBy:      [mongoose.Schema.Types.ObjectId],
  },
  { timestamps: true }
);
MessageSchema.index({ taskId: 1, createdAt: -1 });

const UserSchema = new mongoose.Schema({
  name:        String,
  email:       String,
  redisUserId: Number,
  avatar:      { type: String, default: null },
  lastSeen:    { type: Date, default: null },
});

const ProjectMemberSchema = new mongoose.Schema({
  projectId: mongoose.Schema.Types.ObjectId,
  userId:    mongoose.Schema.Types.ObjectId,
  role:      String,
});

const TodoSchema = new mongoose.Schema({
  projectId: mongoose.Schema.Types.ObjectId,
  text:      String,
});

const Message       = mongoose.models.Message       || mongoose.model("Message",       MessageSchema);
const User          = mongoose.models.User          || mongoose.model("User",          UserSchema);
const ProjectMember = mongoose.models.ProjectMember || mongoose.model("ProjectMember", ProjectMemberSchema);
const Todo          = mongoose.models.Todo          || mongoose.model("Todo",          TodoSchema);

// ── Express + Socket.IO ──────────────────────────────────────────────────────
const NEXT_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: NEXT_ORIGIN, credentials: true },
});

// ── Online users: mongoUserId(string) -> Set<socketId> ───────────────────────
const onlineUsers = new Map();

function addOnline(mongoId, socketId) {
  if (!onlineUsers.has(mongoId)) onlineUsers.set(mongoId, new Set());
  onlineUsers.get(mongoId).add(socketId);
}

function removeOnline(mongoId, socketId) {
  const sockets = onlineUsers.get(mongoId);
  if (!sockets) return false;
  sockets.delete(socketId);
  if (sockets.size === 0) { onlineUsers.delete(mongoId); return true; }
  return false;
}

// ── Auth middleware ──────────────────────────────────────────────────────────
// JWT carries { id: redisUserId (integer), email }
// We resolve the MongoDB _id here so all handlers have a real ObjectId.
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("Unauthorized"));
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // redisUserId is stored as Number in MongoDB
    const dbUser = await User.findOne({ redisUserId: Number(decoded.id) }).lean();
    if (!dbUser) return next(new Error("User not found"));

    socket.user = {
      mongoId:    dbUser._id,
      mongoIdStr: String(dbUser._id),
      name:       dbUser.name || decoded.email,
      email:      decoded.email,
      avatar:     dbUser.avatar || null,
      lastSeen:   dbUser.lastSeen || null,
    };
    next();
  } catch {
    next(new Error("Unauthorized"));
  }
});

// ── Socket events ────────────────────────────────────────────────────────────
io.on("connection", (socket) => {
  const { mongoId, mongoIdStr, name } = socket.user;

  addOnline(mongoIdStr, socket.id);
  socket.broadcast.emit("userOnline", { userId: mongoIdStr });
  // Broadcast this user's avatar so others can update their UI
  socket.broadcast.emit("userAvatarUpdate", { userId: mongoIdStr, avatar: socket.user.avatar || null });

  // joinTaskRoom
  socket.on("joinTaskRoom", async ({ taskId }) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(taskId)) return;
      const taskOid = new mongoose.Types.ObjectId(taskId);

      const task = await Todo.findById(taskOid).lean();
      if (!task) return;

      const member = await ProjectMember.findOne({ projectId: task.projectId, userId: mongoId }).lean();
      if (!member) return;

      socket.join(taskId);

      await Message.updateMany(
        { taskId: taskOid, deliveredTo: { $ne: mongoId } },
        { $addToSet: { deliveredTo: mongoId } }
      );

      const delivered = await Message.find({ taskId: taskOid, deliveredTo: mongoId }, { _id: 1 }).lean();
      if (delivered.length) {
        io.to(taskId).emit("messageDelivered", {
          taskId,
          messageIds: delivered.map((m) => String(m._id)),
          userId: mongoIdStr,
        });
      }
    } catch (err) {
      console.error("joinTaskRoom error:", err);
    }
  });

  // leaveTaskRoom
  socket.on("leaveTaskRoom", ({ taskId }) => {
    socket.leave(taskId);
  });

  // sendMessage
  socket.on("sendMessage", async ({ taskId, content, type = "text", fileUrl, fileName }) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(taskId)) return;
      const taskOid = new mongoose.Types.ObjectId(taskId);

      const task = await Todo.findById(taskOid).lean();
      if (!task) return;

      const member = await ProjectMember.findOne({ projectId: task.projectId, userId: mongoId }).lean();
      if (!member) return;

      const msg = await Message.create({
        taskId:      taskOid,
        senderId:    mongoId,
        senderName:  name,
        senderAvatar: socket.user.avatar || null,
        content:     content || "",
        type,
        fileUrl:     fileUrl  || null,
        fileName:    fileName || null,
        deliveredTo: [mongoId],
        seenBy:      [mongoId],
      });

      io.to(taskId).emit("receiveMessage", msg.toObject());

      // Notify all project members who are NOT in this task room right now
      const allMembers = await ProjectMember.find({ projectId: task.projectId }).lean();
      const notification = {
        taskId,
        taskName: task.text,
        senderId: mongoIdStr,
        senderName: name,
        senderAvatar: socket.user.avatar || null,
        preview: type === "text" ? (content || "").slice(0, 80) : type === "image" ? "📷 Image" : `📎 ${fileName || "File"}`,
        messageId: String(msg._id),
        createdAt: msg.createdAt,
      };
      for (const m of allMembers) {
        const recipientId = String(m.userId);
        if (recipientId === mongoIdStr) continue; // don't notify sender
        const recipientSockets = onlineUsers.get(recipientId);
        if (!recipientSockets) continue;
        for (const sid of recipientSockets) {
          io.to(sid).emit("newMessageNotification", notification);
        }
      }
    } catch (err) {
      console.error("sendMessage error:", err);
    }
  });

  // typing
  socket.on("typing", ({ taskId }) => {
    socket.to(taskId).emit("typing", { userId: mongoIdStr, name });
  });

  socket.on("stopTyping", ({ taskId }) => {
    socket.to(taskId).emit("stopTyping", { userId: mongoIdStr });
  });

  // messageSeen
  socket.on("messageSeen", async ({ taskId, messageIds }) => {
    try {
      if (!Array.isArray(messageIds) || !messageIds.length) return;
      const oids = messageIds
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id));

      await Message.updateMany(
        { _id: { $in: oids }, seenBy: { $ne: mongoId } },
        { $addToSet: { seenBy: mongoId } }
      );
      io.to(taskId).emit("messageSeen", {
        taskId,
        messageIds: messageIds.map(String),
        userId: mongoIdStr,
      });
    } catch (err) {
      console.error("messageSeen error:", err);
    }
  });

  // updateAvatar — called after user uploads a new avatar via REST API
  socket.on("updateAvatar", async ({ avatar }) => {
    try {
      await User.findByIdAndUpdate(mongoId, { avatar });
      socket.user.avatar = avatar;
      io.emit("userAvatarUpdate", { userId: mongoIdStr, avatar });
    } catch (err) { console.error("updateAvatar error:", err); }
  });

  socket.on("getMyMongoId", () => {
    socket.emit("myMongoId", { mongoId: mongoIdStr, avatar: socket.user.avatar || null, lastSeen: socket.user.lastSeen || null });
  });

  // disconnect
  socket.on("disconnect", async () => {
    const wasLast = removeOnline(mongoIdStr, socket.id);
    if (wasLast) {
      const now = new Date();
      try {
        await User.findByIdAndUpdate(mongoId, { lastSeen: now });
      } catch (e) { console.error("lastSeen update error:", e); }
      socket.broadcast.emit("userOffline", { userId: mongoIdStr, lastSeen: now.toISOString() });
    }
  });
});

server.listen(PORT, () => console.log(`Socket.IO server running on port ${PORT}`));
