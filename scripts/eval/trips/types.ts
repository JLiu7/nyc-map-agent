/** Shapes for the trip and multi-turn suite (#23). See docs/eval/trips/README.md. */

/** What a turn asks for, as the case author knows it. Checks read these, never the wording. */
export interface Expect {
  /** A way to get somewhere: the planner must run and the route must be drawn. */
  trip?: boolean;
  /** "Yes" to the offer in the previous reply: something must be drawn or started. */
  yes?: boolean;
  /** A restroom was asked for; without it, the restroom tool is the wrong topic. */
  restroom?: boolean;
  /** Too vague to plan: the reply should ask which place or time. */
  ask?: boolean;
}

export interface Turn { user: string; expect: Expect }

export interface Case {
  id: string;
  /** What the case exercises, in a few words, for the report. */
  about: string;
  /** Where the rider is. Defaults to Union Square. */
  location?: { lon: number; lat: number } | null;
  turns: Turn[];
}

/** What one turn did, read from the agent's event stream. */
export interface Observed {
  reply: string;
  /** Tool calls in the order they started. */
  tools: string[];
  /** Map commands sent to the app (showRoute, openPanel, playFlythrough, flyTo, ...). */
  commands: string[];
  /** The app's "Just to check: did you mean ...?" that the runner answered "Yes" within this turn. */
  readback?: string;
}

export type CheckId =
  | "no-plan-without-tool"
  | "no-route-drawn"
  | "wrong-topic-tool"
  | "yes-did-nothing"
  | "tool-loop"
  | "empty-reply"
  | "internal-name-leak"
  | "guessed-when-vague";

export interface Violation { check: CheckId; detail: string }

export interface Versions { gitSha: string; model: string; promptHash: string; toolsHash: string }

export interface Row {
  runId: string;
  label: string;
  caseId: string;
  trial: number;
  turn: number;
  user: string;
  expect: Expect;
  observed: Observed;
  violations: Violation[];
  ms: number;
  versions: Versions;
}
