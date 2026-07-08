require("dotenv").config({ path: __dirname + "/../.env.local" });

const { Worker } = require("bullmq");
const mongoose = require("mongoose");
const connection = require("../lib/redis");
const { sendDeadlineReminder } = require("../lib/email");
const { createLogger } = require("../lib/logger");

const log = createLogger("DeadlineWorker");
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/todo-app";

async function connectMongo() {
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(MONGO_URI, { bufferCommands: false });
  log.info("Connected to MongoDB");
}

const TodoSchema = new mongoose.Schema(
  {
    text: String,
    done: Boolean,
    deadline: Date,
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    assignedToName: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project" },
  },
  { strict: false }
);

const Todo = mongoose.model("Todo", TodoSchema);

const worker = new Worker(
  "deadlineQueue",
  async (job) => {
    const start = Date.now();
    const { todoId, email, taskName, projectName, assigneeName, creatorName } = job.data;

    log.info("Job received", { jobId: job.id, taskName, to: email, attempt: job.attemptsMade + 1 });

    try {
      await connectMongo();

      const todo = await Todo.findById(todoId).lean();

      if (!todo) {
        log.warn("Todo no longer exists — skipping", { jobId: job.id, todoId });
        return { success: true, skipped: true, reason: "todo_deleted" };
      }

      if (todo.done) {
        log.warn("Todo already completed — skipping", { jobId: job.id, todoId });
        return { success: true, skipped: true, reason: "todo_completed" };
      }

      if (!todo.deadline) {
        log.warn("Todo deadline removed — skipping", { jobId: job.id, todoId });
        return { success: true, skipped: true, reason: "deadline_removed" };
      }

      log.info("Sending deadline reminder email", { jobId: job.id, to: email, project: projectName });

      const info = await sendDeadlineReminder({
        email,
        taskName,
        projectName,
        deadline: todo.deadline,
        assigneeName,
        creatorName,
      });

      const duration = Date.now() - start;
      log.info("Reminder email sent", { jobId: job.id, messageId: info.messageId, durationMs: duration });

      return { success: true, duration, email, messageId: info.messageId };
    } catch (err) {
      log.error("Failed to send reminder email", { jobId: job.id, error: err.message });
      throw err;
    }
  },
  { connection, concurrency: 3 }
);

worker.on("completed", (job) => {
  const rv = job.returnvalue;
  if (rv?.skipped) {
    log.info("Job completed (skipped)", { jobId: job.id, reason: rv.reason });
  } else {
    log.info("Job completed", { jobId: job.id, durationMs: rv?.duration });
  }
});

worker.on("failed", (job, err) => {
  log.error("Job failed", { jobId: job?.id, error: err.message, attempts: job?.attemptsMade });
});

worker.on("stalled", (jobId) => {
  log.warn("Job stalled", { jobId });
});

worker.on("error", (err) => {
  log.error("Worker error", { error: err.message });
});

log.info("Worker started — waiting for jobs");

module.exports = worker;
