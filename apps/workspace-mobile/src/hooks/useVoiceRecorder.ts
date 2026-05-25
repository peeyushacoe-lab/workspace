import { useCallback, useRef, useState } from "react";
import { Audio } from "expo-av";

export interface VoiceNote {
  uri: string;
  duration: number;
}

export function useVoiceRecorder() {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback(async (): Promise<boolean> => {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) return false;

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      recRef.current = rec;
      setSeconds(0);
      setRecording(true);

      timerRef.current = setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);

      return true;
    } catch {
      return false;
    }
  }, []);

  const stop = useCallback(async (): Promise<VoiceNote | null> => {
    if (!recRef.current) return null;
    try {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      await recRef.current.stopAndUnloadAsync();
      const uri = recRef.current.getURI();
      const status = await recRef.current.getStatusAsync();
      const duration = (status as { durationMillis?: number }).durationMillis
        ? Math.round(((status as { durationMillis: number }).durationMillis) / 1000)
        : 0;
      recRef.current = null;
      setRecording(false);
      setSeconds(0);
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      return uri ? { uri, duration } : null;
    } catch {
      recRef.current = null;
      setRecording(false);
      setSeconds(0);
      return null;
    }
  }, []);

  const cancel = useCallback(async () => {
    if (!recRef.current) return;
    try {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      await recRef.current.stopAndUnloadAsync();
    } catch {
      // ignore
    }
    recRef.current = null;
    setRecording(false);
    setSeconds(0);
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
  }, []);

  return { recording, seconds, start, stop, cancel };
}
