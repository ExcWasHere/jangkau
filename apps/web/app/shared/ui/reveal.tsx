import { useEffect, useRef, useState } from "react";

/**
 * Reveal sekali saat elemen masuk viewport.
 *
 * Sengaja hanya translate + opacity dengan easing keluar yang pendek:
 * tidak ada parallax, tidak ada loop, tidak ada scale. Elemen yang sudah
 * tampil tidak pernah dianimasikan ulang agar halaman terasa tenang saat
 * di-scroll balik.
 */
export function Reveal({
  children,
  delay = 0,
  as: Tag = "div",
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  as?: "div" | "li" | "section" | "header" | "article";
  className?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.15 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as never}
      className={`reveal ${className}`}
      data-visible={visible ? "true" : "false"}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}

/**
 * Angka yang menghitung naik satu kali saat terlihat. Dipakai hanya untuk
 * tiga statistik di hero — bukan untuk setiap angka di halaman.
 */
export function CountUp({
  value,
  suffix = "",
  durationMs = 900,
}: {
  value: number;
  suffix?: string;
  durationMs?: number;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      return;
    }

    setDisplay(0);
    let frame = 0;
    let startedAt = 0;

    const step = (timestamp: number) => {
      if (!startedAt) startedAt = timestamp;
      const progress = Math.min(1, (timestamp - startedAt) / durationMs);
      // easeOutCubic: cepat di awal, melambat di akhir.
      const eased = 1 - (1 - progress) ** 3;
      setDisplay(Math.round(value * eased));
      if (progress < 1) frame = requestAnimationFrame(step);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          frame = requestAnimationFrame(step);
          observer.disconnect();
        }
      },
      { threshold: 0.6 },
    );

    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [durationMs, value]);

  return (
    <span ref={ref} className="tabular-nums">
      {display.toLocaleString("id-ID")}
      {suffix}
    </span>
  );
}
