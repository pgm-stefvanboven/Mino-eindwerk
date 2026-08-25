/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import * as Notifications from "expo-notifications";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState, useRef } from "react";
import { CameraView, useCameraPermissions } from "expo-camera";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRole } from "../../context/RoleContext";
import {
  decreaseStock,
  getDailySchedule,
  getMedications,
  deleteScheduleItem,
  updateScheduleItem,
  Medication,
  ScheduleItem,
} from "../../data/medications";
import { supabase } from "../../lib/supabase";
import { Pi } from "../../services/pi";

type Task = {
  id: number;
  time: string;
  name: string;
  taken: boolean;
  medId: string;
  amount: string;
};

const DEMO_MISS_LIMIT_SECONDS = 120;
const ROBOT_API_URL = "http://172.31.149.75:5001";

const ESCALATION_GRACE_MS = 30000;
const CLAIM_TTL_MS = 15000;
const FRESH_TRIGGER_WINDOW_SECONDS = 600; // 10 minutes
const MISSED_CHECKINS_BEFORE_ESCALATION = 2;

// --- DATE LOGIC ---
const isSameDay = (d1: Date, d2: Date) =>
  d1.getDate() === d2.getDate() &&
  d1.getMonth() === d2.getMonth() &&
  d1.getFullYear() === d2.getFullYear();
const isToday = (date: Date) => isSameDay(date, new Date());
const isPastDate = (date: Date) => {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return date < t;
};
// Lokale datum als YYYY-MM-DD
const toLocalDateStr = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

// --- DAGTELLER VOOR GEMISTE MOMENTEN (mantelzorg-drempel) ---
type DailyTally = {
  count: number;
  status: "idle" | "escalating";
  claimTs?: number;
};

const getDailyTallyKey = (dateStr: string) => `daily_missed_tally_${dateStr}`;

const readDailyTally = async (dateStr: string): Promise<DailyTally> => {
  const raw = await AsyncStorage.getItem(getDailyTallyKey(dateStr));
  if (!raw) return { count: 0, status: "idle" };
  try {
    return JSON.parse(raw);
  } catch {
    return { count: 0, status: "idle" };
  }
};

const writeDailyTally = async (dateStr: string, tally: DailyTally) => {
  await AsyncStorage.setItem(getDailyTallyKey(dateStr), JSON.stringify(tally));
};

