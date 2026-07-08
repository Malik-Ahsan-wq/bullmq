require("dotenv").config({ path: __dirname + "/../.env.local" });

const { Worker } = require("bullmq");
const mongoose = require("mongoose");
const connection = require("../lib/redis");
const { sendDeadlineReminder } = require("../lib/email");

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/todo-app";

/**
 * Deadline Reminder Worker
 *
 * Processes delayed jobs from the "deadlineQueue". Each job represents a
 * task deadline reminder. When the delay expires (i.e. the deadline arrives),
 * this worker checks whether the todo is still incomplete and still has a
 * deadline set before sending the reminder email. This prevents sending
 * reminders for tasks that were completed, deleted, or had their deadline
 * removed before the job fired.
 */

// Connect to MongoDB so we can query the current state of the todo.
// The worker is a standalone process, so it needs its own Mongoose connection.
async function connectMongo() {
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(MONGO_URI, { bufferCommands: false });
  console.log("[Deadline Worker] Connected to MongoDB");
}

// Minimal inline schema — we only need to read a few fields to decide
// whether to send the reminder. We do NOT reuse the app's model because
// this is a standalone CommonJS process and the model uses ESM imports.
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
    const { todoId, email, taskName, projectName, assigneeName, creatorName } =
      job.data;

    console.log(`\n--- Deadline Reminder Worker ---`);
    console.log(`Job ${job.id} Processing reminder for task: ${taskName}`);
    console.log(`To: ${email}`);
    console.log(`Deadline job ID: ${job.id}`);

    try {
      // Ensure we have a live MongoDB connection
      await connectMongo();

      // Re-fetch the todo from the database to verify current state.
      // The task may have been completed, deleted, or had its deadline
      // removed since this job was originally scheduled.
      const todo = await Todo.findById(todoId).lean();

      if (!todo) {
        console.log(
          `Job ${job.id} Todo ${todoId} no longer exists — skipping email`
        );
        return { success: true, skipped: true, reason: "todo_deleted" };
      }

      if (todo.done) {
        console.log(
          `Job ${job.id} Todo ${todoId} is already completed — skipping email`
        );
        return { success: true, skipped: true, reason: "todo_completed" };
      }

      if (!todo.deadline) {
        console.log(
          `Job ${job.id} Todo ${todoId} deadline was removed — skipping email`
        );
        return { success: true, skipped: true, reason: "deadline_removed" };
      }

      // All checks passed — send the reminder email
      const info = await sendDeadlineReminder({
        email,
        taskName,
        projectName,
        deadline: todo.deadline,
        assigneeName,
        creatorName,
      });

      const duration = Date.now() - start;
      console.log(`Job ${job.id} Reminder email sent in ${duration}ms`);
      console.log(`Message ID: ${info.messageId}`);
      console.log(`--- End ---\n`);

      return {
        success: true,
        duration,
        email,
        messageId: info.messageId,
      };
    } catch (err) {
      console.error(`Job ${job.id} Reminder email failed: ${err.message}`);
      throw err;
    }
  },
  {
    connection,
    concurrency: 3,
  }
);

worker.on("completed", (job) => {
  if (job.data?.skipped) {
    console.log(`Job ${job.id} Completed (skipped — ${job.returnvalue?.reason})`);
  } else {
    console.log(`Job ${job.id} Completed`);
  }
});

worker.on("failed", (job, err) => {
  console.error(`\n!!! Job ${job.id} FAILED !!!`);
  console.error(`Error: ${err.message}`);
  console.error(`---\n`);
});

console.log("Deadline reminder worker started. Waiting for jobs...");

module.exports = worker;
