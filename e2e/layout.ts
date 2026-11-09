import { expect, type Page } from "@playwright/test";

/**
 * The phone layout bar every screen meets (owner, 2026-10-27: "agents saying
 * they did it won't enforce it"). `expectLayout` fails a test when, at the
 * current window size:
 *
 * - the page scrolls sideways;
 * - a button, link or field sticks out past the left or right edge (a row that
 *   scrolls sideways on purpose counts as one box, not each chip in it);
 * - a tap target is smaller than 24 px either way (WCAG 2.2 target size; text
 *   links inside a sentence are exempt, as WCAG allows);
 * - a visible control is covered by something else, so a tap on its middle
 *   would land on another element, or two controls overlap by more than a sliver;
 * - the map's focus (you, the followed train, the asked place) is hidden: it
 *   must sit on the map outside every open cover (`[data-map-cover]`, the
 *   pull sheet's `.task-top` / `.task-bottom`, the chat bar).
 *
 * Every screen spec calls it at the sizes in SIZES. `scripts/check-layout-tests.ts`
 * fails a pull request that changes a screen without touching a spec that calls it.
 */

export const SIZES = [
  { name: "small phone", width: 320, height: 568 },
  { name: "phone", width: 375, height: 667 },
  { name: "tall phone", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 800 },
] as const;

export type Size = (typeof SIZES)[number];

export interface LayoutOpts {
  /** A map point that must stay in view, not under a panel: [lon, lat]. */
  focus?: [number, number];
  /** Selectors whose controls this screen leaves covered on purpose (e.g. the page behind a modal). */
  ignore?: string[];
}

export interface LayoutProblem {
  rule: "side-scroll" | "off-screen" | "small-target" | "covered" | "overlap" | "focus-hidden";
  what: string;
  detail: string;
}

