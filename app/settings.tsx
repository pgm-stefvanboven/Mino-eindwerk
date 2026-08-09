/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Slider from "@react-native-community/slider";
import React, { useEffect, useState, useRef } from "react";
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
  BackHandler,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRole } from "../context/RoleContext";
import { getPiBaseUrl, Pi, setPiBaseUrl } from "../services/pi";
import { supabase } from "../lib/supabase";

export default function SettingsScreen() {
  const { role } = useRole();

  const [url, setUrl] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactRelation, setContactRelation] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [demoMode, setDemoMode] = useState(true);
  const [loading, setLoading] = useState(false);
  const [volume, setVolume] = useState(50);
  const [volumeLocked, setVolumeLocked] = useState(false);
  const [isEditingContact, setIsEditingContact] = useState(true);
  const [isEditingUrl, setIsEditingUrl] = useState(true);

  // SUPABASE SHARED STATES
  const [cameraAlwaysEnabled, setCameraAlwaysEnabled] = useState(false);
  const [contactLocked, setContactLocked] = useState(false);
  const [patientScanLocked, setPatientScanLocked] = useState(false);
  const [patientDeleteLocked, setPatientDeleteLocked] = useState(false);
  const lastResetSignal = useRef<number | null>(null);

  const [batteryVoltage, setBatteryVoltage] = useState<number | null>(null);
  const [batteryPercentage, setBatteryPercentage] = useState<number | null>(
    null,
  );
  const [robotOnline, setRobotOnline] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [modalConfig, setModalConfig] = useState<{
    title: string;
    message: string;
    type: "success" | "error" | "warning";
    onConfirm?: () => void;
    confirmText?: string;
  }>({
    title: "",
    message: "",
    type: "success",
  });

  // SUPABASE REALTIME LISTENER VOOR GEDEELDE INSTELLINGEN
  useEffect(() => {
    const fetchSharedSettings = async () => {
      const { data, error } = await supabase
        .from("shared_settings")
        .select("*")
        .eq("id", 1)
        .single();

      if (data && !error) {
        setContactLocked(data.contact_locked);
        setPatientScanLocked(data.scan_locked);
        setPatientDeleteLocked(data.delete_locked);
        setCameraAlwaysEnabled(data.camera_always_enabled);

        if (data.contact_name) setContactName(data.contact_name);
        if (data.contact_relation) setContactRelation(data.contact_relation);
        if (data.contact_phone) setContactPhone(data.contact_phone);

        if (data.contact_name || data.contact_phone) {
          setIsEditingContact(false);
        }

        if (data.mino_volume !== null) setVolume(data.mino_volume);
        if (data.volume_locked !== null) setVolumeLocked(data.volume_locked);

        // Sla het huidige reset-signaal op
        if (data.reset_signal !== null) {
          lastResetSignal.current = data.reset_signal;
        }
      }
    };

    fetchSharedSettings();

    const channel = supabase
      .channel("public:shared_settings")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "shared_settings" },
        (payload) => {
          const updatedSettings = payload.new;

          if (updatedSettings.contact_locked !== undefined)
            setContactLocked(updatedSettings.contact_locked);
          if (updatedSettings.scan_locked !== undefined)
            setPatientScanLocked(updatedSettings.scan_locked);
          if (updatedSettings.delete_locked !== undefined) {
            setPatientDeleteLocked(updatedSettings.delete_locked);
          }
          if (updatedSettings.camera_always_enabled !== undefined)
            setCameraAlwaysEnabled(updatedSettings.camera_always_enabled);
          if (updatedSettings.contact_name !== undefined)
            setContactName(updatedSettings.contact_name);
          if (updatedSettings.contact_relation !== undefined)
            setContactRelation(updatedSettings.contact_relation);
          if (updatedSettings.contact_phone !== undefined)
            setContactPhone(updatedSettings.contact_phone);
          if (updatedSettings.mino_volume !== undefined)
            setVolume(updatedSettings.mino_volume);
          if (updatedSettings.volume_locked !== undefined)
            setVolumeLocked(updatedSettings.volume_locked);

          // De globale Kill Switch!
          if (
            updatedSettings.reset_signal &&
            updatedSettings.reset_signal !== lastResetSignal.current
          ) {
            lastResetSignal.current = updatedSettings.reset_signal;

            // Wis alles lokaal en forceer de app om af te sluiten
            AsyncStorage.clear().then(() => {
              showModal(
                "Systeem Gereset",
                "Alle data en instellingen zijn zojuist gewist. De app zal nu afsluiten.",
                "warning",
                () => {
                  BackHandler.exitApp();
                },
                "AFSLUITEN",
              );
            });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // LOKALE INSTELLINGEN LADEN
  useEffect(() => {
    const loadLocal = async () => {
      const savedUrl = await getPiBaseUrl();
      setUrl(savedUrl);

      if (savedUrl) {
        setIsEditingUrl(false);
      }
    };
    loadLocal();
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
    onConfirm?: () => void,
    confirmText: string = "JA, WISSEN",
  ) => {
    setModalConfig({ title, message, type, onConfirm, confirmText });
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

    const { error } = await supabase
      .from("shared_settings")
      .update({
        contact_name: contactName,
        contact_relation: contactRelation,
        contact_phone: contactPhone,
      })
      .eq("id", 1);

    if (error) {
      console.error(error);
      showModal(
        "Fout",
        "Kon contactgegevens niet synchroniseren met de cloud.",
        "error",
      );
    } else {
      showModal(
        "Opgeslagen",
        "De contactgegevens zijn succesvol bijgewerkt.",
        "success",
      );
      setIsEditingContact(false);
    }
  };

  const handleVolumeChange = async (value: number) => {
    const roundedVolume = Math.round(value);
    setVolume(roundedVolume);

    await supabase
      .from("shared_settings")
      .update({ mino_volume: roundedVolume })
      .eq("id", 1);

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

  const toggleVolumeLock = async (value: boolean) => {
    setVolumeLocked(value);
    await supabase
      .from("shared_settings")
      .update({ volume_locked: value })
      .eq("id", 1);
  };

  const toggleContactLock = async (value: boolean) => {
    setContactLocked(value);
    await supabase
      .from("shared_settings")
      .update({ contact_locked: value })
      .eq("id", 1);
  };

  const togglePatientScanLock = async (value: boolean) => {
    setPatientScanLocked(value);
    await supabase
      .from("shared_settings")
      .update({ scan_locked: value })
      .eq("id", 1);
  };

  const togglePatientDeleteLock = async (value: boolean) => {
    setPatientDeleteLocked(value);

    const { error } = await supabase
      .from("shared_settings")
      .update({ delete_locked: value })
      .eq("id", 1);

    if (error) {
      console.error(
        "❌ Fout bij updaten delete_locked in Supabase:",
        error.message,
      );
      setPatientDeleteLocked(!value);
      showModal(
        "Fout bij Opslaan",
        "Kon de instelling niet opslaan in Supabase. Controleer of de kolom 'delete_locked' bestaat in de tabel 'shared_settings'.",
        "error",
      );
    } else {
      console.log("✅ delete_locked succesvol bijgewerkt naar:", value);
    }
  };

  const toggleCameraAlwaysEnabled = async (value: boolean) => {
    setCameraAlwaysEnabled(value);
    await supabase
      .from("shared_settings")
      .update({ camera_always_enabled: value })
      .eq("id", 1);
  };

  const testConnection = async () => {
    setLoading(true);
    try {
      await setPiBaseUrl(url);
      await Pi.health();
      setRobotOnline(true);
      showModal("Verbonden!", "De robot is bereikbaar.", "success");
      setIsEditingUrl(false);
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
    await supabase
      .from("shared_settings")
      .update({ emergency_camera_unlocked: false })
      .eq("id", 1);
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
        setModalVisible(false);

        await supabase
          .from("shared_settings")
          .update({
            contact_locked: false,
            scan_locked: false,
            camera_always_enabled: false,
            emergency_camera_unlocked: false,
            reset_signal: Date.now(),
          })
          .eq("id", 1);
      },
    );
  };

  // --- HULPVARIABELEN VOOR DE UI ---
  const isPatientLocked = role === "patient" && contactLocked;
  const canEdit = isEditingContact && !isPatientLocked;
  const hasData = Boolean(contactName || contactPhone);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      <ScrollView contentContainerStyle={styles.content}>
        {/* MANTELZORGER CONTACTGEGEVENS */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MANTELZORGER CONTACTGEGEVENS</Text>

          <View style={styles.card}>
            <Text style={styles.label}>Naam</Text>
            <View style={[styles.inputRow, !canEdit && { opacity: 0.7 }]}>
              <Ionicons name="person-outline" size={20} color="#666" />
              <TextInput
                style={styles.input}
                value={contactName}
                onChangeText={setContactName}
                placeholder="Naam mantelzorger"
                placeholderTextColor="#444"
                editable={canEdit}
              />
            </View>

            <Text style={styles.label}>Relatie</Text>
            <View style={[styles.inputRow, !canEdit && { opacity: 0.7 }]}>
              <Ionicons name="people-outline" size={20} color="#666" />
              <TextInput
                style={styles.input}
                value={contactRelation}
                onChangeText={setContactRelation}
                placeholder="Bijv. Dochter"
                placeholderTextColor="#444"
                editable={canEdit}
              />
            </View>

            <Text style={styles.label}>Telefoonnummer</Text>
            <View style={[styles.inputRow, !canEdit && { opacity: 0.7 }]}>
              <Ionicons name="call-outline" size={20} color="#666" />
              <TextInput
                style={styles.input}
                value={contactPhone}
                onChangeText={handlePhoneChange}
                placeholder="0470123456"
                placeholderTextColor="#444"
                keyboardType="phone-pad"
                maxLength={10}
                editable={canEdit}
              />
            </View>

            {/* KNOPPEN LOGICA */}
            {!isEditingContact && !isPatientLocked ? (
              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  { marginTop: 8, backgroundColor: "#333" },
                ]}
                onPress={() => setIsEditingContact(true)}
              >
                <Text style={styles.actionBtnText}>GEGEVENS BEWERKEN</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  { marginTop: 8 },
                  isPatientLocked && { opacity: 0.5 },
                ]}
                disabled={isPatientLocked}
                onPress={saveContact}
              >
                <Text style={styles.actionBtnText}>
                  {hasData
                    ? "CONTACTGEGEVENS BIJWERKEN"
                    : "CONTACTGEGEVENS OPSLAAN"}
                </Text>
              </TouchableOpacity>
            )}

            {role === "patient" && contactLocked && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginTop: 12,
                }}
              >
                <Ionicons
                  name="lock-closed"
                  size={14}
                  color="#ffaa00"
                  style={{ marginRight: 6 }}
                />
                <Text style={{ color: "#ffaa00", fontSize: 12 }}>
                  Contactgegevens zijn vergrendeld door de mantelzorger.
                </Text>
              </View>
            )}

            {role === "mantelzorger" && (
              <>
                <View style={styles.divider} />

                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: "rgba(16,185,129,0.12)",
                    borderRadius: 10,
                    padding: 12,
                  }}
                >
                  <Ionicons
                    name="notifications-circle"
                    size={28}
                    color="#10b981"
                  />

                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <Text
                      style={{
                        color: "white",
                        fontWeight: "600",
                        fontSize: 15,
                      }}
                    >
                      Dit toestel ontvangt noodmeldingen
                    </Text>
                    <Text
                      style={{ color: "#9ca3af", fontSize: 12, marginTop: 2 }}
                    >
                      Geregistreerd als mantelzorger voor pushnotificaties.
                    </Text>
                  </View>

                  <Ionicons name="checkmark-circle" size={24} color="#10b981" />
                </View>
              </>
            )}
          </View>
        </View>

        {/* AUDIO & VOLUME */}
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
                minimumTrackTintColor={
                  role === "patient" && volumeLocked ? "#444" : "#007AFF"
                }
                maximumTrackTintColor="#333"
                thumbTintColor={
                  role === "patient" && volumeLocked ? "#666" : "white"
                }
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
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ROBOT CONNECTIVITEIT</Text>

          <View style={styles.card}>
            {url ? (
              <View
                style={{
                  backgroundColor: "rgba(0,0,0,0.2)",
                  borderRadius: 8,
                  padding: 14,
                  marginBottom: 16,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.03)",
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 12,
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
                        letterSpacing: 1,
                      }}
                    >
                      {robotOnline ? "ONLINE" : "OFFLINE"}
                    </Text>
                  </View>
                </View>

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

            {(() => {
              const isUrlLockedForPatient = role === "patient";
              const canEditUrl = isEditingUrl && !isUrlLockedForPatient;

              return (
                <>
                  <View
                    style={[styles.inputRow, !canEditUrl && { opacity: 0.7 }]}
                  >
                    <Ionicons name="globe-outline" size={20} color="#666" />
                    <TextInput
                      style={styles.input}
                      value={url}
                      onChangeText={setUrl}
                      placeholder="http://192.168..."
                      placeholderTextColor="#444"
                      autoCapitalize="none"
                      editable={canEditUrl}
                    />
                  </View>

                  {isUrlLockedForPatient ? (
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={testConnection}
                      disabled={loading}
                    >
                      {loading ? (
                        <ActivityIndicator color="white" />
                      ) : (
                        <Text style={styles.actionBtnText}>
                          TEST VERBINDING
                        </Text>
                      )}
                    </TouchableOpacity>
                  ) : !isEditingUrl ? (
                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <TouchableOpacity
                        style={[
                          styles.actionBtn,
                          { flex: 1, backgroundColor: "#333" },
                        ]}
                        onPress={() => setIsEditingUrl(true)}
                      >
                        <Text style={styles.actionBtnText}>BEWERKEN</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionBtn, { flex: 1 }]}
                        onPress={testConnection}
                        disabled={loading}
                      >
                        {loading ? (
                          <ActivityIndicator color="white" />
                        ) : (
                          <Text style={styles.actionBtnText}>TEST</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={testConnection}
                      disabled={loading}
                    >
                      {loading ? (
                        <ActivityIndicator color="white" />
                      ) : (
                        <Text style={styles.actionBtnText}>
                          {url ? "OPSLAAN & TESTEN" : "TEST VERBINDING"}
                        </Text>
                      )}
                    </TouchableOpacity>
                  )}

                  {isUrlLockedForPatient && (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        marginTop: 12,
                      }}
                    >
                      <Ionicons
                        name="lock-closed"
                        size={14}
                        color="#ffaa00"
                        style={{ marginRight: 6 }}
                      />
                      <Text style={{ color: "#ffaa00", fontSize: 12 }}>
                        Netwerkinstellingen worden beheerd door de mantelzorger.
                      </Text>
                    </View>
                  )}
                </>
              );
            })()}
          </View>
        </View>

        {/* ADAPTIEVE ZORG - Enkel voor Mantelzorger */}
        {role === "mantelzorger" && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ADAPTIEVE ZORG (PATIËNT)</Text>
            <View style={styles.card}>
              <View style={styles.switchRow}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={styles.switchTitle}>
                    Vergrendel mantelzorgergegevens
                  </Text>
                  <Text style={styles.switchSub}>
                    Voorkom dat de patiënt de contactgegevens van de
                    mantelzorger wijzigt.
                  </Text>
                </View>
                <Switch
                  value={contactLocked}
                  onValueChange={toggleContactLock}
                  trackColor={{ false: "#333", true: "#ffaa00" }}
                  thumbColor="white"
                />
              </View>

              <View style={styles.divider} />

              <View style={styles.switchRow}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={styles.switchTitle}>
                    Vergrendel medicatiebeheer
                  </Text>
                  <Text style={styles.switchSub}>
                    Voorkom dat de patiënt zelfstandig medicatie scant, bijvult,
                    bewerkt of verwijdert.
                  </Text>
                </View>
                <Switch
                  value={patientScanLocked}
                  onValueChange={togglePatientScanLock}
                  trackColor={{ false: "#333", true: "#ffaa00" }}
                  thumbColor="white"
                />
              </View>

              <View style={styles.divider} />

              <View style={styles.switchRow}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={styles.switchTitle}>Vergrendel volume</Text>
                  <Text style={styles.switchSub}>
                    Patiënt kan het volume van de Mino robot niet meer
                    aanpassen.
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
                    <Text style={styles.modalBtnText}>
                      {modalConfig.confirmText}
                    </Text>
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