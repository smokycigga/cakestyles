import express from "express";

import {
  adjust,
  getHistory,
  getSummary,
  redeem,
} from "../controllers/loyaltyController.js";

const router = express.Router();

router.get("/:customerId", getSummary);
router.get("/:customerId/history", getHistory);
router.post("/:customerId/adjust", adjust);
router.post("/:customerId/redeem", redeem);

export default router;