/** Every layout problem on the page now; empty when it meets the bar. */
export async function layoutProblems(page: Page, opts: LayoutOpts = {}): Promise<LayoutProblem[]> {
  // The static chat bar from index.html covers the bottom of the screen until the real one
  // mounts, which on a slow machine comes after the map. Measure the app, not the boot screen;
  // one that never goes away is still measured, and flagged, after 10 s.
  await page.locator("#shell-bar").waitFor({ state: "detached", timeout: 10_000 }).catch(() => undefined);
  // Let a sheet or camera that is still animating settle first.
  await page.waitForTimeout(500);
  return page.evaluate(({ focus, ignore }) => {
    const problems: Array<{ rule: string; what: string; detail: string }> = [];
    const W = window.innerWidth, H = window.innerHeight;
    const name = (el: Element) => {
      const h = el as HTMLElement;
      const label = h.getAttribute("aria-label") || h.getAttribute("data-testid") || h.textContent?.trim().slice(0, 40) || h.getAttribute("placeholder") || "";
      return `${el.tagName.toLowerCase()}${label ? ` "${label}"` : ""}`;
    };
    const shown = (el: Element) => {
      const h = el as HTMLElement;
      if (h.closest("[aria-hidden=true], [inert], .sr-only, .maplibregl-ctrl-attrib")) return false;
      const r = h.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      for (let a: HTMLElement | null = h; a; a = a.parentElement) {
        const s = getComputedStyle(a);
        if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false;
      }
      return true;
    };
    const skipped = (el: Element) => (ignore ?? []).some((sel) => el.closest(sel));
    /** The nearest ancestor that clips its content (a scrolling list or chip row). */
    const clipper = (el: Element) => {
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const s = getComputedStyle(a);
        if (/(auto|scroll|hidden)/.test(s.overflowX + s.overflowY)) return a;
      }
      return null;
    };

    // 1. No sideways scroll.
    const sw = document.documentElement.scrollWidth;
    if (sw > W + 1) problems.push({ rule: "side-scroll", what: "page", detail: `page is ${sw}px wide in a ${W}px window` });

    const controls = [...document.querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=switch], [role=option]")]
      .filter((el) => shown(el) && !skipped(el));

    for (const el of controls) {
      const r = el.getBoundingClientRect();
      const clip = clipper(el);
      const box = clip ? clip.getBoundingClientRect() : null;
      // 2. Off the screen sideways. A control in a clipping row is judged by the row.
      const outer = box ?? r;
      if (outer.left < -1 || outer.right > W + 1) problems.push({ rule: "off-screen", what: name(clip ?? el), detail: `spans x ${Math.round(outer.left)}–${Math.round(outer.right)} in a ${W}px window` });
      // Scrolled out of its own list or row: not on screen now, so nothing more to judge.
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (box && (cx < box.left || cx > box.right || cy < box.top || cy > box.bottom)) continue;
      if (cx < 0 || cx > W || cy < 0 || cy > H) continue;
      // 3. Tap target size; a link inside running text is exempt.
      const inline = el.tagName === "A" && getComputedStyle(el).display === "inline";
      if (!inline && (r.width < 24 || r.height < 24)) problems.push({ rule: "small-target", what: name(el), detail: `${Math.round(r.width)}×${Math.round(r.height)} px` });
      // 4. Covered: a tap on its middle must reach it.
      const hit = document.elementFromPoint(cx, cy);
      if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) {
        const label = el.closest("label");
        if (!(label && label.contains(hit))) problems.push({ rule: "covered", what: name(el), detail: `a tap on it lands on ${name(hit)}` });
      }
    }

    // 4b. Overlapping: two controls (neither inside the other) may not share more than a sliver,
    // even when each one's middle is still free.
    // Only the part on show counts: a chip half scrolled out of its strip is cut off there, not under the next button.
    const boxes = controls.map((el) => {
      const r = el.getBoundingClientRect();
      const c = clipper(el)?.getBoundingClientRect();
      return { el, r: c ? { left: Math.max(r.left, c.left), right: Math.min(r.right, c.right), top: Math.max(r.top, c.top), bottom: Math.min(r.bottom, c.bottom) } : r };
    });
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      // A handle drawn on its frame's corner says so: data-overlap-ok.
      if (a.el.closest("[data-overlap-ok]") || b.el.closest("[data-overlap-ok]")) continue;
      const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (w > 4 && h > 4) problems.push({ rule: "overlap", what: name(a.el), detail: `overlaps ${name(b.el)} by ${Math.round(w)}×${Math.round(h)} px` });
    }

    // 5. The focus stays on the open map.
    if (focus) {
      const map = (window as unknown as { __map?: { project(p: [number, number]): { x: number; y: number }; getContainer(): HTMLElement } }).__map;
      if (map) {
        const c = map.getContainer().getBoundingClientRect();
        const p = map.project(focus);
        const x = c.left + p.x, y = c.top + p.y;
        const covers = [...document.querySelectorAll("[data-map-cover], .task-top, .task-bottom, [data-testid=agent-bar]")]
          .filter(shown)
          .map((e) => ({ e, r: e.getBoundingClientRect() }));
        const under = covers.find(({ r }) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom);
        if (x < c.left || x > c.right || y < c.top || y > c.bottom) problems.push({ rule: "focus-hidden", what: "map focus", detail: `off the map at ${Math.round(x)},${Math.round(y)}` });
        else if (under) problems.push({ rule: "focus-hidden", what: "map focus", detail: `under ${name(under.e)}` });
      }
    }
    return problems;
  }, { focus: opts.focus ?? null, ignore: opts.ignore ?? [] }) as Promise<LayoutProblem[]>;
}

/** Fails with every problem listed, so one run shows them all. */
export async function expectLayout(page: Page, opts: LayoutOpts = {}): Promise<void> {
  const problems = await layoutProblems(page, opts);
  const size = page.viewportSize();
  expect(problems.map((p) => `${p.rule}: ${p.what} — ${p.detail}`), `layout at ${size?.width}×${size?.height}`).toEqual([]);
}
