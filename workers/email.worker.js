const { Worker } = require("bullmq");
const connection = require("../lib/redis");

const worker = new Worker(
  "emailQueue",
  async (job) => {
    const start = Date.now();

    console.log(`\n--- Email Worker ---`);
    console.log(`Job ${job.id} Processing...`);
    console.log(`To: ${job.data.email}`);
    console.log(`Subject: ${job.data.subject}`);
    console.log(`Message: ${job.data.message}`);

    // Simulate email sending (3 second delay)
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
  console.log(`Job ${job.id} Failed: ${err.message}`);
});

console.log("Email worker started. Waiting for jobs...");

module.exports = worker;
