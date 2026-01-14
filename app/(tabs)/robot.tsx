/* eslint-disable @typescript-eslint/no-unused-vars */
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
  StatusBar,
} from "react-native";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useNavigation } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ScreenOrientation from "expo-screen-orientation";
import * as NavigationBar from "expo-navigation-bar";

const VIDEO_IP = "http://10.217.173.75:5001";
const COMMAND_IP = "http://10.217.173.75:5002";

// --- THEMA INSTELLINGEN ---
const THEME = {
  primary: "#00f0ff",
  danger: "#ff2a2a",
  glass: "rgba(10, 15, 20, 0.65)",
  border: "rgba(255, 255, 255, 0.15)",
  font: Platform.OS === "ios" ? "Menlo" : "monospace",
};

// --- COMPONENTEN ---

const TechBtn = ({
  icon,
  onPress,
  onPressIn,
  onPressOut,
  style,
  danger = false,
  size = 50,
}: any) => (
  <Pressable
    onPress={onPress}
    onPressIn={onPressIn}
    onPressOut={onPressOut}
    style={({ pressed }) => [
      styles.techBtnBase,
      { width: size, height: size, borderRadius: size / 2 },
      danger && styles.techBtnDanger,
      pressed && { transform: [{ scale: 0.95 }], opacity: 0.8 },
      style,
    ]}
  >
    <Ionicons name={icon} size={size * 0.45} color="white" />
  </Pressable>
);

const ControlPad = ({ moveFn }: { moveFn: (d: string) => void }) => {
  return (
    <View style={styles.padGrid}>
      <View style={styles.padRow}>
        <View style={styles.emptyCell} />
        <TechBtn
          icon="caret-up"
          size={60}
          onPressIn={() => moveFn("vooruit")}
          onPressOut={() => moveFn("stop")}
        />
        <View style={styles.emptyCell} />
      </View>
      <View style={styles.padRow}>
        <TechBtn
          icon="caret-back"
          size={60}
          onPressIn={() => moveFn("links")}
          onPressOut={() => moveFn("stop")}
        />
        <Pressable
          style={({ pressed }) => [
            styles.stopCore,
            pressed && { transform: [{ scale: 0.9 }] },
          ]}
          onPress={() => moveFn("stop")}
        >
          <View style={styles.stopIcon} />
          <Text style={styles.stopLabel}>STOP</Text>
        </Pressable>
        <TechBtn
          icon="caret-forward"
          size={60}
          onPressIn={() => moveFn("rechts")}
          onPressOut={() => moveFn("stop")}
        />
      </View>
      <View style={styles.padRow}>
        <View style={styles.emptyCell} />
        <TechBtn
          icon="caret-down"
          size={60}
          onPressIn={() => moveFn("achteruit")}
          onPressOut={() => moveFn("stop")}
        />
        <View style={styles.emptyCell} />
      </View>
    </View>
  );
};

