import React, { useState, useEffect, useCallback } from "react";
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

type Task = {
  id: number;
  time: string;
  name: string;
  taken: boolean;
  medId: string;
  amount: string;
};

const DEMO_MISS_LIMIT_SECONDS = 5;

export default function VandaagScreen() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [now, setNow] = useState(new Date());
  const [showDemoModal, setShowDemoModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [lowStockMeds, setLowStockMeds] = useState<Medication[]>([]);

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

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
    }, [loadData])
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

  const confirmMedication = async (id: number) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    if (getTaskStatus(task) !== "ACTIONABLE") return;

    // 1. UI Update
    const newTasks = tasks.map((t) =>
      t.id === id ? { ...t, taken: true } : t
    );
    setTasks(newTasks);

    // 2. Save status
    const dateKey = `tasks_${selectedDate.toDateString()}`;
    await AsyncStorage.setItem(dateKey, JSON.stringify(newTasks));

    // 3. Decrease stock in Database!
    await decreaseStock(task.medId, task.amount);

    // 4. Update local 'low stock' display immediately
    const updatedMeds = await getMedications();
    setLowStockMeds(updatedMeds.filter((m) => m.stock < 10));

    Pi.confirmMed(id).catch(console.error);
    Pi.stopReminder().catch(() => {});
  };

  const startDemoScenario = () => {
    setShowDemoModal(true);
    Pi.startReminder();
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
          {/*  STOCK ALERT (Only visible if there are <10) */}
          {lowStockMeds.length > 0 && (
            <View style={styles.alertSection}>
              <View style={styles.alertHeader}>
                <Ionicons name="warning" size={18} color="#ffaa00" />
                <Text style={styles.alertTitle}>Bijna op! Bijbestellen:</Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginTop: 10 }}
              >
                {lowStockMeds.map((med) => (
                  <View key={med.id} style={styles.stockChip}>
                    <Text style={styles.stockChipName}>{med.name}</Text>
                    <Text style={styles.stockChipCount}>Nog {med.stock}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* TIMELINE */}
          <View style={styles.timelineContainer}>
            {tasks.map((task, index) => {
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
                      onPress={() => confirmMedication(task.id)}
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
              <Text style={styles.demoLinkText}>Test Alarm Systeem</Text>
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
  stockChip: {
    backgroundColor: "#222",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#333",
    flexDirection: "row",
    gap: 6,
  },
  stockChipName: { color: "white", fontSize: 12 },
  stockChipCount: { color: "#ffaa00", fontWeight: "bold", fontSize: 12 },
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