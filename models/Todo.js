import mongoose from "mongoose";
import connectDB from "../lib/mongodb";

const TodoSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
    done: {
      type: Boolean,
      default: false,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    assignedToName: {
      type: String,
      default: null,
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    deadline: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

TodoSchema.index({ projectId: 1, assignedTo: 1 });
TodoSchema.index({ projectId: 1, createdAt: -1 });

async function TodoModel() {
  await connectDB();
  delete mongoose.models.Todo;
  return mongoose.model("Todo", TodoSchema);
}

export default TodoModel;
