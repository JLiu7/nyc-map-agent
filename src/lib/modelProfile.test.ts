import { describe, expect, it } from "vitest";
import { healthLine, parseProfile, readProfile, setProfilePref, getProfilePref, PROFILE_KEY } from "./modelProfile";
import { withProfile } from "@/features/agent/stream";

const mem = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
};

describe("model profile on this phone", () => {
  it("keeps only smart or dev", () => {
    expect(parseProfile("dev")).toBe("dev");
    expect(parseProfile("turbo")).toBeNull();
    expect(readProfile(mem({ [PROFILE_KEY]: "smart" }))).toBe("smart");
  });

  it("stores a pick and forgets it on Auto", () => {
    const s = mem();
    setProfilePref("dev", s);
    expect(s.m.get(PROFILE_KEY)).toBe("dev");
    expect(getProfilePref()).toBe("dev");
    setProfilePref(null, s);
    expect(s.m.has(PROFILE_KEY)).toBe(false);
  });

  it("goes with each question unless the question already names one", () => {
    const req = { messages: [{ role: "user" as const, content: "to Coney Island" }], location: null, mode: "transit" as const };
    expect(withProfile(req, "dev").profile).toBe("dev");
    expect(withProfile(req, null)).toBe(req);
    expect(withProfile({ ...req, profile: "smart" }, "dev").profile).toBe("smart");
  });

  it("names the provider answering first and how many are up", () => {
    expect(healthLine(null)).toBeNull();
    expect(healthLine([{ label: "DeepSeek", ok: false }, { label: "Qwen", ok: true }, { label: "WorkBuddy" }])).toBe("Qwen · 2/3");
    expect(healthLine([{ label: "DeepSeek", ok: false }])).toBe("0/1");
  });
});
