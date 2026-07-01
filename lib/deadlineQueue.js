import { Queue } from "bullmq";
import connection from "./redis";

/**
 * BullMQ queue for deadline reminder emails.
 * Separate from emailQueue to keep invitation and reminder concerns isolated.
 * Jobs are added with a delay equal to (deadline - now) so they fire exactly
 * when the deadline arrives.
 */
const deadlineQueue = new Queue("deadlineQueue", {
  connection,
});

export default deadlineQueue;
