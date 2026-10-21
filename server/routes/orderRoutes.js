import express from "express";
import {
  checkout,
  track,
  list,
  getOne,
  updateStatus,
  recordPayment,
  createManual,
  remove,
} from "../controllers/orderController.js";

const router = express.Router();

// Public
router.post("/", checkout);
router.get("/track/:orderNumber", track);

// Admin
router.get("/", list);
router.get("/:id", getOne);
router.put("/:id/status", updateStatus);
router.post("/:id/payments", recordPayment);
router.post("/manual", createManual);
router.delete("/:id", remove);

export default router;