export default function VandaagScreen() {
  const { role } = useRole();
  const router = useRouter();
  const params = useLocalSearchParams<{ privacyAlert?: string }>();

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [now, setNow] = useState(new Date());
  const [showDemoModal, setShowDemoModal] = useState(false);
  const [privacyModalVisible, setPrivacyModalVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [lowStockMeds, setLowStockMeds] = useState<Medication[]>([]);
  const [takingMedication, setTakingMedication] = useState<number | null>(null);
  const [emergencyActive, setEmergencyActive] = useState(false);
  const [demoMissedCount, setDemoMissedCount] = useState<number>(0);
  const [alarmStage, setAlarmStage] = useState<
    "idle" | "reminder" | "waiting" | "emergency"
  >("idle");
  const automaticMissedProcessing = useRef<Set<string>>(new Set());
  const triggeredReminders = useRef<Set<string>>(new Set());

  const dailyTallyMutex = useRef<Promise<void>>(Promise.resolve());
  const [scheduleLocked, setScheduleLocked] = useState(false);
  const [taskStages, setTaskStages] = useState<{ [taskId: number]: string }>({});

  // STATE VOOR BEWERKMODAL INNAMEMOMENT
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editTime, setEditTime] = useState("");
  const [editAmount, setEditAmount] = useState("");
  // Bepaalt of de velden bewerkbaar zijn (knop toont "Bewerken" vs "Bewaar")
  const [isEditingSchedule, setIsEditingSchedule] = useState(false);

  const [permission, requestPermission] = useCameraPermissions();
  const [showScanner, setShowScanner] = useState(false);
  const [scanningTaskId, setScanningTaskId] = useState<number | null>(null);

  const [contact, setContact] = useState({
    name: "",
    relation: "",
    phone: "",
  });

  // Reset het rode bolletje (badge '1') zodra de patiënt het scherm bekijkt
  useEffect(() => {
    if (role === "patient") {
      Notifications.setBadgeCountAsync(0).catch(() => { });
    }
  }, [role]);

  // Update klok elke seconde (zorgt voor live aftellen)
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!params.privacyAlert) return;
    setPrivacyModalVisible(true);
    router.setParams({ privacyAlert: undefined } as any);
  }, [params.privacyAlert]);

  // LUISTER NAAR SCHEDULE_LOCKED IN SHARED_SETTINGS
  useEffect(() => {
    const checkScheduleLock = async () => {
      const { data } = await supabase
        .from("shared_settings")
        .select("schedule_locked")
        .eq("id", 1)
        .single();
      if (data) {
        setScheduleLocked(data.schedule_locked ?? false);
      }
    };

    checkScheduleLock();

    const lockChannelName = `home-schedule-lock-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(lockChannelName)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "shared_settings" },
        (payload) => {
          if (payload.new.schedule_locked !== undefined) {
            setScheduleLocked(payload.new.schedule_locked);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (role !== "patient") return;

    let isActive = true;
    let wasUnlocked = false;

    const applyStatus = (
      emergencyUnlocked: boolean,
      alwaysEnabled: boolean,
    ) => {
      const isUnlocked = emergencyUnlocked && !alwaysEnabled;
      if (isUnlocked && !wasUnlocked) {
        setPrivacyModalVisible(true);
        setEmergencyActive(true);
        setAlarmStage("emergency");
      } else if (!isUnlocked && wasUnlocked) {
        setPrivacyModalVisible(false);
      }
      wasUnlocked = isUnlocked;
    };

    const loadCameraStatus = async () => {
      const { data } = await supabase
        .from("shared_settings")
        .select("emergency_camera_unlocked, camera_always_enabled")
        .eq("id", 1)
        .single();

      if (data && isActive) {
        applyStatus(data.emergency_camera_unlocked, data.camera_always_enabled);
      }
    };

    loadCameraStatus();

    const channelName = `home-camera-status-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "shared_settings" },
        (payload) => {
          if (!isActive) return;
          const updated = payload.new as {
            emergency_camera_unlocked: boolean;
            camera_always_enabled: boolean;
          };
          applyStatus(
            updated.emergency_camera_unlocked,
            updated.camera_always_enabled,
          );
        },
      )
      .subscribe();

    return () => {
      isActive = false;
      supabase.removeChannel(channel);
    };
  }, [role]);

  useEffect(() => {
    if (role === "mantelzorger") return;
    if (!isToday(selectedDate)) return;

    const needsWarning = lowStockMeds.some(
      (med) => med.stock < 10 && !med.isOrdered,
    );

    if (!needsWarning) return;

    const triggerWarningOncePerDay = async () => {
      const todayKey = `inventory_warning_played_${new Date().toDateString()}`;
      const hasPlayedToday = await AsyncStorage.getItem(todayKey);

      if (hasPlayedToday) return;

      await AsyncStorage.setItem(todayKey, "true");

      fetch(`${ROBOT_API_URL}/inventory_warning`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }).catch((error) => {
        console.error("Inventory warning kon niet worden afgespeeld:", error);
      });
    };

    triggerWarningOncePerDay();
  }, [lowStockMeds, selectedDate, role]);

  const isTooFarBack = () => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    const l = new Date(t);
    l.setDate(t.getDate() - 7);
    return selectedDate <= l;
  };

  const isTooFarFuture = () => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    const l = new Date(t);
    l.setDate(t.getDate() + 7);
    return selectedDate >= l;
  };

  // 1. OPHALEN VAN DATA (MEDICIJNEN + INNAMEMOMENTEN UIT SUPABASE)
  const loadData = useCallback(async () => {
    setIsLoading(true);

    const { data: contactData, error: contactError } = await supabase
      .from("shared_settings")
      .select("contact_name, contact_relation, contact_phone")
      .eq("id", 1)
      .single();

    if (contactData && !contactError) {
      setContact({
        name: contactData.contact_name || "",
        relation: contactData.contact_relation || "",
        phone: contactData.contact_phone || "",
      });
    }

    const currentMeds = await getMedications();
    setLowStockMeds(currentMeds.filter((m) => m.stock < 10));

    // OPHALEN UIT DYNAMISCHE SUPABASE TABEL DAILY_SCHEDULE
    const rawSchedule = await getDailySchedule();

    const dateKey = `tasks_${selectedDate.toDateString()}`;
    const savedData = await AsyncStorage.getItem(dateKey);

    let currentTasks: Task[] = rawSchedule.map((scheduleItem) => {
      const med = currentMeds.find((m) => m.id === scheduleItem.medId);

      let medName = med ? med.name : "Onbekend";
      if (!med && scheduleItem.medId === "6") {
        medName = "Dafalgan Forte";
      }

      return {
        id: scheduleItem.id,
        time: scheduleItem.time,
        name: `${scheduleItem.amount} ${medName}`,
        medId: scheduleItem.medId,
        amount: scheduleItem.amount,
        taken: false,
      };
    });

    const dateStr = toLocalDateStr(selectedDate);
    const stagesMap: { [taskId: number]: string } = {};
    let highestAlarm: "idle" | "reminder" | "waiting" | "emergency" = "idle";

    for (const t of currentTasks) {
      const sKey = `automatic_missed_${dateStr}_${t.id}`;
      const raw = await AsyncStorage.getItem(sKey);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          stagesMap[t.id] = parsed.stage;
          if (parsed.stage === "second_reminder" && highestAlarm === "idle") {
            highestAlarm = "waiting";
          } else if (parsed.stage === "emergency" || parsed.stage === "emergency_sending") {
            highestAlarm = "emergency";
          }
        } catch {
          stagesMap[t.id] = raw;
        }
      }
    }
    setTaskStages(stagesMap);
    setAlarmStage(highestAlarm);

    if (savedData) {
      const savedTasks: Task[] = JSON.parse(savedData);
      currentTasks = currentTasks.map((t) => {
        if (t.id === 106) return { ...t, taken: false };

        const saved = savedTasks.find((st) => st.id === t.id);
        return saved ? { ...t, taken: saved.taken } : t;
      });
    } else if (isPastDate(selectedDate)) {
      currentTasks = currentTasks.map((t) => ({
        ...t,
        taken: t.id === 106 ? false : Math.random() > 0.2,
      }));
      await AsyncStorage.setItem(dateKey, JSON.stringify(currentTasks));
    }

    // SYNCHRONISATIE MET SUPABASE MEDICATION_LOGS
    try {
      const dateStr = selectedDate.toISOString().split("T")[0];
      const { data: dbLogs, error: logErr } = await supabase
        .from("medication_logs")
        .select("*")
        .eq("date", dateStr);

      if (dbLogs && dbLogs.length > 0 && !logErr) {
        currentTasks = currentTasks.map((t) => {
          if (t.id === 106) return { ...t, taken: false };
          const log = dbLogs.find((l: any) => l.task_id === t.id);
          return log ? { ...t, taken: log.taken } : t;
        });
      }
    } catch (e) {
      console.log("Fout bij ophalen logs uit Supabase:", e);
    }

    setTasks(currentTasks);
    setIsLoading(false);
  }, [selectedDate]);

  // 2. REALTIME LISTENERS FOR DAILY_SCHEDULE, LOGS AND MEDICATIONS
  useEffect(() => {
    const channelName = `home-realtime-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "daily_schedule" },
        () => {
          loadData();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "medication_logs" },
        () => {
          loadData();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "medications" },
        () => {
          loadData();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  // --- STATUS LOGIC MET DEMO AFHANDELING ---
  const getTaskStatus = (task: Task) => {
    if (task.taken) return "TAKEN";

    if (task.time === "DEMO") return "ACTIONABLE";

    if (isPastDate(selectedDate)) return "MISSED_HISTORIC";
    if (!isToday(selectedDate) && !isPastDate(selectedDate))
      return "FUTURE_DAY";

    const [hours, minutes] = task.time.split(":").map(Number);
    const taskTime = new Date(selectedDate);
    taskTime.setHours(hours, minutes, 0, 0);

    const fiveMinBefore = new Date(taskTime.getTime() - 5 * 60 * 1000);
    const missLimit = new Date(
      taskTime.getTime() + DEMO_MISS_LIMIT_SECONDS * 1000,
    );

    if (now >= fiveMinBefore && now < taskTime) return "UPCOMING";
    if (now >= taskTime && now <= missLimit) return "ACTIONABLE";
    if (now > missLimit) return "MISSED_TODAY";
    return "WAITING";
  };

  // --- AUTOMATISCHE ZORGSCENARIO FLOW BIJ GEMISTE MEDICATIE ---
  useEffect(() => {
    if (role !== "patient" || !isToday(selectedDate)) return;

    tasks.forEach((task) => {
      if (task.taken || task.time === "DEMO") return;

      const [hours, minutes] = task.time.split(":").map(Number);
      const taskTime = new Date(selectedDate);
      taskTime.setHours(hours, minutes, 0, 0);

      const diffSeconds = (now.getTime() - taskTime.getTime()) / 1000;
      const dateStr = toLocalDateStr(selectedDate);
      const triggerKey = `${dateStr}_${task.id}`;

      // 1. Eerste herinnering (0 - 5 seconden na innametijd)
      if (diffSeconds >= 0 && diffSeconds < 5) {
        if (!triggeredReminders.current.has(triggerKey)) {
          triggeredReminders.current.add(triggerKey);

          // Reset oude testdata voor dit moment zodat de 2e herinnering gegarandeerd afgaat
          AsyncStorage.removeItem(`automatic_missed_${dateStr}_${task.id}`).catch(() => { });

          fetch(`${ROBOT_API_URL}/start_reminder`, { method: "POST" }).catch((err) => {
            console.error("Kon start_reminder niet bereiken:", err);
          });
        }
      }

      // 2. Tweede herinnering & inhaalvenster na 2 minuten (120s)
      if (diffSeconds >= DEMO_MISS_LIMIT_SECONDS) {
        handleAutomaticMissedMedication(task);
      }
    });
  }, [now, tasks, selectedDate, role]);

  // --- BEWERKEN & VERWIJDEREN LOGICA VOOR INNAMEMOMENTEN ---
  const handleOpenEditModal = (task: Task) => {
    const status = getTaskStatus(task);

    // BEVEILIGING: Niet meer bewerkbaar als het moment al voorbij of ingenomen is
    if (status === "TAKEN" || status.includes("MISSED")) {
      return;
    }

    if (role === "patient" && scheduleLocked) {
      Alert.alert(
        "Vergrendeld",
        "Het aanpassen van innamemomenten is vergrendeld door de mantelzorger.",
      );
      return;
    }
    setEditingTask(task);
    setEditTime(task.time);
    setEditAmount(task.amount);
    setIsEditingSchedule(false);
  };

  const handleEditTimeChange = (text: string) => {
    const digitsOnly = text.replace(/[^0-9]/g, "").slice(0, 4);
    const formatted =
      digitsOnly.length >= 3
        ? `${digitsOnly.slice(0, 2)}:${digitsOnly.slice(2)}`
        : digitsOnly;
    setEditTime(formatted);
  };

  // Enkel cijfers en 'x' toestaan (formaat "2x", "3x", ...).
  const handleEditAmountChange = (text: string) => {
    const sanitized = text
      .toLowerCase()
      .replace(/[^0-9x]/g, "")
      .slice(0, 4);
    setEditAmount(sanitized);
  };

  const isValidTimeFormat = (timeStr: string): boolean =>
    /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(timeStr);

  const isTimeInPast = (timeStr: string): boolean => {
    if (!isToday(selectedDate)) return false;
    if (!isValidTimeFormat(timeStr)) return false;

    const [hh, mm] = timeStr.split(":").map(Number);
    const candidate = new Date(selectedDate);
    candidate.setHours(hh, mm, 0, 0);

    return candidate.getTime() < new Date().getTime();
  };

  const withDailyTallyLock = <T,>(fn: () => Promise<T>): Promise<T> => {
    const run = dailyTallyMutex.current.then(fn, fn);
    dailyTallyMutex.current = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  };

  const sendCareEmergencyNotification = async () => {
    setAlarmStage("emergency");
    setEmergencyActive(true);
    await AsyncStorage.setItem("CAMERA_EMERGENCY_ACCESS", "true");

    const res = await fetch(`${ROBOT_API_URL}/care_emergency`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error(`Server retourneerde HTTP ${res.status}`);
  };

  const registerMissedCheckIn = (dateStr: string) =>
    withDailyTallyLock(async () => {
      const tally = await readDailyTally(dateStr);
      const newCount = tally.count + 1;

      if (newCount < MISSED_CHECKINS_BEFORE_ESCALATION) {
        await writeDailyTally(dateStr, { count: newCount, status: "idle" });
        console.log(
          `ℹ️ Gemist moment ${newCount}/${MISSED_CHECKINS_BEFORE_ESCALATION} vandaag — mantelzorger nog niet verwittigd.`
        );
        return;
      }

      console.log(
        `🚨 ${newCount} gemiste momenten vandaag → mantelzorger wordt verwittigd (derde melding).`
      );

      await writeDailyTally(dateStr, {
        count: newCount,
        status: "escalating",
        claimTs: Date.now(),
      });

      try {
        await sendCareEmergencyNotification();
        await writeDailyTally(dateStr, { count: 0, status: "idle" });
      } catch (err) {
        console.error(
          "Fout bij versturen mantelzorgmelding (wordt hervat op een volgende tick):",
          err
        );
      }
    });

  const retryStaleDailyEscalation = (dateStr: string) =>
    withDailyTallyLock(async () => {
      const tally = await readDailyTally(dateStr);
      if (tally.status !== "escalating") return;
      if (!tally.claimTs || Date.now() - tally.claimTs < CLAIM_TTL_MS) return;

      console.log("🔁 Vorige mantelzorgmelding niet bevestigd → opnieuw proberen.");
      try {
        await sendCareEmergencyNotification();
        await writeDailyTally(dateStr, { count: 0, status: "idle" });
      } catch (err) {
        console.error("Herhaalde poging mantelzorgmelding mislukt:", err);
        await writeDailyTally(dateStr, { ...tally, claimTs: Date.now() });
      }
    });

  const resolveEmergency = async () => {
    try {
      const dateStr = toLocalDateStr(selectedDate);

      // 1. Sluit de noodtoegang tot de camera in Supabase
      await supabase
        .from("shared_settings")
        .update({ emergency_camera_unlocked: false })
        .eq("id", 1);

      // 2. Resetting the daily counter: The caregiver has confirmed this, so two more missed moments are needed before the next notification.
      await writeDailyTally(dateStr, { count: 0, status: "idle" });

      await AsyncStorage.removeItem("CAMERA_EMERGENCY_ACCESS");

      setEmergencyActive(false);
      setAlarmStage("idle");

      // 3. Log Notifications
      await supabase.from("notifications").insert([
        {
          title: "Situatie hersteld",
          body: "De gebruiker heeft bevestigd dat alles in orde is. Noodstatus is beëindigd.",
          type: "medication",
          read: false,
        },
      ]);

      Alert.alert("Noodsituatie beëindigd", "Het systeem staat weer in normale werking en de camera is vergrendeld.");
    } catch (e) {
      console.error("Fout bij oplossen noodsituatie:", e);
    }
  };

  const notifyCaregiverOfScheduleChange = async (
    title: string,
    body: string,
  ) => {
    await supabase.from("notifications").insert([
      {
        title,
        body,
        type: "schedule_change",
        read: false,
      },
    ]);

    try {
      const { data: settings, error: settingsError } = await supabase
        .from("shared_settings")
        .select("caregiver_push_token")
        .eq("id", 1)
        .single();

      if (settingsError) {
        console.error(
          "Fout bij ophalen caregiver_push_token:",
          settingsError,
        );
      }

      if (settings?.caregiver_push_token) {
        await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Accept-encoding": "gzip, deflate",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to: settings.caregiver_push_token,
            sound: "default",
            title,
            body,
            data: { type: "schedule_change" },
          }),
        });
      }
    } catch (e) {
      console.error("Fout bij versturen push naar mantelzorger:", e);
    }
  };

  const handleSaveTaskEdit = async () => {
    if (!editingTask) return;

    // Not in edit mode yet? First tap = just unlock the fields.
    if (!isEditingSchedule) {
      setIsEditingSchedule(true);
      return;
    }

    if (!isValidTimeFormat(editTime)) {
      Alert.alert(
        "Ongeldig tijdstip",
        "Gebruik het formaat UU:MM (bv. 08:00), enkel cijfers.",
      );
      return;
    }

    if (isTimeInPast(editTime)) {
      Alert.alert(
        "Tijdstip ligt in het verleden",
        "Je kan een innamemoment niet instellen op een tijdstip dat vandaag al voorbij is.",
      );
      return;
    }

    const amountNumber = parseInt(editAmount, 10);
    if (!amountNumber || amountNumber < 1) {
      Alert.alert(
        "Ongeldige hoeveelheid",
        "De hoeveelheid moet minstens 1 zijn.",
      );
      return;
    }

    const isTimeChanged = editingTask.time !== editTime;
    const oldTime = editingTask.time;

    // 1. Update the daily_schedule table in Supabase
    await updateScheduleItem({
      id: editingTask.id,
      medId: editingTask.medId,
      time: editTime,
      amount: editAmount,
    });

    // 2. If the patient has changed the time of administration: NOTIFY THE CAREGIVER!
    if (isTimeChanged && role === "patient") {
      const cleanMedName = editingTask.name.replace(/^[0-9]+x\s*/, "");
      await notifyCaregiverOfScheduleChange(
        "⏰ Innamemoment gewijzigd",
        `De patiënt heeft het innametijdstip van ${cleanMedName} aangepast van ${oldTime} naar ${editTime}.`,
      );
    }

    setIsEditingSchedule(false);
    setEditingTask(null);
    loadData();
  };

  const handleDeleteTask = async () => {
    if (!editingTask) return;

    Alert.alert(
      "Innamemoment Verwijderen",
      `Weet je zeker dat je het innamemoment (${editingTask.time}) voor ${editingTask.name} wilt verwijderen?`,
      [
        { text: "Annuleren", style: "cancel" },
        {
          text: "Verwijderen",
          style: "destructive",
          onPress: async () => {
            await deleteScheduleItem(editingTask.id);

            if (role === "patient") {
              await notifyCaregiverOfScheduleChange(
                "🗑️ Innamemoment verwijderd",
                `De patiënt heeft het innamemoment om ${editingTask.time} voor ${editingTask.name} verwijderd.`,
              );
            }

            setEditingTask(null);
            loadData();
          },
        },
      ],
    );
  };

  // --- AUTOMATISCHE LOKALE MELDING ENKEL EN ALLEEN VOOR DE PATIËNT ---
  useEffect(() => {
    if (role !== "patient" || !isToday(selectedDate)) return;

    tasks.forEach((task) => {
      if (task.taken) return;
      const status = getTaskStatus(task);

      if (status === "UPCOMING") {
        const title = "⏰ Bijna tijd voor medicatie!";
        const body = `Het is over 5 minuten tijd om ${task.name} in te nemen.`;
        const dateStr = toLocalDateStr(selectedDate);

        supabase
          .from("notifications")
          .upsert(
            {
              title,
              body,
              type: "reminder_5min",
              task_id: task.id,
              reminder_date: dateStr,
              read: false,
            },
            {
              onConflict: "task_id,reminder_date,type",
              ignoreDuplicates: true,
            },
          )
          .then(({ error: notifError }) => {
            if (notifError) {
              console.error(
                "Fout bij opslaan 5-min herinnering in Supabase:",
                notifError,
              );
            }
          });

      }
    });
  }, [now, tasks, selectedDate, role]);

  useEffect(() => {
    if (role !== "patient" || !isToday(selectedDate)) return;

    tasks.forEach(async (task) => {
      const identifier = `reminder-${toLocalDateStr(selectedDate)}-${task.id}`;

      if (task.taken || task.time === "DEMO") {
        await Notifications.cancelScheduledNotificationAsync(
          identifier,
        ).catch(() => { });
        return;
      }

      const [hours, minutes] = task.time.split(":").map(Number);
      const taskTime = new Date(selectedDate);
      taskTime.setHours(hours, minutes, 0, 0);
      const triggerDate = new Date(taskTime.getTime() - 5 * 60 * 1000);

      // Is it already past that time? There's nothing left to schedule.
      if (triggerDate.getTime() <= Date.now()) {
        await Notifications.cancelScheduledNotificationAsync(
          identifier,
        ).catch(() => { });
        return;
      }

      if (taskTime.getTime() > Date.now()) {
        await Notifications.scheduleNotificationAsync({
          identifier: `reminder-exact-${toLocalDateStr(selectedDate)}-${task.id}`,
          content: {
            title: "💊 Tijd voor je medicatie!",
            body: `Neem nu je ${task.name} in via Mino.`,
            sound: "default",
            badge: 1,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: taskTime,
          },
        });
      }

      await Notifications.scheduleNotificationAsync({
        identifier,
        content: {
          title: "⏰ Bijna tijd voor medicatie!",
          body: `Het is over 5 minuten tijd om ${task.name} in te nemen.`,
          sound: "default",
          badge: 1,
          data: { type: "reminder_5min", route: "/notifications" },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: triggerDate,
        },
      });
    });
  }, [tasks, selectedDate, role]);

  const changeDate = (days: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + days);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const limitPast = new Date(today);
    limitPast.setDate(today.getDate() - 7);
    const limitFuture = new Date(today);
    limitFuture.setDate(today.getDate() + 7);

    if (
      (days < 0 && newDate < limitPast) ||
      (days > 0 && newDate > limitFuture)
    )
      return;
    setSelectedDate(newDate);
  };

  const confirmMedication = async (id: number) => {
    if (role === "mantelzorger") return;

    const task = tasks.find((t) => t.id === id);
    if (!task) return;

    const status = getTaskStatus(task);
    const stage = taskStages[task.id];

    // Open only when the event is current, OR during the catch-up window for notification 2
    const canTake = status === "ACTIONABLE" || (status === "MISSED_TODAY" && stage === "second_reminder");
    if (!canTake) return;

    // 1. Request permission to use a camera if necessary
    if (!permission?.granted) {
      const permRes = await requestPermission();
      if (!permRes.granted) {
        Alert.alert("Camera vereist", "Cameratoegang is nodig om de barcode bij Mino te scannen.");
        return;
      }
    }

    try {
      await fetch(`${ROBOT_API_URL}/lock_open`, { method: "POST" });
      await fetch(`${ROBOT_API_URL}/audio/confirm_medication`, { method: "POST" });
    } catch (e) {
      console.error("Fout bij openen slot of audio:", e);
    }

    setScanningTaskId(id);
    setShowScanner(true);
  };

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    // Verify that the scanned code matches Mino's physical barcode
    if (data === "5420098712344") {
      setShowScanner(false);

      try {
        // Notify the robot that the scan was successful (triggers audio, delayed lock, and Supabase log)
        await fetch(`${ROBOT_API_URL}/audio/confirm_done`, { method: "POST" });

        // Update Local UI
        if (scanningTaskId) {
          finishMedication(scanningTaskId);
        }
      } catch (e) {
        console.error("Fout bij afronden scan:", e);
      }

      setScanningTaskId(null);
    } else {
      Alert.alert("Onbekende Barcode", "Scan de barcode aan de binnenzijde van het medicatieklepje van Mino.");
    }
  };

  // --- RECORDING OF INTAKE (SUPABASE + LOCAL) ---
  const finishMedication = async (id: number) => {
    if (role === "mantelzorger") return;

    const task = tasks.find((t) => t.id === id);
    if (!task) return;

    // Stop any reminders
    await Pi.stopReminder().catch(() => { });

    // Do not save demo tasks persistently
    if (task.time === "DEMO" || task.id === 106) {
      setTasks((prevTasks) =>
        prevTasks.map((t) => (t.id === id ? { ...t, taken: true } : t))
      );

      setTakingMedication(null);

      setTimeout(() => {
        setTasks((prevTasks) =>
          prevTasks.map((t) => (t.id === id ? { ...t, taken: false } : t))
        );
      }, 5000);

      return;
    }

    const dateStr = toLocalDateStr(selectedDate);

    try {
      // 1. Sign up for Supabase
      const { error: logError } = await supabase
        .from("medication_logs")
        .upsert(
          {
            task_id: id,
            date: dateStr,
            taken: true,
            taken_at: new Date().toISOString(),
          },
          { onConflict: "task_id, date" }
        );

      if (logError) {
        throw new Error(`Medicatie-log kon niet worden opgeslagen: ${logError.message}`);
      }

      // 2. Update the local task list
      const newTasks = tasks.map((t) =>
        t.id === id ? { ...t, taken: true } : t
      );

      const dateKey = `tasks_${selectedDate.toDateString()}`;
      await AsyncStorage.setItem(dateKey, JSON.stringify(newTasks));
      setTasks(newTasks);

      // 3. Reduce inventory
      await decreaseStock(task.medId, task.amount);
      const updatedMeds = await getMedications();
      setLowStockMeds(updatedMeds.filter((m) => m.stock < 10));

      // 4. Lock Emergency Access and Camera Immediately in Supabase
      await supabase
        .from("shared_settings")
        .update({ emergency_camera_unlocked: false })
        .eq("id", 1);

      await AsyncStorage.removeItem("CAMERA_EMERGENCY_ACCESS");

      // 5. Mark the status as “tasks” to stop further notifications
      const stageKey = `automatic_missed_${dateStr}_${id}`;
      await AsyncStorage.setItem(
        stageKey,
        JSON.stringify({ stage: "taken", ts: Date.now() })
      );

      setTaskStages((prev) => ({ ...prev, [id]: "taken" }));
      setAlarmStage("idle");
      setEmergencyActive(false);
      setTakingMedication(null);

    } catch (error) {
      console.error("❌ Medicatie-inname kon niet volledig worden geregistreerd:", error);
      Alert.alert(
        "Inname niet geregistreerd",
        "De medicatie werd fysiek bevestigd, maar de registratie kon niet worden voltooid. Controleer de verbinding."
      );
      setTakingMedication(null);
    }
  };

  const startDemoScenario = async () => {
    try {
      const res = await fetch(`${ROBOT_API_URL}/start_demo_scenario`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();

      if (data.stage === "warning") {
        setAlarmStage("waiting");
      } else if (data.stage === "emergency") {
        setAlarmStage("emergency");
        setEmergencyActive(true);
        await AsyncStorage.setItem("CAMERA_EMERGENCY_ACCESS", "true");
        // The PrivacyModal is now triggered automatically via Supabase and unit
      }
    } catch (error) {
      console.error("Fout bij starten scenario:", error);
      Alert.alert("Fout", "Kon robot niet bereiken.");
    }
  };

  const handleAutomaticMissedMedication = async (task: Task) => {
    if (role !== "patient") return;
    if (task.time === "DEMO") return;

    const dateStr = toLocalDateStr(selectedDate);
    const stageKey = `automatic_missed_${dateStr}_${task.id}`;

    if (!isToday(selectedDate)) return;

    // Only moments that are truly over
    const [hours, minutes] = task.time.split(":").map(Number);
    const taskTime = new Date(selectedDate);
    taskTime.setHours(hours, minutes, 0, 0);

    if (now <= taskTime) return;

    const diffSeconds = (now.getTime() - taskTime.getTime()) / 1000;

    // Prevent overlapping async runs within the same tick
    const lockKey = `${dateStr}_${task.id}`;
    if (automaticMissedProcessing.current.has(lockKey)) return;
    automaticMissedProcessing.current.add(lockKey);

    try {
      const raw = await AsyncStorage.getItem(stageKey);
      let stored: { stage: string; ts: number } | null = null;

      if (raw) {
        try {
          stored = JSON.parse(raw);
        } catch {
          const legacyStage = raw === "taken" ? "taken" : "second_reminder";
          stored = { stage: legacyStage, ts: 0 };
        }
      }

      // Final statuses for this specific intake instance. “missed_counted” and “missed_stale” are the new final statuses; ‘emergency’ and “emergency_sending” remain here solely to identify data saved earlier (before this change), so that it is not processed again.
      if (
        stored?.stage === "taken" ||
        stored?.stage === "missed_stale" ||
        stored?.stage === "missed_counted" ||
        stored?.stage === "emergency" ||
        stored?.stage === "emergency_sending"
      ) {
        return;
      }

      // Task has since been assigned -> complete
      if (task.taken) {
        await AsyncStorage.setItem(
          stageKey,
          JSON.stringify({ stage: "taken", ts: Date.now() })
        );
        setAlarmStage("idle");
        return;
      }

      // Step 1: Send a second reminder and open the grace period
      if (!stored || stored.stage === "missed_stale" || stored.stage === "missed_counted") {
        // Als het moment al langer dan 10 minuten geleden is:
        if (diffSeconds > FRESH_TRIGGER_WINDOW_SECONDS) {
          await AsyncStorage.setItem(
            stageKey,
            JSON.stringify({ stage: "missed_stale", ts: Date.now() })
          );
          setTaskStages((prev) => ({ ...prev, [task.id]: "missed_stale" }));
          return;
        }

        // Speel tweede herinnering af op robot
        fetch(`${ROBOT_API_URL}/second_reminder`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }).catch((err) => console.error("Fout bij second_reminder:", err));

        // Zet status lokaal én in storage op 'second_reminder' met de huidige timestamp
        await AsyncStorage.setItem(
          stageKey,
          JSON.stringify({ stage: "second_reminder", ts: Date.now() })
        );

        setTaskStages((prev) => ({ ...prev, [task.id]: "second_reminder" }));
        setAlarmStage("waiting");
        return;
      }

      // Check whether the grace period has ended
      if (
        stored.stage !== "second_reminder" ||
        Date.now() - stored.ts < ESCALATION_GRACE_MS
      ) {
        return;
      }

      // Check directly in Supabase whether the intake has been registered
      const { data, error } = await supabase
        .from("medication_logs")
        .select("taken")
        .eq("task_id", task.id)
        .eq("date", dateStr)
        .maybeSingle();

      if (error) {
        console.error("Fout bij controleren medicatie-inname:", error);
        return;
      }

      if (data?.taken === true) {
        console.log(`✅ Medicatie ${task.id} alsnog ingenomen → escalatie geannuleerd`);
        await AsyncStorage.setItem(
          stageKey,
          JSON.stringify({ stage: "taken", ts: Date.now() })
        );
        setTaskStages((prev) => ({ ...prev, [task.id]: "taken" }));
        setAlarmStage("idle");
        return;
      }

      // Step 2: This particular moment has now been definitively missed. This does not automatically escalate to the caregiver; that only happens when this is the second missed moment of the day (see the MissedCheckIn register and MISSED_CHECKINS_BEFORE_ESCALATION).
      console.log(`❌ Medicatiemoment ${task.id} blijft gemist na inhaalvenster.`);

      await AsyncStorage.setItem(
        stageKey,
        JSON.stringify({ stage: "missed_counted", ts: Date.now() })
      );
      setTaskStages((prev) => ({ ...prev, [task.id]: "missed_counted" }));
      setAlarmStage("idle");

      await registerMissedCheckIn(dateStr);
    } catch (error) {
      console.error("Fout tijdens automatische escalatie:", error);
    } finally {
      automaticMissedProcessing.current.delete(lockKey);
    }
  };

  const formatDateDisplay = (date: Date) => {
    if (isToday(date)) return "VANDAAG";
    return date
      .toLocaleDateString("nl-NL", {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
      .toUpperCase();
  };

  const isPatientScheduleLocked = role === "patient" && scheduleLocked;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.headerContainer}>
        <Text style={styles.appTitle}>MEDICATIE DOSSIER</Text>
      </View>

      <View style={styles.dateNav}>
        <TouchableOpacity
          onPress={() => changeDate(-1)}
          style={[styles.navBtn, isTooFarBack() && styles.navBtnDisabled]}
          disabled={isTooFarBack()}
        >
          <Ionicons
            name="chevron-back"
            size={24}
            color={isTooFarBack() ? "#333" : "#00f0ff"}
          />
        </TouchableOpacity>
        <View style={styles.dateDisplay}>
          <Text style={styles.dateText}>{formatDateDisplay(selectedDate)}</Text>
          {isToday(selectedDate) && <View style={styles.activeDot} />}
        </View>
        <TouchableOpacity
          onPress={() => changeDate(1)}
          style={[styles.navBtn, isTooFarFuture() && styles.navBtnDisabled]}
          disabled={isTooFarFuture()}
        >
          <Ionicons
            name="chevron-forward"
            size={24}
            color={isTooFarFuture() ? "#333" : "#00f0ff"}
          />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator
          size="large"
          color="#00f0ff"
          style={{ marginTop: 50 }}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {/* STOCK ALERT */}
          {lowStockMeds.length > 0 &&
            (() => {
              const unhandledCount = lowStockMeds.filter(
                (m) => !m.isOrdered,
              ).length;
              const isAllHandled = unhandledCount === 0;

              const isMantelzorger = role === "mantelzorger";

              let themeColor = "";
              let headerText = "";
              let iconName = "";

              if (isMantelzorger) {
                themeColor = isAllHandled ? "#ef4444" : "#ffaa00";
                headerText = isAllHandled
                  ? "TAAK: Medicatie aankopen!"
                  : "Voorraad patiënt is laag";
                iconName = isAllHandled ? "cart" : "warning";
              } else {
                themeColor = isAllHandled ? "#60a5fa" : "#ffaa00";
                headerText = isAllHandled
                  ? `Gerustgesteld: ${contact.name || "familie"} is verwittigd`
                  : "Bijna op! Meld het aan familie:";
                iconName = isAllHandled ? "checkmark-circle" : "warning";
              }

              const bgStyle = {
                backgroundColor: `${themeColor}15`,
                borderColor: `${themeColor}40`,
                borderWidth: 1,
                borderRadius: 12,
                padding: 12,
                marginBottom: 20,
              };

              return (
                <View style={bgStyle}>
                  <View style={styles.alertHeader}>
                    <Ionicons
                      name={iconName as any}
                      size={18}
                      color={themeColor}
                    />
                    <Text style={[styles.alertTitle, { color: themeColor }]}>
                      {headerText}
                    </Text>
                  </View>

                  <View style={{ marginTop: 12 }}>
                    {lowStockMeds.map((med) => {
                      const isReported = med.isOrdered === true;
                      const dailyNeededAmount = tasks
                        .filter((t) => t.medId === med.id)
                        .reduce((sum, t) => {
                          const parsedAmount = parseInt(t.amount.replace(/[^0-9]/g, ""), 10);
                          return sum + (isNaN(parsedAmount) || parsedAmount <= 0 ? 1 : parsedAmount);
                        }, 0) || 1;

                      const daysLeft = Math.floor(med.stock / dailyNeededAmount);
                      // Dynamisch enkelvoud/meervoud
                      const daysText = daysLeft === 1 ? "1 dag" : `${daysLeft} dagen`;

                      const chipBorderColor = isReported
                        ? isMantelzorger
                          ? "rgba(239, 68, 68, 0.4)"
                          : "rgba(96, 165, 250, 0.4)"
                        : "rgba(255, 170, 0, 0.4)";

                      return (
                        <TouchableOpacity
                          key={med.id}
                          activeOpacity={0.7}
                          onPress={() => router.push("/medications")}
                          style={{
                            backgroundColor: "rgba(0,0,0,0.3)",
                            paddingHorizontal: 14,
                            paddingVertical: 12,
                            borderRadius: 12,
                            borderWidth: 1,
                            borderColor: chipBorderColor,
                            flexDirection: "row",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 8,
                            gap: 8,
                          }}
                        >
                          {/* Left side: Drug name (wraps neatly for long names) */}
                          <Text
                            style={[styles.stockChipName, { flex: 1 }]}
                            numberOfLines={1}
                            ellipsizeMode="tail"
                          >
                            {med.name}
                          </Text>

                          {/* Right side: Status + chevron (never wraps to a new line) */}
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 8,
                              flexShrink: 0,
                            }}
                          >
                            {isReported ? (
                              <View
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  gap: 5,
                                }}
                              >
                                <Text
                                  style={{
                                    color: isMantelzorger ? "#ef4444" : "#60a5fa",
                                    fontWeight: "bold",
                                    fontSize: 11,
                                    letterSpacing: 0.3,
                                  }}
                                >
                                  {isMantelzorger ? "AANKOPEN" : "REEDS GEMELD"}
                                </Text>
                                <Ionicons
                                  name={isMantelzorger ? "alert-circle" : "checkmark-circle"}
                                  size={15}
                                  color={isMantelzorger ? "#ef4444" : "#60a5fa"}
                                />
                              </View>
                            ) : (
                              <Text style={styles.stockChipCount}>
                                Nog {med.stock} stuks (ca. {daysText})
                              </Text>
                            )}

                            <Ionicons
                              name="chevron-forward"
                              size={16}
                              color="rgba(255,255,255,0.3)"
                            />
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              );
            })()}

          {alarmStage === "reminder" && (
            <View
              style={{
                backgroundColor: "rgba(59,130,246,0.15)",
                borderColor: "#3b82f6",
                borderWidth: 1,
                borderRadius: 12,
                padding: 14,
                marginBottom: 20,
              }}
            >
              <Text style={{ color: "#3b82f6", fontWeight: "bold" }}>
                Herinnering actief
              </Text>

              <Text style={{ color: "#ccc", marginTop: 6 }}>
                Mino herinnert de gebruiker om de medicatie in te nemen.
              </Text>
            </View>
          )}

          {alarmStage === "waiting" && (
            <View
              style={{
                backgroundColor: "rgba(245,158,11,0.15)",
                borderColor: "#f59e0b",
                borderWidth: 1,
                borderRadius: 12,
                padding: 14,
                marginBottom: 20,
              }}
            >
              <Text style={{ color: "#f59e0b", fontWeight: "bold" }}>
                Geen reactie ontvangen
              </Text>

              <Text style={{ color: "#ccc", marginTop: 6 }}>
                Mino wacht nog op een bevestiging van de medicatie-inname.
              </Text>
            </View>
          )}

          {alarmStage === "emergency" && (
            <View
              style={{
                backgroundColor: "rgba(255,68,68,0.12)",
                borderColor: "#ff4444",
                borderWidth: 1.5,
                borderRadius: 16,
                padding: 18,
                marginBottom: 20,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="alert-circle" size={24} color="#ff4444" />
                <Text
                  style={{
                    color: "#ff4444",
                    fontWeight: "bold",
                    fontSize: 17,
                    letterSpacing: 0.5,
                  }}
                >
                  Noodsituatie gedetecteerd
                </Text>
              </View>

              <Text
                style={{
                  color: "#ccc",
                  marginTop: 10,
                  lineHeight: 20,
                  fontSize: 13,
                }}
              >
                Mino heeft herhaaldelijk geen inname geregistreerd. De mantelzorger is
                automatisch verwittigd en de camera is vrijgegeven.
              </Text>

              <View
                style={{
                  backgroundColor: "rgba(0,0,0,0.3)",
                  borderRadius: 10,
                  padding: 12,
                  marginVertical: 12,
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 14 }}>
                  {contact.name || "Mantelzorger"} ({contact.relation || "Contact"})
                </Text>
                <Text style={{ color: "#aaa", fontSize: 12, marginTop: 2 }}>
                  {contact.phone || "Geen telefoonnummer"}
                </Text>
              </View>

              {/* RESET BUTTONS: Causes the alarm to disappear and resets the status */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={resolveEmergency}
                style={{
                  backgroundColor: "#ff4444",
                  paddingVertical: 12,
                  borderRadius: 10,
                  alignItems: "center",
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <Ionicons name="checkmark-done" size={18} color="#fff" />
                <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 13 }}>
                  BEVESTIG SITUATIE VEILIG / RESET
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* TIMELINE */}
          <View style={styles.timelineContainer}>
            {tasks
              .filter(
                (task) => !(role === "mantelzorger" && task.medId === "6"),
              )
              .map((task, index) => {
                const status = getTaskStatus(task);
                let btnStyle: any = styles.btnDefault;
                let iconName: any = "";
                let iconColor = "#fff";
                let isDisabled = true;
                let btnText = "";
                let textColor = "white";

                // Can only be edited if it hasn't started yet or is over
                const canEditThisTask =
                  status !== "TAKEN" && !status.includes("MISSED");

                switch (status) {
                  case "TAKEN":
                    btnStyle = styles.btnTaken;
                    btnText = "OK";
                    iconName = "checkmark";
                    isDisabled = true;
                    break;
                  case "UPCOMING":
                    if (task.time !== "DEMO") {
                      const [h, m] = task.time.split(":").map(Number);
                      const taskTime = new Date();
                      taskTime.setHours(h, m, 0, 0);

                      const diffMs = taskTime.getTime() - now.getTime();
                      const remainingMin = Math.max(
                        1,
                        Math.ceil(diffMs / (60 * 1000)),
                      );
                      btnText = `OVER ${remainingMin} MIN`;
                    } else {
                      btnText = "OVER 5 MIN";
                    }

                    btnStyle = styles.btnUpcoming;
                    iconName = "alert-circle-outline";
                    iconColor = "#ffaa00";
                    textColor = "#ffaa00";
                    isDisabled = true;
                    break;
                  case "ACTIONABLE":
                    if (role === "mantelzorger") {
                      btnStyle = styles.btnWaitingCaregiver;
                      btnText = "WACHT OP INNAME";
                      iconName = "time-outline";
                      iconColor = "#ffaa00";
                      textColor = "#ffaa00";
                      isDisabled = true;
                    } else {
                      btnStyle = styles.btnActive;
                      btnText = "NEEM IN";
                      iconName = "hand-right";
                      isDisabled = false;
                    }
                    break;
                  case "WAITING":
                    btnStyle = styles.btnWaiting;
                    btnText = task.time;
                    iconName = "time";
                    textColor = "#666";
                    isDisabled = true;
                    break;
                  case "MISSED_TODAY":
                    const currentStage = taskStages[task.id];

                    // Allow “OVERTAKING” only between marker 2 and marker 3
                    if (role === "patient" && currentStage === "second_reminder") {
                      btnStyle = {
                        backgroundColor: "rgba(255, 170, 0, 0.15)",
                        borderWidth: 1,
                        borderColor: "#ffaa00",
                      };
                      btnText = "INHALEN";
                      iconName = "hand-right";
                      iconColor = "#ffaa00";
                      textColor = "#ffaa00";
                      isDisabled = false;
                    } else {
                      // After report 3 (emergency) or for a caregiver: permanently locked
                      btnStyle = styles.btnMissed;
                      btnText = "GEMIST";
                      iconName = "close";
                      iconColor = "#ff4444";
                      isDisabled = true;
                    }
                    break;
                  case "MISSED_HISTORIC":
                    btnStyle = styles.btnMissed;
                    btnText = "GEMIST";
                    iconName = "close";
                    iconColor = "#ff4444";
                    isDisabled = true;
                    break;
                  case "FUTURE_DAY":
                    btnStyle = styles.btnFuture;
                    btnText = task.time;
                    iconName = "calendar";
                    iconColor = "#c084fc";
                    textColor = "#e9d5ff";
                    isDisabled = true;
                    break;
                }

                if (takingMedication === task.id) {
                  btnStyle = styles.btnActive;
                  btnText = "GENOMEN";
                  iconName = "checkmark-circle";
                  iconColor = "#fff";
                  isDisabled = false;
                }

                return (
                  <View key={task.id} style={styles.compactCard}>
                    <View style={styles.timelineSidebar}>
                      <View
                        style={[
                          styles.dot,
                          status === "TAKEN" && styles.dotGreen,
                          status === "UPCOMING" && styles.dotUpcoming,
                          status === "ACTIONABLE" && styles.dotBlue,
                          status.includes("MISSED") && styles.dotRed,
                        ]}
                      />
                      {index < tasks.length - 1 && <View style={styles.line} />}
                    </View>

                    <View style={styles.compactContent}>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.timeText,
                            status === "UPCOMING" && { color: "#ffaa00" },
                            status === "ACTIONABLE" && { color: "#00f0ff" },
                            status.includes("MISSED") && { color: "#ff4444" },
                          ]}
                        >
                          {task.time}
                        </Text>
                        <Text style={styles.nameText}>{task.name}</Text>
                      </View>

                      {/* EDIT BUTTON (ONLY IF THE MOMENT HAS NOT YET PASSED OR BEEN TAKEN) */}
                      {canEditThisTask && (
                        <TouchableOpacity
                          onPress={() => handleOpenEditModal(task)}
                          style={styles.editCardBtn}
                          activeOpacity={0.7}
                        >
                          <Ionicons
                            name={
                              isPatientScheduleLocked
                                ? "lock-closed-outline"
                                : "create-outline"
                            }
                            size={18}
                            color={isPatientScheduleLocked ? "#666" : "#00f0ff"}
                          />
                        </TouchableOpacity>
                      )}

                      <TouchableOpacity
                        disabled={isDisabled}
                        onPress={() =>
                          takingMedication === task.id
                            ? finishMedication(task.id)
                            : confirmMedication(task.id)
                        }
                        style={[styles.compactBtn, btnStyle]}
                      >
                        {status === "WAITING" ||
                          status === "FUTURE_DAY" ? null : (
                          <Ionicons
                            name={iconName}
                            size={16}
                            color={iconColor}
                            style={{ marginRight: 4 }}
                          />
                        )}
                        <Text
                          style={[styles.compactBtnText, { color: textColor }]}
                        >
                          {btnText}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
          </View>

          {isToday(selectedDate) && (
            <TouchableOpacity
              style={styles.demoLink}
              onPress={startDemoScenario}
            >
              <Text style={styles.demoLinkText}>Start zorgscenario</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}

      {/* IN-APP BARCODE SCANNER MODAL */}
      <Modal visible={showScanner} animationType="slide" onRequestClose={() => setShowScanner(false)}>
        <View style={{ flex: 1, backgroundColor: "#000" }}>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            onBarcodeScanned={handleBarcodeScanned}
            barcodeScannerSettings={{
              barcodeTypes: ["ean13", "code128"],
            }}
          />

          {/* Scanner Overlay / Richtkader */}
          <SafeAreaView style={{ flex: 1, justifyContent: "space-between", alignItems: "center", padding: 24 }}>
            <View style={{ backgroundColor: "rgba(0,0,0,0.7)", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 }}>
              <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 16, textAlign: "center" }}>
                Scan de barcode in Mino's klepje
              </Text>
            </View>

            <View
              style={{
                width: 260,
                height: 160,
                borderColor: "#00f0ff",
                borderWidth: 2,
                borderRadius: 16,
                backgroundColor: "transparent",
              }}
            />

            <TouchableOpacity
              onPress={() => {
                setShowScanner(false);
                fetch(`${ROBOT_API_URL}/lock_close`, { method: "POST" }).catch(() => { });
              }}
              style={{ backgroundColor: "rgba(255,68,68,0.8)", paddingVertical: 12, paddingHorizontal: 32, borderRadius: 10 }}
            >
              <Text style={{ color: "#fff", fontWeight: "bold" }}>ANNULEREN</Text>
            </TouchableOpacity>
          </SafeAreaView>
        </View>
      </Modal>

      {/* EDIT MODAL WITH TRASH CAN ICON IN THE HEADER */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={editingTask !== null}
        onRequestClose={() => setEditingTask(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.editModalContent}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.editModalTitle}>Innamemoment Aanpassen</Text>
              <TouchableOpacity
                onPress={handleDeleteTask}
                style={styles.deleteIconBtn}
                activeOpacity={0.7}
              >
                <Ionicons name="trash-outline" size={20} color="#ff4444" />
              </TouchableOpacity>
            </View>

            <Text style={styles.editModalSubText}>{editingTask?.name}</Text>

            <Text style={styles.label}>Innametijdstip (HH:MM)</Text>
            <View style={styles.inputRow}>
              <Ionicons name="time-outline" size={20} color="#666" />
              <TextInput
                style={[styles.input, !isEditingSchedule && { color: "#888" }]}
                value={editTime}
                onChangeText={handleEditTimeChange}
                placeholder="08:00"
                placeholderTextColor="#444"
                editable={isEditingSchedule}
                keyboardType="number-pad"
                maxLength={5}
              />
            </View>

            <Text style={styles.label}>Aantal / Dosering</Text>
            <View style={styles.inputRow}>
              <Ionicons name="funnel-outline" size={20} color="#666" />
              <TextInput
                style={[styles.input, !isEditingSchedule && { color: "#888" }]}
                value={editAmount}
                onChangeText={handleEditAmountChange}
                placeholder="1x"
                placeholderTextColor="#444"
                editable={isEditingSchedule}
                keyboardType="default"
                maxLength={4}
              />
            </View>

            <View style={{ width: "100%", gap: 10, marginTop: 10 }}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: "#007AFF" }]}
                onPress={handleSaveTaskEdit}
              >
                <Text style={styles.actionBtnText}>
                  {!isEditingSchedule ? "BEWERKEN" : "BEWAAR"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: "#2c2c2e" }]}
                onPress={() => {
                  setIsEditingSchedule(false);
                  setEditingTask(null);
                }}
              >
                <Text style={[styles.actionBtnText, { color: "#ccc" }]}>
                  ANNULEREN
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* PRIVACY MODAL */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={privacyModalVisible}
        onRequestClose={() => setPrivacyModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View
              style={[styles.modalIconCircle, { backgroundColor: "#8b5cf6" }]}
            >
              <Ionicons name="shield-checkmark" size={32} color="#fff" />
            </View>
            <Text style={styles.modalTitle}>Camera-toegang actief</Text>
            <Text style={styles.modalText}>
              {(contact.name || "Uw mantelzorger") +
                " bekijkt op dit moment de camerabeelden om te controleren of alles goed met u gaat. Dit venster sluit automatisch zodra de camera stopt."}
            </Text>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => setPrivacyModalVisible(false)}
            >
              <Text style={styles.modalButtonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#09090b" },
  headerContainer: {
    paddingVertical: 15,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  appTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
    letterSpacing: 2,
  },
  dateNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 10,
    backgroundColor: "#111",
  },
  navBtn: {
    padding: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 8,
  },
  navBtnDisabled: { opacity: 0.2 },
  dateDisplay: { alignItems: "center", justifyContent: "center", flex: 1 },
  dateText: { color: "white", fontSize: 16, fontWeight: "bold" },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#00f0ff",
    marginTop: 4,
  },
  list: { padding: 16 },
  alertHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  alertTitle: {
    color: "#ffaa00",
    fontWeight: "bold",
    fontSize: 13,
    textTransform: "uppercase",
  },
  stockChipName: { color: "white", fontSize: 15, fontWeight: "bold" },
  stockChipCount: { color: "#ffaa00", fontWeight: "bold", fontSize: 13 },
  timelineContainer: { marginTop: 0 },
  compactCard: { flexDirection: "row", height: 75 },
  timelineSidebar: { width: 30, alignItems: "center", paddingTop: 8 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#333" },
  dotGreen: { backgroundColor: "#34C759" },
  dotUpcoming: {
    backgroundColor: "#ffaa00",
    shadowColor: "#ffaa00",
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  dotBlue: {
    backgroundColor: "#00f0ff",
    shadowColor: "#00f0ff",
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  dotRed: { backgroundColor: "#ff4444" },
  line: { width: 2, flex: 1, backgroundColor: "#222", marginVertical: 4 },
  compactContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1c1c1e",
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  timeText: { color: "#888", fontSize: 12, fontWeight: "bold" },
  nameText: { color: "white", fontSize: 15, fontWeight: "600" },
  editCardBtn: {
    padding: 8,
    marginRight: 6,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  compactBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 85,
    justifyContent: "center",
  },
  compactBtnText: { fontSize: 11, fontWeight: "bold" },
  btnDefault: { backgroundColor: "#333" },
  btnActive: { backgroundColor: "#007AFF" },
  btnUpcoming: {
    backgroundColor: "rgba(255, 170, 0, 0.15)",
    borderWidth: 1,
    borderColor: "#ffaa00",
  },
  btnWaitingCaregiver: {
    backgroundColor: "rgba(255, 170, 0, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(255, 170, 0, 0.3)",
  },
  btnTaken: {
    backgroundColor: "rgba(52, 199, 89, 0.2)",
    borderWidth: 1,
    borderColor: "#34C759",
  },
  btnWaiting: { backgroundColor: "transparent" },
  btnMissed: {
    backgroundColor: "rgba(255, 68, 68, 0.1)",
    borderWidth: 1,
    borderColor: "#ff4444",
  },
  btnFuture: { backgroundColor: "rgba(192, 132, 252, 0.1)" },
  demoLink: { alignSelf: "center", marginTop: 20, padding: 10 },
  demoLinkText: { color: "#333", fontSize: 12 },

  editModalContent: {
    backgroundColor: "#1c1c1e",
    width: "85%",
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  modalHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  editModalTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
  },
  deleteIconBtn: {
    padding: 6,
    backgroundColor: "rgba(255,68,68,0.1)",
    borderRadius: 8,
  },
  editModalSubText: {
    color: "#888",
    fontSize: 14,
    marginBottom: 20,
  },
  label: { color: "#888", fontSize: 12, marginBottom: 6, marginLeft: 4 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2c2c2e",
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  input: {
    flex: 1,
    color: "white",
    paddingVertical: 12,
    marginLeft: 10,
    fontSize: 16,
  },
  actionBtn: {
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  actionBtnText: { color: "white", fontWeight: "bold", fontSize: 14 },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#1c1c1e",
    width: "80%",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  modalIconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#f59e0b",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
  },
  modalText: {
    color: "#ccc",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 20,
  },
  modalButton: {
    backgroundColor: "#333",
    paddingVertical: 10,
    paddingHorizontal: 30,
    borderRadius: 10,
  },
  modalButtonText: { color: "#fff", fontWeight: "bold" },
});