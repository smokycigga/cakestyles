import app from "./app.js";
import connectDB from "./config/db.js";

const startServer = async () => {
  try {
    await connectDB();

    const PORT = process.env.PORT || 5000;

    app.listen(PORT, () => {
      console.log(`🧁 Cakestyles server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Server Error:", error);
    process.exit(1);
  }
};

startServer();
