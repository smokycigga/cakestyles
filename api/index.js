// Vercel serverless entry: the Express app IS the handler.
// vercel.json rewrites /api/* here while preserving the original URL,
// so Express routes mounted under /api work unchanged.
import app from "../server/app.js";

export default app;
