const API_BASE = "/api/admin";
const TOKEN_KEY = "admin_api_token";

export function getAdminToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? "";
}

export function saveAdminToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAdminToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function apiFetch(path: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAdminToken()}`,
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export const adminApi = {
  // ── Auth ──────────────────────────────────────────────────────
  async login(password: string): Promise<void> {
    const data = (await apiFetch("/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    })) as { token: string };
    saveAdminToken(data.token);
  },

  async logout(): Promise<void> {
    await apiFetch("/logout", { method: "POST" }).catch(() => {});
    clearAdminToken();
  },

  // ── Configs ───────────────────────────────────────────────────
  async upsertConfig(key: string, value: string): Promise<void> {
    await apiFetch("/configs", {
      method: "POST",
      body: JSON.stringify({ key, value }),
    });
  },

  async upsertConfigs(configs: { key: string; value: string }[]): Promise<void> {
    await apiFetch("/configs", {
      method: "POST",
      body: JSON.stringify(configs),
    });
  },

  // ── Attendance ────────────────────────────────────────────────
  async deleteAttendance(ids: string[]): Promise<void> {
    await apiFetch("/attendance", {
      method: "DELETE",
      body: JSON.stringify({ ids }),
    });
  },

  // ── Cleanup (generic delete) ─────────────────────────────────
  async cleanup(table: string, ids: string[]): Promise<void> {
    await apiFetch("/cleanup", {
      method: "DELETE",
      body: JSON.stringify({ table, ids }),
    });
  },

  // ── Reconciliations ───────────────────────────────────────────
  async upsertReconciliation(data: Record<string, unknown>): Promise<void> {
    await apiFetch("/reconciliations", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async deleteReconciliation(id: string): Promise<void> {
    await apiFetch(`/reconciliations/${id}`, { method: "DELETE" });
  },

  // ── Shifts ────────────────────────────────────────────────────
  async insertShift(data: Record<string, unknown>): Promise<void> {
    await apiFetch("/shifts", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async updateShift(id: string, data: Record<string, unknown>): Promise<void> {
    await apiFetch(`/shifts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  async deleteShift(id: string): Promise<void> {
    await apiFetch(`/shifts/${id}`, { method: "DELETE" });
  },

  // ── Job Applications ──────────────────────────────────────────
  async updateJobApplication(id: string, data: Record<string, unknown>): Promise<void> {
    await apiFetch(`/job-applications/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  async deleteJobApplication(id: string): Promise<void> {
    await apiFetch(`/job-applications/${id}`, { method: "DELETE" });
  },
};
