import { Router } from "express";
import { seedDemoData } from "../services/telegramBot";

const router = Router();

router.post("/demo/reset", (_req, res) => {
  try {
    const counts = seedDemoData();
    res.json({ success: true, message: "Demo data reset successfully", counts });
  } catch (e) {
    res.status(500).json({ success: false, message: String(e) });
  }
});

export default router;
