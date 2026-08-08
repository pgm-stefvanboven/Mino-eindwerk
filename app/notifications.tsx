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
import * as Notifications from "expo-notifications";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

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
  const { role } = useRole();

  useEffect(() => {
    // 1. Haal de gefilterde lijst op bij het laden
    loadNotifications();

    // 2. REALTIME LISTENER: Luister naar nieuwe gebeurtenissen
    const channel = supabase
      .channel("public:notifications_list")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newNotification = payload.new as Notification;

            // FILTER: Voorkom dat de melding in de lijst komt als de rol niet klopt
            if (role === "patient" && newNotification.type !== "privacy")
              return;
            if (role === "mantelzorger" && newNotification.type === "privacy")
              return;

            setNotifications((prev) => [newNotification, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            const updatedNotification = payload.new as Notification;
            setNotifications((prev) =>
              prev.map((notif) =>
                notif.id === updatedNotification.id
                  ? updatedNotification
                  : notif,
              ),
            );
          } else if (payload.eventType === "DELETE") {
            const deletedNotification = payload.old as Notification;
            setNotifications((prev) =>
              prev.filter((notif) => notif.id !== deletedNotification.id),
            );
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [role]); // Voeg role toe als dependency zodat hij herlaadt bij een wissel

  const loadNotifications = async () => {
    let query = supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false });

    // Pas de query aan op basis van de rol
    if (role === "patient") {
      query = query.eq("type", "privacy"); // Patiënt ziet ENKEL privacy meldingen
    } else if (role === "mantelzorger") {
      query = query.neq("type", "privacy"); // Mantelzorger ziet ALLES BEHALVE privacy meldingen
    }

    const { data, error } = await query;

    if (error) {
      console.error(error);
      return;
    }

    setNotifications(data ?? []);
  };

  const markAsRead = async (id: string, isRead: boolean) => {
    if (isRead) return;

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
        };
      case "medication":
        return { iconName: "medkit", iconColor: "#3b82f6", title: "Medicatie" };
      case "battery":
        return {
          iconName: "battery-dead",
          iconColor: "#f59e0b",
          title: "Batterij",
        };
      case "stock":
        return { iconName: "cube", iconColor: "#10b981", title: "Voorraad" };
      case "privacy":
        return {
          iconName: "shield-checkmark",
          iconColor: "#8b5cf6",
          title: "Privacy",
        }; // Nieuwe layout voor patiënt
      default:
        return {
          iconName: "notifications",
          iconColor: "#a1a1aa",
          title: originalTitle || "Melding",
        };
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

  // VERWIJDERD: Het harde blokkeerscherm voor de patiënt is hier weggehaald zodat de patiënt de privacy-melding kan lezen.

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
              {role === "patient"
                ? "Systeemmeldingen over uw privacy verschijnen hier."
                : "Meldingen van Mino verschijnen hier zodra er een gebeurtenis plaatsvindt."}
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