import { Tabs, useRouter } from "expo-router";
import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable } from "react-native";

export default function TabLayout() {
  const router = useRouter();

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
      {/* ... other tabs ... */}
      <Tabs.Screen
        name="index"
        options={{
          title: "VANDAAG",
          tabBarIcon: ({ color }) => (
            <Ionicons name="calendar" size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="medications"
        options={{
          title: "MEDICIJNEN",
          tabBarIcon: ({ color }) => (
            <Ionicons name="medkit" size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="robot"
        options={{
          title: "CAMERA",
          tabBarIcon: ({ color }) => (
            <Ionicons name="videocam" size={24} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}