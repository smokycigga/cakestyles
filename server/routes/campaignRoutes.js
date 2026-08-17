import express from "express";
import {
  buildRecipients,
  create,
  exportRecipientsCsv,
  getOne,
  list,
  update,
  updateRecipient,
} from "../controllers/campaignController.js";

const router = express.Router();

router.get("/", list);
router.post("/", create);
router.get("/:id/recipients.csv", exportRecipientsCsv);
router.get("/:id/export.csv", exportRecipientsCsv);
router.post("/:id/recipients/build", buildRecipients);
router.post("/:id/build-recipients", buildRecipients);
router.patch("/:id/recipients/:recipientId", updateRecipient);
router.put("/:id/recipients/:recipientId", updateRecipient);
router.get("/:id", getOne);
router.put("/:id", update);

export default router;
