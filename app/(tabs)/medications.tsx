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
  ScrollView,
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
  { name: string; dosage: string; stockToAdd: number }
> = {
  "5410123456786": { name: "Dafalgan Forte", dosage: "1g", stockToAdd: 20 },
  "5410123456799": { name: "Dafalgan Forte", dosage: "1g", stockToAdd: 50 },
  "8714567890128": { name: "Ibuprofen", dosage: "400mg", stockToAdd: 30 },
  "3056789012342": { name: "Metoprolol", dosage: "50mg", stockToAdd: 100 },
};

const ROBOT_API = "http://10.81.173.75:5001";

// --- SYSTEM LIMITS ---
const MAX_STOCK_PER_MED = 500;
const SCAN_COOLDOWN = 2000;

// Tijdsslot voor jongdementie: 12 uur in milliseconden
const DEMENTIA_TIME_LOCK = 12 * 60 * 60 * 1000;

export default function MedicijnLijstScreen() {
  const [meds, setMeds] = useState<Medication[]>([]);
  const [permission, requestPermission] = useCameraPermissions();

  // Modals state
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [cameraVisible, setCameraVisible] = useState(false);

  // Custom Alerts State
  const [successVisible, setSuccessVisible] = useState(false);
  const [successData, setSuccessData] = useState({ title: "", msg: "" });

  const [warningVisible, setWarningVisible] = useState(false);
  const [warningData, setWarningData] = useState({ title: "", msg: "" });

  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmData, setConfirmData] = useState({
    title: "",
    msg: "",
    confirmText: "TOEVOEGEN",
    isDestructive: false,
    onConfirm: () => {},
  });

  // Data state
  const [selectedMed, setSelectedMed] = useState<Medication | null>(null);

  // New Medication Form state
  const [newName, setNewName] = useState("");
  const [newDosage, setNewDosage] = useState("");
  const [newStock, setNewStock] = useState("");

  const [isRefilling, setIsRefilling] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [lastScanTime, setLastScanTime] = useState(0);

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
    }, []),
  );

  // --- CUSTOM ALERT HELPERS ---
  const showCustomSuccess = (title: string, msg: string) => {
    setSuccessData({ title, msg });
    setTimeout(() => setSuccessVisible(true), 500);
  };

  const showCustomWarning = (title: string, msg: string) => {
    setWarningData({ title, msg });
    setWarningVisible(true);
  };

  const showCustomConfirm = (
    title: string,
    msg: string,
    onConfirm: () => void,
    confirmText: string = "TOEVOEGEN",
    isDestructive: boolean = false,
  ) => {
    setConfirmData({ title, msg, onConfirm, confirmText, isDestructive });
    setConfirmVisible(true);
  };

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
    const now = Date.now();

    if (now - lastScanTime < SCAN_COOLDOWN) {
      return;
    }

    setLastScanTime(now);
    setCameraVisible(false);

    const foundProduct = BARCODE_DB[data];

    if (foundProduct) {
      if (isRefilling && selectedMed) {
        if (
          foundProduct.name.toLowerCase() !== selectedMed.name.toLowerCase()
        ) {
          setTimeout(() => {
            showCustomWarning(
              "Foutief Medicijn",
              `Je probeert ${selectedMed.name} bij te vullen, maar je scande ${foundProduct.name}.`,
            );
          }, 500);
          return;
        }

        const updateStockLogic = async () => {
          let updatedItem: Medication | null = null;

          const updatedList = meds.map((m) => {
            if (m.id === selectedMed.id) {
              const updatedStock = Math.min(
                MAX_STOCK_PER_MED,
                m.stock + foundProduct.stockToAdd,
              );

              if (updatedStock === MAX_STOCK_PER_MED) {
                setTimeout(() => {
                  showCustomWarning(
                    "Voorraad limiet",
                    "Maximum voorraad voor dit medicijn bereikt.",
                  );
                }, 1000);
              }

              updatedItem = {
                ...m,
                stock: updatedStock,
                isOrdered: false,
                lastScannedAt: now,
              };
              return updatedItem;
            }
            return m;
          });

          if (updatedItem) {
            setSelectedMed(updatedItem);
          }
          setMeds(updatedList);
          await saveMedications(updatedList);

          showCustomSuccess(
            "Gelukt!",
            `Voorraad verhoogd met ${foundProduct.stockToAdd} stuks.`,
          );
        };

        // DEMENTIE BEVEILIGING (met bevestiging)
        if (
          selectedMed.lastScannedAt &&
          now - selectedMed.lastScannedAt < DEMENTIA_TIME_LOCK
        ) {
          setTimeout(() => {
            showCustomConfirm(
              "Medicijn vandaag al gescand",
              "Dit medicijn werd vandaag al toegevoegd. Heb je echt een tweede doos gescand?",
              () => {
                setConfirmVisible(false);
                updateStockLogic();
              },
              "TOEVOEGEN",
              false,
            );
          }, 500);
          return;
        }

        updateStockLogic();
      } else {
        setNewName(foundProduct.name);
        setNewDosage(foundProduct.dosage);
        setNewStock(foundProduct.stockToAdd.toString());
        setIsLocked(true);

        setAddModalVisible(true);

        showCustomSuccess(
          "Product Herkend",
          `Doosje met ${foundProduct.stockToAdd} stuks gevonden.`,
        );
      }
    } else {
      setTimeout(() => {
        showCustomWarning(
          "Onbekend Product",
          `Code ${data} staat niet in het systeem.`,
        );
      }, 500);
    }
  };

  // --- SAVING NEW MEDICINE ---
  const handleSaveNew = async () => {
    if (!newName || !newStock) {
      showCustomWarning("Invullen aub", "Naam en voorraad zijn verplicht.");
      return;
    }

    const stockAmount = parseInt(newStock) || 0;
    const now = Date.now();

    const existingMed = meds.find(
      (m) =>
        m.name.toLowerCase() === newName.toLowerCase() &&
        m.dosage.toLowerCase() === newDosage.toLowerCase(),
    );

    let updatedList: Medication[];

    if (existingMed) {
      if (
        existingMed.lastScannedAt &&
        now - existingMed.lastScannedAt < DEMENTIA_TIME_LOCK
      ) {
        showCustomWarning(
          "Al toegevoegd!",
          "Je hebt dit medicijn vandaag al bijgevuld in de app. Om verwarring te voorkomen, hebben we deze scan geblokkeerd.",
        );
        return;
      }

      const newStockValue = Math.min(
        MAX_STOCK_PER_MED,
        existingMed.stock + stockAmount,
      );

      updatedList = meds.map((m) =>
        m.id === existingMed.id
          ? { ...m, stock: newStockValue, lastScannedAt: now }
          : m,
      );

      showCustomSuccess(
        "Voorraad bijgewerkt",
        `${existingMed.name} voorraad verhoogd.`,
      );
    } else {
      const newMedItem: Medication = {
        id: Date.now().toString(),
        name: newName,
        dosage: newDosage || "N.v.t.",
        stock: Math.min(stockAmount, MAX_STOCK_PER_MED),
        isOrdered: false,
        lastScannedAt: now,
      };

      updatedList = [...meds, newMedItem];

      showCustomSuccess(
        "Medicijn toegevoegd",
        `${newName} toegevoegd aan voorraad.`,
      );
    }

    setMeds(updatedList);
    await saveMedications(updatedList);

    setAddModalVisible(false);
    setNewName("");
    setNewDosage("");
    setNewStock("");
    setIsLocked(false);
  };

  const deleteMed = (id: string) => {
    const newList = meds.filter((m) => m.id !== id);
    setMeds(newList);
    saveMedications(newList);
    setEditModalVisible(false);

    // Optioneel: toon een succesmelding dat het verwijderd is
    showCustomSuccess("Verwijderd", "Het medicijn is succesvol verwijderd.");
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
      setSelectedMed({ ...selectedMed, isOrdered: true });
    }

    setTimeout(() => {
      setIsSending(false);
      setEditModalVisible(false);
      showCustomSuccess(
        "Gemeld aan familie",
        `Verzoek voor ${medName} is succesvol verstuurd.`,
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

      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          setNewName("");
          setNewDosage("");
          setNewStock("");
          setIsLocked(false);
          setAddModalVisible(true);
        }}
      >
        <Ionicons name="barcode-outline" size={30} color="white" />
      </TouchableOpacity>

      {/* --- MODAL 1: ADD NEW MEDICINE --- */}
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
            {/* ScrollView toegevoegd zodat je naar de onderste velden kunt scrollen */}
            <ScrollView
              contentContainerStyle={{ flexGrow: 1 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.modalContentFullScreen}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Nieuw Medicijn</Text>
                  <TouchableOpacity onPress={() => setAddModalVisible(false)}>
                    <Ionicons name="close" size={28} color="#888" />
                  </TouchableOpacity>
                </View>

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
                    <Ionicons
                      name="checkmark-circle"
                      size={20}
                      color="#4ade80"
                    />
                    <Text style={styles.lockedText}>
                      Product herkend & geverifieerd
                    </Text>
                  </View>
                )}

                <Text style={styles.label}>NAAM MEDICIJN</Text>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={[styles.input, isLocked && styles.inputLocked]}
                    placeholder="bv. Paracetamol"
                    placeholderTextColor="#666"
                    value={newName}
                    onChangeText={setNewName}
                    editable={!isLocked}
                    maxLength={40}
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

                <Text style={styles.label}>DOSERING</Text>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={[styles.input, isLocked && styles.inputLocked]}
                    placeholder="bv. 500mg"
                    placeholderTextColor="#666"
                    value={newDosage}
                    onChangeText={setNewDosage}
                    editable={!isLocked}
                    maxLength={15}
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

                <Text style={styles.label}>AANTAL STUKS / VOORRAAD</Text>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={styles.input}
                    placeholder="0"
                    placeholderTextColor="#666"
                    value={newStock}
                    onChangeText={setNewStock}
                    keyboardType="numeric"
                    maxLength={3}
                  />
                </View>

                <TouchableOpacity
                  style={styles.saveBtn}
                  onPress={handleSaveNew}
                >
                  <Text style={styles.saveBtnText}>TOEVOEGEN AAN VOORRAAD</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* --- MODAL 2A: SUCCESS MESSAGE --- */}
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

      {/* --- MODAL 2B: WARNING MESSAGE --- */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={warningVisible}
        onRequestClose={() => setWarningVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.warningContent}>
            <View style={styles.warningIcon}>
              <Ionicons name="hand-right" size={40} color="#ef4444" />
            </View>
            <Text style={styles.warningTitle}>{warningData.title}</Text>
            <Text style={styles.warningText}>{warningData.msg}</Text>
            <TouchableOpacity
              style={styles.warningBtn}
              onPress={() => setWarningVisible(false)}
            >
              <Text style={styles.warningBtnText}>BEGREPEN</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* --- MODAL 2C: CONFIRMATION MESSAGE --- */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={confirmVisible}
        onRequestClose={() => setConfirmVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.warningContent,
              {
                borderColor: confirmData.isDestructive ? "#ef4444" : "#ffaa00",
              },
            ]}
          >
            <View
              style={[
                styles.warningIcon,
                {
                  backgroundColor: confirmData.isDestructive
                    ? "rgba(239, 68, 68, 0.15)"
                    : "rgba(255, 170, 0, 0.15)",
                },
              ]}
            >
              <Ionicons
                name={confirmData.isDestructive ? "trash" : "alert"}
                size={40}
                color={confirmData.isDestructive ? "#ef4444" : "#ffaa00"}
              />
            </View>
            <Text style={styles.warningTitle}>{confirmData.title}</Text>
            <Text style={styles.warningText}>{confirmData.msg}</Text>

            <View style={styles.confirmBtnRow}>
              <TouchableOpacity
                style={[styles.confirmBtn, styles.cancelBtn]}
                onPress={() => setConfirmVisible(false)}
              >
                <Text style={styles.cancelBtnText}>ANNULEREN</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.confirmBtn,
                  confirmData.isDestructive
                    ? styles.destructiveBtn
                    : styles.acceptBtn,
                ]}
                onPress={confirmData.onConfirm}
              >
                <Text
                  style={
                    confirmData.isDestructive
                      ? styles.destructiveBtnText
                      : styles.acceptBtnText
                  }
                >
                  {confirmData.confirmText}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* --- MODAL 3: CAMERA --- */}
      <Modal
        animationType="slide"
        visible={cameraVisible}
        onRequestClose={() => setCameraVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: "black" }}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            onBarcodeScanned={handleBarcodeScanned}
            barcodeScannerSettings={{ barcodeTypes: ["ean13", "qr"] }}
          />
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
              }}
            >
              {selectedMed?.stock}
            </Text>

            {selectedMed?.lastScannedAt && (
              <Text
                style={{
                  color: "#888",
                  marginBottom: 25,
                  fontSize: 13,
                }}
              >
                Laatste scan:{" "}
                {new Date(selectedMed.lastScannedAt).toLocaleString("nl-BE", {
                  hour: "2-digit",
                  minute: "2-digit",
                  day: "2-digit",
                  month: "2-digit",
                })}
              </Text>
            )}

            <TouchableOpacity
              style={styles.bigScanBtn}
              onPress={() => {
                setEditModalVisible(false);
                setTimeout(() => startCamera(true), 500);
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
              onPress={() => {
                if (selectedMed) {
                  setEditModalVisible(false);
                  setTimeout(() => {
                    showCustomConfirm(
                      "Medicijn Verwijderen",
                      `Weet je zeker dat je ${selectedMed.name} definitief wilt verwijderen?`,
                      () => {
                        setConfirmVisible(false);
                        deleteMed(selectedMed.id);
                      },
                      "VERWIJDEREN",
                      true,
                    );
                  }, 400);
                }
              }}
              style={{ marginTop: 20, padding: 10 }}
            >
              <Text style={{ color: "#ef4444", fontWeight: "bold" }}>
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
  // AANGEPAST: flex: 1 verwijderd zodat de ScrollView de hoogte goed kan berekenen, en paddingBottom toegevoegd.
  modalContentFullScreen: {
    padding: 20,
    paddingTop: 50,
    paddingBottom: 40,
    backgroundColor: "#09090b",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 25,
  },
  modalTitle: { color: "white", fontSize: 22, fontWeight: "bold" },

  // --- SUCCESS MODAL STYLES ---
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

  // --- WARNING & CONFIRM MODAL STYLES ---
  warningContent: {
    backgroundColor: "#1c1c1e",
    width: "85%",
    borderRadius: 24,
    padding: 30,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ef4444",
  },
  warningIcon: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  warningTitle: {
    color: "white",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 10,
    textAlign: "center",
  },
  warningText: {
    color: "#aaa",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 25,
    lineHeight: 20,
  },
  warningBtn: {
    backgroundColor: "#2c2c2e",
    borderWidth: 1,
    borderColor: "#ef4444",
    paddingVertical: 12,
    width: "100%",
    borderRadius: 12,
    alignItems: "center",
  },
  warningBtnText: {
    color: "#ef4444",
    fontWeight: "bold",
    fontSize: 15,
  },
  confirmBtnRow: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
    justifyContent: "space-between",
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
  },
  cancelBtn: {
    backgroundColor: "transparent",
    borderColor: "#666",
  },
  cancelBtnText: {
    color: "#aaa",
    fontWeight: "bold",
    fontSize: 14,
  },
  acceptBtn: {
    backgroundColor: "rgba(255, 170, 0, 0.1)",
    borderColor: "#ffaa00",
  },
  acceptBtnText: {
    color: "#ffaa00",
    fontWeight: "bold",
    fontSize: 14,
  },
  destructiveBtn: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderColor: "#ef4444",
  },
  destructiveBtnText: {
    color: "#ef4444",
    fontWeight: "bold",
    fontSize: 14,
  },

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
    backgroundColor: "#2563eb",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 10,
    marginBottom: 10,
  },
  scanButtonText: { fontWeight: "700", color: "white", fontSize: 15 },
  scanHint: { color: "#666", fontSize: 12, textAlign: "center" },
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
  inputWrapper: { position: "relative", justifyContent: "center" },
  input: {
    backgroundColor: "#1c1c1e",
    color: "white",
    padding: 16,
    paddingRight: 40,
    borderRadius: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#333",
  },
  inputLocked: {
    backgroundColor: "#111",
    borderColor: "transparent",
    color: "#666",
  },
  lockIcon: { position: "absolute", right: 15, opacity: 0.5 },
  lockedBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(74, 222, 128, 0.15)",
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