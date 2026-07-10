require("dotenv").config({ path: __dirname + "/../.env.local" });

const { Worker } = require("bullmq");
const mongoose = require("mongoose");
const connection = require("../lib/redis");
const { sendLoginNotification } = require("../lib/email");
const { sendPushNotification } = require("../lib/notificationService");
const { createLogger } = require("../lib/logger");

const log = createLogger("LoginWorker");
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/todo-app";

async function connectMongo() {
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(MONGO_URI, { bufferCommands: false });
  log.info("Connected to MongoDB");
}

const UserSchema = new mongoose.Schema({ email: String, name: String, fcmToken: String }, { strict: false });
const User = mongoose.models.User || mongoose.model("User", UserSchema);

const worker = new Worker(
  "loginQueue",
  async (job) => {
    const start = Date.now();
    const { email, name, ip } = job.data;

    log.info("Job received", { jobId: job.id, email, attempt: job.attemptsMade + 1 });

    await connectMongo();

    // Send email notification
    const info = await sendLoginNotification({ email, name, loginTime: new Date(), ip });
    log.info("Login notification email sent", { jobId: job.id, messageId: info.messageId });

    // Send FCM push notification
    const user = await User.findOne({ email }).lean();
    if (user?.fcmToken) {
      const loginTime = new Date().toLocaleString();
      const valid = await sendPushNotification(user.fcmToken, {
        title: "New Login Detected",
        body: `Your account was accessed${ip ? ` from ${ip}` : ""} at ${loginTime}`,
        data: { type: "login", ip: ip || "" },
      });
      if (!valid) {
        await User.updateOne({ email }, { fcmToken: null });
        log.warn("Cleared invalid FCM token", { email });
      }
    }

    const duration = Date.now() - start;
    log.info("Login job completed", { jobId: job.id, durationMs: duration });
    return { success: true, duration, email, messageId: info.messageId };
  },
  {
    connection,
    concurrency: 3,
    limiter: { max: 5, duration: 1000 },
  }
);

worker.on("completed", (job) => {
  log.info("Job completed", { jobId: job.id, durationMs: job.returnvalue?.duration });
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
