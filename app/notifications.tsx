/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useRef, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import { supabase } from "../lib/supabase";
import { useRole } from "../context/RoleContext";
import { resolveNotificationRoute } from "../lib/notificationRouting";

type Notification = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  read: boolean;
  type?: string;
};

// Types die specifiek bestemd zijn voor de patiënt
const PATIENT_NOTIFICATION_TYPES = ["privacy", "reminder_5min"];

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const { role } = useRole();
  const router = useRouter();

  const roleRef = useRef(role);
  useEffect(() => {
    roleRef.current = role;
  }, [role]);

  useEffect(() => {
    loadNotifications();

    const channelName = `notifications-list-${Math.random().toString(36).slice(2)}`;
    const channel = supabase.channel(channelName);

    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "notifications" },
      (payload) => {
        const currentRole = roleRef.current;

        if (payload.eventType === "INSERT") {
          const newNotification = payload.new as Notification;
          const notifType = newNotification.type || "";

          // Filteren op rol
          if (
            currentRole === "patient" &&
            !PATIENT_NOTIFICATION_TYPES.includes(notifType)
          )
            return;
          if (
            currentRole === "mantelzorger" &&
            PATIENT_NOTIFICATION_TYPES.includes(notifType)
          )
            return;

          setNotifications((prev) => [newNotification, ...prev]);
        } else if (payload.eventType === "UPDATE") {
          const updatedNotification = payload.new as Notification;
          setNotifications((prev) =>
            prev.map((notif) =>
              notif.id === updatedNotification.id ? updatedNotification : notif,
            ),
          );
        } else if (payload.eventType === "DELETE") {
          const deletedNotification = payload.old as Notification;
          setNotifications((prev) =>
            prev.filter((notif) => notif.id !== deletedNotification.id),
          );
        }
      },
    );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [role]);

  const loadNotifications = async () => {
    let query = supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false });

    if (role === "patient") {
      // Patiënt ziet privacy én 5-minuten medicatie herinneringen
      query = query.in("type", PATIENT_NOTIFICATION_TYPES);
    } else if (role === "mantelzorger") {
      // Mantelzorger ziet alle meldingen BEHALVE patiënt-specifieke herinneringen/privacy
      query = query.not(
        "type",
        "in",
        `("${PATIENT_NOTIFICATION_TYPES.join('","')}")`,
      );
    }

    const { data, error } = await query;
    if (error) {
      console.error(error);
      return;
    }

    const list = data ?? [];
    setNotifications(list);

    // Alles wat hier zichtbaar en nog ongelezen is, meteen als gelezen
    // markeren — zoals bij WhatsApp: het openen van de lijst zelf is wat
    // een melding "gelezen" maakt, niet enkel het aantikken van elk item
    // afzonderlijk. Dit is ook wat de badge daadwerkelijk laat kloppen met
    // Supabase i.p.v. permanent op "1" te blijven staan.
    const unreadIds = list.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length > 0) {
      setNotifications((prev) =>
        prev.map((n) => (unreadIds.includes(n.id) ? { ...n, read: true } : n)),
      );

      const { error: readError } = await supabase
        .from("notifications")
        .update({ read: true })
        .in("id", unreadIds);

      if (readError) {
        console.error("Fout bij markeren als gelezen:", readError);
      }
    }

    // Badge van het app-icoon synchroniseren met de werkelijke toestand.
    await Notifications.setBadgeCountAsync(0).catch(() => { });
  };

  const markAsRead = async (id: string, isRead: boolean) => {
    if (isRead) return;
    setNotifications((prev) =>
      prev.map((notif) => (notif.id === id ? { ...notif, read: true } : notif)),
    );
    await supabase.from("notifications").update({ read: true }).eq("id", id);
  };

  const confirmDelete = (id: string) => {
    Alert.alert(
      "Melding Verwijderen",
      "Wil je deze melding definitief uit de lijst verwijderen?",
      [
        { text: "Annuleren", style: "cancel" },
        {
          text: "Verwijderen",
          style: "destructive",
          onPress: async () => {
            setNotifications((prev) => prev.filter((n) => n.id !== id));
            await supabase.from("notifications").delete().eq("id", id);
          },
        },
      ],
    );
  };

  const confirmDeleteAll = () => {
    Alert.alert(
      "Alles Verwijderen",
      "Weet je zeker dat je alle meldingen in deze lijst definitief wilt verwijderen?",
      [
        { text: "Annuleren", style: "cancel" },
        {
          text: "Verwijder Alles",
          style: "destructive",
          onPress: async () => {
            const idsToDelete = notifications.map((n) => n.id);
            setNotifications([]);

            const { error } = await supabase
              .from("notifications")
              .delete()
              .in("id", idsToDelete);

            if (error) console.error("Fout bij alles verwijderen:", error);
          },
        },
      ],
    );
  };

  const handleNotificationPress = (item: Notification) => {
    if (item.type !== "emergency") {
      markAsRead(item.id, item.read);
    }

    const route = resolveNotificationRoute({
      type: item.type,
      title: item.title,
      body: item.body,
    });
    router.push(route as any);
  };

  const getTypeConfig = (type: string | undefined, originalTitle: string) => {
    switch (type) {
      case "emergency":
        return {
          iconName: "alert-circle",
          iconColor: "#ef4444",
          title: "Noodsituatie",
        };
      case "reminder_5min":
        return {
          iconName: "time",
          iconColor: "#ffaa00",
          title: "Medicatie Herinnering",
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
        };
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.pageTitle}>Recente Meldingen</Text>
          <Text style={styles.subTitle}>Lang indrukken om te verwijderen.</Text>
        </View>

        {notifications.length > 0 && (
          <TouchableOpacity
            onPress={confirmDeleteAll}
            style={styles.deleteAllBtn}
            activeOpacity={0.6}
          >
            <Ionicons name="trash-outline" size={20} color="#ef4444" />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 20 }}
        renderItem={({ item }) => {
          const config = getTypeConfig(item.type, item.title);
          const isUnread = !item.read;

          return (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => handleNotificationPress(item)}
              onLongPress={() => confirmDelete(item.id)}
              delayLongPress={400}
              style={[
                styles.notificationCard,
                {
                  backgroundColor: isUnread
                    ? "rgba(255,255,255,0.08)"
                    : "#1c1c1e",
                  borderLeftColor: config.iconColor,
                  borderColor: isUnread
                    ? "rgba(255,255,255,0.15)"
                    : "transparent",
                },
              ]}
            >
              <View
                style={[
                  styles.iconWrapper,
                  { backgroundColor: `${config.iconColor}15` },
                ]}
              >
                <Ionicons
                  name={config.iconName as any}
                  size={24}
                  color={config.iconColor}
                />
              </View>

              <View style={styles.textContainer}>
                <View style={styles.titleRow}>
                  <Text style={[styles.title, isUnread && styles.titleUnread]}>
                    {config.title}
                  </Text>
                  {isUnread && <View style={styles.unreadDot} />}
                </View>

                <Text style={styles.bodyText}>{item.body}</Text>
                <Text style={styles.timeText}>
                  {formatDateTime(item.created_at)}
                </Text>
              </View>

              <View style={styles.chevronWrapper}>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color="rgba(255,255,255,0.4)"
                />
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="notifications-off" size={40} color="#333" />
            </View>
            <Text style={styles.emptyTitle}>Geen nieuwe meldingen</Text>
            <Text style={styles.emptyText}>
              {role === "patient"
                ? "Herinneringen en privacy-meldingen verschijnen hier."
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
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 15,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  pageTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "bold",
    letterSpacing: 0.5,
  },
  subTitle: {
    color: "#71717a",
    fontSize: 12,
    marginTop: 4,
  },
  deleteAllBtn: {
    padding: 10,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  notificationCard: {
    padding: 16,
    borderRadius: 14,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    borderLeftWidth: 4,
    borderWidth: 1,
  },
  iconWrapper: {
    width: 46,
    height: 46,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  textContainer: {
    flex: 1,
    justifyContent: "center",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  title: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  titleUnread: {
    fontWeight: "900",
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#00f0ff",
    marginLeft: 8,
  },
  bodyText: {
    color: "#d4d4d8",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  timeText: {
    color: "#71717a",
    fontSize: 12,
    fontWeight: "500",
  },
  chevronWrapper: {
    marginLeft: 10,
    justifyContent: "center",
    alignItems: "center",
    width: 24,
  },
  emptyContainer: {
    alignItems: "center",
    marginTop: 60,
    paddingHorizontal: 20,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.03)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
  },
  emptyText: {
    color: "#a1a1aa",
    textAlign: "center",
    lineHeight: 22,
  },
});