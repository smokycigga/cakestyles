import AuditLog from "../models/AuditLog.js";

const diffObjects = (before, after, fields) => {
  const changes = [];
  for (const field of fields) {
    const oldVal = before?.[field];
    const newVal = after?.[field];
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes.push({ field, old: oldVal ?? null, new: newVal ?? null });
    }
  }
  return changes;
};

// Records who changed what, for financially meaningful mutations (PRD §20).
export const writeAudit = async ({ req, action, entity, entityId, before, after, fields, meta }) => {
  try {
    let changes = [];
    if (before && after && fields) {
      changes = diffObjects(before, after, fields);
    }
    await AuditLog.create({
      actor: req?.user
        ? { userId: req.user._id, name: req.user.name }
        : { name: req?.actorName || "system" },
      action,
      entity,
      entityId: entityId || after?._id || null,
      changes,
      meta: meta || "",
    });
  } catch (err) {
    // Auditing must never break the main operation.
    console.error("Audit write failed:", err.message);
  }
};

