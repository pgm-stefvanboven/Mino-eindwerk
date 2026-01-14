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

// --- THE CORRECT DEMO CODES ---
const BARCODE_DB: Record<
  string,
  { name: string; dosage: string; stock: number }
> = {
  "5410123456786": { name: "Dafalgan Forte", dosage: "1g", stock: 30 },
  "8714567890128": { name: "Ibuprofen", dosage: "400mg", stock: 30 },
  "3056789012342": { name: "Metoprolol", dosage: "50mg", stock: 100 },
};

const ROBOT_API = "http://10.217.173.75:5001";

export default function MedicijnLijstScreen() {
  const [meds, setMeds] = useState<Medication[]>([]);
  const [permission, requestPermission] = useCameraPermissions();

  const [addModalVisible, setAddModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [cameraVisible, setCameraVisible] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);
  const [successData, setSuccessData] = useState({ title: "", msg: "" });

  const [selectedMed, setSelectedMed] = useState<Medication | null>(null);
  const [newName, setNewName] = useState("");
  const [newDosage, setNewDosage] = useState("");
  const [newStock, setNewStock] = useState("");

  const [isRefilling, setIsRefilling] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // NEW: State for caregiver information
  const [caregiverName, setCaregiverName] = useState("Familie");
  const [caregiverRelation, setCaregiverRelation] = useState("");

  // Update data every time the screen opens
  useFocusEffect(
    useCallback(() => {
      getMedications().then(setMeds);

      // LOAD CAREGIVER INFO FROM SETTINGS
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
        if (foundProduct.name !== selectedMed.name) {
          setTimeout(() => {
            Alert.alert(
              "⚠️ Foutief Medicijn",
              `Je probeert ${selectedMed.name} bij te vullen, maar je scande ${foundProduct.name}.`
            );
          }, 500);
          return;
        }
        updateStock(foundProduct.stock);
        showCustomSuccess(
          "Voorraad Bijgevuld",
          `Er zijn ${foundProduct.stock} stuks ${foundProduct.name} toegevoegd.`
        );
      } else {
        setNewName(foundProduct.name);
        setNewDosage(foundProduct.dosage);
        setNewStock(foundProduct.stock.toString());
        setIsLocked(true);
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

  const showCustomSuccess = (title: string, msg: string) => {
    setSuccessData({ title, msg });
    setTimeout(() => setSuccessVisible(true), 500);
  };

  const updateStock = async (amount: number) => {
    if (!selectedMed) return;
    const updatedList = meds.map((m) => {
      if (m.id === selectedMed.id) {
        const updatedStock = Math.max(0, m.stock + amount);
        setSelectedMed({ ...m, stock: updatedStock });
        return { ...m, stock: updatedStock };
      }
      return m;
    });
    setMeds(updatedList);
    await saveMedications(updatedList);
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

    setTimeout(() => {
      setIsSending(false);
      setEditModalVisible(false);
      showCustomSuccess(
        "Bericht Verzonden",
        `Verzoek voor ${medName} is succesvol verstuurd naar ${caregiverName} (${caregiverRelation}).`
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
          return (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => openEditModal(item)}
              style={[styles.card, isLow && styles.cardLowStock]}
            >
              <View style={[styles.iconContainer, isLow && styles.iconLow]}>
                <Ionicons
                  name={isLow ? "alert" : "medkit"}
                  size={24}
                  color={isLow ? "#ffaa00" : "#00f0ff"}
                />
              </View>
              <View style={styles.textContainer}>
                <Text style={styles.medName}>{item.name}</Text>
                <View style={styles.detailRow}>
                  <Text
                    style={[
                      styles.stockText,
                      isLow && { color: "#ffaa00", fontWeight: "bold" },
                    ]}
                  >
                    Nog {item.stock} stuks
                  </Text>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{item.dosage}</Text>
                  </View>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#666" />
            </TouchableOpacity>
          );
        }}
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => setAddModalVisible(true)}
      >
        <Ionicons name="barcode-outline" size={32} color="white" />
      </TouchableOpacity>

      {/* SUCCESS MODAL */}
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

      {/* CAMERA MODAL */}
      <Modal
        animationType="slide"
        visible={cameraVisible}
        onRequestClose={() => setCameraVisible(false)}
      >
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          onBarcodeScanned={handleBarcodeScanned}
          barcodeScannerSettings={{ barcodeTypes: ["ean13", "qr"] }}
        >
          <SafeAreaView style={styles.cameraOverlay}>
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
        </CameraView>
      </Modal>

      {/* REFILL MODAL */}
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
              onPress={() => startCamera(true)}
            >
              <Ionicons name="scan-circle" size={40} color="white" />
              <View>
                <Text style={styles.bigScanTitle}>SCAN NIEUWE DOOS</Text>
                <Text style={styles.bigScanSub}>Automatisch bijvullen</Text>
              </View>
            </TouchableOpacity>

            {selectedMed && selectedMed.stock < 10 && (
              <TouchableOpacity
                style={[styles.notifyBtn, isSending && { opacity: 0.7 }]}
                onPress={() => notifyCaregiver(selectedMed.name)}
                disabled={isSending}
              >
                {isSending ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <>
                    <Ionicons
                      name="paper-plane-outline"
                      size={20}
                      color="white"
                    />
                    {/* DYNAMIC BUTTON TEXT */}
                    <Text style={styles.notifyBtnText}>
                      VRAAG AAN {caregiverName.toUpperCase()}{" "}
                      {caregiverRelation
                        ? `(${caregiverRelation.toUpperCase()})`
                        : ""}
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
  iconLow: {
    backgroundColor: "rgba(255, 170, 0, 0.1)",
    borderColor: "rgba(255, 170, 0, 0.2)",
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
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  modalTitle: { color: "white", fontSize: 20, fontWeight: "bold" },
  successContent: {
    backgroundColor: "#1c1c1e",
    width: "80%",
    borderRadius: 24,
    padding: 30,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#4ade80",
    shadowColor: "#4ade80",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
  },
  successIcon: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "#4ade80",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
    shadowColor: "#4ade80",
    shadowOpacity: 0.6,
    shadowRadius: 10,
  },
  successTitle: {
    color: "white",
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 10,
    textAlign: "center",
  },
  successText: {
    color: "#ccc",
    fontSize: 15,
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 22,
  },
  successBtn: {
    backgroundColor: "#4ade80",
    paddingVertical: 14,
    width: "100%",
    borderRadius: 12,
    alignItems: "center",
  },
  successBtnText: { color: "#052e16", fontWeight: "bold", fontSize: 16 },
  scanSection: {
    backgroundColor: "rgba(0, 240, 255, 0.05)",
    padding: 15,
    borderRadius: 12,
    marginBottom: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(0, 240, 255, 0.2)",
    borderStyle: "dashed",
  },
  scanButton: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    backgroundColor: "#00f0ff",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  scanButtonText: { fontWeight: "bold", color: "black" },
  scanHint: { color: "#666", fontSize: 11, textAlign: "center" },
  bigScanBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
    backgroundColor: "#007AFF",
    padding: 20,
    borderRadius: 16,
    width: "100%",
    justifyContent: "center",
    shadowColor: "#007AFF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  bigScanTitle: { color: "white", fontWeight: "bold", fontSize: 18 },
  bigScanSub: { color: "rgba(255,255,255,0.7)", fontSize: 13 },
  divider: {
    height: 1,
    backgroundColor: "#333",
    marginVertical: 10,
    width: "100%",
  },
  inputLocked: {
    backgroundColor: "#1a1a1a",
    borderColor: "#4ade80",
    color: "#888",
  },
  lockedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(74, 222, 128, 0.1)",
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  lockedText: { color: "#4ade80", fontSize: 12, fontWeight: "bold" },
  label: {
    color: "#888",
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: 8,
    marginTop: 10,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  input: {
    backgroundColor: "#2c2c2e",
    color: "white",
    padding: 16,
    borderRadius: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  saveBtn: {
    backgroundColor: "#007AFF",
    padding: 18,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 30,
    marginBottom: 10,
  },
  saveBtnText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 14,
    letterSpacing: 1,
  },
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
  notifyBtnText: { color: "white", fontWeight: "bold", fontSize: 11 }, // Iets kleiner font voor lange namen
  closeBtn: {
    width: "100%",
    padding: 16,
    backgroundColor: "#333",
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