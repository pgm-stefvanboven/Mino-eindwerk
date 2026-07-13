/* eslint-disable @typescript-eslint/no-unused-vars */
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  StatusBar,
} from "react-native";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useNavigation } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ScreenOrientation from "expo-screen-orientation";
import * as NavigationBar from "expo-navigation-bar";

const VIDEO_IP = "http://10.91.88.75:5001";
const COMMAND_IP = "http://10.91.88.75:5002";

// --- THEMA ---
const THEME = {
  primary: "#00f0ff",
  danger: "#ff2a2a",
  glass: "rgba(20, 30, 40, 0.7)",
  glassActive: "rgba(0, 240, 255, 0.3)",
  border: "rgba(255, 255, 255, 0.15)",
  font: Platform.OS === "ios" ? "Menlo" : "monospace",
};

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
      pressed && styles.techBtnPressed,
      style,
    ]}
  >
    <Ionicons name={icon} size={size * 0.45} color="white" />
  </Pressable>
);

const StatusBadge = ({ status }: { status: string }) => {
  // Standaard is rood (voor CONNECTING of OFFLINE)
  let color = "#ff4444";
  let bg = "rgba(255, 60, 60, 0.2)";

  if (status === "ONLINE") {
    color = "#3cdc78"; // Groen
    bg = "rgba(60, 220, 120, 0.2)";
  } else if (status === "VERGRENDELD") {
    color = "#00f0ff"; // Blauw (past bij het slotje)
    bg = "rgba(0, 240, 255, 0.15)";
  }

  return (
    <View style={[styles.badge, { backgroundColor: bg, borderColor: color }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.badgeText}>{status}</Text>
    </View>
  );
};

// Aangepaste DPad die 'size' accepteert voor schaling
const DPad = ({
  moveFn,
  type,
  label,
  size = 50, // Standaard grootte
}: {
  moveFn: (d: string) => void;
  type: "move" | "cam";
  label?: string;
  size?: number;
}) => {
  const isMove = type === "move";
  // Dynamische cell grootte gebaseerd op knopgrootte
  const cellSize = size + 10;

  const icons = isMove
    ? {
        up: "caret-up",
        down: "caret-down",
        left: "caret-back",
        right: "caret-forward",
      }
    : {
        up: "chevron-up",
        down: "chevron-down",
        left: "chevron-back",
        right: "chevron-forward",
      };

  const cmds = isMove
    ? {
        up: "vooruit",
        down: "achteruit",
        left: "links",
        right: "rechts",
        stop: "stop",
      }
    : {
        up: "cam_up",
        down: "cam_down",
        left: "cam_left",
        right: "cam_right",
        stop: "cam_stop",
      };

  return (
    <View style={styles.padContainer}>
      {label && <Text style={styles.padLabel}>{label}</Text>}

      <View style={styles.padRow}>
        <View style={{ width: cellSize, height: cellSize }} />
        <TechBtn
          icon={icons.up}
          size={size}
          onPressIn={() => moveFn(cmds.up)}
          onPressOut={() => moveFn(cmds.stop)}
        />
        <View style={{ width: cellSize, height: cellSize }} />
      </View>

      <View style={styles.padRow}>
        <TechBtn
          icon={icons.left}
          size={size}
          onPressIn={() => moveFn(cmds.left)}
          onPressOut={() => moveFn(cmds.stop)}
        />
        <View
          style={{
            width: cellSize,
            height: cellSize,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <View style={styles.centerPointDot} />
        </View>
        <TechBtn
          icon={icons.right}
          size={size}
          onPressIn={() => moveFn(cmds.right)}
          onPressOut={() => moveFn(cmds.stop)}
        />
      </View>

      <View style={styles.padRow}>
        <View style={{ width: cellSize, height: cellSize }} />
        <TechBtn
          icon={icons.down}
          size={size}
          onPressIn={() => moveFn(cmds.down)}
          onPressOut={() => moveFn(cmds.stop)}
        />
        <View style={{ width: cellSize, height: cellSize }} />
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

  // NIEUW: Toegangs staten
  const [cameraAlways, setCameraAlways] = React.useState(false);
  const [emergencyAccess, setEmergencyAccess] = React.useState(false);
  const [contact, setContact] = React.useState({
    name: "",
    relation: "",
    phone: "",
  });

  const move = (dir: string) => {
    fetch(`${COMMAND_IP}/move/${dir}`).catch(() => setStatus("OFFLINE"));
  };

  const reloadVideo = () => {
    setStatus("CONNECTING");
    setWebKey((k) => k + 1);
  };

  useFocusEffect(
    React.useCallback(() => {
      if (Platform.OS === "android")
        NavigationBar.setVisibilityAsync("visible");
      reloadVideo();

      AsyncStorage.multiGet([
        "CONTACT_NAME",
        "CONTACT_RELATION",
        "CONTACT_PHONE",
        "CAMERA_ALWAYS_ENABLED",
        "CAMERA_EMERGENCY_ACCESS",
      ]).then((result) => {
        setContact({
          name: result[0][1] || "",
          relation: result[1][1] || "",
          phone: result[2][1] || "",
        });
        setCameraAlways(result[3][1] === "true");
        setEmergencyAccess(result[4][1] === "true");
      });

      return () => {
        move("stop");
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT);
        if (Platform.OS === "android")
          NavigationBar.setVisibilityAsync("visible");
        navigation.setOptions({ headerShown: true, tabBarStyle: undefined });
      };
    }, [navigation]),
  );

  const toggleFullscreen = async () => {
    if (isFullscreen) {
      navigation.setOptions({
        headerShown: true,
        tabBarStyle: undefined,
      });

      if (Platform.OS === "android") {
        await NavigationBar.setVisibilityAsync("visible");
      }

      await ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.PORTRAIT,
      );

      setIsFullscreen(false);
    } else {
      navigation.setOptions({
        headerShown: false,
        tabBarStyle: { display: "none" },
      });

      await ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.LANDSCAPE,
      );

      if (Platform.OS === "android") {
        await NavigationBar.setVisibilityAsync("hidden");

        try {
          await NavigationBar.setBehaviorAsync("overlay-swipe");
        } catch {}
      }

      setIsFullscreen(true);
    }

    setTimeout(reloadVideo, 100);
  };

  const html = `
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <style>
          html, body { margin:0; padding:0; background: #000; width: 100vw; height: 100vh; overflow: hidden; display: flex; justify-content: center; align-items: center; }
          img { width: 100%; height: 100%; object-fit: cover; display: block; } 
        </style>
      </head>
      <body><img src="${VIDEO_IP}/video_feed?ts=${webKey}" /></body>
    </html>
  `;

  // Check de toegang:
  const hasAccess = cameraAlways || emergencyAccess;

  return (
    <View style={styles.root}>
      <StatusBar hidden={isFullscreen} barStyle="light-content" />

      {/* --- PORTRAIT MODE --- */}
      {!isFullscreen && (
        <View style={[styles.container, { paddingTop: insets.top }]}>
          <View style={styles.videoContainer}>
            {hasAccess ? (
              <>
                {/* BANNER BINNEN DE VIDEO ZODRA ER NOODTOEGANG IS */}
                {emergencyAccess && (
                  <View style={styles.emergencyBanner}>
                    <Ionicons name="warning" size={16} color="#ff4444" />
                    <Text style={styles.emergencyBannerText}>
                      Noodtoegang actief
                    </Text>
                  </View>
                )}

                <WebView
                  key={`p-${webKey}`}
                  source={{ html }}
                  style={{ flex: 1, backgroundColor: "#080a0c" }}
                  scrollEnabled={false}
                  onLoadEnd={() => setStatus("ONLINE")}
                  onError={() => setStatus("OFFLINE")}
                />
              </>
            ) : (
              /* PRIVACY KAART ALS ER GEEN TOEGANG IS */
              <View style={styles.privacyView}>
                <Ionicons name="lock-closed" size={60} color="#00f0ff" />
                <Text style={styles.privacyTitle}>Camera Vergrendeld</Text>
                <Text style={styles.privacyText}>
                  De camera is momenteel gedeactiveerd om de privacy van de
                  patiënt te waarborgen. In het geval van een zorgscenario wordt
                  dit scherm automatisch vrijgegeven.
                </Text>
              </View>
            )}
          </View>

          {/* CONTROL BAR (Status & Refresh & Fullscreen) */}
          <View style={styles.controlBar}>
            <StatusBadge status={hasAccess ? status : "VERGRENDELD"} />
            <View style={{ flexDirection: "row", gap: 15 }}>
              {/* Verberg actieknoppen als er geen toegang is */}
              {hasAccess && (
                <>
                  <TechBtn icon="refresh" size={40} onPress={reloadVideo} />
                  <TechBtn icon="scan" size={40} onPress={toggleFullscreen} />
                </>
              )}
            </View>
          </View>

          {/* BESTURING (Rijden & Kijken) */}
          {hasAccess ? (
            <View style={styles.portraitControls}>
              <DPad moveFn={move} type="move" label="RIJDEN" size={42} />
              <View style={styles.divider} />
              <DPad moveFn={move} type="cam" label="KIJKEN" size={42} />
            </View>
          ) : (
            /* Lege ruimte om de layout mooi in balans te houden als besturing weg is */
            <View
              style={{
                flex: 1,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  color: "#333",
                  fontSize: 12,
                  textTransform: "uppercase",
                  letterSpacing: 2,
                }}
              >
                Besturing gedeactiveerd
              </Text>
            </View>
          )}
        </View>
      )}

      {/* --- LANDSCAPE MODE --- */}
      {isFullscreen && (
        <View style={styles.fsRoot}>
          <View style={styles.fsVideoLayer}>
            {hasAccess ? (
              <WebView
                key={`l-${webKey}`}
                source={{ html }}
                style={{ flex: 1, backgroundColor: "black" }}
                scrollEnabled={false}
                onLoadEnd={() => setStatus("ONLINE")}
                onError={() => setStatus("OFFLINE")}
              />
            ) : (
              <View style={[styles.privacyView, { backgroundColor: "black" }]}>
                <Ionicons name="lock-closed" size={80} color="#00f0ff" />
                <Text style={[styles.privacyTitle, { fontSize: 24 }]}>
                  Camera Vergrendeld
                </Text>
              </View>
            )}
          </View>

          {/* HUD LAYER */}
          <View
            style={[
              styles.fsHud,
              {
                paddingLeft: insets.left || 20,
                paddingRight: insets.right || 20,
              },
            ]}
          >
            <View style={styles.fsTopCenter}>
              <StatusBadge status={hasAccess ? status : "VERGRENDELD"} />
            </View>

            {/* Verberg D-Pads als er geen toegang is */}
            {hasAccess && (
              <>
                <View style={styles.fsBottomLeft}>
                  <DPad moveFn={move} type="move" size={55} />
                </View>
                <View style={styles.fsBottomRight}>
                  <DPad moveFn={move} type="cam" size={55} />
                </View>
              </>
            )}

            <View style={styles.fsTopRight}>
              {/* Refresh kan weg als er geen camera is */}
              {hasAccess && (
                <TechBtn
                  icon="refresh"
                  size={45}
                  onPress={reloadVideo}
                  style={{ marginBottom: 15 }}
                />
              )}
              {/* SLUIT-KNOP ALTIJD TONEN! Zodat je nooit vast komt te zitten */}
              <TechBtn
                icon="close"
                size={45}
                danger
                onPress={toggleFullscreen}
              />
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#050505" },
  container: { flex: 1, paddingBottom: 20 },

  // --- NIEUW: PRIVACY MODUS & BANNER ---
  privacyView: {
    flex: 1,
    backgroundColor: "#111",
    justifyContent: "center",
    alignItems: "center",
    padding: 30,
  },
  privacyTitle: {
    color: "#00f0ff",
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 15,
    letterSpacing: 1,
  },
  privacyText: {
    color: "#888",
    fontSize: 12,
    textAlign: "center",
    marginTop: 10,
    lineHeight: 18,
  },
  emergencyBanner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(255, 68, 68, 0.9)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    zIndex: 10,
  },
  emergencyBannerText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 12,
    marginLeft: 6,
    textTransform: "uppercase",
    letterSpacing: 1,
  },

  // --- VIDEO STYLES (AANGEPAST) ---
  videoContainer: {
    width: "100%",
    aspectRatio: 16 / 9, // Behoudt breedbeeld
    backgroundColor: "#000",
    borderBottomWidth: 1,
    borderColor: "#333",
    // Geen margin meer, dus schermvullend in de breedte
  },

  // --- CONTROL BAR (NIEUW) ---
  controlBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
    marginBottom: 10,
  },

  // Status Badge Styling
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  badgeText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 10,
    fontFamily: THEME.font,
    letterSpacing: 1,
  },

  // --- PORTRAIT CONTROLS (COMPACTER) ---
  portraitControls: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-evenly",
    alignItems: "center",
  },
  divider: {
    width: 1,
    height: "50%",
    backgroundColor: "rgba(255,255,255,0.1)",
  },

  // --- BUTTON & PAD STYLES ---
  padContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  padLabel: {
    color: THEME.primary,
    fontFamily: THEME.font,
    fontSize: 9, // Iets kleiner font
    letterSpacing: 2,
    marginBottom: 8,
    opacity: 0.7,
    textTransform: "uppercase",
  },
  padRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  centerPointDot: {
    width: 2,
    height: 2,
    borderRadius: 1,
    backgroundColor: "rgba(255,255,255,0.3)",
  },

  techBtnBase: {
    backgroundColor: THEME.glass,
    borderWidth: 1,
    borderColor: THEME.border,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#00f0ff",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    margin: 2, // Iets minder marge tussen knoppen
  },
  techBtnPressed: {
    backgroundColor: THEME.glassActive,
    borderColor: THEME.primary,
    transform: [{ scale: 0.92 }],
  },
  techBtnDanger: {
    borderColor: THEME.danger,
    backgroundColor: "rgba(255, 42, 42, 0.15)",
  },

  // --- FULLSCREEN STYLES ---
  fsRoot: { flex: 1, backgroundColor: "black" },
  fsVideoLayer: { ...StyleSheet.absoluteFillObject },
  fsHud: { ...StyleSheet.absoluteFillObject, zIndex: 10 },

  fsTopCenter: {
    position: "absolute",
    top: 20,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  fsBottomLeft: { position: "absolute", bottom: 30, left: 30 },
  fsBottomRight: { position: "absolute", bottom: 30, right: 30 },
  fsTopRight: {
    position: "absolute",
    top: 30,
    right: 30,
    alignItems: "flex-end",
  },
});
