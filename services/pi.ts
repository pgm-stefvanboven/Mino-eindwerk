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

// --- FUNCTION 1: For Port 5001 (Medicines & Video) ---
async function api(path: string, method: string = "GET", body?: any) {
  const base = await getPiBaseUrl(); // This is ...:5001

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

// --- FUNCTION 2: For Port 5002 (Control & Reminder) ---
// This function takes the URL from above but changes 5001 to 5002
async function apiCommand(path: string, method: string = "GET", body?: any) {
  let base = await getPiBaseUrl();

  // TRICK: We replace port 5001 with 5002 for commands
  base = base.replace("5001", "5002");

  const options: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) options.body = JSON.stringify(body);

  try {
    // console.log(`Send command to: ${base}${path}`); // only for debugging
    const res = await fetch(`${base}${path}`, options);
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } catch (err) {
    console.warn("API 5002 Error:", err);
    return null;
  }
}

// All the functions together
export const Pi = {
  health: () => api("/health"),

  // --- ROBOT CONTROL (uses apiCommand -> Port 5002) ---
  move: (dir: string) => apiCommand(`/move/${dir}`),
  stop: () => apiCommand(`/move/stop`),

  // --- DEMO SCENARIO (uses apiCommand -> Port 5002) ---
  // This starts the lights (White -> Orange -> Red)
  startReminder: () => apiCommand("/move/reminder_start"),
  // this stops the lights
  stopReminder: () => apiCommand("/move/reminder_stop"),

  // --- MEDICINES (Stays on api -> Port 5001) ---
  getMeds: () => api("/medicijnen"),
  confirmMed: (id: number) => api(`/medicijnen/${id}/bevestig`, "POST"),
  addMed: (naam: string) => api(`/medicijnen`, "POST", { naam }),
};