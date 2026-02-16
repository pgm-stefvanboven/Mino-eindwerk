/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useState, useCallback } from "react";
import {
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  View,
  Text,
  StatusBar,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useFocusEffect } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Medication,
  getMedications,
  saveMedications,
} from "../../data/medications";

// --- DATABASE VOOR BARCODES ---
const BARCODE_DB: Record<
  string,
  { name: string; dosage: string; stock: number }
> = {
  "5410123456786": { name: "Dafalgan Forte", dosage: "1g", stock: 30 },
  "8714567890128": { name: "Ibuprofen", dosage: "400mg", stock: 30 },
  "3056789012342": { name: "Metoprolol", dosage: "50mg", stock: 100 },
};

const ROBOT_API = "http://10.81.173.75:5001";

export default function MedicijnLijstScreen() {
  const [meds, setMeds] = useState<Medication[]>([]);
  const [permission, requestPermission] = useCameraPermissions();

  // Modals state
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [cameraVisible, setCameraVisible] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);
  const [successData, setSuccessData] = useState({ title: "", msg: "" });

  // Data state
  const [selectedMed, setSelectedMed] = useState<Medication | null>(null);

  // New Medication Form state
  const [newName, setNewName] = useState("");
  const [newDosage, setNewDosage] = useState("");
  const [newStock, setNewStock] = useState("");

  const [isRefilling, setIsRefilling] = useState(false); // True = bestaand bijvullen, False = nieuw toevoegen
  const [isLocked, setIsLocked] = useState(false); // Als true, zijn velden ingevuld door scanner
  const [isSending, setIsSending] = useState(false);

  // Caregiver info
  const [caregiverName, setCaregiverName] = useState("Familie");
  const [caregiverRelation, setCaregiverRelation] = useState("");

  // Update data every time the screen opens
  useFocusEffect(
    useCallback(() => {
      getMedications().then(setMeds);

      const loadContact = async () => {
        const name = await AsyncStorage.getItem("CONTACT_NAME");
        const relation = await AsyncStorage.getItem("CONTACT_RELATION");
        if (name) setCaregiverName(name);
        if (relation) setCaregiverRelation(relation);
      };
      loadContact();
    }, [])
  );

  // --- CAMERA LOGIC ---
  const startCamera = async (refillMode = false) => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) return;
    }
    setIsRefilling(refillMode);
    setCameraVisible(true);
  };

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    setCameraVisible(false);
    const foundProduct = BARCODE_DB[data];

    if (foundProduct) {
      if (isRefilling && selectedMed) {
        // SCENARIO 1: BIJVULLEN BESTAAND
        if (foundProduct.name !== selectedMed.name) {
          setTimeout(() => {
            Alert.alert(
              "⚠️ Foutief Medicijn",
              `Je probeert ${selectedMed.name} bij te vullen, maar je scande ${foundProduct.name}.`
            );
          }, 500);
          return;
        }

        // Update stock direct
        const updateStockLogic = async (amount: number) => {
          const updatedList = meds.map((m) => {
            if (m.id === selectedMed.id) {
              const updatedStock = Math.max(0, m.stock + amount);
              // Update ook lokale state voor de modal
              setSelectedMed({ ...m, stock: updatedStock, isOrdered: false });
              return { ...m, stock: updatedStock, isOrdered: false };
            }
            return m;
          });
          setMeds(updatedList);
          await saveMedications(updatedList);
          showCustomSuccess("Gelukt!", `Voorraad bijgewerkt.`);
        };

        // Voeg standaard doos grootte toe
        updateStockLogic(foundProduct.stock);
      } else {
        // SCENARIO 2: NIEUW TOEVOEGEN
        setNewName(foundProduct.name);
        setNewDosage(foundProduct.dosage);
        setNewStock(foundProduct.stock.toString());
        setIsLocked(true); // Velden op slot want het is een geverifieerd product

        // Zorg dat het toevoeg scherm open staat
        setAddModalVisible(true);

        showCustomSuccess(
          "Product Herkend",
          `EAN: ${data}\n${foundProduct.name} (${foundProduct.dosage})`
        );
      }
    } else {
      setTimeout(() => {
        Alert.alert(
          "Onbekend Product",
          `Code ${data} staat niet in de demo database.`
        );
      }, 500);
    }
  };

  // --- SAVING NEW MEDICINE ---
  const handleSaveNew = async () => {
    if (!newName || !newStock) {
      Alert.alert("Invullen aub", "Naam en voorraad zijn verplicht.");
      return;
    }

    const newMedItem: Medication = {
      id: Date.now().toString(),
      name: newName,
      dosage: newDosage || "N.v.t.",
      stock: parseInt(newStock) || 0,
      isOrdered: false,
    };

    const updatedList = [...meds, newMedItem];
    setMeds(updatedList);
    await saveMedications(updatedList);

    setAddModalVisible(false);
    setNewName("");
    setNewDosage("");
    setNewStock("");
    setIsLocked(false);
  };

  // --- NOTIFICATIONS & UPDATES ---
  const showCustomSuccess = (title: string, msg: string) => {
    setSuccessData({ title, msg });
    setTimeout(() => setSuccessVisible(true), 500);
  };

  const deleteMed = (id: string) => {
    const newList = meds.filter((m) => m.id !== id);
    setMeds(newList);
    saveMedications(newList);
    setEditModalVisible(false);
  };

  const openEditModal = (med: Medication) => {
    setSelectedMed(med);
    setEditModalVisible(true);
  };

  const notifyCaregiver = async (medName: string) => {
    setIsSending(true);
    try {
      await fetch(`${ROBOT_API}/notify_caregiver`, { method: "POST" });
    } catch (e) {
      console.log("Robot offline (demo mode)");
    }

    if (selectedMed) {
      const updatedList = meds.map((m) => {
        if (m.id === selectedMed.id) {
          return { ...m, isOrdered: true };
        }
        return m;
      });
      setMeds(updatedList);
      saveMedications(updatedList);
      // Update local selection to show checkmark immediately
      setSelectedMed({ ...selectedMed, isOrdered: true });
    }

    setTimeout(() => {
      setIsSending(false);
      setEditModalVisible(false);
      setEditModalVisible(false);
      showCustomSuccess(
        "Gemeld aan familie",
        `Verzoek voor ${medName} is succesvol verstuurd.`
      );
    }, 1500);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.headerContainer}>
        <Text style={styles.appTitle}>Medicijn Voorraad</Text>
        <Text style={styles.subTitle}>
          Tik op een medicijn om details te bekijken of bij te vullen.
        </Text>
      </View>

      <FlatList
        data={meds}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const isLow = item.stock < 10;
          const isReported = item.isOrdered === true;

          let statusColor = "#00f0ff";
          let statusIcon: keyof typeof Ionicons.glyphMap = "medkit";
          let statusText = `Nog ${item.stock} stuks`;
          let textColor = "#666";

          if (isReported) {
            statusColor = "#60a5fa";
            statusIcon = "mail-unread";
            statusText = "Gemeld aan familie";
            textColor = "#60a5fa";
          } else if (isLow) {
            statusColor = "#ffaa00";
            statusIcon = "alert";
            statusText = `Nog ${item.stock} stuks - Bijvullen!`;
            textColor = "#ffaa00";
          }

          return (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => openEditModal(item)}
              style={[
                styles.card,
                isLow && !isReported && styles.cardLowStock,
                isReported && styles.cardReported,
              ]}
            >
              <View
                style={[
                  styles.iconContainer,
                  {
                    backgroundColor: `${statusColor}20`,
                    borderColor: `${statusColor}40`,
                  },
                ]}
              >
                <Ionicons name={statusIcon} size={24} color={statusColor} />
              </View>

              <View style={styles.textContainer}>
                <Text style={styles.medName}>{item.name}</Text>
                <View style={styles.detailRow}>
                  <Text
                    style={[
                      styles.stockText,
                      {
                        color: textColor,
                        fontWeight: isLow || isReported ? "bold" : "normal",
                      },
                    ]}
                  >
                    {statusText}
                  </Text>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{item.dosage}</Text>
                  </View>
                </View>
              </View>

              <Ionicons
                name={isReported ? "checkmark" : "chevron-forward"}
                size={20}
                color={isReported ? "#60a5fa" : "#666"}
              />
            </TouchableOpacity>
          );
        }}
      />

      {/* --- FAB (Floating Action Button) MET HET JUISTE SCAN ICOON --- */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          // Reset fields for new entry
          setNewName("");
          setNewDosage("");
          setNewStock("");
          setIsLocked(false);
          setAddModalVisible(true);
        }}
      >
        <Ionicons name="barcode-outline" size={30} color="white" />
      </TouchableOpacity>

      {/* --- MODAL 1: ADD NEW MEDICINE (LOCKED & STYLED) --- */}
      <Modal
        animationType="slide"
        visible={addModalVisible}
        onRequestClose={() => setAddModalVisible(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: "#09090b" }}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1 }}
          >
            <View style={styles.modalContentFullScreen}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Nieuw Medicijn</Text>
                <TouchableOpacity onPress={() => setAddModalVisible(false)}>
                  <Ionicons name="close" size={28} color="#888" />
                </TouchableOpacity>
              </View>

              {/* Scan Button inside Add Modal */}
              <TouchableOpacity
                style={styles.scanSection}
                onPress={() => startCamera(false)}
              >
                <View style={styles.scanButton}>
                  <Ionicons name="barcode-outline" size={22} color="white" />
                  <Text style={styles.scanButtonText}>SCAN BARCODE</Text>
                </View>
                <Text style={styles.scanHint}>
                  of vul de gegevens hieronder handmatig in
                </Text>
              </TouchableOpacity>

              {isLocked && (
                <View style={styles.lockedBanner}>
                  <Ionicons name="checkmark-circle" size={20} color="#4ade80" />
                  <Text style={styles.lockedText}>
                    Product herkend & geverifieerd
                  </Text>
                </View>
              )}

              {/* NAAM MEDICIJN (LOCKED NA SCAN) */}
              <Text style={styles.label}>NAAM MEDICIJN</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={[styles.input, isLocked && styles.inputLocked]}
                  placeholder="bv. Paracetamol"
                  placeholderTextColor="#666"
                  value={newName}
                  onChangeText={setNewName}
                  editable={!isLocked} // KAN NIET AANPASSEN NA SCAN
                />
                {isLocked && (
                  <Ionicons
                    name="lock-closed"
                    size={18}
                    color="#666"
                    style={styles.lockIcon}
                  />
                )}
              </View>

              {/* DOSERING (LOCKED NA SCAN) */}
              <Text style={styles.label}>DOSERING</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={[styles.input, isLocked && styles.inputLocked]}
                  placeholder="bv. 500mg"
                  placeholderTextColor="#666"
                  value={newDosage}
                  onChangeText={setNewDosage}
                  editable={!isLocked} // KAN NIET AANPASSEN NA SCAN
                />
                {isLocked && (
                  <Ionicons
                    name="lock-closed"
                    size={18}
                    color="#666"
                    style={styles.lockIcon}
                  />
                )}
              </View>

              {/* VOORRAAD (ALTIJD AANPASBAAR) */}
              <Text style={styles.label}>AANTAL STUKS / VOORRAAD</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input} // GEEN LOCKED STYLE HIER
                  placeholder="0"
                  placeholderTextColor="#666"
                  value={newStock}
                  onChangeText={setNewStock}
                  keyboardType="numeric"
                />
                {/* Geen slot icoon hier, want je mag dit altijd aanpassen */}
              </View>

              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveNew}>
                <Text style={styles.saveBtnText}>TOEVOEGEN AAN VOORRAAD</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* --- MODAL 2: SUCCESS MESSAGE --- */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={successVisible}
        onRequestClose={() => setSuccessVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.successContent}>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark" size={50} color="white" />
            </View>
            <Text style={styles.successTitle}>{successData.title}</Text>
            <Text style={styles.successText}>{successData.msg}</Text>
            <TouchableOpacity
              style={styles.successBtn}
              onPress={() => setSuccessVisible(false)}
            >
              <Text style={styles.successBtnText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* --- MODAL 3: CAMERA (GECORRIGEERD) --- */}
      <Modal
        animationType="slide"
        visible={cameraVisible}
        onRequestClose={() => setCameraVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: "black" }}>
          {/* 1. De Camera staat nu 'los', zonder children */}
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            onBarcodeScanned={handleBarcodeScanned}
            barcodeScannerSettings={{ barcodeTypes: ["ean13", "qr"] }}
          />

          {/* 2. De Overlay staat er nu 'overheen' via absolute positionering */}
          <SafeAreaView
            style={[styles.cameraOverlay, StyleSheet.absoluteFill]}
            pointerEvents="box-none"
          >
            <TouchableOpacity
              onPress={() => setCameraVisible(false)}
              style={styles.closeCameraBtn}
            >
              <Ionicons name="close" size={30} color="white" />
            </TouchableOpacity>

            <View style={styles.scanFrame}>
              <View style={styles.scanLine} />
            </View>

            <Text style={styles.cameraText}>
              {isRefilling
                ? `Scan doosje ${selectedMed?.name}`
                : "Scan nieuw medicijn"}
            </Text>
          </SafeAreaView>
        </View>
      </Modal>

      {/* --- MODAL 4: EDIT / REFILL --- */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={editModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { alignItems: "center" }]}>
            <Text style={styles.modalTitle}>{selectedMed?.name}</Text>
            <Text style={{ color: "#888", marginBottom: 20 }}>
              {selectedMed?.dosage}
            </Text>

            <Text style={styles.label}>HUIDIGE VOORRAAD</Text>
            <Text
              style={{
                fontSize: 60,
                fontWeight: "bold",
                color: "white",
                marginBottom: 30,
              }}
            >
              {selectedMed?.stock}
            </Text>

            <TouchableOpacity
              style={styles.bigScanBtn}
              onPress={() => {
                setEditModalVisible(false); // Sluit eerst dit scherm
                setTimeout(() => startCamera(true), 500); // Start dan camera
              }}
            >
              <Ionicons name="scan-circle" size={40} color="white" />
              <View>
                <Text style={styles.bigScanTitle}>SCAN NIEUWE DOOS</Text>
                <Text style={styles.bigScanSub}>Automatisch bijvullen</Text>
              </View>
            </TouchableOpacity>

            {selectedMed && selectedMed.stock < 10 && (
              <TouchableOpacity
                disabled={isSending || selectedMed.isOrdered}
                style={[
                  styles.notifyBtn,
                  isSending && { opacity: 0.7 },
                  selectedMed.isOrdered && styles.notifyBtnOrdered,
                ]}
                onPress={() => notifyCaregiver(selectedMed.name)}
              >
                {isSending ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <>
                    <Ionicons
                      name={
                        selectedMed.isOrdered
                          ? "checkmark-circle"
                          : "paper-plane-outline"
                      }
                      size={20}
                      color="white"
                    />
                    <Text style={styles.notifyBtnText}>
                      {selectedMed.isOrdered
                        ? "REEDS GEMELD AAN FAMILIE"
                        : `VRAAG AAN ${caregiverName.toUpperCase()} ${
                            caregiverRelation
                              ? `(${caregiverRelation.toUpperCase()})`
                              : ""
                          }`}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={() => selectedMed && deleteMed(selectedMed.id)}
              style={{ marginTop: 20, padding: 10 }}
            >
              <Text style={{ color: "#ff4444", fontWeight: "bold" }}>
                Verwijder medicijn
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setEditModalVisible(false)}
              style={styles.closeBtn}
            >
              <Text style={styles.closeBtnText}>SLUITEN</Text>
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
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  appTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
    letterSpacing: 1,
  },
  subTitle: { color: "#888", fontSize: 13, marginTop: 4 },
  listContent: { padding: 20, paddingBottom: 100 },

  // --- CARDS ---
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(30,30,35, 0.6)",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  cardLowStock: {
    borderColor: "rgba(255, 170, 0, 0.3)",
    backgroundColor: "rgba(255, 170, 0, 0.05)",
  },
  cardReported: {
    borderColor: "rgba(96, 165, 250, 0.3)",
    backgroundColor: "rgba(96, 165, 250, 0.05)",
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "rgba(0, 240, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
    borderWidth: 1,
    borderColor: "rgba(0, 240, 255, 0.2)",
  },
  textContainer: { flex: 1 },
  medName: { color: "white", fontSize: 17, fontWeight: "600", marginBottom: 6 },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  badge: {
    backgroundColor: "#222",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#333",
  },
  badgeText: { color: "#ccc", fontSize: 12, fontWeight: "500" },
  stockText: { color: "#666", fontSize: 12 },

  // --- FAB (ADD BUTTON) ---
  fab: {
    position: "absolute",
    right: 20,
    bottom: 30,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#007AFF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },

  // --- MODALS ALGEMENE STYLING ---
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#1c1c1e",
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    width: "90%",
  },
  modalContentFullScreen: {
    flex: 1,
    padding: 20,
    paddingTop: 50, // Iets meer ruimte voor de notch
    backgroundColor: "#09090b",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 25,
  },
  modalTitle: { color: "white", fontSize: 22, fontWeight: "bold" },

  // --- SUCCESS POPUP ---
  successContent: {
    backgroundColor: "#1c1c1e",
    width: "80%",
    borderRadius: 24,
    padding: 30,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#4ade80",
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(74, 222, 128, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  successTitle: {
    color: "white",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 10,
    textAlign: "center",
  },
  successText: {
    color: "#aaa",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 20,
  },
  successBtn: {
    backgroundColor: "#4ade80",
    paddingVertical: 12,
    width: "100%",
    borderRadius: 12,
    alignItems: "center",
  },
  successBtnText: { color: "#052e16", fontWeight: "bold", fontSize: 16 },

  // --- SCAN SECTION ---
  scanSection: {
    backgroundColor: "#131313",
    padding: 20,
    borderRadius: 16,
    marginBottom: 25,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#333",
    borderStyle: "dashed",
  },
  scanButton: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    backgroundColor: "#2563eb", // Iets dieper blauw
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 10,
    marginBottom: 10,
  },
  scanButtonText: { fontWeight: "700", color: "white", fontSize: 15 },
  scanHint: { color: "#666", fontSize: 12, textAlign: "center" },

  // --- INPUT FIELDS & LOCKING ---
  label: {
    color: "#888",
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 8,
    marginTop: 15,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginLeft: 4,
  },
  inputWrapper: {
    position: "relative", // Nodig om het slotje te positioneren
    justifyContent: "center",
  },
  input: {
    backgroundColor: "#1c1c1e",
    color: "white",
    padding: 16,
    paddingRight: 40, // Ruimte maken voor het slot icoon
    borderRadius: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#333",
  },
  // Nieuwe stijl voor gesloten velden (ziet eruit als 'read-only')
  inputLocked: {
    backgroundColor: "#111", // Donkerder
    borderColor: "transparent", // Geen rand
    color: "#666", // Tekst donkerder
  },
  lockIcon: {
    position: "absolute",
    right: 15,
    opacity: 0.5,
  },

  // --- VERIFIED BANNER ---
  lockedBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(74, 222, 128, 0.15)", // Subtiel groen
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(74, 222, 128, 0.3)",
  },
  lockedText: {
    color: "#4ade80",
    fontSize: 13,
    fontWeight: "600",
    marginLeft: 10,
  },

  // --- BUTTONS ---
  saveBtn: {
    backgroundColor: "#007AFF",
    padding: 18,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 40,
    shadowColor: "#007AFF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  saveBtnText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 15,
    letterSpacing: 0.5,
  },

  // --- OVERIGE STYLES (CAMERA ETC) ---
  bigScanBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
    backgroundColor: "#007AFF",
    padding: 20,
    borderRadius: 16,
    width: "100%",
    justifyContent: "center",
  },
  bigScanTitle: { color: "white", fontWeight: "bold", fontSize: 18 },
  bigScanSub: { color: "rgba(255,255,255,0.7)", fontSize: 13 },
  notifyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#d97706",
    padding: 14,
    borderRadius: 12,
    width: "100%",
    justifyContent: "center",
    marginTop: 20,
  },
  notifyBtnOrdered: {
    backgroundColor: "#10b981",
    borderColor: "#059669",
    borderWidth: 1,
    opacity: 1,
  },
  notifyBtnText: { color: "white", fontWeight: "bold", fontSize: 11 },
  closeBtn: {
    width: "100%",
    padding: 16,
    backgroundColor: "#2c2c2e",
    borderRadius: 12,
    alignItems: "center",
    marginTop: 10,
  },
  closeBtnText: { color: "white", fontWeight: "bold" },
  cameraOverlay: {
    flex: 1,
    backgroundColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
  },
  scanFrame: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: "#00f0ff",
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.1)",
  },
  scanLine: {
    width: "90%",
    height: 2,
    backgroundColor: "#ff0000",
    opacity: 0.6,
  },
  cameraText: {
    color: "white",
    marginTop: 20,
    fontSize: 16,
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 10,
    borderRadius: 8,
  },
  closeCameraBtn: {
    position: "absolute",
    top: 50,
    right: 20,
    padding: 10,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 20,
  },
});