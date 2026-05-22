import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { useAuthStore } from "../src/store/auth";
import { apiRequest } from "../src/api/client";

// Show alerts while app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30_000,
      // Keep cache for 24 h so offline reads work after the app restarts
      gcTime: 1000 * 60 * 60 * 24,
    },
  },
});

const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "cybersage-query-cache",
});

async function registerPushToken() {
  if (Platform.OS === "web") return;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") return;

  try {
    // projectId is required for production EAS builds; omit for dev (Expo Go)
    const tokenRes = await Notifications.getExpoPushTokenAsync();
    await apiRequest<{ registered: boolean }>("/api/mobile/push/register", {
      method: "POST",
      body: JSON.stringify({ token: tokenRes.data, platform: Platform.OS }),
    });
  } catch (e) {
    console.warn("[push] registration skipped:", e);
  }
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading, hydrate } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();
  const notifSub = useRef<Notifications.Subscription | null>(null);

  useEffect(() => { void hydrate(); }, []);

  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === "(auth)";
    if (!user && !inAuth) {
      router.replace("/(auth)/login");
    } else if (user && !inAuth) {
      void registerPushToken();
    } else if (user && inAuth) {
      router.replace("/(tabs)");
    }
  }, [user, loading, segments]);

  // Handle tapping a push notification — deep link to the relevant screen
  useEffect(() => {
    notifSub.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as {
        type?: string;
        threadId?: string;
        channelId?: string;
      };
      if (data?.type === "email" && data?.threadId) {
        router.push(`/thread/${data.threadId}` as never);
      } else if (data?.type === "chat") {
        router.push("/(tabs)/chat" as never);
      }
    });
    return () => { notifSub.current?.remove(); };
  }, []);

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister: asyncStoragePersister }}
    >
      <AuthGate>
        <Stack screenOptions={{ headerShown: false }} />
      </AuthGate>
    </PersistQueryClientProvider>
  );
}
