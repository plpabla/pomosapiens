import { useEffect, useRef } from "react";

export function useTabTitle(input: {
  title: string | null;
  alert?: readonly [string, string] | null;
  onAlertDismiss?: () => void;
}): void {
  const defaultRef = useRef("");
  const onDismissRef = useRef(input.onAlertDismiss);
  const titleRef = useRef(input.title);

  useEffect(() => {
    onDismissRef.current = input.onAlertDismiss;
  }, [input.onAlertDismiss]);

  useEffect(() => {
    titleRef.current = input.title;
  }, [input.title]);

  useEffect(() => {
    defaultRef.current = document.title;
    return () => {
      document.title = defaultRef.current;
    };
  }, []);

  useEffect(() => {
    document.title = input.title ?? defaultRef.current;
  }, [input.title]);

  const alertA = input.alert?.[0] ?? null;
  const alertB = input.alert?.[1] ?? null;
  useEffect(() => {
    if (alertA === null || alertB === null) {
      document.title = titleRef.current ?? defaultRef.current;
      return;
    }
    const a = alertA;
    const b = alertB;
    if (!document.hidden) {
      document.title = defaultRef.current;
      onDismissRef.current?.();
      return;
    }
    let showFirst = false;
    document.title = a;
    const id = setInterval(() => {
      showFirst = !showFirst;
      document.title = showFirst ? b : a;
    }, 1000);
    const onVis = () => {
      if (document.hidden) return;
      clearInterval(id);
      document.title = defaultRef.current;
      document.removeEventListener("visibilitychange", onVis);
      onDismissRef.current?.();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [alertA, alertB]);
}
