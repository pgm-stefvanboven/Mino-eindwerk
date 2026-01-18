/* eslint-disable @typescript-eslint/no-unused-vars */
import AsyncStorage from "@react-native-async-storage/async-storage";

export type Medication = {
  id: string;
  name: string;
  dosage: string;
  stock: number;
  isOrdered?: boolean;
};

const STORAGE_KEY = "MEDICATION_DB_STOCK";

// Demo med ID (altijd bevestigbaar in de UI)
export const DEMO_MED_ID = "6";

// 1. The standard database (if you reset the app)
export const INITIAL_GLOBAL_MEDS: Medication[] = [
  { id: "1", name: "Paracetamol", dosage: "500mg", stock: 24 },
  { id: "2", name: "Ibuprofen", dosage: "400mg", stock: 5 }, // Almost out!
  { id: "3", name: "Metoprolol", dosage: "50mg", stock: 8 }, // Almost out!
  { id: "4", name: "Vitamin D", dosage: "10mcg", stock: 60 },
  { id: "5", name: "Dafalgan Forte", dosage: "1g", stock: 30 },

  // DEMO: altijd bevestigbaar scenario gebruikt dit medicijn
  { id: "6", name: "Dafalgan Forte", dosage: "1g", stock: 15 },
];

// 2. The daily schedule (link times to Medication IDs)
export const DAILY_SCHEDULE = [
  { id: 101, medId: "1", time: "08:00", amount: "3x" }, // 3x Paracetamol
  { id: 102, medId: "3", time: "12:00", amount: "1x" }, // 1x Metoprolol
  { id: 104, medId: "2", time: "18:00", amount: "1x" }, // 1x Ibuprofen
  { id: 103, medId: "4", time: "20:00", amount: "2x" }, // 2x Vitamin D
  { id: 105, medId: "5", time: "22:00", amount: "1x" }, // 1x Dafalgan (normaal)
  { id: 106, medId: "6", time: "DEMO", amount: "1x" }, // DEMO: altijd bevestigbaar
];

// --- FUNCTIONS FOR THE SCREENS ---

// Merge helper: zorg dat nieuwe meds (zoals id "6") altijd worden toegevoegd
const mergeMeds = (stored: Medication[], base: Medication[]) => {
  const map = new Map<string, Medication>();
  for (const m of stored) map.set(m.id, m);

  // Voeg ontbrekende meds toe vanuit base
  for (const b of base) {
    if (!map.has(b.id)) map.set(b.id, b);
  }

  return Array.from(map.values());
};

// Get list (from memory or reset)
export const getMedications = async (): Promise<Medication[]> => {
  try {
    const json = await AsyncStorage.getItem(STORAGE_KEY);

    if (json) {
      const stored: Medication[] = JSON.parse(json);

      // Migratie: voeg ontbrekende default meds toe (zoals demo id "6")
      const merged = mergeMeds(stored, INITIAL_GLOBAL_MEDS);

      // Sla terug op als er iets bijgekomen is
      if (merged.length !== stored.length) {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      }
      return merged;
    } else {
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(INITIAL_GLOBAL_MEDS),
      );
      return INITIAL_GLOBAL_MEDS;
    }
  } catch (e) {
    return INITIAL_GLOBAL_MEDS;
  }
};

// Save list
export const saveMedications = async (meds: Medication[]) => {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(meds));
};

// Smart function: decrease stock based on ID and text (e.g. "3x" or "2x")
export const decreaseStock = async (medId: string, amountStr: string) => {
  const meds = await getMedications();

  // Extract the number from the string (e.g. "2x" -> 2)
  const amount = parseInt(amountStr.replace("x", "")) || 1;

  const updatedMeds = meds.map((m) => {
    if (m.id === medId) {
      const newStock = Math.max(0, m.stock - amount);
      return { ...m, stock: newStock };
    }
    return m;
  });

  await saveMedications(updatedMeds);
};