// services/pi.ts
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY_PI_BASE = "pi_base_url";

// Hier staat jouw vaste IP nu als standaard!
export async function getPiBaseUrl(): Promise<string> {
  const saved = await AsyncStorage.getItem(KEY_PI_BASE);
  return saved ?? "http://10.20.195.75:5000";
}

export async function setPiBaseUrl(url: string): Promise<void> {
  const cleaned = url.trim().replace(/\/+$/, "");
  await AsyncStorage.setItem(KEY_PI_BASE, cleaned);
}

// Algemene API functie
async function api(path: string, method: string = "GET", body?: any) {
  const base = await getPiBaseUrl();
  const options: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) options.body = JSON.stringify(body);

  try {
    const res = await fetch(`${base}${path}`, options);
    const text = await res.text();
    // Probeer JSON te parsen, anders geef tekst terug
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } catch (err) {
    console.warn("API Error:", err);
    throw err;
  }
}

// Al je functies bij elkaar
export const Pi = {
  health: () => api("/health"),
  // Robot besturing
  move: (dir: string) => api(`/move/${dir}`),
  stop: () => api(`/move/stop`),
  // Medicijnen (later koppel je dit aan je database)
  getMeds: () => api("/medicijnen"),
  confirmMed: (id: number) => api(`/medicijnen/${id}/bevestig`, "POST"),
  addMed: (naam: string) => api(`/medicijnen`, "POST", { naam }),
};