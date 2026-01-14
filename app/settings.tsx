/* eslint-disable react/no-unescaped-entities */
/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Switch,
  StatusBar,
  ActivityIndicator,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getPiBaseUrl, setPiBaseUrl, Pi } from "../services/pi";

export default function SettingsScreen() {
  const [url, setUrl] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactRelation, setContactRelation] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [demoMode, setDemoMode] = useState(true);
  const [loading, setLoading] = useState(false);

  // --- CUSTOM MODAL STATE ---
  const [modalVisible, setModalVisible] = useState(false);
  const [modalConfig, setModalConfig] = useState({
    title: "",
    message: "",
    type: "success", // 'success', 'error', 'warning'
    onConfirm: null as null | (() => void), // CONFIRM CALLBACK
  });

  // --- LOADING ---
  useEffect(() => {
    const load = async () => {
      const savedUrl = await getPiBaseUrl();
      setUrl(savedUrl);
      const savedName = await AsyncStorage.getItem("CONTACT_NAME");
      const savedRelation = await AsyncStorage.getItem("CONTACT_RELATION");
      const savedPhone = await AsyncStorage.getItem("CONTACT_PHONE");
      if (savedName) setContactName(savedName);
      if (savedRelation) setContactRelation(savedRelation);
      if (savedPhone) setContactPhone(savedPhone);
    };
    load();
  }, []);

  // --- HELPER: SHOW MODAL ---
  const showModal = (
    title: string,
    message: string,
    type: "success" | "error" | "warning",
    onConfirm: (() => void) | null = null
  ) => {
    setModalConfig({ title, message, type, onConfirm });
    setModalVisible(true);
  };

  const handlePhoneChange = (text: string) => {
    const cleaned = text.replace(/[^0-9]/g, "").slice(0, 10);
    setContactPhone(cleaned);
  };

  const saveContact = async () => {
    if (contactPhone.length < 9) {
      showModal(
        "Ongeldig Nummer",
        "Een telefoonnummer moet minstens 9 cijfers bevatten.",
        "error"
      );
      return;
    }
    await AsyncStorage.setItem("CONTACT_NAME", contactName);
    await AsyncStorage.setItem("CONTACT_RELATION", contactRelation);
    await AsyncStorage.setItem("CONTACT_PHONE", contactPhone);
    showModal(
      "Opgeslagen",
      "De contactgegevens zijn succesvol bijgewerkt.",
      "success"
    );
  };

  const testConnection = async () => {
    setLoading(true);
    try {
      await setPiBaseUrl(url);
      await Pi.health();
      showModal("Verbonden!", "De robot is bereikbaar.", "success");
    } catch (e) {
      showModal(
        "Verbinding Mislukt",
        "Kan geen verbinding maken. Check IP en WiFi.",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  const confirmReset = () => {
    showModal(
      "⚠️ Alles Wissen?",
      "Dit verwijdert alle medicatie-historiek en voorraad. Dit kan niet ongedaan gemaakt worden.",
      "warning",
      async () => {
        await AsyncStorage.clear();
        setModalVisible(false);
        // Short delay for UX
        setTimeout(() => {
          showModal(
            "Gereset",
            "De app is terug naar fabrieksinstellingen.",
            "success"
          );
        }, 300);
      }
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      <ScrollView contentContainerStyle={styles.content}>
        {/* SECTION 1: ROBOT */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ROBOT CONNECTIVITEIT</Text>
          <View style={styles.card}>
            <View style={styles.inputRow}>
              <Ionicons name="globe-outline" size={20} color="#666" />
              <TextInput
                style={styles.input}
                value={url}
                onChangeText={setUrl}
                placeholder="http://192.168..."
                placeholderTextColor="#444"
                autoCapitalize="none"
              />
            </View>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={testConnection}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.actionBtnText}>TEST VERBINDING</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* SECTION 2: CONTACT */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MANTELZORGER CONTACT</Text>
          <View style={styles.card}>
            <Text style={styles.label}>Naam</Text>
            <View style={styles.inputRow}>
              <Ionicons name="person-outline" size={20} color="#666" />
              <TextInput
                style={styles.input}
                value={contactName}
                onChangeText={setContactName}
                placeholder="bv. Sofie"
                placeholderTextColor="#444"
              />
            </View>

            <Text style={styles.label}>Relatie</Text>
            <View style={styles.inputRow}>
              <Ionicons name="heart-outline" size={20} color="#666" />
              <TextInput
                style={styles.input}
                value={contactRelation}
                onChangeText={setContactRelation}
                placeholder="bv. Dochter"
                placeholderTextColor="#444"
              />
            </View>

            <Text style={styles.label}>Telefoonnummer</Text>
            <View style={styles.inputRow}>
              <Ionicons name="call-outline" size={20} color="#666" />
              <TextInput
                style={styles.input}
                value={contactPhone}
                onChangeText={handlePhoneChange}
                placeholder="0475123456"
                placeholderTextColor="#444"
                keyboardType="number-pad"
                maxLength={10}
              />
            </View>

            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: "#333" }]}
              onPress={saveContact}
            >
              <Text style={styles.actionBtnText}>OPSLAAN</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* SECTION 3: DEMO */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SYSTEEM & DEMO</Text>
          <View style={styles.card}>
            <View style={styles.switchRow}>
              <View>
                <Text style={styles.switchTitle}>Demo Modus</Text>
                <Text style={styles.switchSub}>
                  Versnelde tijd (5 sec limiet)
                </Text>
              </View>
              <Switch
                value={demoMode}
                onValueChange={setDemoMode}
                trackColor={{ false: "#333", true: "#007AFF" }}
                thumbColor={"white"}
              />
            </View>
            <View style={styles.divider} />
            <TouchableOpacity style={styles.dangerBtn} onPress={confirmReset}>
              <Ionicons name="trash-outline" size={20} color="#ff4444" />
              <Text style={styles.dangerBtnText}>RESET ALLE DATA</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.footerText}>
          Mino v1.0{"\n"}
          "Slimme zorg, gerust gevoel."{"\n"}
          Afstudeerproject Stef Van Boven
        </Text>
      </ScrollView>

      {/* --- CUSTOM MODAL --- */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              {
                borderColor:
                  modalConfig.type === "error"
                    ? "#ff4444"
                    : modalConfig.type === "warning"
                    ? "#ffaa00"
                    : "#4ade80",
              },
            ]}
          >
            <View
              style={[
                styles.modalIcon,
                {
                  backgroundColor:
                    modalConfig.type === "error"
                      ? "#ff4444"
                      : modalConfig.type === "warning"
                      ? "#ffaa00"
                      : "#4ade80",
                },
              ]}
            >
              <Ionicons
                name={
                  modalConfig.type === "error"
                    ? "close"
                    : modalConfig.type === "warning"
                    ? "warning"
                    : "checkmark"
                }
                size={40}
                color="white"
              />
            </View>
            <Text style={styles.modalTitle}>{modalConfig.title}</Text>
            <Text style={styles.modalText}>{modalConfig.message}</Text>

            <View style={{ width: "100%", gap: 10 }}>
              {modalConfig.onConfirm ? (
                <>
                  <TouchableOpacity
                    style={[styles.modalBtn, { backgroundColor: "#ff4444" }]}
                    onPress={modalConfig.onConfirm}
                  >
                    <Text style={styles.modalBtnText}>JA, WISSEN</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtn, { backgroundColor: "#333" }]}
                    onPress={() => setModalVisible(false)}
                  >
                    <Text style={[styles.modalBtnText, { color: "white" }]}>
                      ANNULEER
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.modalBtn,
                    {
                      backgroundColor:
                        modalConfig.type === "error" ? "#ff4444" : "#4ade80",
                    },
                  ]}
                  onPress={() => setModalVisible(false)}
                >
                  <Text
                    style={[
                      styles.modalBtnText,
                      {
                        color:
                          modalConfig.type === "success" ? "#052e16" : "white",
                      },
                    ]}
                  >
                    OK
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#09090b" },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
  },
  headerTitle: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
    letterSpacing: 2,
  },
  content: { padding: 20 },
  section: { marginBottom: 30 },
  sectionTitle: {
    color: "#666",
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: 10,
    paddingLeft: 4,
  },
  card: { backgroundColor: "#1c1c1e", borderRadius: 12, padding: 16 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2c2c2e",
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
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
  label: { color: "#888", fontSize: 12, marginBottom: 6, marginLeft: 4 },
  actionBtn: {
    backgroundColor: "#007AFF",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
  },
  actionBtnText: { color: "white", fontWeight: "bold", fontSize: 14 },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  switchTitle: { color: "white", fontSize: 16, fontWeight: "600" },
  switchSub: { color: "#666", fontSize: 12 },
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.1)",
    marginVertical: 16,
  },
  dangerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(255, 68, 68, 0.1)",
    borderRadius: 8,
    paddingVertical: 12,
  },
  dangerBtnText: { color: "#ff4444", fontWeight: "bold", fontSize: 14 },
  footerText: {
    textAlign: "center",
    color: "#333",
    fontSize: 12,
    marginTop: 20,
    lineHeight: 18,
  },

  // MODAL STYLES
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#1c1c1e",
    width: "85%",
    borderRadius: 24,
    padding: 30,
    alignItems: "center",
    borderWidth: 1,
    shadowOpacity: 0.4,
    shadowRadius: 20,
  },
  modalIcon: {
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  modalTitle: {
    color: "white",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 10,
    textAlign: "center",
  },
  modalText: {
    color: "#ccc",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 22,
  },
  modalBtn: {
    paddingVertical: 14,
    width: "100%",
    borderRadius: 12,
    alignItems: "center",
  },
  modalBtnText: { fontWeight: "bold", fontSize: 14 },
});