export default function RobotScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [webKey, setWebKey] = React.useState(0);
  const [status, setStatus] = React.useState<
    "ONLINE" | "CONNECTING" | "OFFLINE"
  >("CONNECTING");
  const [isFullscreen, setIsFullscreen] = React.useState(false);

  const move = (dir: string) => {
    fetch(`${COMMAND_IP}/move/${dir}`).catch(() => setStatus("OFFLINE"));
  };

  const reloadVideo = () => {
    setStatus("CONNECTING");
    setWebKey((k) => k + 1);
  };

  useFocusEffect(
    React.useCallback(() => {
      // 1. Bij start: toon navigatiebalk
      if (Platform.OS === "android") {
        NavigationBar.setVisibilityAsync("visible");
      }

      reloadVideo();

      return () => {
        // 2. CLEANUP: Reset alles bij verlaten
        move("stop");
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT);

        if (Platform.OS === "android") {
          NavigationBar.setVisibilityAsync("visible");
        }

        // Reset App UI
        navigation.setOptions({
          headerShown: true,
          tabBarStyle: undefined,
        });
      };
    }, [navigation])
  );

  const toggleFullscreen = async () => {
    if (isFullscreen) {
      // --- TERUG NAAR NORMAAL ---
      navigation.setOptions({
        headerShown: true,
        tabBarStyle: undefined,
      });

      if (Platform.OS === "android") {
        await NavigationBar.setVisibilityAsync("visible");
      }

      await ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.PORTRAIT
      );

      setIsFullscreen(false);
    } else {
      // --- NAAR FULLSCREEN ---
      navigation.setOptions({
        headerShown: false,
        tabBarStyle: { display: "none" },
      });

      await ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.LANDSCAPE
      );

      if (Platform.OS === "android") {
        await NavigationBar.setVisibilityAsync("hidden");
        // FIX VOOR ERROR: We proberen de behavior te zetten, maar negeren de fout als het niet ondersteund is
        try {
          await NavigationBar.setBehaviorAsync("overlay-swipe");
        } catch (e) {
          // Edge-to-edge devices ondersteunen dit soms niet, dat is oké.
        }
      }

      setIsFullscreen(true);
    }
    setTimeout(reloadVideo, 100);
  };

  // CSS FIX: Brightness filter toegevoegd om het beeld lichter te maken
  const html = `
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <style>
          html, body { 
            margin:0; padding:0; background: #000; 
            width: 100vw; height: 100vh; 
            overflow: hidden; 
            display: flex; justify-content: center; align-items: center; 
          }
          img { 
            width: 100%; height: 100%; 
            object-fit: cover; 
            display: block; 
            filter: brightness(1.2);
          } 
        </style>
      </head>
      <body><img src="${VIDEO_IP}/video_feed?ts=${webKey}" /></body>
    </html>
  `;

  const StatusDisplay = ({ style }: any) => (
    <View style={[styles.statusBadge, style]}>
      <View
        style={[
          styles.statusDot,
          {
            backgroundColor:
              status === "ONLINE"
                ? "#3cdc78"
                : status === "CONNECTING"
                ? "#fbbf24"
                : "#ef4444",
          },
        ]}
      />
      <Text style={styles.statusText}>{status}</Text>
    </View>
  );

  return (
    <View style={styles.root}>
      <StatusBar hidden={isFullscreen} barStyle="light-content" />

      {/* --- PORTRAIT MODE --- */}
      {!isFullscreen && (
        <View style={[styles.container, { paddingTop: insets.top }]}>

          <View style={styles.monitorFrame}>
            <View style={styles.screenInner}>
              <WebView
                key={`p-${webKey}`}
                source={{ html }}
                style={{ flex: 1, backgroundColor: "black" }}
                scrollEnabled={false}
                onLoadEnd={() => setStatus("ONLINE")}
                onError={() => setStatus("OFFLINE")}
              />

              <View style={styles.monitorOverlay}>
                <StatusDisplay />
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <TechBtn
                    icon="refresh"
                    size={36}
                    onPress={reloadVideo}
                    style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
                  />
                  <TechBtn
                    icon="scan"
                    size={36}
                    onPress={toggleFullscreen}
                    style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
                  />
                </View>
              </View>
            </View>
          </View>

          <View style={styles.controlsSection}>
            <ControlPad moveFn={move} />
          </View>
        </View>
      )}

      {/* --- LANDSCAPE MODE --- */}
      {isFullscreen && (
        <View style={styles.fsRoot}>
          <View style={styles.fsVideoLayer}>
            <WebView
              key={`l-${webKey}`}
              source={{ html }}
              style={{ flex: 1, backgroundColor: "black" }}
              scrollEnabled={false}
              onLoadEnd={() => setStatus("ONLINE")}
              onError={() => setStatus("OFFLINE")}
            />
          </View>

          <View
            style={[
              styles.fsHud,
              {
                paddingLeft: insets.left > 0 ? insets.left : 20,
                paddingRight: insets.right > 0 ? insets.right : 20,
              },
            ]}
          >
            <View style={styles.fsLeft}>
              <ControlPad moveFn={move} />
            </View>

            <View style={styles.fsCenter}>
              <StatusDisplay style={{ backgroundColor: "rgba(0,0,0,0.6)" }} />
            </View>

            <View style={styles.fsRight}>
              <View style={styles.actionColumn}>
                <TechBtn icon="refresh" size={50} onPress={reloadVideo} />
                <TechBtn
                  icon="close"
                  size={50}
                  danger
                  onPress={toggleFullscreen}
                />
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#050505" },
  container: { flex: 1 },

  header: {
    color: "white",
    textAlign: "center",
    fontSize: 16,
    fontFamily: THEME.font,
    fontWeight: "bold",
    letterSpacing: 3,
    marginBottom: 10,
    marginTop: 10,
    opacity: 0.8,
  },
  footerText: {
    color: "#555",
    fontFamily: THEME.font,
    fontSize: 10,
    letterSpacing: 2,
    marginTop: 20,
  },

  monitorFrame: {
    marginHorizontal: 12,
    aspectRatio: 16 / 9,
    backgroundColor: "#111",
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: "#333",
  },
  screenInner: {
    flex: 1,
    borderRadius: 8,
    overflow: "hidden",
    position: "relative",
  },
  monitorOverlay: {
    position: "absolute",
    top: 10,
    left: 10,
    right: 10,
    flexDirection: "row",
    justifyContent: "space-between",
  },

  controlsSection: { flex: 1, justifyContent: "center", alignItems: "center" },

  padGrid: { width: 200, height: 200, justifyContent: "center" },
  padRow: {
    flexDirection: "row",
    height: 66,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyCell: { width: 60, height: 60 },

  techBtnBase: {
    backgroundColor: THEME.glass,
    borderWidth: 1,
    borderColor: THEME.border,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "black",
    shadowOpacity: 0.3,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  techBtnDanger: {
    backgroundColor: "rgba(255, 40, 40, 0.2)",
    borderColor: "rgba(255, 60, 60, 0.5)",
  },

  stopCore: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "rgba(220, 20, 20, 0.9)",
    borderWidth: 2,
    borderColor: "rgba(255, 100, 100, 0.4)",
    justifyContent: "center",
    alignItems: "center",
    marginHorizontal: 4,
    shadowColor: "#f00",
    shadowOpacity: 0.4,
    shadowRadius: 10,
    zIndex: 10,
  },
  stopIcon: {
    width: 16,
    height: 16,
    backgroundColor: "white",
    borderRadius: 2,
    marginBottom: 2,
  },
  stopLabel: {
    color: "white",
    fontSize: 9,
    fontWeight: "bold",
    fontFamily: THEME.font,
  },

  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  statusText: {
    color: "white",
    fontSize: 10,
    fontFamily: THEME.font,
    fontWeight: "bold",
  },

  fsRoot: { flex: 1, backgroundColor: "black" },
  fsVideoLayer: { ...StyleSheet.absoluteFillObject, zIndex: 0 },
  fsHud: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 20,
  },
  fsLeft: { flex: 1, justifyContent: "flex-end", paddingBottom: 10 },
  fsCenter: { marginTop: 10 },
  fsRight: { flex: 1, justifyContent: "center", alignItems: "flex-end" },
  actionColumn: { gap: 20, marginRight: 10 },
});