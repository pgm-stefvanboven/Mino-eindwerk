import React, { useState } from "react";
import {
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  View,
  Text,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

export default function MedicijnLijstScreen() {
  const [meds, setMeds] = useState([
    { id: "1", name: "Paracetamol", dosage: "500mg" },
    { id: "2", name: "Ibuprofen", dosage: "400mg" },
  ]);
  const [newName, setNewName] = useState("");

  const addMed = () => {
    if (newName.trim().length === 0) return;
    setMeds([
      ...meds,
      { id: Date.now().toString(), name: newName, dosage: "Standaard" },
    ]);
    setNewName("");
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.headerTitle}>Alle Medicijnen</Text>

      {/* Invoer veld */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Nieuw medicijn naam..."
          value={newName}
          onChangeText={setNewName}
        />
        <TouchableOpacity onPress={addMed} style={styles.addBtn}>
          <Ionicons name="add" size={28} color="white" />
        </TouchableOpacity>
      </View>

      {/* De Lijst */}
      <FlatList
        data={meds}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <View style={styles.iconBox}>
              <Ionicons name="medkit" size={24} color="#007AFF" />
            </View>
            <View>
              <Text style={styles.medName}>{item.name}</Text>
              <Text style={styles.medDose}>{item.dosage}</Text>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f2f2f7", padding: 20 },
  headerTitle: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 20,
    color: "#1c1c1e",
  },
  inputContainer: { flexDirection: "row", marginBottom: 20, gap: 10 },
  input: {
    flex: 1,
    backgroundColor: "white",
    padding: 15,
    borderRadius: 12,
    fontSize: 16,
  },
  addBtn: {
    backgroundColor: "#007AFF",
    width: 56,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 12,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
  },
  iconBox: {
    width: 40,
    height: 40,
    backgroundColor: "#e3f2fd",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
  },
  medName: { fontSize: 17, fontWeight: "600" },
  medDose: { fontSize: 14, color: "gray" },
});