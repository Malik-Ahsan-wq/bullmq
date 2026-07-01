require("dotenv").config({ path: __dirname + "/../.env.local" });

const { Worker } = require("bullmq");
const connection = require("../lib/redis");
const { sendInviteEmail } = require("../lib/email");

const worker = new Worker(
  "emailQueue",
  async (job) => {
    const start = Date.now();

    if (job.name === "sendInviteEmail") {
      console.log(`\n--- Invite Email Worker ---`);
      console.log(`Job ${job.id} Processing invite...`);
      console.log(`To: ${job.data.email}`);
      console.log(`Project: ${job.data.projectName}`);
      console.log(`Invited by: ${job.data.inviterName}`);

      try {
        const info = await sendInviteEmail({
          email: job.data.email,
          projectName: job.data.projectName,
          inviterName: job.data.inviterName,
          token: job.data.token,
        });

        const duration = Date.now() - start;
        console.log(`Job ${job.id} Invite email sent in ${duration}ms`);
        console.log(`Message ID: ${info.messageId}`);
        console.log(`--- End ---\n`);

        return {
          success: true,
          duration,
          email: job.data.email,
          messageId: info.messageId,
        };
      } catch (err) {
        console.error(`Job ${job.id} Email send failed: ${err.message}`);
        throw err;
      }
    }

    console.log(`\n--- Email Worker ---`);
    console.log(`Job ${job.id} Processing...`);
    console.log(`To: ${job.data.email}`);
    console.log(`Subject: ${job.data.subject}`);
    console.log(`Message: ${job.data.message}`);

    await new Promise((resolve) => setTimeout(resolve, 3000));

    const duration = Date.now() - start;
    console.log(`Job ${job.id} Email Sent in ${duration}ms`);
    console.log(`--- End ---\n`);

    return {
      success: true,
      duration,
      email: job.data.email,
    };
  },
  {
    connection,
    concurrency: 3,
    limiter: {
      max: 3,
      duration: 1000,
    },
  }
);

worker.on("completed", (job) => {
  console.log(`Job ${job.id} Completed`);
});

worker.on("failed", (job, err) => {
  console.error(`\n!!! Job ${job.id} FAILED !!!`);
  console.error(`Error: ${err.message}`);
  console.error(`---\n`);
});

console.log("Email worker started. Waiting for jobs...");

module.exports = worker;
