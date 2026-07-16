/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Slider from "@react-native-community/slider";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRole } from "../context/RoleContext";
import { getPiBaseUrl, Pi, setPiBaseUrl } from "../services/pi";

export default function SettingsScreen() {
  const { role, setRole } = useRole();

  const [url, setUrl] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactRelation, setContactRelation] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [demoMode, setDemoMode] = useState(true);
  const [loading, setLoading] = useState(false);

  // Zorg scenario states
  const [requireScan, setRequireScan] = useState(true);
  const [volumeLocked, setVolumeLocked] = useState(false); // NIEUW
  const [volume, setVolume] = useState(50); // NIEUW

  // Nieuwe state voor de demo camera override
  const [cameraAlwaysEnabled, setCameraAlwaysEnabled] = useState(false);

  const [batteryVoltage, setBatteryVoltage] = useState<number | null>(null);
  const [batteryPercentage, setBatteryPercentage] = useState<number | null>(
    null,
  );
  const [robotOnline, setRobotOnline] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [modalConfig, setModalConfig] = useState({
    title: "",
    message: "",
    type: "success",
    onConfirm: null as null | (() => void),
  });

  useEffect(() => {
    const load = async () => {
      const savedUrl = await getPiBaseUrl();
      setUrl(savedUrl);
      const savedName = await AsyncStorage.getItem("CONTACT_NAME");
      const savedRelation = await AsyncStorage.getItem("CONTACT_RELATION");
      const savedPhone = await AsyncStorage.getItem("CONTACT_PHONE");
      const savedScan = await AsyncStorage.getItem("REQUIRE_SCAN");
      const savedCamAlways = await AsyncStorage.getItem(
        "CAMERA_ALWAYS_ENABLED",
      );
      const savedVolumeLock = await AsyncStorage.getItem("VOLUME_LOCKED");

      if (savedScan !== null) setRequireScan(savedScan === "true");
      if (savedCamAlways !== null)
        setCameraAlwaysEnabled(savedCamAlways === "true");
      if (savedVolumeLock !== null) setVolumeLocked(savedVolumeLock === "true");

      if (savedName) setContactName(savedName);
      if (savedRelation) setContactRelation(savedRelation);
      if (savedPhone) setContactPhone(savedPhone);

      const savedVolume = await AsyncStorage.getItem("MINO_VOLUME");
      if (savedVolume !== null) {
        setVolume(parseInt(savedVolume)); // Set the slider to the saved value
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (!url) return;
    loadBattery();
    const interval = setInterval(() => loadBattery(), 5000);
    return () => clearInterval(interval);
  }, [url]);

  const showModal = (
    title: string,
    message: string,
    type: "success" | "error" | "warning",
    onConfirm: (() => void) | null = null,
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
        "error",
      );
      return;
    }
    await AsyncStorage.setItem("CONTACT_NAME", contactName);
    await AsyncStorage.setItem("CONTACT_RELATION", contactRelation);
    await AsyncStorage.setItem("CONTACT_PHONE", contactPhone);
    showModal(
      "Opgeslagen",
      "De contactgegevens zijn succesvol bijgewerkt.",
      "success",
    );
  };

  const toggleRequireScan = async (value: boolean) => {
    setRequireScan(value);
    await AsyncStorage.setItem("REQUIRE_SCAN", value.toString());
  };

  // NIEUW: Functie om volume lock op te slaan
  const toggleVolumeLock = async (value: boolean) => {
    setVolumeLocked(value);
    await AsyncStorage.setItem("VOLUME_LOCKED", value.toString());
  };

  // NIEUW: Functie om volume naar backend te sturen
  const handleVolumeChange = async (value: number) => {
    const roundedVolume = Math.round(value);
    setVolume(roundedVolume);

    // NIEUW: Sla het volume lokaal op in de app
    await AsyncStorage.setItem("MINO_VOLUME", roundedVolume.toString());

    if (!url) return;

    try {
      await fetch(`${url}/api/volume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ volume: roundedVolume }),
      });
    } catch (error) {
      console.error("Fout bij aanpassen volume:", error);
    }
  };

  const toggleCameraAlwaysEnabled = async (value: boolean) => {
    setCameraAlwaysEnabled(value);
    await AsyncStorage.setItem("CAMERA_ALWAYS_ENABLED", value.toString());
  };

  const testConnection = async () => {
    setLoading(true);
    try {
      await setPiBaseUrl(url);
      await Pi.health();
      setRobotOnline(true);
      showModal("Verbonden!", "De robot is bereikbaar.", "success");
    } catch (e) {
      setRobotOnline(false);
      showModal(
        "Verbinding Mislukt",
        "Kan geen verbinding maken. Check IP en WiFi.",
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  async function loadBattery() {
    try {
      const response = await fetch(`${url}/battery`);
      const data = await response.json();
      setBatteryVoltage(data.raw);
      setBatteryPercentage(data.percentage);
      setRobotOnline(true);
    } catch (error) {
      setRobotOnline(false);
    }
  }

  const resetZorgScenario = async () => {
    await AsyncStorage.removeItem("CAMERA_EMERGENCY_ACCESS");
    showModal(
      "Scenario Gereset",
      "De noodtoegang is ingetrokken en het scenario is gereset.",
      "success",
    );
  };

  const confirmReset = () => {
    showModal(
      "Alles Wissen?",
      "Dit verwijdert alle medicatie-historiek en voorraad. Dit kan niet ongedaan gemaakt worden.",
      "warning",
      async () => {
        await AsyncStorage.clear();
        setModalVisible(false);
        setTimeout(
          () =>
            showModal(
              "Gereset",
              "De app is terug naar fabrieksinstellingen.",
              "success",
            ),
          300,
        );
      },
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      <ScrollView contentContainerStyle={styles.content}>
        {/* ACCOUNT WISSELEN */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ACCOUNT WISSELEN (DEMO)</Text>
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.accountRow}
              onPress={() => setRole("patient")}
            >
              <View
                style={[
                  styles.avatarCircle,
                  { backgroundColor: role === "patient" ? "#3b82f6" : "#333" },
                ]}
              >
                <Text style={styles.avatarText}>G</Text>
              </View>
              <Text
                style={[
                  styles.accountName,
                  role === "patient" && { fontWeight: "bold", color: "white" },
                ]}
              >
                Gebruiker (Patiënt)
              </Text>
              {role === "patient" && (
                <Ionicons name="checkmark-circle" size={24} color="#3b82f6" />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.accountRow, { borderBottomWidth: 0 }]}
              onPress={() => setRole("mantelzorger")}
            >
              <View
                style={[
                  styles.avatarCircle,
                  {
                    backgroundColor:
                      role === "mantelzorger" ? "#10b981" : "#333",
                  },
                ]}
              >
                <Text style={styles.avatarText}>M</Text>
              </View>
              <Text
                style={[
                  styles.accountName,
                  role === "mantelzorger" && {
                    fontWeight: "bold",
                    color: "white",
                  },
                ]}
              >
                Mantelzorger
              </Text>
              {role === "mantelzorger" && (
                <Ionicons name="checkmark-circle" size={24} color="#10b981" />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* NIEUW: AUDIO & VOLUME (Zichtbaar voor iedereen, maar disableable voor patiënt) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AUDIO & VOLUME</Text>
          <View style={styles.card}>
            <View style={{ alignItems: "center", paddingVertical: 10 }}>
              <Text
                style={{
                  color: "white",
                  fontSize: 16,
                  marginBottom: 15,
                  fontWeight: "600",
                }}
              >
                Mino Volume: {Math.round(volume)}%
              </Text>
              <Slider
                style={{ width: "100%", height: 40 }}
                minimumValue={0}
                maximumValue={100}
                step={1}
                value={volume}
                onValueChange={(val) => setVolume(val)}
                onSlidingComplete={handleVolumeChange}
                // Pas kleuren aan als het vergrendeld is
                minimumTrackTintColor={
                  role === "patient" && volumeLocked ? "#444" : "#007AFF"
                }
                maximumTrackTintColor="#333"
                thumbTintColor={
                  role === "patient" && volumeLocked ? "#666" : "white"
                }
                // Disable de slider voor de patiënt als de lock aan staat
                disabled={role === "patient" && volumeLocked}
              />
              {role === "patient" && volumeLocked && (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginTop: 10,
                  }}
                >
                  <Ionicons
                    name="lock-closed"
                    size={14}
                    color="#ffaa00"
                    style={{ marginRight: 6 }}
                  />
                  <Text style={{ color: "#ffaa00", fontSize: 12 }}>
                    Volume is vergrendeld door mantelzorger
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* CONNECTIVITEIT */}
        {/* CONNECTIVITEIT */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ROBOT CONNECTIVITEIT</Text>

          <View style={styles.card}>
            {/* STATUS & BATTERIJ DASHBOARD (Nu ín de kaart) */}
            {url ? (
              <View
                style={{
                  backgroundColor: "rgba(0,0,0,0.2)", // Subtiele diepte
                  borderRadius: 8,
                  padding: 14,
                  marginBottom: 16,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.03)",
                }}
              >
                {/* Systeemstatus */}
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 12, // Ruimte tussen status en batterij
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Ionicons
                      name="hardware-chip-outline"
                      size={16}
                      color="#888"
                    />
                    <Text style={{ color: "#888", fontSize: 14 }}>
                      Systeemstatus
                    </Text>
                  </View>

                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: robotOnline ? "#3cdc78" : "#ff4444",
                        shadowColor: robotOnline ? "#3cdc78" : "#ff4444",
                        shadowOpacity: 0.5,
                        shadowRadius: 4,
                      }}
                    />
                    <Text
                      style={{
                        color: robotOnline ? "#3cdc78" : "#ff4444",
                        fontWeight: "bold",
                        fontSize: 14,
                        letterSpacing: 1, // Maakt uppercase tekst strakker
                      }}
                    >
                      {robotOnline ? "ONLINE" : "OFFLINE"}
                    </Text>
                  </View>
                </View>

                {/* Batterij */}
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Ionicons
                      name={
                        batteryPercentage !== null && batteryPercentage <= 20
                          ? "battery-dead"
                          : "battery-half"
                      }
                      size={16}
                      color="#888"
                    />
                    <Text style={{ color: "#888", fontSize: 14 }}>
                      Batterij
                    </Text>
                  </View>

                  <Text
                    style={{
                      // Kleur rood als batterij 20% of lager is, anders wit
                      color:
                        batteryPercentage !== null && batteryPercentage <= 20
                          ? "#ff4444"
                          : "white",
                      fontWeight: "bold",
                      fontSize: 14,
                    }}
                  >
                    {batteryPercentage !== null
                      ? `${batteryPercentage}%`
                      : "--%"}

                    {/* Voltage in een zachtere kleur zodat het percentage de focus krijgt */}
                    <Text
                      style={{
                        color: "#666",
                        fontWeight: "normal",
                        fontSize: 12,
                      }}
                    >
                      {batteryVoltage !== null
                        ? ` (${batteryVoltage.toFixed(1)}V)`
                        : ""}
                    </Text>
                  </Text>
                </View>
              </View>
            ) : null}

            {/* IP INPUT & KNOP */}
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

        {/* MANTELZORGER SPECIFIEK */}
        {role === "mantelzorger" && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ADAPTIEVE ZORG (PATIËNT)</Text>
            <View style={styles.card}>
              <View style={styles.switchRow}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={styles.switchTitle}>
                    Zelfstandig Voorraad Beheer
                  </Text>
                  <Text style={styles.switchSub}>
                    De patiënt kan barcodes scannen en zo nieuwe doosjes
                    medicatie toevoegen of de voorraad bijwerken. Zet dit uit
                    bij vergevorderde dementie.
                  </Text>
                </View>
                <Switch
                  value={requireScan}
                  onValueChange={toggleRequireScan}
                  trackColor={{ false: "#333", true: "#10b981" }}
                  thumbColor="white"
                />
              </View>

              <View style={styles.divider} />

              {/* NIEUW: Volume lock switch voor mantelzorger */}
              <View style={styles.switchRow}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={styles.switchTitle}>Vergrendel Volume</Text>
                  <Text style={styles.switchSub}>
                    Blokkeer de volume-slider voor de patiënt om onbedoeld
                    geluidsoverlast of overprikkeling te voorkomen.
                  </Text>
                </View>
                <Switch
                  value={volumeLocked}
                  onValueChange={toggleVolumeLock}
                  trackColor={{ false: "#333", true: "#ffaa00" }}
                  thumbColor="white"
                />
              </View>
            </View>
          </View>
        )}

        {/* DEMO & SYSTEEM */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SYSTEEM & DEMO</Text>
          <View style={styles.card}>
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
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

            <View style={styles.switchRow}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.switchTitle}>
                  Demo: camera altijd beschikbaar
                </Text>
                <Text style={styles.switchSub}>
                  Overschrijft de privacymodus. Handig tijdens de verdediging of
                  om te testen.
                </Text>
              </View>
              <Switch
                value={cameraAlwaysEnabled}
                onValueChange={toggleCameraAlwaysEnabled}
                trackColor={{ false: "#333", true: "#007AFF" }}
                thumbColor={"white"}
              />
            </View>

            {role === "mantelzorger" && (
              <>
                <View style={styles.divider} />

                <TouchableOpacity
                  style={[
                    styles.dangerBtn,
                    {
                      backgroundColor: "rgba(255, 170, 0, 0.1)",
                      marginBottom: 10,
                    },
                  ]}
                  onPress={resetZorgScenario}
                >
                  <Ionicons name="refresh" size={20} color="#ffaa00" />
                  <Text style={[styles.dangerBtnText, { color: "#ffaa00" }]}>
                    RESET ZORGSCENARIO
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.dangerBtn}
                  onPress={confirmReset}
                >
                  <Ionicons name="trash-outline" size={20} color="#ff4444" />
                  <Text style={styles.dangerBtnText}>RESET ALLE DATA</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        <Text style={styles.footerText}>
          Mino v1.0{"\n"}
          "Slimme zorg, gerust gevoel."{"\n"}
          Afstudeerproject Stef Van Boven
        </Text>
      </ScrollView>

      {/* CUSTOM MODAL */}
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

  // --- NIEUWE STYLES VOOR DE ACCOUNT SWITCHER ---
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  avatarText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
  },
  accountName: {
    flex: 1,
    color: "#a1a1aa",
    fontSize: 16,
  },
  // ----------------------------------------------

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
