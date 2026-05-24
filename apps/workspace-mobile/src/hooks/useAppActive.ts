import { useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

export function useAppActive() {
  const [active, setActive] = useState(true);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      const nowActive = next === "active";
      if (appState.current !== next) {
        appState.current = next;
        setActive(nowActive);
      }
    });
    return () => sub.remove();
  }, []);

  return active;
}
