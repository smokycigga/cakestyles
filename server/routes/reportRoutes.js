import express from "express";
import {
  salesReport,
  productsReport,
  outstandingReport,
  profitabilityReport,
  expensesReport,
  customersReport,
  customerStatement,
} from "../controllers/reportController.js";

const router = express.Router();

router.get("/sales.csv", salesReport);
router.get("/products.csv", productsReport);
router.get("/outstanding.csv", outstandingReport);
router.get("/profitability.csv", profitabilityReport);
router.get("/expenses.csv", expensesReport);
router.get("/customers.csv", customersReport);
router.get("/customer-statement.csv", customerStatement);

export default router;

