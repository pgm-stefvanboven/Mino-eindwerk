import React, { useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  Button,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Pi } from "../../services/pi";

const INITIAL_TASKS = [
  { id: 1, time: "08:00", name: "3x Paracetamol", taken: false },
  { id: 2, time: "12:00", name: "1x Bloeddrukpil", taken: false },
  { id: 3, time: "20:00", name: "1x Vitamine D", taken: false },
];

export default function VandaagScreen() {
  const [tasks, setTasks] = useState(INITIAL_TASKS);

  // --- DEMO FUNCTIE ---
  const startDemoScenario = () => {
    Alert.alert(
      "Scenario Gestart",
      "Mino begint nu met knipperen (Wit -> Oranje -> Rood)."
    );
    Pi.startReminder();
  };

  const confirmMedication = (id: number) => {
    const task = tasks.find((t) => t.id === id);
    if (task?.taken) return;

    // Visuele update
    setTasks((currentTasks) =>
      currentTasks.map((t) => (t.id === id ? { ...t, taken: true } : t))
    );

    console.log("Stuur bevestiging naar Pi voor medicijn:", id);

    // 1. Log in database
    Pi.confirmMed(id).catch(console.error);

    // 2. STOP HET ALARM OP DE ROBOT
    Pi.stopReminder().catch((err) => {
      console.log("Kon alarm niet stoppen:", err);
    });
  };

  const todoTasks = tasks.filter((task) => !task.taken);
  const doneTasks = tasks.filter((task) => task.taken);

  return (
    <SafeAreaView style={styles.container}>
      {/* --- DEMO KNOP --- */}
      <View
        style={{ backgroundColor: "#fff3cd", padding: 10, marginBottom: 10 }}
      >
        <Button
          title="Start Scenario (Demo)"
          color="#d97706"
          onPress={startDemoScenario}
        />
      </View>
      {/* ----------------- */}

      <Text style={styles.headerTitle}>Medicatie Vandaag</Text>

      <ScrollView contentContainerStyle={styles.list}>
        {todoTasks.length > 0 && (
          <Text style={styles.sectionHeader}>Nog in te nemen</Text>
        )}

        {todoTasks.map((task) => (
          <View key={task.id} style={styles.card}>
            <View style={styles.info}>
              <Text style={styles.time}>{task.time}</Text>
              <Text style={styles.name}>{task.name}</Text>
            </View>

            <TouchableOpacity
              onPress={() => confirmMedication(task.id)}
              style={[styles.button, styles.btnOpen]}
            >
              <Text style={styles.btnText}>BEVESTIG INNAME</Text>
            </TouchableOpacity>
          </View>
        ))}

        {todoTasks.length === 0 && (
          <View style={styles.allDoneContainer}>
            <Ionicons name="happy-outline" size={50} color="#34C759" />
            <Text style={styles.allDoneText}>
              Alles ingenomen voor vandaag!
            </Text>
          </View>
        )}

        {doneTasks.length > 0 && (
          <>
            <View style={styles.divider} />
            <Text style={styles.sectionHeaderGray}>Ingenomen</Text>

            {doneTasks.map((task) => (
              <View key={task.id} style={[styles.card, styles.cardTaken]}>
                <View style={styles.info}>
                  <Text style={[styles.time, styles.textGray]}>
                    {task.time}
                  </Text>
                  <Text style={[styles.name, styles.textGray]}>
                    {task.name}
                  </Text>
                </View>
                <View style={[styles.button, styles.btnTaken]}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <Ionicons name="checkmark-circle" size={24} color="white" />
                    <Text style={styles.btnText}>GENOMEN</Text>
                  </View>
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f2f2f7" },
  headerTitle: {
    fontSize: 32,
    fontWeight: "bold",
    padding: 20,
    color: "#1c1c1e",
  },
  list: { padding: 20, paddingTop: 0 },
  sectionHeader: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 10,
    marginTop: 10,
    color: "#1c1c1e",
  },
  sectionHeaderGray: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 10,
    marginTop: 10,
    color: "#8e8e93",
  },
  divider: { height: 1, backgroundColor: "#d1d1d6", marginVertical: 20 },
  card: {
    backgroundColor: "white",
    padding: 20,
    borderRadius: 16,
    marginBottom: 15,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  cardTaken: {
    backgroundColor: "#f2f2f7",
    opacity: 0.8,
    shadowOpacity: 0,
    elevation: 0,
    borderWidth: 1,
    borderColor: "#d1d1d6",
  },
  info: { marginBottom: 15 },
  time: { fontSize: 24, fontWeight: "800", color: "#007AFF" },
  name: { fontSize: 18, color: "#3a3a3c", marginTop: 4 },
  textGray: { color: "#8e8e93" },
  button: { padding: 16, borderRadius: 12, alignItems: "center" },
  btnOpen: { backgroundColor: "#007AFF" },
  btnTaken: { backgroundColor: "#34C759" },
  btnText: { color: "white", fontWeight: "bold", fontSize: 16 },
  allDoneContainer: { alignItems: "center", marginVertical: 20, opacity: 0.8 },
  allDoneText: {
    fontSize: 18,
    color: "#34C759",
    fontWeight: "bold",
    marginTop: 10,
  },
});