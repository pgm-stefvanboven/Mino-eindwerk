import { useEffect } from "react";
import { ActivityIndicator, View, Text } from "react-native";
import { useRouter } from "expo-router";
import { useRole } from "../context/RoleContext";

export default function SplashScreen() {
  const router = useRouter();
  const { role, loading } = useRole();

  useEffect(() => {
    if (loading) return;

    if (role) {
      router.replace("/(tabs)");
    } else {
      router.replace("/login");
    }
  }, [loading, role, router]);

  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#09090b",
        padding: 24,
      }}
    >
      <Text
        style={{
          color: "white",
          fontSize: 32,
          fontWeight: "bold",
          marginBottom: 12,
        }}
      >
        Mino
      </Text>

      <Text
        style={{
          color: "#a1a1aa",
          fontSize: 16,
          textAlign: "center",
          marginBottom: 32,
        }}
      >
        Uw zorgomgeving wordt{"\n"}voorbereid...
      </Text>

      <ActivityIndicator size="large" color="#4ade80" />
    </View>
  );
}
