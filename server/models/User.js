import mongoose from "mongoose";
import { ROLES } from "../config/constants.js";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: "staff" },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

userSchema.methods.toSafeJSON = function () {
  return { _id: this._id, name: this.name, email: this.email, role: this.role, active: this.active };
};

export default mongoose.model("User", userSchema);

