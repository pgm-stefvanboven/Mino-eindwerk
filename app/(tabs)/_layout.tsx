import { Tabs, useRouter } from "expo-router";
import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable } from "react-native";
import { useRole } from "../../context/RoleContext"; // 1. Importeer de context (check je mappenpad!)

export default function TabLayout() {
  const router = useRouter();
  const { role } = useRole(); // 2. Haal de actieve rol op

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
          <Pressable
            onPress={() => router.push("/settings")}
            style={({ pressed }) => ({
              marginRight: 15,
              opacity: pressed ? 0.5 : 1,
            })}
          >
            <Ionicons name="settings-outline" size={24} color="white" />
          </Pressable>
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
          // 3. PRIVACY-BY-DESIGN: Verberg de tab volledig voor de mantelzorger
          href: role === "mantelzorger" ? null : "/robot",
          tabBarIcon: ({ color }) => (
            <Ionicons name="videocam" size={24} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}