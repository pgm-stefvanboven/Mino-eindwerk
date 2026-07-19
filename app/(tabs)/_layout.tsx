import { Tabs, useRouter, usePathname } from "expo-router";
import React, { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, View, Text } from "react-native";
import { useRole } from "../../context/RoleContext"; // 1. Importeer de context (check je mappenpad!)
import { supabase } from "../../lib/supabase";

export default function TabLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const { role } = useRole(); // 2. Haal de actieve rol op

  const [unreadCount, setUnreadCount] = useState(0);

  // 3. NIEUW: Update de badge elke keer als je van of naar dit scherm navigeert
  useEffect(() => {
    fetchUnreadCount();
  }, [pathname]);

  useEffect(() => {
    // Haal direct het aantal op bij het laden
    fetchUnreadCount();

    // REALTIME: Luister naar wijzigingen in de notificaties tabel!
    const channel = supabase
      .channel("public:notifications")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        () => {
          fetchUnreadCount();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchUnreadCount = async () => {
    const { count, error } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("read", false);

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
          // Dynamische titel en icoon op basis van de rol
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
          // 3. PRIVACY-BY-DESIGN: Hide the tab completely from the patient.
          href: role === "patient" ? null : "/robot",
          tabBarIcon: ({ color }) => (
            <Ionicons name="videocam" size={24} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
