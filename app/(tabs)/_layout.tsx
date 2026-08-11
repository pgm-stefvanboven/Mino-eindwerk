import { Tabs, useRouter, usePathname } from "expo-router";
import React, { useEffect, useRef, useState, useCallback } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, View, Text, Platform } from "react-native";
import { useRole } from "../../context/RoleContext";
import { supabase } from "../../lib/supabase";

// --- PUSH IMPORTS ---
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";

// Types die specifiek bestemd zijn voor de patiënt (buiten de component voor een vaste referentie)
const PATIENT_NOTIFICATION_TYPES = ["privacy", "reminder_5min"];

export default function TabLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const { role } = useRole();

  const [unreadCount, setUnreadCount] = useState(0);

  // Keep the latest role in a ref so the realtime callback always reads the current role
  const roleRef = useRef(role);
  useEffect(() => {
    roleRef.current = role;
  }, [role]);

  // Haal aantal ongelezen meldingen op
  const fetchUnreadCount = useCallback(async () => {
    const currentRole = roleRef.current;

    let query = supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("read", false);

    if (currentRole === "patient") {
      query = query.in("type", PATIENT_NOTIFICATION_TYPES);
    } else if (currentRole === "mantelzorger") {
      query = query.not(
        "type",
        "in",
        `("${PATIENT_NOTIFICATION_TYPES.join('","')}")`
      );
    }

    const { count, error } = await query;

    if (!error && count !== null) {
      setUnreadCount(count);
    }
  }, []);

  // --- REGISTREER GSM VOOR PUSH MELDINGEN ---
  useEffect(() => {
    async function registerForPushNotificationsAsync() {
      console.log("🛠️ Push Check gestart. Huidige rol is:", role);

      if (role !== "mantelzorger") {
        console.log("🛑 Gestopt: Gebruiker is geen mantelzorger.");
        return;
      }

      if (!Device.isDevice) {
        console.log(
          "🛑 Gestopt: Push notificaties vereisen een fysiek toestel.",
        );
        return;
      }

      try {
        const { status: existingStatus } =
          await Notifications.getPermissionsAsync();
        console.log("📊 Huidige toestemming status:", existingStatus);
        let finalStatus = existingStatus;

        if (existingStatus !== "granted") {
          console.log("👀 Toestemming vragen aan de gebruiker...");
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus !== "granted") {
          console.log("🛑 Gestopt: Gebruiker heeft toestemming geweigerd!");
          return;
        }

        console.log("✅ Toestemming is in orde! Token ophalen...");

        const tokenData = await Notifications.getExpoPushTokenAsync({
          projectId: "4137b61f-247e-4811-aea5-a53fc50ba7d7",
        }).catch((err) => {
          console.error("❌ Fout bij ophalen Expo token:", err);
          return null;
        });

        if (!tokenData) return;

        const token = tokenData.data;
        console.log("🚀 Nieuwe Push Token gegenereerd:", token);

        const { error } = await supabase
          .from("shared_settings")
          .update({ caregiver_push_token: token })
          .eq("id", 1);

        if (error) {
          console.error("❌ Fout bij opslaan push token in Supabase:", error);
        } else {
          console.log("💾 Token succesvol opgeslagen in Supabase!");
        }

        if (Platform.OS === "android") {
          Notifications.setNotificationChannelAsync("default", {
            name: "default",
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: "#00f0ff",
          });
        }
      } catch (e) {
        console.error("❌ Er is een onverwachte fout opgetreden:", e);
      }
    }

    registerForPushNotificationsAsync();
  }, [role]);

  // Update de badge elke keer als je van of naar dit scherm navigeert, of als de rol wijzigt
  useEffect(() => {
    fetchUnreadCount();
  }, [pathname, role, fetchUnreadCount]);

  // REALTIME: Luister naar wijzigingen in de notificaties tabel.
  useEffect(() => {
    fetchUnreadCount();

    const channelName = `notifications-badge-${Math.random().toString(36).slice(2)}`;
    const channel = supabase.channel(channelName);

    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "notifications" },
      () => {
        fetchUnreadCount();
      },
    );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchUnreadCount]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#007AFF",
        tabBarStyle: {
          backgroundColor: "#1c1c1e",
          borderTopColor: "rgba(255,255,255,0.1)",
        },
        headerStyle: {
          backgroundColor: "#09090b",
          borderBottomColor: "rgba(255,255,255,0.1)",
          borderBottomWidth: 1,
        },
        headerTintColor: "white",
        headerTitleStyle: { fontWeight: "bold", letterSpacing: 1 },

        headerRight: () => (
          <>
            <Pressable
              onPress={() => router.push("/notifications")}
              style={({ pressed }) => ({
                marginRight: 20,
                opacity: pressed ? 0.5 : 1,
                position: "relative",
              })}
            >
              <Ionicons name="notifications-outline" size={24} color="white" />

              {unreadCount > 0 && (
                <View
                  style={{
                    position: "absolute",
                    right: -6,
                    top: -4,
                    backgroundColor: "#ff4444",
                    borderRadius: 10,
                    minWidth: 18,
                    height: 18,
                    justifyContent: "center",
                    alignItems: "center",
                    paddingHorizontal: 4,
                    borderWidth: 1,
                    borderColor: "#09090b",
                  }}
                >
                  <Text
                    style={{
                      color: "white",
                      fontSize: 10,
                      fontWeight: "bold",
                    }}
                  >
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </Text>
                </View>
              )}
            </Pressable>

            <Pressable
              onPress={() => router.push("/settings")}
              style={({ pressed }) => ({
                marginRight: 15,
                opacity: pressed ? 0.5 : 1,
              })}
            >
              <Ionicons name="settings-outline" size={24} color="white" />
            </Pressable>
          </>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: role === "mantelzorger" ? "OVERZICHT" : "VANDAAG",
          tabBarIcon: ({ color }) => (
            <Ionicons
              name={role === "mantelzorger" ? "stats-chart" : "calendar"}
              size={24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="medications"
        options={{
          title: role === "mantelzorger" ? "BEHEER" : "MEDICIJNEN",
          tabBarIcon: ({ color }) => (
            <Ionicons
              name={role === "mantelzorger" ? "list" : "medkit"}
              size={24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="robot"
        options={{
          title: "CAMERA",
          href: role === "patient" ? null : "/robot",
          tabBarIcon: ({ color }) => (
            <Ionicons name="videocam" size={24} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}