import mongoose from "mongoose";
import connectDB from "../lib/mongodb";

const ProjectStatsSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      unique: true,
      index: true,
    },
    total: { type: Number, default: 0 },
    completed: { type: Number, default: 0 },
    pending: { type: Number, default: 0 },
    overdue: { type: Number, default: 0 },
    lastUpdated: { type: Date, default: null },
    members: { type: mongoose.Schema.Types.Mixed, default: [] },
  },
  { timestamps: true, collection: "projectstats" }
);

async function ProjectStatsModel() {
  await connectDB();
  delete mongoose.models.ProjectStats;
  return mongoose.model("ProjectStats", ProjectStatsSchema);
}

export default ProjectStatsModel;
