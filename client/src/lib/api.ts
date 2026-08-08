const API_URL = import.meta.env.VITE_API_URL as string;

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

async function parseErrorMessage(res: Response): Promise<string> {
  const body = await res.json().catch(() => null);
  return body?.error ?? `Request failed with status ${res.status}`;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }
  return res.json();
}

export async function fetchMe(token: string): Promise<AuthUser> {
  const res = await fetch(`${API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }
  return res.json();
}
