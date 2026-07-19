import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

type Notification = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  read: boolean;
  type?: string;
};

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      return;
    }

    setNotifications(data ?? []);
  };

  // Functie om de melding als gelezen te markeren
  const markAsRead = async (id: string, isRead: boolean) => {
    if (isRead) return; // Als het al gelezen is, hoeven we niks te doen

    // 1. Optimistische UI update (direct de bol verbergen voor een snelle app-ervaring)
    setNotifications((prev) =>
      prev.map((notif) => (notif.id === id ? { ...notif, read: true } : notif)),
    );

    // 2. Database updaten
    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", id);

    if (error) {
      console.error("Fout bij updaten read status:", error);
    }
  };

  // Helper om icoon en dynamische titel te bepalen op basis van type
  const getTypeConfig = (type: string | undefined, originalTitle: string) => {
    switch (type) {
      case "emergency":
        return { icon: "🔴", title: "Noodsituatie" };
      case "medication":
        return { icon: "💊", title: "Medicatie" };
      case "battery":
        return { icon: "🔋", title: "Batterij" };
      case "stock":
        return { icon: "📦", title: "Voorraad" };
      default:
        return { icon: "🔔", title: originalTitle || "Melding" };
    }
  };

  // Helper om de datum te formatteren
  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    const dateOptions: Intl.DateTimeFormatOptions = {
      day: "numeric",
      month: "long",
      year: "numeric",
    };
    const datePart = date.toLocaleDateString("nl-BE", dateOptions);
    const timePart = date.toLocaleTimeString("nl-BE", {
      hour: "2-digit",
      minute: "2-digit",
    });

    return `${datePart} • ${timePart}`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const config = getTypeConfig(item.type, item.title);

          return (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => markAsRead(item.id, item.read)}
              style={{
                backgroundColor: "#1c1c1e",
                padding: 16,
                borderRadius: 12,
                marginBottom: 12,
                flexDirection: "row",
                alignItems: "flex-start",
                borderWidth: 1,
                borderColor: item.read
                  ? "transparent"
                  : "rgba(255, 68, 68, 0.3)",
              }}
            >
              <Text style={{ fontSize: 24, marginRight: 16, marginTop: 2 }}>
                {config.icon}
              </Text>

              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: "white",
                    fontSize: 16,
                    fontWeight: item.read ? "600" : "bold",
                    marginBottom: 4,
                  }}
                >
                  {config.title}
                </Text>

                <Text
                  style={{
                    color: "#d4d4d8",
                    marginBottom: 8,
                    fontSize: 14,
                    lineHeight: 20,
                  }}
                >
                  {item.body}
                </Text>

                <Text
                  style={{
                    color: "#71717a",
                    fontSize: 12,
                  }}
                >
                  {formatDateTime(item.created_at)}
                </Text>
              </View>

              {!item.read && (
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: "#ff4444",
                    marginTop: 6,
                    marginLeft: 8,
                  }}
                />
              )}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={{ marginTop: 40 }}>
            <Text
              style={{
                color: "white",
                fontSize: 18,
                fontWeight: "600",
                marginBottom: 8,
              }}
            >
              Nog geen meldingen
            </Text>

            <Text
              style={{
                color: "#a1a1aa",
                lineHeight: 22,
              }}
            >
              Meldingen van Mino verschijnen hier zodra er een gebeurtenis
              plaatsvindt.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#09090b",
    padding: 20,
  },
  subtitle: {
    color: "#a1a1aa",
    fontSize: 16,
  },
});
