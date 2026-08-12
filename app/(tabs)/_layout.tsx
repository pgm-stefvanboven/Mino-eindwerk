import { Tabs, useRouter, usePathname } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, View, Text, Platform } from "react-native";
import { useRole } from "../../context/RoleContext";
import { supabase } from "../../lib/supabase";

// --- PUSH IMPORTS ---
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";

// Zelfde bron van waarheid als notifications.tsx — moet hiermee gelijk
// blijven, anders telt deze badge meldingstypes mee die de lijst voor die
// rol nooit toont (en dus ook nooit als gelezen kan markeren), wat een
// permanente "spookbadge" veroorzaakt.
const PATIENT_NOTIFICATION_TYPES = ["privacy", "reminder_5min"];

export default function TabLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const { role } = useRole();

  const [unreadCount, setUnreadCount] = useState(0);

  // Keep the latest role in a ref so the realtime callback (set up once,
  // see below) always reads the current role without us needing to tear
  // down and recreate the channel every time role changes.
  const roleRef = useRef(role);
  useEffect(() => {
    roleRef.current = role;
  }, [role]);

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
        // BELANGRIJK (zie Expo-documentatie): op Android 13+ verschijnt de
        // toestemmingsprompt pas nadat er minstens één notification channel
        // bestaat. setNotificationChannelAsync moet dus VOOR
        // getPermissionsAsync/requestPermissionsAsync en getExpoPushTokenAsync
        // gebeuren — hiervoor stond dit helemaal op het einde, waardoor de
        // prompt op Android 13+ mogelijk nooit verscheen en de hele
        // registratie stil faalde.
        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("default", {
            name: "default",
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: "#00f0ff",
          });
        }

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
      } catch (e) {
        console.error("❌ Er is een onverwachte fout opgetreden:", e);
      }
    }

    registerForPushNotificationsAsync();
  }, [role]);

  // Update de badge elke keer als je van of naar dit scherm navigeert, of als de rol wijzigt
  useEffect(() => {
    fetchUnreadCount();
  }, [pathname, role]);

  // REALTIME: Luister naar wijzigingen in de notificaties tabel.
  // IMPORTANT: this effect now runs ONCE per real mount (deps: []).
  // It used to depend on [role], which meant that every role switch (and
  // every Expo Router "screen freeze/reconnect" when you left and came
  // back to this tab) tore the channel down and immediately recreated one
  // with the SAME name ("public:notifications"). supabase-js unsubscribes
  // asynchronously, so the new channel() call would sometimes get handed
  // back the still-being-removed old instance — which already had
  // .subscribe() called on it — and .on() would throw:
  // "cannot add `postgres_changes` callbacks ... after `subscribe()`".
  //
  // Fix: give every mount its own unique channel name so it can never
  // collide with a channel that's still being torn down, and read role
  // from roleRef so we don't need to recreate the channel at all.
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
  }, []);

  const fetchUnreadCount = async () => {
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
        `("${PATIENT_NOTIFICATION_TYPES.join('","')}")`,
      );
    }

    const { count, error } = await query;

    if (!error && count !== null) {
      setUnreadCount(count);
    }
  };

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

        // Settings button top right
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
          // PRIVACY-BY-DESIGN: Hide the tab completely from the patient.
          href: role === "patient" ? null : "/robot",
          tabBarIcon: ({ color }) => (
            <Ionicons name="videocam" size={24} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}