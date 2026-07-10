require("dotenv").config({ path: __dirname + "/../.env.local" });

const { Worker } = require("bullmq");
const mongoose = require("mongoose");
const connection = require("../lib/redis");
const { sendInviteEmail } = require("../lib/email");
const { sendPushNotification } = require("../lib/notificationService");
const { createLogger } = require("../lib/logger");

const log = createLogger("EmailWorker");
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/todo-app";

async function connectMongo() {
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(MONGO_URI, { bufferCommands: false });
  log.info("Connected to MongoDB");
}

const UserSchema = new mongoose.Schema({ email: String, fcmToken: String }, { strict: false });
const User = mongoose.models.User || mongoose.model("User", UserSchema);

const worker = new Worker(
  "emailQueue",
  async (job) => {
    const start = Date.now();

    log.info("Job received", { jobId: job.id, type: job.name, to: job.data.email, attempt: job.attemptsMade + 1 });

    if (job.name === "sendInviteEmail") {
      const { email, projectName, inviterName, token } = job.data;

      log.info("Sending invite email", { jobId: job.id, to: email, project: projectName });

      const info = await sendInviteEmail({ email, projectName, inviterName, token });
      const duration = Date.now() - start;
      log.info("Invite email sent", { jobId: job.id, messageId: info.messageId, durationMs: duration });

      // Send FCM push notification
      await connectMongo();
      const user = await User.findOne({ email }).lean();
      if (user?.fcmToken) {
        const valid = await sendPushNotification(user.fcmToken, {
          title: "You've been invited!",
          body: `${inviterName} invited you to join "${projectName}"`,
          data: { type: "invitation", projectName, inviterName, token },
        });
        if (!valid) {
          await User.updateOne({ email }, { fcmToken: null });
          log.warn("Cleared invalid FCM token", { email });
        }
      }

      return { success: true, duration, email, messageId: info.messageId };
    }

    // Generic email job
    const { email, subject, message } = job.data;
    log.info("Sending generic email", { jobId: job.id, to: email, subject });
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const duration = Date.now() - start;
    log.info("Generic email sent", { jobId: job.id, durationMs: duration });
    return { success: true, duration, email };
  },
  {
    connection,
    concurrency: 3,
    limiter: { max: 3, duration: 1000 },
  }
);

worker.on("completed", (job) => {
  log.info("Job completed", { jobId: job.id, type: job.name, durationMs: job.returnvalue?.duration });
});

worker.on("failed", (job, err) => {
  log.error("Job failed", { jobId: job?.id, type: job?.name, error: err.message, attempts: job?.attemptsMade });
});

worker.on("stalled", (jobId) => {
  log.warn("Job stalled", { jobId });
});

worker.on("error", (err) => {
  log.error("Worker error", { error: err.message });
});

log.info("Worker started — waiting for jobs");

module.exports = worker;
