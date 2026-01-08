// services/pi.ts
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY_PI_BASE = "pi_base_url";

// Dit is je standaard URL (voor video en medicijnen op poort 5001)
export async function getPiBaseUrl(): Promise<string> {
  const saved = await AsyncStorage.getItem(KEY_PI_BASE);
  return saved ?? "http://10.217.173.75:5001";
}

export async function setPiBaseUrl(url: string): Promise<void> {
  const cleaned = url.trim().replace(/\/+$/, "");
  await AsyncStorage.setItem(KEY_PI_BASE, cleaned);
}

// --- FUNCTIE 1: Voor Poort 5001 (Medicijnen & Video) ---
async function api(path: string, method: string = "GET", body?: any) {
  const base = await getPiBaseUrl(); // Dit is ...:5001

  const options: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) options.body = JSON.stringify(body);

  try {
    const res = await fetch(`${base}${path}`, options);
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } catch (err) {
    console.warn("API 5001 Error:", err);
    throw err;
  }
}

// --- FUNCTIE 2: Voor Poort 5002 (Besturing & Reminder) ---
// Deze functie pakt de URL van hierboven, maar verandert 5001 naar 5002
async function apiCommand(path: string, method: string = "GET", body?: any) {
  let base = await getPiBaseUrl();

  // TRUCJE: We vervangen poort 5001 door 5002 voor de commando's
  base = base.replace("5001", "5002");

  const options: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) options.body = JSON.stringify(body);

  try {
    // console.log(`Stuur commando naar: ${base}${path}`); // Zet aan voor debuggen
    const res = await fetch(`${base}${path}`, options);
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } catch (err) {
    console.warn("API 5002 Error:", err);
    // We gooien geen error hier, zodat de app niet crasht als de robot even uit staat
    return null;
  }
}

// Al je functies bij elkaar
export const Pi = {
  health: () => api("/health"),

  // --- ROBOT BESTURING (Gebruikt nu apiCommand -> Poort 5002) ---
  move: (dir: string) => apiCommand(`/move/${dir}`),
  stop: () => apiCommand(`/move/stop`),

  // --- DEMO SCENARIO (Gebruikt apiCommand -> Poort 5002) ---
  // Dit start de lichtjes (Wit -> Oranje -> Rood)
  startReminder: () => apiCommand("/move/reminder_start"),
  // Dit stopt de lichtjes
  stopReminder: () => apiCommand("/move/reminder_stop"),

  // --- MEDICIJNEN (Blijft op api -> Poort 5001) ---
  getMeds: () => api("/medicijnen"),
  confirmMed: (id: number) => api(`/medicijnen/${id}/bevestig`, "POST"),
  addMed: (naam: string) => api(`/medicijnen`, "POST", { naam }),
};