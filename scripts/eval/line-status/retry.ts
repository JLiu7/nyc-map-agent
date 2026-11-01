/**
 * Asking the model, without letting a dropped connection become a wrong answer (#629).
 *
 * A trial that cannot reach the model used to come back with an empty reply, which the
 * `empty-reply` check then counted against the model. Two runs compared that way can differ
 * only in how often the network happened to fail: on 2026-11-01 one run lost 12 trials to a
 * dropped tunnel and another lost 6, and the comparison said nothing about the prompt.
 *
 * So a failed call is retried, and when the retries are spent the run stops instead of
 * recording a row. A run that could not reach the model is not a run.
 */

export interface RetryOptions {
  /** Total tries, including the first. */
  attempts: number;
  /** Wait before the second try; doubles each time after that. */
  delayMs: number;
  /** Called before each retry, with the failure and the try that is about to happen. */
  onRetry?: (error: unknown, nextAttempt: number) => void;
  /** Injected so tests do not wait. */
  sleep?: (ms: number) => Promise<void>;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Run `fn`, retrying a throw; rethrow the last failure once the attempts are spent. */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  const sleep = opts.sleep ?? wait;
  let last: unknown;
  for (let attempt = 1; attempt <= Math.max(1, opts.attempts); attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      if (attempt === opts.attempts) break;
      opts.onRetry?.(error, attempt + 1);
      await sleep(opts.delayMs * 2 ** (attempt - 1));
    }
  }
  throw last;
}

/** A run that stopped because the model could not be reached. Says what to do, not just what broke. */
export class UnreachableModel extends Error {
  constructor(readonly caseId: string, readonly trial: number, readonly cause: unknown) {
    const why = cause instanceof Error ? cause.message : String(cause);
    super(
      `could not reach the model on ${caseId} trial ${trial} after retrying: ${why}. ` +
        "No row was recorded for it, because an empty reply here would be scored against the model. " +
        "Check the model endpoint and run again.",
    );
    this.name = "UnreachableModel";
  }
}
