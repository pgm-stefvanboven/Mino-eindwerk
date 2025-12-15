import React, { useEffect, useState } from "react";
import { View, Text, Pressable, Alert, StyleSheet } from "react-native";
import { Pi } from "../../services/pi";
import { useRouter } from "expo-router";

export default function TodayScreen() {
  const router = useRouter();
  const [healthTime, setHealthTime] = useState<string>("");

  useEffect(() => {
    Pi.health()
      .then((d) => setHealthTime(d.time))
      .catch((e) => Alert.alert("Fout", String(e)));
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Medicatie vandaag</Text>

      <Text style={styles.text}>Server tijd: {healthTime || "..."}</Text>

      <Pressable style={styles.btn} onPress={() => router.push("/connect")}>
        <Text style={styles.btnText}>Verbinding / IP instellen</Text>
      </Pressable>

      <Pressable
        style={[styles.btn, styles.secondary]}
        onPress={async () => {
          try {
            await Pi.testForward();
            Alert.alert("OK", "Robot test gestuurd!");
          } catch (e: any) {
            Alert.alert("Fout", e?.message ?? "Mislukt");
          }
        }}
      >
        <Text style={styles.btnText}>Robot test (vooruit)</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#f5f7fa",
  },
  title: { fontSize: 28, fontWeight: "800" },
  text: { fontSize: 16 },
  btn: {
    padding: 14,
    borderRadius: 10,
    backgroundColor: "#1e88e5",
    alignItems: "center",
  },
  secondary: { backgroundColor: "#2e7d32" },
  btnText: { color: "white", fontWeight: "800" },
});
