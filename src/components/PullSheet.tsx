import { useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import "@/components/task-screens.css";
import { pullSheetMounted, useSheetPlace } from "@/lib/store/pullSheet";
import { nextLevel, swipeOf, type SheetLevel } from "./sheetSwipe";

export interface PullSheetProps {
  level: SheetLevel;
  onLevel: (level: SheetLevel) => void;
  /** Sideways swipes on the open sheet, to switch category. */
  onSide?: (swipe: "left" | "right") => void;
  /** The one line that rests on the chat bar; it should open the sheet on a tap. */
  header: ReactNode;
  /** Shown once the sheet is open; a scrolling part takes the class pull-sheet-body. */
  children?: ReactNode;
  testId: string;
  label: string;
  /** Takes this view off the sheet; the Back arrow calls it when another view waits under this one. */
  onClose?: () => void;
  /** The header already has its own back arrow that calls onClose: do not draw a second one. */
  ownBack?: boolean;
}

/**
 * A sheet that rests as one line on the chat bar and comes up from behind it:
 * swipe or tap up to open (two steps), down to close a step, sideways for the
 * next category. Every swipe has a tap: the grip and the header line. It never
 * grows past where the map's focus (a followed train, a picked line) still
 * shows above it, and it counts as a cover so the camera keeps the focus clear
 * (owner, 2026-10-25).
 *
 * A phone has one sheet. A sheet opened over another becomes its top view: the
 * one under it draws nothing until Back takes the new one off (src/lib/store/pullSheet.ts).
 */
export function PullSheet({ level, onLevel, onSide, header, children, testId, label, onClose, ownBack }: PullSheetProps) {
  const ref = useRef<HTMLElement>(null);
  const start = useRef<{ x: number; y: number; body: boolean } | null>(null);
  const swiped = useRef(false);
  const levelRef = useRef(level);
  levelRef.current = level;

  const [id, setId] = useState<number | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useLayoutEffect(() => {
    const { id, release } = pullSheetMounted(() => closeRef.current?.());
    setId(id);
    return release;
  }, []);
  const { top, below } = useSheetPlace(id);
  // On a phone the sheet spans the width: publish its height so Center on my location rides above it.
  useLayoutEffect(() => {
    const el = ref.current;
    const root = document.documentElement;
    if (!el) return;
    const publish = () => root.style.setProperty("--pull-sheet-h", window.innerWidth < 640 ? `${Math.ceil(el.getBoundingClientRect().height) + 8}px` : "0px");
    publish();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(publish);
    ro?.observe(el);
    window.addEventListener("resize", publish);
    return () => { ro?.disconnect(); window.removeEventListener("resize", publish); root.style.removeProperty("--pull-sheet-h"); };
  }, [top]);
  // Open on a phone, locate rides just above the sheet (owner, 2026-10-27: "there isn't even a button
  // to zoom to my location"); only a full-height sheet leaves no room, so it steps aside then.
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (!top) return;
    if (level) root.dataset.pullSheet = level === 2 ? "full" : "open";
    else delete root.dataset.pullSheet;
    return () => { delete root.dataset.pullSheet; };
  }, [level, top]);

  const end = (e: PointerEvent) => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    const swipe = swipeOf(e.clientX - s.x, e.clientY - s.y);
    if (!swipe) return;
    if (swipe === "left" || swipe === "right") {
      if (!levelRef.current || !onSide) return;
      onSide(swipe);
    } else {
      // Inside a list that scrolls, a vertical drag scrolls it; the grip and the header line still open and close.
      const body = ref.current?.querySelector(".pull-sheet-body");
      if (s.body && body && body.scrollHeight > body.clientHeight + 1) return;
      onLevel(nextLevel(levelRef.current, swipe));
    }
    swiped.current = true;
  };
  const down = (e: ReactPointerEvent) => {
    swiped.current = false;
    start.current = { x: e.clientX, y: e.clientY, body: Boolean((e.target as HTMLElement).closest(".pull-sheet-body")) };
    // A swipe up ends over the map, outside the sheet: listen for its end on the window.
    const up = (ev: PointerEvent) => { stop(); end(ev); };
    const cancel = () => { stop(); start.current = null; };
    const stop = () => { window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel); };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
  };
  // A swipe that ends on a button is not a tap on it.
  const eatClick = (e: ReactMouseEvent) => {
    if (!swiped.current) return;
    swiped.current = false;
    e.preventDefault();
    e.stopPropagation();
  };

  // Under another view: stay mounted (its place, level and scroll come back with Back) but draw nothing.
  if (!top) return null;
  return (
    <section ref={ref} data-testid={testId} data-level={level} data-map-cover aria-label={label}
      className="task-panel pull-sheet" onPointerDown={down} onClickCapture={eatClick}>
      <button type="button" className="pull-grip" data-testid="sheet-grip" aria-label={level === 2 ? "Show less" : "Show more"} aria-expanded={level > 0}
        onClick={() => onLevel(level === 2 ? 0 : ((level + 1) as SheetLevel))}><span aria-hidden /></button>
      {below && onClose && !ownBack ? (
        <div className="flex items-center gap-1.5">
          <button type="button" data-testid="sheet-back" aria-label="Back" onClick={onClose} className="task-action task-close shrink-0"><ArrowLeft className="h-[18px] w-[18px]" strokeWidth={2.5} aria-hidden /></button>
          <div className="min-w-0 flex-1">{header}</div>
        </div>
      ) : header}
      {level > 0 ? children : null}
    </section>
  );
}
