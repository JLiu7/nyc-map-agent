/**
 * Rules the code decides itself, so the model never has to get them right.
 * Ported from the website copilot's guard rules (chatbots/copilot-engine,
 * src/guard.ts), where holdout sets found each of these cases.
 */
type YesNo = "yes" | "no" | "unclear";

const HEDGE = /\b(maybe|not sure|unsure|i guess|depends|hmm+|um+|uh+|let me think)\b/i;
const NO = /\b(no|nope|nah|wait|not yet|stop|cancel|hold on|don'?t|wrong|incorrect|not (right|correct|quite|really|that|it)|isn'?t (right|correct|it)|that'?s not)\b/i;
const YES = /\b(yes|yeah|yep|yup|go ahead|confirm|do it|go for it|absolutely|please do|sure|correct|that'?s right|right|that one)\b/i;
// Words that attach a condition to a yes: "yes but the other one", "yes if it has an elevator".
const BUT = /\b(but|except|although|though|however|unless|if|as long as|provided|assuming|only)\b/i;

/**
 * A hedge or a "no" always beats a "yes", and anything unclear is never a yes.
 * A yes must be short, carry no condition and not be a question: "sure, is it far?" is not a confirmation.
 */
export function yesNo(text: string): YesNo {
  const t = text.replace(/[‘’]/g, "'");
  if (HEDGE.test(t)) return "unclear";
  if (NO.test(t)) return "no";
  if (YES.test(t) && !BUT.test(t) && !t.includes("?") && t.trim().split(/\s+/).length <= 8) return "yes";
  return "unclear";
}
