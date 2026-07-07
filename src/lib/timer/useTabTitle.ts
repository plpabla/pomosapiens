import { useEffect, useRef } from "react";

export function useTabTitle(input: { title: string | null }): void {
  const defaultRef = useRef("");

  useEffect(() => {
    defaultRef.current = document.title;
    return () => {
      document.title = defaultRef.current;
    };
  }, []);

  useEffect(() => {
    document.title = input.title ?? defaultRef.current;
  }, [input.title]);
}
