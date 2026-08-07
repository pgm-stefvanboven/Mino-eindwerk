/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { useRole } from "../context/RoleContext";

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
  const { role } = useRole(); // Retrieve the current role

  useEffect(() => {
    // Stop immediately if the user is a patient
    if (role === "patient") return;

    loadNotifications();

    const channel = supabase
      .channel("public:notifications_list")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            // New report? Put it right at the top of the list
            const newNotification = payload.new as Notification;
            setNotifications((prev) => [newNotification, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            // Notification updated? (e.g., in another session marked as read)
            const updatedNotification = payload.new as Notification;
            setNotifications((prev) =>
              prev.map((notif) =>
                notif.id === updatedNotification.id
                  ? updatedNotification
                  : notif,
              ),
            );
          } else if (payload.eventType === "DELETE") {
            // Notification deleted in the database? Remove it from the list
            const deletedNotification = payload.old as Notification;
            setNotifications((prev) =>
              prev.filter((notif) => notif.id !== deletedNotification.id),
            );
          }
        },
      )
      .subscribe();

    // Cleanup als het scherm wordt afgesloten
    return () => {
      supabase.removeChannel(channel);
    };
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

  const markAsRead = async (id: string, isRead: boolean) => {
    if (isRead) return;

    // Optimistische UI update (direct de bol verbergen voor een snelle app-ervaring)
    setNotifications((prev) =>
      prev.map((notif) => (notif.id === id ? { ...notif, read: true } : notif)),
    );

    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", id);

    if (error) {
      console.error("Fout bij updaten read status:", error);
    }
  };

  const getTypeConfig = (type: string | undefined, originalTitle: string) => {
    switch (type) {
      case "emergency":
        return {
          iconName: "alert-circle",
          iconColor: "#ef4444",
          title: "Noodsituatie",
        }; // Rood
      case "medication":
        return { iconName: "medkit", iconColor: "#3b82f6", title: "Medicatie" }; // Blauw
      case "battery":
        return {
          iconName: "battery-dead",
          iconColor: "#f59e0b",
          title: "Batterij",
        }; // Oranje
      case "stock":
        return { iconName: "cube", iconColor: "#10b981", title: "Voorraad" }; // Groen
      default:
        return {
          iconName: "notifications",
          iconColor: "#a1a1aa",
          title: originalTitle || "Melding",
        }; // Grijs
    }
  };

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

  if (role === "patient") {
    return (
      <SafeAreaView style={styles.container}>
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            padding: 20,
          }}
        >
          <Ionicons name="shield-half" size={48} color="#3b82f6" />
          <Text
            style={{
              color: "white",
              fontSize: 18,
              marginTop: 16,
              textAlign: "center",
            }}
          >
            Dit scherm is enkel toegankelijk voor de mantelzorger.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

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
              <Ionicons
                name={config.iconName as any}
                size={26}
                color={config.iconColor}
                style={{ marginRight: 16, marginTop: 2 }}
              />

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
});
