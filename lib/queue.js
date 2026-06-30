const { Queue } = require("bullmq");
const connection = require("./redis");

const emailQueue = new Queue("emailQueue", {
  connection,
  limiter: {
    max: 5,
    duration: 1000,
  },
});

module.exports = emailQueue;
