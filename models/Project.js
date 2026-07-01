import mongoose from "mongoose";
import connectDB from "../lib/mongodb";

const ProjectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

ProjectSchema.index({ ownerId: 1 });

async function ProjectModel() {
  await connectDB();
  return mongoose.models.Project || mongoose.model("Project", ProjectSchema);
}

export default ProjectModel;
