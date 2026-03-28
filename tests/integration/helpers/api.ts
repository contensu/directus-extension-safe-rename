/**
 * Directus REST API client for integration tests.
 */

const BASE_URL = process.env["DIRECTUS_URL"] ?? "http://localhost:8055";
const EMAIL = process.env["DIRECTUS_EMAIL"] ?? "admin@example.com";
const PASSWORD = process.env["DIRECTUS_PASSWORD"] ?? "d1r3ctu5";

let _token: string | null = null;

async function getToken(): Promise<string> {
  if (_token) return _token;
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Auth failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { data: { access_token: string } };
  _token = data.data.access_token;
  return _token;
}

export function resetToken() {
  _token = null;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: T }> {
  const token = await getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: T;
  try {
    data = JSON.parse(text) as T;
  } catch {
    data = text as unknown as T;
  }
  return { status: res.status, data };
}

export const api = {
  get: <T = unknown>(path: string) => request<T>("GET", path),
  post: <T = unknown>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T = unknown>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  delete: <T = unknown>(path: string) => request<T>("DELETE", path),
};

export async function waitForDirectus(): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/server/health`);
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await sleep(1000);
  }
  throw new Error("Directus did not become ready within 60s");
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function unique(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 9999)}`;
}
