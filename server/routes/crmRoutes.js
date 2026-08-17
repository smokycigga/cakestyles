import express from "express";
import { overview, customerSegments, importantDates } from "../controllers/crmController.js";

const router = express.Router();

router.get("/overview", overview);
router.get("/segments", customerSegments);
router.get("/important-dates", importantDates);

export default router;
