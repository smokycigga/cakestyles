import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import connectDB from "../server/config/db.js";
import User from "../server/models/User.js";

const run = async () => {
  const password = process.env.OWNER_PASSWORD;

  // No default: this script points at whatever MONGO_URI is configured, which
  // in this repo is the live database. A fallback password baked into source
  // would mean the deployed owner account could be signed into by anyone who
  // can read the repository.
  if (!password || password.length < 10) {
    console.error("Set OWNER_PASSWORD (at least 10 characters) before running this script.");
    process.exit(1);
  }

  await connectDB();

  const email = (process.env.OWNER_EMAIL || "owner@cakestyles.test").toLowerCase();

  const existing = await User.findOne({ email });
  if (existing) {
    console.log(`⚠️  Owner already exists: ${email}`);
    await mongoose.disconnect();
    return;
  }

  const owner = await User.create({
    name: "Cakestyles Owner",
    email,
    passwordHash: await bcrypt.hash(password, 10),
    role: "owner",
  });

  console.log(`✅ Owner created: ${owner.email}`);
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
