import React, { useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
// BELANGRIJK: We importeren je Pi service
import { Pi } from "../../services/pi";

// Dit is nep-data. Later kun je dit vervangen door Pi.getMeds()
const INITIAL_TASKS = [
  { id: 1, time: "08:00", name: "3x Paracetamol", taken: false },
  { id: 2, time: "12:00", name: "1x Bloeddrukpil", taken: false },
];

export default function VandaagScreen() {
  const [tasks, setTasks] = useState(INITIAL_TASKS);

  const toggleTask = (id: number) => {
    // 1. Visuele update: Maak het vinkje direct groen (voor snelle reactie)
    setTasks((currentTasks) =>
      currentTasks.map((task) =>
        task.id === id ? { ...task, taken: !task.taken } : task
      )
    );

    // 2. Hardware actie: Stuur commando naar de Robot
    console.log("Stuur bevestiging naar Pi voor medicijn:", id);

    Pi.confirmMed(id)
      .then((response) => {
        console.log("Robot antwoord:", response);
        // Optioneel: Je zou hier nog een extra melding kunnen tonen
      })
      .catch((err) => {
        console.log("Fout bij verbinden met robot:", err);
        // Geef alleen een melding als het echt misgaat, om de gebruiker niet te storen
        Alert.alert(
          "Verbindingsfout",
          "Kon de robot niet bereiken voor het geluidssignaal."
        );
      });
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.headerTitle}>Medicatie Vandaag</Text>

      <ScrollView contentContainerStyle={styles.list}>
        {tasks.map((task) => (
          <View
            key={task.id}
            style={[styles.card, task.taken && styles.cardTaken]}
          >
            <View style={styles.info}>
              <Text style={styles.time}>{task.time}</Text>
              <Text style={styles.name}>{task.name}</Text>
            </View>

            <TouchableOpacity
              onPress={() => toggleTask(task.id)}
              style={[
                styles.button,
                task.taken ? styles.btnTaken : styles.btnOpen,
              ]}
            >
              {task.taken ? (
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
                >
                  <Ionicons name="checkmark-circle" size={24} color="white" />
                  <Text style={styles.btnText}>GENOMEN</Text>
                </View>
              ) : (
                <Text style={styles.btnText}>BEVESTIG INNAME</Text>
              )}
            </TouchableOpacity>
          </View>
        ))}
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
  cardTaken: { backgroundColor: "#e8f5e9", opacity: 0.8 },
  info: { marginBottom: 15 },
  time: { fontSize: 24, fontWeight: "800", color: "#007AFF" },
  name: { fontSize: 18, color: "#3a3a3c", marginTop: 4 },
  button: { padding: 16, borderRadius: 12, alignItems: "center" },
  btnOpen: { backgroundColor: "#007AFF" },
  btnTaken: { backgroundColor: "#34C759" },
  btnText: { color: "white", fontWeight: "bold", fontSize: 16 },
});