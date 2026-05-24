import { useEffect, useRef, useState } from "react";
import * as LocalAuthentication from "expo-local-authentication";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, type AppStateStatus } from "react-native";

const KEY = "appLockEnabled";

export function useBiometricLock() {
  const [enabled, setEnabled] = useState(false);
  const [locked, setLocked] = useState(false);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const authenticating = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then(v => {
      if (v === "true") setEnabled(true);
    });
  }, []);

  const authenticate = async () => {
    if (authenticating.current) return;
    authenticating.current = true;
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !isEnrolled) { setLocked(false); return; }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Authenticate to access Nexus",
        cancelLabel: "Cancel",
        fallbackLabel: "Use Passcode",
      });
      if (result.success) setLocked(false);
    } finally {
      authenticating.current = false;
    }
  };

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (appState.current.match(/inactive|background/) && next === "active" && enabled) {
        setLocked(true);
        void authenticate();
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, [enabled]);

  const toggle = async (value: boolean) => {
    if (value) {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !isEnrolled) return false;
    }
    await AsyncStorage.setItem(KEY, value ? "true" : "false");
    setEnabled(value);
    return true;
  };

  return { enabled, locked, toggle, authenticate };
}
