import { Queue } from "bullmq";
import connection from "./redis";

/**
 * BullMQ queue for login notification emails.
 * Separate from emailQueue to keep login concerns isolated.
 * Jobs are added when a user successfully logs in to send notification emails.
 */
const loginQueue = new Queue("loginQueue", {
  connection,
});

export default loginQueue;
