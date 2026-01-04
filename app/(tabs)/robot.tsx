import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";

// AANPASSING: Twee aparte adressen!
// 1. De Ogen (Video) op poort 5001
const VIDEO_IP = "http://10.217.173.75:5001";

// 2. De Handen (Besturing) op poort 5002
const COMMAND_IP = "http://10.217.173.75:5002";

export default function RobotScreen() {
  const move = (dir: string) => {
    // AANPASSING: We sturen commando's nu naar de COMMAND_IP (5002)
    // Dit stoort de videostream (5001) niet meer!
    fetch(`${COMMAND_IP}/move/${dir}`).catch((e) => {
      console.log("Foutje bij sturen:", e);
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Camera & Besturing</Text>

      <View style={styles.cameraBox}>
        {/* AANPASSING: We halen de video van VIDEO_IP (5001) */}
        <WebView
          source={{ uri: `${VIDEO_IP}/video_feed` }}
          style={{ flex: 1 }}
          scrollEnabled={false}
          javaScriptEnabled={true}
          androidHardwareAccelerationDisabled={true}
          scalesPageToFit={true}
        />
      </View>

      <View style={styles.controls}>
        {/* Vooruit */}
        <TouchableOpacity
          style={styles.btn}
          onPressIn={() => move("vooruit")}
          onPressOut={() => move("stop")}
        >
          <Ionicons name="caret-up" size={30} color="white" />
        </TouchableOpacity>

        <View style={styles.row}>
          {/* Links */}
          <TouchableOpacity
            style={styles.btn}
            onPressIn={() => move("links")}
            onPressOut={() => move("stop")}
          >
            <Ionicons name="caret-back" size={30} color="white" />
          </TouchableOpacity>

          {/* Rechts */}
          <TouchableOpacity
            style={styles.btn}
            onPressIn={() => move("rechts")}
            onPressOut={() => move("stop")}
          >
            <Ionicons name="caret-forward" size={30} color="white" />
          </TouchableOpacity>
        </View>

        {/* Achteruit */}
        <TouchableOpacity
          style={styles.btn}
          onPressIn={() => move("achteruit")}
          onPressOut={() => move("stop")}
        >
          <Ionicons name="caret-down" size={30} color="white" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1c1c1e",
    padding: 10,
    paddingTop: 50,
  },
  header: {
    color: "white",
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 10,
  },
  cameraBox: {
    height: 220,
    backgroundColor: "black",
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#333",
  },
  controls: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  row: {
    flexDirection: "row",
    gap: 20,
    marginVertical: 10,
  },
  btn: {
    backgroundColor: "#3a3a3c",
    width: 65,
    height: 65,
    borderRadius: 32.5,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
  },
});