require("dotenv").config({ path: __dirname + "/../.env.local" });

const { Worker } = require("bullmq");
const connection = require("../lib/redis");
const { sendLoginNotification } = require("../lib/email");
const { createLogger } = require("../lib/logger");

const log = createLogger("LoginWorker");

const worker = new Worker(
  "loginQueue",
  async (job) => {
    const start = Date.now();
    const { email, name, ip } = job.data;

    log.info("Job received", { jobId: job.id, email, attempt: job.attemptsMade + 1 });

    try {
      log.info("Sending login notification email", { jobId: job.id, to: email });

      const info = await sendLoginNotification({
        email,
        name,
        loginTime: new Date(),
        ip,
      });

      const duration = Date.now() - start;
      log.info("Login notification sent", { jobId: job.id, messageId: info.messageId, durationMs: duration });

      return { success: true, duration, email, messageId: info.messageId };
    } catch (err) {
      log.error("Failed to send login notification", { jobId: job.id, error: err.message });
      throw err;
    }
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
