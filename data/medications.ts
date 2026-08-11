import { supabase } from "../lib/supabase";

export type Medication = {
  id: string;
  name: string;
  dosage: string;
  stock: number;
  isOrdered?: boolean;
  lastScannedAt?: number;
};

export type ScheduleItem = {
  id: number;
  medId: string;
  time: string;
  amount: string;
};

export const DEMO_MED_ID = "6";

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
  {
    id: "6",
    name: "Dafalgan Forte",
    dosage: "1g",
    stock: 15,
    isOrdered: false,
  },
];

export const DAILY_SCHEDULE: ScheduleItem[] = [
  { id: 101, medId: "1", time: "08:00", amount: "3x" },
  { id: 102, medId: "3", time: "12:00", amount: "1x" },
  { id: 104, medId: "2", time: "18:00", amount: "1x" },
  { id: 103, medId: "4", time: "20:00", amount: "2x" },
  { id: 105, medId: "5", time: "22:00", amount: "1x" },
  { id: 106, medId: "6", time: "DEMO", amount: "1x" },
];

// --- MEDICATIE SUPABASE FUNCTIES ---

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

    if (!data || data.length === 0) {
      await supabase.from("medications").insert(INITIAL_GLOBAL_MEDS);
      return INITIAL_GLOBAL_MEDS;
    }

    return data as Medication[];
  } catch (e) {
    console.error("Netwerk of onverwachte fout bij ophalen meds:", e);
    return INITIAL_GLOBAL_MEDS;
  }
};

export const updateMedication = async (med: Medication) => {
  try {
    const { error } = await supabase
      .from("medications")
      .update({
        name: med.name,
        dosage: med.dosage,
        stock: med.stock,
        isOrdered: med.isOrdered,
        lastScannedAt: med.lastScannedAt,
      })
      .eq("id", med.id);

    if (error) console.error("Fout bij updaten medicijn:", error.message);
  } catch (e) {
    console.error("Netwerk of onverwachte fout bij updaten med:", e);
  }
};

export const addMedication = async (med: Medication) => {
  try {
    const { error } = await supabase.from("medications").insert([med]);
    if (error) console.error("Fout bij toevoegen medicijn:", error.message);
  } catch (e) {
    console.error("Netwerk of onverwachte fout bij toevoegen med:", e);
  }
};

export const saveMedications = async (meds: Medication[]) => {
  try {
    const { error } = await supabase.from("medications").upsert(meds);
    if (error) console.error("Fout bij opslaan in Supabase:", error.message);
  } catch (e) {
    console.error("Netwerk of onverwachte fout bij opslaan meds:", e);
  }
};

export const deleteMedication = async (id: string) => {
  try {
    const { error } = await supabase.from("medications").delete().eq("id", id);
    if (error)
      console.error("Fout bij verwijderen uit Supabase:", error.message);
  } catch (e) {
    console.error("Netwerk of onverwachte fout bij verwijderen med:", e);
  }
};

export const decreaseStock = async (medId: string, amountStr: string) => {
  const meds = await getMedications();
  const targetMed = meds.find((m) => m.id === medId);
  if (!targetMed) return;

  const amount = parseInt(amountStr.replace("x", "")) || 1;
  const newStock = Math.max(0, targetMed.stock - amount);
  const updatedMed = { ...targetMed, stock: newStock };

  await updateMedication(updatedMed);
};

// --- NIEUW: SCHEMA (DAILY SCHEDULE) SUPABASE FUNCTIES ---

export const getDailySchedule = async (): Promise<ScheduleItem[]> => {
  try {
    const { data, error } = await supabase
      .from("daily_schedule")
      .select("*")
      .order("time", { ascending: true });

    if (error || !data || data.length === 0) {
      // Vul Supabase aan indien de tabel leeg is
      if (!data || data.length === 0) {
        await supabase.from("daily_schedule").insert(DAILY_SCHEDULE);
      }
      return DAILY_SCHEDULE;
    }

    return data as ScheduleItem[];
  } catch (e) {
    console.error("Fout bij ophalen schema uit Supabase:", e);
    return DAILY_SCHEDULE;
  }
};

export const updateScheduleItem = async (item: ScheduleItem) => {
  try {
    const { error } = await supabase
      .from("daily_schedule")
      .update({ time: item.time, amount: item.amount })
      .eq("id", item.id);

    if (error) console.error("Fout bij bijwerken schema item:", error.message);
  } catch (e) {
    console.error("Fout bij bijwerken schema item:", e);
  }
};

export const deleteScheduleItem = async (id: number) => {
  try {
    const { error } = await supabase
      .from("daily_schedule")
      .delete()
      .eq("id", id);

    if (error)
      console.error("Fout bij verwijderen schema item:", error.message);
  } catch (e) {
    console.error("Fout bij verwijderen schema item:", e);
  }
};
