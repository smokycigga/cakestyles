import express from "express";
import { listByCustomer, create } from "../controllers/activityController.js";

const router = express.Router();

router.get("/customer/:customerId", listByCustomer);
router.post("/", create);

export default router;
