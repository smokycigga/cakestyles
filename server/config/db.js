import mongoose from "mongoose";

if (!process.env.MONGO_URI) {
  console.error("MONGO_URI is not set");
  process.exit(1);
}

// Cache the connection globally so warm serverless invocations reuse it.
const cached = global.cakestylesMongoose || { conn: null, promise: null };

const connectDB = async () => {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(process.env.MONGO_URI, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 10000,
      })
      .then((m) => m);
  }

  cached.conn = await cached.promise;
  global.cakestylesMongoose = cached;
  return cached.conn;
};

export default connectDB;
