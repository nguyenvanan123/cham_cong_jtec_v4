const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

type QueryOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  params?: string;
  body?: unknown;
  prefer?: string;
};

export async function dbQuery(table: string, opts: QueryOptions = {}): Promise<unknown> {
  const { method = "GET", params, body, prefer } = opts;
  const url = `${SUPABASE_URL}/rest/v1/${table}${params ? `?${params}` : ""}`;

  const headers: Record<string, string> = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
  if (prefer) headers["Prefer"] = prefer;

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${method} ${table}: ${res.status} ${text}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
