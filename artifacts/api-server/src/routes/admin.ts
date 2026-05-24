import { Router } from "express";
import crypto from "crypto";
import { dbQuery } from "../lib/supabase";
import { createSession, deleteSession } from "../lib/sessions";
import { requireAdmin } from "../middlewares/adminAuth";

const router = Router();

function sha256(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

// ─── LOGIN ──────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { password } = req.body as { password?: string };
    if (!password) {
      res.status(400).json({ error: "Password required" });
      return;
    }

    const rows = (await dbQuery("configs", {
      params: "key=eq.admin_password&select=value",
    })) as { value: string }[];

    const stored = rows?.[0]?.value ?? "";
    const hashed = sha256(password);
    const isHashMatch = stored === hashed;
    const isPlainMatch = stored === password && !isHashMatch;

    if (!isHashMatch && !isPlainMatch) {
      res.status(401).json({ error: "Mật khẩu không đúng" });
      return;
    }

    // Tự động nâng cấp plain text → hash
    if (isPlainMatch) {
      await dbQuery("configs", {
        method: "PATCH",
        params: "key=eq.admin_password",
        body: { value: hashed },
        prefer: "return=minimal",
      });
    }

    const token = createSession();
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── LOGOUT ─────────────────────────────────────────────────────
router.post("/logout", requireAdmin, (req, res) => {
  const token = (req.headers.authorization ?? "").slice(7);
  deleteSession(token);
  res.json({ ok: true });
});

// ─── CONFIGS — batch upsert ──────────────────────────────────────
router.post("/configs", requireAdmin, async (req, res) => {
  try {
    const items: { key: string; value: string }[] = Array.isArray(req.body)
      ? req.body
      : [req.body];

    await Promise.all(
      items.map((item) =>
        dbQuery("configs", {
          method: "PATCH",
          params: `key=eq.${encodeURIComponent(item.key)}`,
          body: { value: item.value },
          prefer: "return=minimal",
        })
      )
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── ATTENDANCE — delete by IDs ──────────────────────────────────
router.delete("/attendance", requireAdmin, async (req, res) => {
  try {
    const { ids } = req.body as { ids?: string[] };
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: "ids array required" });
      return;
    }
    await dbQuery("attendance", {
      method: "DELETE",
      params: `id=in.(${ids.join(",")})`,
      prefer: "return=minimal",
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── CLEANUP — generic delete (attendance / reconciliations) ─────
router.delete("/cleanup", requireAdmin, async (req, res) => {
  try {
    const { table, ids } = req.body as { table?: string; ids?: string[] };
    const allowed = ["attendance", "reconciliations", "job_applications"];
    if (!table || !allowed.includes(table)) {
      res.status(400).json({ error: "Invalid table" });
      return;
    }
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: "ids required" });
      return;
    }
    await dbQuery(table, {
      method: "DELETE",
      params: `id=in.(${ids.join(",")})`,
      prefer: "return=minimal",
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── RECONCILIATIONS — upsert ────────────────────────────────────
router.post("/reconciliations", requireAdmin, async (req, res) => {
  try {
    await dbQuery("reconciliations", {
      method: "POST",
      body: req.body,
      prefer: "resolution=merge-duplicates,return=minimal",
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.delete("/reconciliations/:id", requireAdmin, async (req, res) => {
  try {
    await dbQuery("reconciliations", {
      method: "DELETE",
      params: `id=eq.${req.params.id}`,
      prefer: "return=minimal",
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── SHIFTS ──────────────────────────────────────────────────────
router.post("/shifts", requireAdmin, async (req, res) => {
  try {
    await dbQuery("shifts", {
      method: "POST",
      body: req.body,
      prefer: "return=minimal",
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.patch("/shifts/:id", requireAdmin, async (req, res) => {
  try {
    await dbQuery("shifts", {
      method: "PATCH",
      params: `id=eq.${req.params.id}`,
      body: req.body,
      prefer: "return=minimal",
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.delete("/shifts/:id", requireAdmin, async (req, res) => {
  try {
    await dbQuery("shifts", {
      method: "DELETE",
      params: `id=eq.${req.params.id}`,
      prefer: "return=minimal",
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── JOB APPLICATIONS ────────────────────────────────────────────
router.patch("/job-applications/:id", requireAdmin, async (req, res) => {
  try {
    await dbQuery("job_applications", {
      method: "PATCH",
      params: `id=eq.${req.params.id}`,
      body: req.body,
      prefer: "return=minimal",
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.delete("/job-applications/:id", requireAdmin, async (req, res) => {
  try {
    await dbQuery("job_applications", {
      method: "DELETE",
      params: `id=eq.${req.params.id}`,
      prefer: "return=minimal",
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
