import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
  StyleSheet,
} from "react-native";
import { getPiBaseUrl, setPiBaseUrl, Pi } from "../services/pi";
import { useRouter } from "expo-router";

export default function ConnectScreen() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "ok" | "fail">("idle");

  useEffect(() => {
    getPiBaseUrl().then(setUrl);
  }, []);

  const test = async () => {
    try {
      await setPiBaseUrl(url);
      await Pi.health();
      setStatus("ok");
      Alert.alert("Gelukt", "Verbonden met de Raspberry Pi!");
    } catch (e: any) {
      setStatus("fail");
      Alert.alert("Fout", e?.message ?? "Kan geen verbinding maken");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Verbinding</Text>
      <Text style={styles.label}>Pi URL (bv. http://10.217.173.75:5001)</Text>

      <TextInput
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />

      <Pressable style={styles.btn} onPress={test}>
        <Text style={styles.btnText}>Test verbinding</Text>
      </Pressable>

      <Pressable
        style={[styles.btn, styles.secondary]}
        onPress={() => router.replace("/(tabs)")}
      >
        <Text style={styles.btnText}>Ga naar Medicatie</Text>
      </Pressable>

      <Text style={styles.status}>
        Status:{" "}
        {status === "idle" ? "—" : status === "ok" ? "✅ OK" : "❌ FAIL"}
      </Text>
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
  label: { opacity: 0.8 },
  input: {
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
  },
  btn: {
    padding: 14,
    borderRadius: 10,
    backgroundColor: "#1e88e5",
    alignItems: "center",
  },
  secondary: { backgroundColor: "#455a64" },
  btnText: { color: "white", fontWeight: "800" },
  status: { marginTop: 8, fontSize: 16 },
});
