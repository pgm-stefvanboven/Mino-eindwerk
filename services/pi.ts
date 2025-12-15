import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY_PI_BASE = "pi_base_url";

export async function getPiBaseUrl(): Promise<string> {
  const saved = await AsyncStorage.getItem(KEY_PI_BASE);
  return saved ?? "http://10.20.195.75:5000";
}

export async function setPiBaseUrl(url: string): Promise<void> {
  const cleaned = url.trim().replace(/\/+$/, "");
  await AsyncStorage.setItem(KEY_PI_BASE, cleaned);
}

async function api(path: string, init?: RequestInit) {
  const base = await getPiBaseUrl();
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const text = await res.text();
  let data: any = text;
  try { data = JSON.parse(text); } catch {}

  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  return data;
}

export const Pi = {
  health: () => api("/health"),
  today: () => api("/today"),
  testForward: () => api("/test/forward"),
};