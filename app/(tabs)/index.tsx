/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Modal,
  ActivityIndicator,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { Pi } from "../../services/pi";
import {
  DAILY_SCHEDULE,
  decreaseStock,
  getMedications,
  Medication,
} from "../../data/medications";
import { useRole } from "../../context/RoleContext";
import { supabase } from "../../lib/supabase";

type Task = {
  id: number;
  time: string;
  name: string;
  taken: boolean;
  medId: string;
  amount: string;
};

const DEMO_MISS_LIMIT_SECONDS = 5;
// Zorg dat dit IP klopt met je server
const ROBOT_API_URL = "http://10.178.148.75:5001";

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
  const inventoryWarningPlayed = useRef(false);
  const [takingMedication, setTakingMedication] = useState<number | null>(null);
  const [emergencyActive, setEmergencyActive] = useState(false);
  const [alarmStage, setAlarmStage] = useState<
    "idle" | "reminder" | "waiting" | "emergency"
  >("idle");

  const [contact, setContact] = useState({
    name: "",
    relation: "",
    phone: "",
  });

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Arrived here via a "privacy" notification tap (see
  // lib/notificationRouting.ts, which routes privacy notifications to
  // "/?privacyAlert=1"). Show the reassuring dialog, then clear the param
  // so navigating away and back (or a re-render) doesn't reopen it.
  // (Kept as a fallback path — the realtime effect below is the primary
  // trigger now, since no push is actually sent for "privacy" type.)
  useEffect(() => {
    if (!params.privacyAlert) return;
    setPrivacyModalVisible(true);
    router.setParams({ privacyAlert: undefined } as any);
  }, [params.privacyAlert]);

  // Show the privacy dialog automatically the instant a caregiver's
  // camera access is unlocked (see app/(tabs)/robot.tsx's
  // startCareSession / handleEmergencyResolved / lockEmergencyAccess),
  // and hide it automatically the instant access ends — no notification
  // tap required, and it doubles as the "closes automatically as soon as
  // the camera stops" behavior. Only relevant to the patient; the
  // caregiver who's actually watching doesn't need to be told about it.
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
    // Alleen uitvoeren op het Vandaag-scherm
    if (!isToday(selectedDate)) return;

    // Geen voorraadwaarschuwing nodig
    const needsWarning = lowStockMeds.some(
      (med) => med.stock < 10 && !med.isOrdered,
    );

    if (!needsWarning) return;

    // Voorkom dat het geluid iedere render/focus opnieuw afspeelt
    if (inventoryWarningPlayed.current) return;

    inventoryWarningPlayed.current = true;

    console.log("Voorraad bijna op - Inventory.mp3 afspelen");

    fetch(`${ROBOT_API_URL}/inventory_warning`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Inventory warning HTTP ${response.status}`);
        }

        const data = await response.json();
        console.log("Inventory warning response:", data);
      })
      .catch((error) => {
        console.error("Inventory warning kon niet worden afgespeeld:", error);
        inventoryWarningPlayed.current = false;
      });
  }, [lowStockMeds, selectedDate]);

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

  // --- DATA LOADING ---
  const loadData = useCallback(async () => {
    setIsLoading(true);

    // Haal de actuele contactgegevens op uit Supabase
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

    // 1. Check Stock (for the warning at the top)
    const currentMeds = await getMedications();
    setLowStockMeds(currentMeds.filter((m) => m.stock < 10));

    // 2. Build Task List
    const dateKey = `tasks_${selectedDate.toDateString()}`;
    const savedData = await AsyncStorage.getItem(dateKey);

    // Build base structure from config (so names/times are always up-to-date)
    let currentTasks = DAILY_SCHEDULE.map((scheduleItem) => {
      const med = currentMeds.find((m) => m.id === scheduleItem.medId);
      return {
        id: scheduleItem.id,
        time: scheduleItem.time,
        name: `${scheduleItem.amount} ${med ? med.name : "Onbekend"}`,
        medId: scheduleItem.medId,
        amount: scheduleItem.amount,
        taken: false,
      };
    });

    if (savedData) {
      // Restore checkmarks from storage
      const savedTasks: Task[] = JSON.parse(savedData);
      currentTasks = currentTasks.map((t) => {
        const saved = savedTasks.find((st) => st.id === t.id);
        return saved ? { ...t, taken: saved.taken } : t;
      });
    } else if (isPastDate(selectedDate)) {
      // Simulate history
      currentTasks = currentTasks.map((t) => ({
        ...t,
        taken: Math.random() > 0.2,
      }));
      await AsyncStorage.setItem(dateKey, JSON.stringify(currentTasks));
    }

    setTasks(currentTasks);
    setIsLoading(false);
  }, [selectedDate]);

  // Reload when screen comes into view or date changes
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  // --- STATUS LOGIC ---
  const getTaskStatus = (task: Task) => {
    if (task.taken) return "TAKEN";
    if (isPastDate(selectedDate)) return "MISSED_HISTORIC";
    if (!isToday(selectedDate) && !isPastDate(selectedDate))
      return "FUTURE_DAY";

    const [hours, minutes] = task.time.split(":").map(Number);
    const taskTime = new Date();
    taskTime.setHours(hours, minutes, 0, 0);
    const missLimit = new Date(taskTime);
    missLimit.setSeconds(missLimit.getSeconds() + DEMO_MISS_LIMIT_SECONDS);

    if (now < taskTime) return "WAITING";
    if (now > missLimit) return "MISSED_TODAY";
    return "ACTIONABLE";
  };

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

  // --- DE BELANGRIJKSTE UPDATE: INNAME BEVESTIGEN + TIMER STARTEN ---
  const confirmMedication = async (id: number) => {
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
          }).catch(() => {});
          return null;
        }
        return current;
      });
    }, 5000);
  };

  const finishMedication = async (id: number) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;

    try {
      await fetch(`${ROBOT_API_URL}/lock_close`, {
        method: "POST",
      });
    } catch {}

    const newTasks = tasks.map((t) =>
      t.id === id ? { ...t, taken: true } : t,
    );

    setTasks(newTasks);

    const dateKey = `tasks_${selectedDate.toDateString()}`;
    await AsyncStorage.setItem(dateKey, JSON.stringify(newTasks));

    await decreaseStock(task.medId, task.amount);

    const updatedMeds = await getMedications();
    setLowStockMeds(updatedMeds.filter((m) => m.stock < 10));

    // 1. AWAIT pauzeert de code hier perfect totdat de robot klaar is met de eerste audio ("Medication-done.mp3")
    await Pi.confirmMed(id).catch(console.error);
    Pi.stopReminder().catch(() => {});

    const currentMed = updatedMeds.find((m) => m.id === task.medId);

    // Controleer of de voorraad kritiek is
    if (currentMed && currentMed.stock < 10 && !currentMed.isOrdered) {
      // Omdat we hebben gewacht op het inname-geluidje, is de speaker nu vrij!
      try {
        console.log("Trigger inventory warning...");
        await fetch(`${ROBOT_API_URL}/inventory_warning`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
      } catch (err) {
        console.error("Fout bij afspelen inventory_warning:", err);
      }

      try {
        console.log("Start restock timer...");
        await fetch(`${ROBOT_API_URL}/start_restock_timer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
      } catch (err) {
        console.error("Fout bij starten restock timer:", err);
      }
    }

    await AsyncStorage.removeItem("CAMERA_EMERGENCY_ACCESS");
    setEmergencyActive(false);
    setAlarmStage("idle");

    setTakingMedication(null);
  };

  const startDemoScenario = async () => {
    setShowDemoModal(true);
    setAlarmStage("reminder");

    // FASE 1
    await fetch("http://10.178.148.75:5001/start_reminder", {
      method: "POST",
    });

    setTimeout(async () => {
      setAlarmStage("waiting");

      // FASE 2
      await fetch("http://10.178.148.75:5001/second_reminder", {
        method: "POST",
      });
    }, 5000);

    setTimeout(async () => {
      setAlarmStage("emergency");
      setEmergencyActive(true);

      await AsyncStorage.setItem("CAMERA_EMERGENCY_ACCESS", "true");

      // FASE 3
      await fetch("http://10.178.148.75:5001/care_emergency", {
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
          {/*  STOCK ALERT (Slimme Versie) */}
          {/*  STOCK ALERT (Slimme Jury-proof Versie) */}
          {lowStockMeds.length > 0 &&
            (() => {
              const unhandledCount = lowStockMeds.filter(
                (m) => !m.isOrdered,
              ).length;
              const isAllHandled = unhandledCount === 0;

              // Bepaal de logica per rol
              const isMantelzorger = role === "mantelzorger";

              // Voor de patiënt is 'isAllHandled' goed nieuws (blauw).
              // Voor de mantelzorger is 'isAllHandled' (gemeld door patiënt) een actiepunt (rood).
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

                      // Kleur van de individuele pillen-chip
                      const chipBorderColor = isReported
                        ? isMantelzorger
                          ? "rgba(239, 68, 68, 0.4)" // Rood voor mantelzorger
                          : "rgba(96, 165, 250, 0.4)" // Blauw voor patiënt
                        : "rgba(255, 170, 0, 0.4)"; // Oranje als standaard waarschuwing

                      return (
                        <TouchableOpacity
                          key={med.id}
                          activeOpacity={0.7} // Zorgt voor de visuele klik-feedback
                          onPress={() => router.push("/medications")} // De snelkoppeling!
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

                switch (status) {
                  case "TAKEN":
                    btnStyle = styles.btnTaken;
                    btnText = "OK";
                    iconName = "checkmark";
                    isDisabled = true;
                    break;
                  case "ACTIONABLE":
                    btnStyle = styles.btnActive;
                    btnText = "NEEM IN";
                    iconName = "hand-right";
                    isDisabled = false;
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
                            status === "ACTIONABLE" && { color: "#00f0ff" },
                            status.includes("MISSED") && { color: "#ff4444" },
                          ]}
                        >
                          {task.time}
                        </Text>
                        <Text style={styles.nameText}>{task.name}</Text>
                      </View>
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

      {/* Reassuring dialog shown when a "privacy" notification is tapped */}
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
  alertSection: {
    backgroundColor: "rgba(255, 170, 0, 0.1)",
    borderColor: "rgba(255, 170, 0, 0.3)",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
  },
  alertHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  alertTitle: {
    color: "#ffaa00",
    fontWeight: "bold",
    fontSize: 13,
    textTransform: "uppercase",
  },
  alertSectionHandled: {
    backgroundColor: "rgba(96, 165, 250, 0.1)", // Blauw/Grijs gloed
    borderColor: "rgba(96, 165, 250, 0.3)",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
  },
  stockChip: {
    backgroundColor: "rgba(0,0,0,0.3)",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 170, 0, 0.4)",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  stockChipReported: {
    backgroundColor: "rgba(96, 165, 250, 0.1)",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(96, 165, 250, 0.3)",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  stockChipCountReported: {
    color: "#60a5fa",
    fontWeight: "bold",
    fontSize: 12,
  },
  stockChipName: { color: "white", fontSize: 15, fontWeight: "bold" },
  stockChipCount: { color: "#ffaa00", fontWeight: "bold", fontSize: 13 },
  timelineContainer: { marginTop: 0 },
  compactCard: { flexDirection: "row", height: 70 },
  timelineSidebar: { width: 30, alignItems: "center", paddingTop: 8 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#333" },
  dotGreen: { backgroundColor: "#34C759" },
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
    backgroundColor: "rgba(30,30,35, 0.4)",
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.03)",
  },
  timeText: { color: "#888", fontSize: 12, fontWeight: "bold" },
  nameText: { color: "white", fontSize: 15, fontWeight: "600" },
  compactBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 90,
    justifyContent: "center",
  },
  compactBtnText: { fontSize: 11, fontWeight: "bold" },
  btnDefault: { backgroundColor: "#333" },
  btnActive: { backgroundColor: "#007AFF" },
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
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