"use client";

import { useEffect, useId, type ReactNode } from "react";
import { AnimatePresence, motion, useDragControls } from "motion/react";
import { X } from "lucide-react";
import { initials } from "@/lib/data";

export function Header({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="screen-header">
      <div>
        <h1 className="large-title">{title}</h1>
        {subtitle && <p className="subtitle">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="section-title">{children}</h2>;
}

export function Avatar({ name, size = 52 }: { name: string; size?: number }) {
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const id = useId();
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            role="radio"
            aria-checked={active}
            className={`seg-option${active ? " is-active" : ""}`}
            onClick={() => onChange(o.value)}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className="seg-pill"
                transition={{ type: "spring", bounce: 0, duration: 0.35 }}
              />
            )}
            <span className="seg-label">
              {o.label}
              {o.count !== undefined && <span className="seg-count">{o.count}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch${checked ? " is-on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <motion.span
        className="switch-knob"
        animate={{ x: checked ? 24 : 0 }}
        transition={{ type: "spring", bounce: 0.2, duration: 0.3 }}
      />
    </button>
  );
}

// Bottom sheet: drag the grabber/header down (or flick) to dismiss.
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const controls = useDragControls();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="scrim"
            className="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
          />
          <motion.section
            key="sheet"
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", bounce: 0.12, duration: 0.45 }}
            drag="y"
            dragControls={controls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.04, bottom: 0.8 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) onClose();
            }}
          >
            <div className="sheet-drag" onPointerDown={(e) => controls.start(e)}>
              <span className="grabber" />
              <div className="sheet-head">
                <h2 className="sheet-title">{title}</h2>
                <button className="icon-btn" onClick={onClose} aria-label="Close">
                  <X size={24} strokeWidth={2.5} />
                </button>
              </div>
            </div>
            <div className="sheet-body">{children}</div>
          </motion.section>
        </>
      )}
    </AnimatePresence>
  );
}
