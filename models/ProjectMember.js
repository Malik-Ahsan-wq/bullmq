import mongoose from "mongoose";
import connectDB from "../lib/mongodb";

const ProjectMemberSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    role: {
      type: String,
      enum: ["owner", "member"],
      default: "member",
    },
  },
  { timestamps: true }
);

ProjectMemberSchema.index({ projectId: 1, userId: 1 }, { unique: true });
ProjectMemberSchema.index({ userId: 1 });

async function ProjectMemberModel() {
  await connectDB();
  return (
    mongoose.models.ProjectMember ||
    mongoose.model("ProjectMember", ProjectMemberSchema)
  );
}

export default ProjectMemberModel;
