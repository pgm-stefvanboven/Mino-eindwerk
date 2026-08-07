/* eslint-disable react-hooks/exhaustive-deps */
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  StatusBar,
  AppState,
  TouchableOpacity,
} from "react-native";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useNavigation } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ScreenOrientation from "expo-screen-orientation";
import * as NavigationBar from "expo-navigation-bar";
import { supabase } from "../../lib/supabase";
import { useRole } from "../../context/RoleContext";

const VIDEO_IP = "http://10.178.148.75:5001";
const COMMAND_IP = "http://10.178.148.75:5002";

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
  let color = "#ff4444";
  let bg = "rgba(255, 60, 60, 0.2)";

  if (status === "ONLINE") {
    color = "#3cdc78";
    bg = "rgba(60, 220, 120, 0.2)";
  } else if (status === "VERGRENDELD") {
    color = "#00f0ff";
    bg = "rgba(0, 240, 255, 0.15)";
  }

  return (
    <View style={[styles.badge, { backgroundColor: bg, borderColor: color }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.badgeText}>{status}</Text>
    </View>
  );
};

const DPad = ({
  moveFn,
  type,
  label,
  size = 50,
}: {
  moveFn: (d: string) => void;
  type: "move" | "cam";
  label?: string;
  size?: number;
}) => {
  const isMove = type === "move";
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
  const { role } = useRole(); // Rol ophalen

  const [webKey, setWebKey] = React.useState(0);
  const [status, setStatus] = React.useState<
    "ONLINE" | "CONNECTING" | "OFFLINE"
  >("CONNECTING");
  const [isFullscreen, setIsFullscreen] = React.useState(false);

  // SUPABASE SHARED STATES
  const [cameraAlways, setCameraAlways] = React.useState(false);
  const [emergencyAccess, setEmergencyAccess] = React.useState(false);

  const move = (dir: string) => {
    fetch(`${COMMAND_IP}/move/${dir}`).catch(() => setStatus("OFFLINE"));
  };

  const reloadVideo = () => {
    setStatus("CONNECTING");
    setWebKey((k) => k + 1);
  };

  // Functie voor ontgrendeling, wordt nu automatisch aangeroepen
  const startCareSession = async () => {
    setEmergencyAccess(true); // optimistic UI

    await supabase
      .from("shared_settings")
      .update({ emergency_camera_unlocked: true })
      .eq("id", 1);

    await supabase.from("notifications").insert({
      title: "Camera actief",
      body: "De mantelzorger kijkt tijdelijk mee via de camera.",
      type: "privacy",
    });
  };

  useFocusEffect(
    React.useCallback(() => {
      let isActive = true;

      if (Platform.OS === "android")
        NavigationBar.setVisibilityAsync("visible");

      reloadVideo();

      // 1. Controleer de huidige status en ontgrendel automatisch als het de mantelzorger is
      const loadStatus = async () => {
        const { data } = await supabase
          .from("shared_settings")
          .select("emergency_camera_unlocked, camera_always_enabled")
          .eq("id", 1)
          .single();

        if (data && isActive) {
          setCameraAlways(data.camera_always_enabled);
          setEmergencyAccess(data.emergency_camera_unlocked);

          // AUTO-UNLOCK LOGICA
          if (
            role === "mantelzorger" &&
            !data.emergency_camera_unlocked &&
            !data.camera_always_enabled
          ) {
            const thirtyMinutesAgo = new Date(
              Date.now() - 30 * 60000,
            ).toISOString();

            const { count } = await supabase
              .from("notifications")
              .select("*", { count: "exact", head: true })
              .eq("type", "emergency")
              .eq("read", false) // <-- Enkel ongelezen noodgevallen tellen mee
              .gte("created_at", thirtyMinutesAgo);

            if (count && count > 0) {
              startCareSession();
            }
          }
        }
      };

      loadStatus();

      // 2. Vergrendel-helper, herbruikt bij blur EN bij app-achtergrond.
      const lockEmergencyAccess = () => {
        if (role === "mantelzorger") {
          supabase
            .from("shared_settings")
            .update({ emergency_camera_unlocked: false })
            .eq("id", 1)
            .then(({ error }) => {
              if (error) console.error("Fout bij sluiten camera:", error);
            });
        }
      };

      // 3. Vergrendel meteen zodra de app naar de achtergrond gaat / wordt
      //    afgesloten — hier op wachten via de blur van useFocusEffect alleen
      //    is niet betrouwbaar genoeg (dat vuurt niet af bij app-kill).
      const appStateSub = AppState.addEventListener("change", (nextState) => {
        if (nextState !== "active") lockEmergencyAccess();
      });

      // 4. Luister realtime naar updates (Cruciaal voor de patiënt-app)
      const channel = supabase
        .channel("public:shared_settings_robot")
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "shared_settings" },
          (payload) => {
            if (isActive) {
              setCameraAlways(payload.new.camera_always_enabled);
              setEmergencyAccess(payload.new.emergency_camera_unlocked);
            }
          },
        )
        .subscribe();

      // DE CLEANUP FUNCTIE (Wordt uitgevoerd zodra je dit tabblad verlaat)
      return () => {
        isActive = false;

        lockEmergencyAccess();
        appStateSub.remove();
        supabase.removeChannel(channel);

        move("stop");
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT);
        if (Platform.OS === "android")
          NavigationBar.setVisibilityAsync("visible");
        navigation.setOptions({ headerShown: true, tabBarStyle: undefined });
      };
    }, [role]),
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

  const handleEmergencyResolved = async () => {
    // 1. Zet alle ongelezen noodmeldingen op gelezen
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("type", "emergency")
      .eq("read", false);

    // 2. Vergrendel de camera in Supabase
    await supabase
      .from("shared_settings")
      .update({ emergency_camera_unlocked: false })
      .eq("id", 1);

    // 3. Sluit de camera direct op het scherm
    setEmergencyAccess(false);
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

  // Heeft dit scherm momenteel recht om de stream te tonen?
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
                {emergencyAccess && !cameraAlways && (
                  <View style={styles.emergencyBanner}>
                    <View
                      style={{ flexDirection: "row", alignItems: "center" }}
                    >
                      <Ionicons name="warning" size={16} color="#ff4444" />
                      <Text style={styles.emergencyBannerText}>
                        Noodtoegang actief
                      </Text>
                    </View>

                    {role === "mantelzorger" && (
                      <TouchableOpacity
                        style={styles.resolveBtn}
                        onPress={handleEmergencyResolved}
                      >
                        <Text style={styles.resolveBtnText}>AFHANDELEN</Text>
                      </TouchableOpacity>
                    )}
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
              <View style={styles.privacyView}>
                <Ionicons name="lock-closed" size={60} color="#00f0ff" />
                <Text style={styles.privacyTitle}>Camera Vergrendeld</Text>
                <Text style={styles.privacyText}>
                  De camera is momenteel gedeactiveerd om de privacy van de
                  patiënt te waarborgen.
                </Text>
              </View>
            )}
          </View>

          <View style={styles.controlBar}>
            <StatusBadge status={hasAccess ? status : "VERGRENDELD"} />
            <View style={{ flexDirection: "row", gap: 15 }}>
              {hasAccess && (
                <>
                  <TechBtn icon="refresh" size={40} onPress={reloadVideo} />
                  <TechBtn icon="scan" size={40} onPress={toggleFullscreen} />
                </>
              )}
            </View>
          </View>

          {hasAccess ? (
            <View style={styles.portraitControls}>
              <DPad moveFn={move} type="move" label="RIJDEN" size={42} />
              <View style={styles.divider} />
              <DPad moveFn={move} type="cam" label="KIJKEN" size={42} />
            </View>
          ) : (
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
              {hasAccess && (
                <TechBtn
                  icon="refresh"
                  size={45}
                  onPress={reloadVideo}
                  style={{ marginBottom: 15 }}
                />
              )}
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

  videoContainer: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#000",
    borderBottomWidth: 1,
    borderColor: "#333",
  },

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

  padContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  padLabel: {
    color: THEME.primary,
    fontFamily: THEME.font,
    fontSize: 9,
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
    margin: 2,
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

  resolveBtn: {
    backgroundColor: "white",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 15,
  },
  resolveBtnText: {
    color: "#ff4444",
    fontSize: 10,
    fontWeight: "bold",
    letterSpacing: 1,
  },
});
