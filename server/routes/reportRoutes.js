import express from "express";
import {
  salesReport,
  productsReport,
  outstandingReport,
  profitabilityReport,
  customersReport,
} from "../controllers/reportController.js";

const router = express.Router();

router.get("/sales.csv", salesReport);
router.get("/products.csv", productsReport);
router.get("/outstanding.csv", outstandingReport);
router.get("/profitability.csv", profitabilityReport);
router.get("/customers.csv", customersReport);

export default router;
