import { describe, expect, it } from "vitest";
import { mask } from "./tracing";

describe("mask", () => {
  it("hides SSNs, birth dates and emails, and keeps trip times", () => {
    expect(mask("ssn 123-45-6789, born 04/12/1987, mail a.b+c@x.co")).toBe("ssn [ssn], born [dob], mail [email]");
    expect(mask("born March 3, 1990 or 1990-03-03")).toBe("born [dob] or [dob]");
    expect(mask("next A train at 8:42, back by 10/31")).toBe("next A train at 8:42, back by 10/31");
  });
});
