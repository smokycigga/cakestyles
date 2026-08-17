import express from "express";
import {
  list,
  getOne,
  fromOrder,
  createStandalone,
  recordPayment,
  updateStatus,
  exportCsv,
} from "../controllers/invoiceController.js";

const router = express.Router();

router.get("/", list);
router.get("/export.csv", exportCsv);
router.post("/from-order/:orderId", fromOrder);
router.post("/", createStandalone);
router.get("/:id", getOne);
router.post("/:id/payments", recordPayment);
router.put("/:id/status", updateStatus);

export default router;
