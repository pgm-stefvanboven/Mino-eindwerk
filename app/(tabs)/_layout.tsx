import { Tabs, useRouter } from "expo-router";
import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable } from "react-native";

export default function TabLayout() {
  const router = useRouter();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#1e88e5",
        headerRight: () => (
          <Pressable
            onPress={() => router.push("/connect")}
            style={{ marginRight: 15 }}
          >
            <Ionicons name="settings-outline" size={24} color="#333" />
          </Pressable>
        ),
      }}
    >
      {/* Scherm 1: Vandaag */}
      <Tabs.Screen
        name="index"
        options={{
          title: "Vandaag",
          tabBarIcon: ({ color }) => (
            <Ionicons name="today" size={28} color={color} />
          ),
        }}
      />

      {/* Scherm 2: Medicijnen Lijst (zorg dat bestandsnaam medicijnen.tsx is!) */}
      <Tabs.Screen
        name="medications"
        options={{
          title: "Medicijnen",
          tabBarIcon: ({ color }) => (
            <Ionicons name="list" size={28} color={color} />
          ),
        }}
      />

      {/* Scherm 3: Robot */}
      <Tabs.Screen
        name="robot"
        options={{
          title: "Camera",
          tabBarIcon: ({ color }) => (
            <Ionicons name="videocam" size={28} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}