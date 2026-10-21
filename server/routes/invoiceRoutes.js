import express from "express";
import {
  list,
  getOne,
  fromOrder,
  createStandalone,
  update,
  linkOrder,
  recordPayment,
  updateStatus,
  remove,
  exportCsv,
} from "../controllers/invoiceController.js";

const router = express.Router();

router.get("/", list);
router.get("/export.csv", exportCsv);
router.post("/from-order/:orderId", fromOrder);
router.post("/", createStandalone);
router.get("/:id", getOne);
router.put("/:id", update);
router.put("/:id/order", linkOrder);
router.post("/:id/payments", recordPayment);
router.put("/:id/status", updateStatus);
router.delete("/:id", remove);

export default router;

