import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// De drie states voor een realistischere flow
type ItsmeState = "waiting" | "approved" | "loading";

export default function LoginScreen() {
  const router = useRouter();
  const [itsmeVisible, setItsmeVisible] = useState(false);
  const [itsmeState, setItsmeState] = useState<ItsmeState>("waiting");

  const handleItsmeLogin = () => {
    setItsmeVisible(true);
    setItsmeState("waiting");

    // 1. Identiteit verifiëren... (3 seconden)
    setTimeout(() => {
      setItsmeState("approved");

      // 2. Identiteit bevestigd ✓ (1 seconde)
      setTimeout(() => {
        setItsmeState("loading");

        // 3. Medicatieschema ophalen... (2 seconden)
        setTimeout(() => {
          setItsmeVisible(false);
          router.replace("/role-selection" as any);
        }, 2000);
      }, 1000);
    }, 3000);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Welkom bij Mino</Text>
        <Text style={styles.subtitle}>
          Veilig aanmelden om uw{"\n"}zorggegevens op te halen.
        </Text>

        <TouchableOpacity style={styles.itsmeButton} onPress={handleItsmeLogin}>
          <View style={styles.itsmeIconPlaceholder}>
            <Image
              source={require("../assets/images/itsme-logo.png")}
              style={{ width: 26, height: 26 }}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.itsmeButtonText}>Aanmelden met itsme</Text>
        </TouchableOpacity>
      </View>

      <Modal
        animationType="fade"
        transparent={true}
        visible={itsmeVisible}
        onRequestClose={() => {}}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.itsmeHeaderBar} />

            {itsmeState === "waiting" && (
              <>
                <ActivityIndicator
                  size="large"
                  color="#FF7900"
                  style={{ marginBottom: 20 }}
                />
                <Text style={styles.modalTitle}>Identificeren...</Text>
                <Text style={styles.modalText}>
                  Open de itsme-app op je smartphone en bevestig de aanmelding
                  voor Mino.
                </Text>
              </>
            )}

            {itsmeState === "approved" && (
              <>
                <View style={styles.successCircle}>
                  <Ionicons name="checkmark" size={40} color="white" />
                </View>
                <Text style={styles.modalTitle}>Identiteit bevestigd</Text>
                <Text style={styles.modalText}>
                  Uw aanmelding is succesvol.
                </Text>
              </>
            )}

            {itsmeState === "loading" && (
              <>
                <ActivityIndicator
                  size="large"
                  color="#4ade80"
                  style={{ marginBottom: 20 }}
                />
                <Text style={styles.modalTitle}>Medische gegevens ophalen</Text>
                <Text style={styles.modalText}>
                  Uw medicatiegegevens worden veilig opgehaald...
                </Text>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#09090b",
    justifyContent: "center",
  },
  content: {
    padding: 30,
    alignItems: "center",
  },
  title: {
    color: "white",
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 10,
  },
  subtitle: {
    color: "#a1a1aa",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 40,
    lineHeight: 24,
  },
  itsmeButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1c1c1e",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: "#FF7900",
    width: "100%",
    justifyContent: "center",
  },
  itsmeIconPlaceholder: {
    backgroundColor: "white",
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  itsmeButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#fff",
    width: "80%",
    borderRadius: 16,
    padding: 30,
    alignItems: "center",
    overflow: "hidden",
  },
  itsmeHeaderBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 6,
    backgroundColor: "#FF7900",
  },
  modalTitle: {
    color: "#000",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 10,
    textAlign: "center",
  },
  modalText: {
    color: "#666",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  successCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "#4ade80",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
});
