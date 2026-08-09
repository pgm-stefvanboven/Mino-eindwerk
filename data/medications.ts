import { supabase } from "../lib/supabase";

export type Medication = {
  id: string;
  name: string;
  dosage: string;
  stock: number;
  isOrdered?: boolean;
  lastScannedAt?: number; // Houdt bij wanneer de barcode voor het laatst is gescand
};

// Demo med ID (altijd bevestigbaar in de UI)
export const DEMO_MED_ID = "6";

// 1. The standard database (if you reset the app)
export const INITIAL_GLOBAL_MEDS: Medication[] = [
  {
    id: "1",
    name: "Paracetamol",
    dosage: "500mg",
    stock: 24,
    isOrdered: false,
  },
  { id: "2", name: "Ibuprofen", dosage: "400mg", stock: 5, isOrdered: false },
  { id: "3", name: "Metoprolol", dosage: "50mg", stock: 8, isOrdered: false },
  { id: "4", name: "Vitamin D", dosage: "10mcg", stock: 60, isOrdered: false },
  {
    id: "5",
    name: "Dafalgan Forte",
    dosage: "1g",
    stock: 30,
    isOrdered: false,
  },

  // DEMO: altijd bevestigbaar scenario gebruikt dit medicijn
  {
    id: "6",
    name: "Dafalgan Forte",
    dosage: "1g",
    stock: 15,
    isOrdered: false,
  },
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

// Get list (from Supabase)
export const getMedications = async (): Promise<Medication[]> => {
  try {
    const { data, error } = await supabase
      .from("medications")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      console.error("Fout bij ophalen uit Supabase:", error.message);
      return INITIAL_GLOBAL_MEDS;
    }

    // Als de cloud database nog helemaal leeg is, vul deze dan met de default meds
    if (!data || data.length === 0) {
      console.log(
        "Database is leeg, INITIAL_GLOBAL_MEDS worden in de cloud gezet...",
      );
      await supabase.from("medications").insert(INITIAL_GLOBAL_MEDS);
      return INITIAL_GLOBAL_MEDS;
    }

    return data as Medication[];
  } catch (e) {
    console.error("Netwerk of onverwachte fout bij ophalen meds:", e);
    return INITIAL_GLOBAL_MEDS;
  }
};

// Save / Update list (to Supabase)
export const saveMedications = async (meds: Medication[]) => {
  try {
    // Upsert zal bestaande ID's updaten en nieuwe ID's toevoegen
    const { error } = await supabase.from("medications").upsert(meds);

    if (error) {
      console.error("Fout bij opslaan in Supabase:", error.message);
    }
  } catch (e) {
    console.error("Netwerk of onverwachte fout bij opslaan meds:", e);
  }
};

// Delete single medication (from Supabase)
export const deleteMedication = async (id: string) => {
  try {
    const { error } = await supabase.from("medications").delete().eq("id", id);

    if (error) {
      console.error("Fout bij verwijderen uit Supabase:", error.message);
    }
  } catch (e) {
    console.error("Netwerk of onverwachte fout bij verwijderen med:", e);
  }
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