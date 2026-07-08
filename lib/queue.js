import { Queue } from "bullmq";
import connection from "./redis";

const emailQueue = new Queue("emailQueue", { connection });

export default emailQueue;
