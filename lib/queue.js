import { Queue } from "bullmq";
import connection from "./redis";

const emailQueue = new Queue("emailQueue", {
  connection,
  limiter: {
    max: 5,
    duration: 1000,
  },
});

export default emailQueue;
