import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";

// BELANGRIJK: Gebruik POORT 5001 (De Bridge), niet 8000!
// De bridge zet de ruwe data om naar beeld.
const ROBOT_IP = "http://10.20.195.75:5001";

export default function RobotScreen() {
  const move = async (dir: string) => {
    try {
      console.log("Rijden naar:", dir);
      // Stuur commando naar de Bridge (Port 5001)
      await fetch(`${ROBOT_IP}/move/${dir}`);
    } catch (e) {
      console.log("Fout bij verbinden robot:", e);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Camera & Besturing</Text>

      {/* 1. De Camera Stream */}
      <View style={styles.cameraBox}>
        {/* We laden de stream van /video_feed op poort 5001 */}
        <WebView
          source={{ uri: `${ROBOT_IP}/video_feed` }}
          style={{ flex: 1 }}
          scrollEnabled={false}
          javaScriptEnabled={true}
          // Deze props helpen soms bij Android streams:
          androidHardwareAccelerationDisabled={true}
          scalesPageToFit={true}
        />
      </View>

      {/* 2. De Knoppen */}
      <View style={styles.controls}>
        {/* Vooruit */}
        <TouchableOpacity
          style={styles.btn}
          onPressIn={() => move("vooruit")}
          onPressOut={() => move("stop")}
        >
          <Ionicons name="caret-up" size={40} color="white" />
        </TouchableOpacity>

        <View style={styles.row}>
          {/* Links */}
          <TouchableOpacity
            style={styles.btn}
            onPressIn={() => move("links")}
            onPressOut={() => move("stop")}
          >
            <Ionicons name="caret-back" size={40} color="white" />
          </TouchableOpacity>

          {/* Rechts */}
          <TouchableOpacity
            style={styles.btn}
            onPressIn={() => move("rechts")}
            onPressOut={() => move("stop")}
          >
            <Ionicons name="caret-forward" size={40} color="white" />
          </TouchableOpacity>
        </View>

        {/* Achteruit */}
        <TouchableOpacity
          style={styles.btn}
          onPressIn={() => move("achteruit")}
          onPressOut={() => move("stop")}
        >
          <Ionicons name="caret-down" size={40} color="white" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1c1c1e",
    padding: 20,
    paddingTop: 60,
  },
  header: {
    color: "white",
    fontSize: 22,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 20,
  },
  cameraBox: {
    height: 250,
    backgroundColor: "black",
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 40,
    borderWidth: 2,
    borderColor: "#333",
  },
  controls: { alignItems: "center" },
  row: { flexDirection: "row", gap: 40, marginVertical: 15 },
  btn: {
    backgroundColor: "#3a3a3c",
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
});