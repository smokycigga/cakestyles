import { z } from "zod";

// Parses the request body against a zod schema; replaces hand-rolled checks.
export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue.path.join(".");
    return res.status(400).json({
      message: `Invalid ${path || "input"}: ${issue.message}`,
    });
  }
  req.body = result.data;
  next();
};
