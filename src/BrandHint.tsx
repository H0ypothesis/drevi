import { Dreamcatcher } from "./Dreamcatcher";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";

export function BrandHint({
  children,
  available,
  onOpenHelp,
}: {
  children: ReactNode;
  available: boolean;
  onOpenHelp: () => void;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!available) setOpen(false);
  }, [available]);

  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      if (container.current?.contains(document.activeElement)) {
        trigger.current?.focus();
      }
      setOpen(false);
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissOnEscape, true);
    };
  }, [open]);

  return (
    <div
      className="brand-hint"
      ref={container}
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") setOpen(true);
      }}
      onPointerLeave={() => {
        if (!container.current?.contains(document.activeElement))
          setOpen(false);
      }}
      onFocus={() => setOpen(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        className="brand-hint-trigger"
        aria-label="关于 Drevi"
        aria-expanded={available && open}
        aria-controls="drevi-brand-hint"
        onClick={() => setOpen(true)}
      >
        {children}
      </button>
      <div
        id="drevi-brand-hint"
        className="thought-card brand-hint-card"
        role="region"
        aria-labelledby="drevi-brand-hint-title"
        hidden={!available || !open}
      >
        <div className="brand-dreamcatcher">
          <Dreamcatcher size={46} />
        </div>
        <b id="drevi-brand-hint-title">捕捉灵感，织出可能。</b>
        <p>
          Catch ideas.
          <br />
          Weave possibilities.
        </p>
        <button
          onClick={() => {
            setOpen(false);
            onOpenHelp();
          }}
        >
          认识非线性对话 <ArrowUpRight size={12} />
        </button>
      </div>
    </div>
  );
}
