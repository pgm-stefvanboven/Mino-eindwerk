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
import { supabase } from "../lib/supabase";
import { useRole } from "../context/RoleContext";
import { resolveNotificationRoute } from "../lib/notificationRouting";

// NOTE: Notifications.setNotificationHandler(...) now lives ONLY in
// app/_layout.tsx — no need to set it again here.

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
  const router = useRouter();

  // See app/(tabs)/_layout.tsx for the full explanation of this pattern.
  // Short version: recreating a supabase channel with the same name every
  // time `role` changed (or the screen re-focused) could race with the
  // previous channel's async unsubscribe and throw
  // "cannot add `postgres_changes` callbacks ... after `subscribe()`".
  // Fix: one channel per real mount, unique name, role read from a ref.
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
          if (currentRole === "patient" && newNotification.type !== "privacy")
            return;
          if (
            currentRole === "mantelzorger" &&
            newNotification.type === "privacy"
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

  // Re-run the initial load whenever role changes (the realtime channel
  // above no longer needs to be recreated for this — see comment above).
  useEffect(() => {
    loadNotifications();
  }, [role]);

  const loadNotifications = async () => {
    let query = supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false });

    if (role === "patient") {
      query = query.eq("type", "privacy");
    } else if (role === "mantelzorger") {
      query = query.neq("type", "privacy");
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
    await supabase.from("notifications").update({ read: true }).eq("id", id);
  };

  // --- ACTIE 1: Individueel Verwijderen (Long Press) ---
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

  // --- ACTIE 2: Alles Verwijderen (Outlook-stijl) ---
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

  // --- ACTIE 3: Klikbaar & Navigeren naar het juiste scherm ---
  const handleNotificationPress = (item: Notification) => {
    // IMPORTANT: emergency notifications are special. app/(tabs)/robot.tsx
    // uses `read: false` on an emergency notification as its signal that
    // the camera still needs to be auto-unlocked for the caregiver. If we
    // mark it read here, the moment you tap it to go look at the camera,
    // robot.tsx's unread-count check finds nothing and never unlocks.
    // Only handleEmergencyResolved() in robot.tsx should mark these read,
    // once the caregiver has actually dealt with the situation.
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

        {/* Outlook-stijl Verwijder Alles Knop */}
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