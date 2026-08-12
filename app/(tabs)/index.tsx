/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import * as Notifications from "expo-notifications";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
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

// LET OP: de globale Notifications.setNotificationHandler(...) staat NIET
// hier, maar centraal in app/_layout.tsx. setNotificationHandler is een
// singleton — twee registraties laten elkaar willekeurig overschrijven
// (welke module toevallig als laatste laadt "wint"), wat precies de oorzaak
// was van het inconsistente badge-gedrag. Voeg hier dus geen tweede
// registratie meer toe.

type Task = {
  id: number;
  time: string;
  name: string;
  taken: boolean;
  medId: string;
  amount: string;
};

const DEMO_MISS_LIMIT_SECONDS = 5;
const ROBOT_API_URL = "http://172.31.149.75:5001";

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
  const [alarmStage, setAlarmStage] = useState<
    "idle" | "reminder" | "waiting" | "emergency"
  >("idle");
  const [scheduleLocked, setScheduleLocked] = useState(false);

  // STATE VOOR BEWERKMODAL INNAMEMOMENT
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editTime, setEditTime] = useState("");
  const [editAmount, setEditAmount] = useState("");
  // Bepaalt of de velden bewerkbaar zijn (knop toont "Bewerken" vs "Bewaar")
  const [isEditingSchedule, setIsEditingSchedule] = useState(false);

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

    // Zelfde vaste-naam-collision bug als eerder gefixt in tabs/_layout.tsx:
    // een hardcoded channel-naam kan botsen met een oude instantie die nog
    // aan het afmelden is (bv. bij snel wisselen van tabblad), wat een
    // "cannot add postgres_changes callbacks ... after subscribe()" crash
    // veroorzaakt. Elke mount krijgt daarom een unieke naam.
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
    const taskTime = new Date();
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

  // Enkel cijfers en de ':'-scheiding toestaan tijdens het typen — voorkomt
  // dat er letters of andere tekens in het tijdstip terechtkomen.
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

  // Enkel relevant wanneer we vandaag bekijken — voor een toekomstige dag
  // heeft "in het verleden" geen betekenis.
  const isTimeInPast = (timeStr: string): boolean => {
    if (!isToday(selectedDate)) return false;
    if (!isValidTimeFormat(timeStr)) return false;

    const [hh, mm] = timeStr.split(":").map(Number);
    const candidate = new Date();
    candidate.setHours(hh, mm, 0, 0);

    return candidate.getTime() < new Date().getTime();
  };

  // Gedeelde helper: schrijft de in-app melding weg EN stuurt een echte push
  // naar het toestel van de mantelzorger. Gebruikt door zowel het aanpassen
  // als het verwijderen van een innamemoment, zodat beide consistent
  // gedrag hebben i.p.v. dat enkel de eerste een echte push kreeg.
  const notifyCaregiverOfScheduleChange = async (
    title: string,
    body: string,
  ) => {
    // In-app record (badge, notificatielijst). Eigen type "schedule_change"
    // i.p.v. "medication" — dat laatste routeert naar het voorraadscherm
    // /medications, wat hier niet klopt: dit gaat over het innamemoment,
    // niet over medicatiebeheer.
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

    // Nog niet in bewerkmodus? Eerste tik = enkel de velden ontgrendelen.
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

    // 1. Update de daily_schedule tabel in Supabase
    await updateScheduleItem({
      id: editingTask.id,
      medId: editingTask.medId,
      time: editTime,
      amount: editAmount,
    });

    // 2. Indien de patiënt het innametijdstip heeft gewijzigd: MELDING STUREN NAAR MANTELZORGER!
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

        // RECORD IN SUPABASE: opzettelijk NIET achter de AsyncStorage-vlag
        // hieronder. Deze upsert is idempotent dankzij de unique index op
        // (task_id, reminder_date, type) + ignoreDuplicates, dus het is veilig
        // om dit bij elke tick opnieuw te proberen. Zo blokkeert een eenmalige
        // mislukte poging (bv. netwerkfout, DB-migratie nog niet toegepast)
        // niet stilzwijgend de rest van de dag — de eerstvolgende geslaagde
        // poging zet gewoon de rij, en daarna doet de unique index de rest.
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

  // --- OS-NIVEAU VOORAF INGEPLANDE HERINNERING (werkt ook buiten de app) ---
  // Hierboven wordt de Supabase-rij pas geschreven op het moment dat de app
  // zelf, terwijl open, "merkt" dat een taak UPCOMING is. Voor de ECHTE
  // melding (die ook buiten de app moet verschijnen, zoals WhatsApp) volstaat
  // dat niet: trigger: null toont enkel iets als de app op dat exacte moment
  // actief JS draait. Deze effect plant de melding daarom vooraf in bij het
  // besturingssysteem, met een echte datum — het OS levert ze dan zelf af,
  // ongeacht of de app open, op de achtergrond, of volledig gesloten is.
  //
  // Een vaste `identifier` per taak+dag zorgt dat herhaalde aanroepen (bv.
  // bij elke wijziging van `tasks`) de vorige planning overschrijven i.p.v.
  // duplicaten te maken.
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

      // Tijdstip al voorbij? Niets (meer) in te plannen.
      if (triggerDate.getTime() <= Date.now()) {
        await Notifications.cancelScheduledNotificationAsync(
          identifier,
        ).catch(() => { });
        return;
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
          // Als je Expo SDK ouder is dan SDK 50 en dit een type-fout geeft,
          // vervang dit object gewoon door: trigger: triggerDate
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

  // 1e TIK: SLOT OPENEN & KNOP "GENOMEN" MAKEN
  const confirmMedication = async (id: number) => {
    if (role === "mantelzorger") return;

    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    if (getTaskStatus(task) !== "ACTIONABLE") return;

    try {
      await fetch(`${ROBOT_API_URL}/lock_open`, {
        method: "POST",
      });
    } catch (e) {
      console.log("Kon slot niet openen");
    }

    setTakingMedication(id);

    setTimeout(async () => {
      setTakingMedication((current) => {
        if (current === id) {
          fetch(`${ROBOT_API_URL}/lock_close`, {
            method: "POST",
          }).catch(() => { });
          return null;
        }
        return current;
      });
    }, 5000);
  };

  // 2e TIK: INNAME AFRONDEN
  const finishMedication = async (id: number) => {
    if (role === "mantelzorger") return;

    const task = tasks.find((t) => t.id === id);
    if (!task) return;

    await Pi.stopReminder().catch(() => { });
    await Pi.confirmMed(id).catch(console.error);

    setTasks((prevTasks) =>
      prevTasks.map((t) => (t.id === id ? { ...t, taken: true } : t)),
    );

    // DEMO RESET NA 5 SEC
    if (task.time === "DEMO" || task.id === 106) {
      setTakingMedication(null);

      setTimeout(() => {
        setTasks((prevTasks) =>
          prevTasks.map((t) => (t.id === id ? { ...t, taken: false } : t)),
        );
      }, 5000);

      return;
    }

    // REGULIERE MEDICATIE OPSLAAN
    const newTasks = tasks.map((t) =>
      t.id === id ? { ...t, taken: true } : t,
    );

    const dateKey = `tasks_${selectedDate.toDateString()}`;
    await AsyncStorage.setItem(dateKey, JSON.stringify(newTasks));

    const dateStr = selectedDate.toISOString().split("T")[0];
    try {
      await supabase.from("medication_logs").upsert(
        {
          task_id: id,
          date: dateStr,
          taken: true,
          taken_at: new Date().toISOString(),
        },
        { onConflict: "task_id, date" },
      );
    } catch (e) {
      console.error("Fout bij opslaan medicatie-log in Supabase:", e);
    }

    await decreaseStock(task.medId, task.amount);

    const updatedMeds = await getMedications();
    setLowStockMeds(updatedMeds.filter((m) => m.stock < 10));

    await AsyncStorage.removeItem("CAMERA_EMERGENCY_ACCESS");
    setEmergencyActive(false);
    setAlarmStage("idle");

    setTakingMedication(null);
  };

  const startDemoScenario = async () => {
    setShowDemoModal(true);
    setAlarmStage("reminder");

    await fetch("http://172.31.149.75:5001/start_reminder", {
      method: "POST",
    });

    setTimeout(async () => {
      setAlarmStage("waiting");

      await fetch("http://172.31.149.75:5001/second_reminder", {
        method: "POST",
      });
    }, 5000);

    setTimeout(async () => {
      setAlarmStage("emergency");
      setEmergencyActive(true);

      await AsyncStorage.setItem("CAMERA_EMERGENCY_ACCESS", "true");

      await fetch("http://172.31.149.75:5001/care_emergency", {
        method: "POST",
      });
    }, 10000);
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
                      const timesPerDay =
                        tasks.filter((t) => t.medId === med.id).length || 1;
                      const daysLeft = Math.floor(med.stock / timesPerDay);

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
                            paddingHorizontal: 16,
                            paddingVertical: 14,
                            borderRadius: 12,
                            borderWidth: 1,
                            borderColor: chipBorderColor,
                            flexDirection: "row",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 8,
                          }}
                        >
                          <Text style={styles.stockChipName}>{med.name}</Text>

                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 10,
                            }}
                          >
                            {isReported ? (
                              <View
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  gap: 6,
                                }}
                              >
                                <Text
                                  style={{
                                    color: isMantelzorger
                                      ? "#ef4444"
                                      : "#60a5fa",
                                    fontWeight: "bold",
                                    fontSize: 12,
                                  }}
                                >
                                  {isMantelzorger
                                    ? "AANKOPEN BIJ APOTHEEK"
                                    : "REEDS GEMELD"}
                                </Text>
                                <Ionicons
                                  name={
                                    isMantelzorger
                                      ? "alert-circle"
                                      : "checkmark-circle"
                                  }
                                  size={16}
                                  color={isMantelzorger ? "#ef4444" : "#60a5fa"}
                                />
                              </View>
                            ) : (
                              <Text style={styles.stockChipCount}>
                                Nog {med.stock} stuks (ca. {daysLeft} dgn)
                              </Text>
                            )}

                            <Ionicons
                              name="chevron-forward"
                              size={18}
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
                backgroundColor: "rgba(255,68,68,0.15)",
                borderColor: "#ff4444",
                borderWidth: 1,
                borderRadius: 12,
                padding: 14,
                marginBottom: 20,
              }}
            >
              <Text
                style={{
                  color: "#ff4444",
                  fontWeight: "bold",
                  fontSize: 18,
                }}
              >
                Noodsituatie gedetecteerd
              </Text>

              <Text
                style={{
                  color: "#ccc",
                  marginTop: 8,
                  lineHeight: 22,
                }}
              >
                Na meerdere onbeantwoorde herinneringen werd deze mantelzorger
                automatisch verwittigd:
              </Text>

              <Text
                style={{
                  color: "#fff",
                  fontWeight: "600",
                  marginTop: 12,
                }}
              >
                {contact.name}
              </Text>

              <Text style={{ color: "#bbb" }}>{contact.relation}</Text>

              <Text
                style={{
                  color: "#e5e7eb",
                  marginTop: 4,
                }}
              >
                {contact.phone}
              </Text>

              <Text
                style={{
                  color: "#ccc",
                  marginTop: 12,
                  lineHeight: 22,
                }}
              >
                Cameratoegang werd tijdelijk vrijgegeven zodat de mantelzorger
                de situatie kan beoordelen.
              </Text>
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

                // Enkel te bewerken als het nog niet ingenomen of voorbij is
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

                    {/* OVERZICHTELIJKE CARD */}
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

                      {/* BEWERK PICOTGRAM / SLOTJE (ENKEL ALS MOMENT NOG NIET VOORBIJ/INGENOMEN IS) */}
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

      {/* RUSTIGE BEWERK MODAL MET PRULLENBAK ICOON IN HEADER */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={editingTask !== null}
        onRequestClose={() => setEditingTask(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.editModalContent}>
            {/* KOP MET TITEL EN SUBTIELE PRULLENBAK RECHTSBOVEN */}
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

      {/* DEMO MODAL */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showDemoModal}
        onRequestClose={() => setShowDemoModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconCircle}>
              <Ionicons name="notifications" size={32} color="#fff" />
            </View>
            <Text style={styles.modalTitle}>Demo Gestart</Text>
            <Text style={styles.modalText}>Robot start alarm...</Text>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => setShowDemoModal(false)}
            >
              <Text style={styles.modalButtonText}>OK</Text>
            </TouchableOpacity>
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

  // STYLING BEWERK MODAL
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