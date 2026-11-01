/**
 * Live check that the trip chat asks before it plans (#625), against the real model, in several
 * languages. Each case is one rider message from Union Square: a vague one must come back as one
 * question with no trip planned, a complete one as a planned trip whose answer ends in a follow-up
 * offer. Pass/fail is read from the stream (a planned trip sends its map buttons), so no person
 * judges the answers.
 *
 *   tsx scripts/eval-trip-questions.ts                      # in process, with this shell's INFERHUB_* env
 *   tsx scripts/eval-trip-questions.ts --url https://nyc.design-bakery.com/api/agent
 */
import { createDailyBudget, createLimiter } from "../server/features/agent/fair-use";
import { POST } from "../server/features/agent/routes";

type Case = { say: string; want: "ask" | "plan" };
const CASES: Case[] = [
  { say: "I need to get to Brooklyn tomorrow", want: "ask" },
  { say: "Quiero ir a Brooklyn mañana con mi abuela", want: "ask" },
  { say: "我明天要去皇后区", want: "ask" },
  { say: "Je dois aller dans le Bronx ce soir", want: "ask" },
  { say: "Take me to Coney Island with my grandma, she walks slowly", want: "ask" },
  { say: "Get me to Grand Central now", want: "plan" },
  { say: "¿Cómo llego al Museo Americano de Historia Natural ahora?", want: "plan" },
  { say: "Мне нужно в Центральный парк сейчас", want: "plan" },
  { say: "Union Square to Times Square now, step-free please", want: "plan" },
];

const url = process.argv.includes("--url") ? process.argv[process.argv.indexOf("--url") + 1] : null;
const here = { lon: -73.9903, lat: 40.7359 };
// In process, the app's per-address limit would stop the run after a few cases.
const fairUse = { limiter: createLimiter({ windowMax: 1000, windowMs: 60_000, burstMax: 1000, burstMs: 60_000 }), budget: createDailyBudget({ softCap: 0, hardCap: 0, capModel: null }), now: Date.now };

async function ask(say: string): Promise<{ text: string; planned: boolean }> {
  const req = { messages: [{ role: "user", content: say }], location: here, now: new Date().toISOString() };
  const res = url
    ? await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(req) })
    : await POST(new Request("http://local/api/agent", { method: "POST", body: JSON.stringify(req) }), { fairUse });
  let text = "";
  let planned = false;
  for (const line of (await res.text()).trim().split("\n")) {
    const e = JSON.parse(line) as { type: string; text?: string; name?: string };
    if (e.type === "text") text += e.text ?? "";
    // A planned trip shows its route: the map buttons, or the model drawing it.
    if (e.type === "actions" || (e.type === "step" && (e.name === "showRoute" || e.name === "openPanel"))) planned = true;
  }
  return { text: text.trim(), planned };
}

const asksOnce = (t: string) => (t.match(/[?？؟]/g) ?? []).length === 1;
let failed = 0;
for (const c of CASES) {
  const r = await ask(c.say);
  const ok = c.want === "ask" ? !r.planned && asksOnce(r.text) : r.planned && /[?？؟]/.test(r.text.slice(-160));
  if (!ok) failed += 1;
  console.log(`${ok ? "pass" : "FAIL"}  want ${c.want}  ${c.say}\n      → ${r.text.replace(/\s+/g, " ")}`);
}
console.log(`\n${CASES.length - failed} of ${CASES.length} passed`);
process.exit(failed ? 1 : 0);
