import type { FeedAlert } from "../../../src/lib/transit/trouble";

/** The MTA alert feed at one moment: what a replay hands the agent instead of the live feed. */
export interface Snapshot { asOf: string; alerts: FeedAlert[] }

export interface Case {
  id: string;
  /** "train" cases may be studied while changing the prompt; "heldout" cases are only read at the end. */
  split: "train" | "heldout";
  /** Cases that mean the same thing (paraphrase, reordered alerts, an unrelated alert added) share a group. */
  group: string;
  variant: string;
  /** Lines the question is about, as the MTA names them. */
  lines: string[];
  question: string;
  /** Ways the question names the place it is about ("Times Square"), for the unaffected-station check. */
  about?: string[];
  snapshot: Snapshot;
}

type CheckId =
  | "empty-reply"
  | "switch-at-skipped-stop"
  | "invented-station"
  | "widened-direction"
  | "trouble-at-unaffected-station"
  | "claims-trouble-when-none"
  | "denies-trouble"
  | "invented-shuttle"
  | "advice-names-skipped-stops"
  | "offer-without-trip";

export interface Violation { check: CheckId; detail: string }

/** What the tool result says, in the structured form the app builds it from (src/lib/transit/trouble.ts). */
export interface Facts {
  /** True when no active alert touches the lines asked about. */
  quiet: boolean;
  /** Stations a train skips: never somewhere to change trains. */
  skipped: string[];
  /** Stations the MTA gives for changing direction, or for getting the train back after a shuttle. */
  switchAt: string[];
  /** Every station name the tool result mentions, for any reason. */
  named: string[];
  /** True when some alert says both directions are affected. */
  bothDirections: boolean;
  /** True when the MTA runs shuttle buses for these lines. */
  shuttle: boolean;
}

export interface Row {
  runId: string;
  label: string;
  caseId: string;
  split: Case["split"];
  group: string;
  variant: string;
  trial: number;
  question: string;
  reply: string;
  planned: boolean;
  violations: Violation[];
  facts: Facts;
  ms: number;
  versions: { gitSha: string; model: string; promptHash: string; toolsHash: string };
}
