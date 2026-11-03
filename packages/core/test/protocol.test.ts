import { describe, expect, it } from "vitest";
import { TOKEN_PREFIX, TOKEN_RE } from "../src/protocol";

describe("protocol", () => {
  it("accepts generated device tokens and rejects junk", () => {
    expect(TOKEN_RE.test(`${TOKEN_PREFIX}_${"a".repeat(32)}`)).toBe(true);
    expect(TOKEN_RE.test("rl_short")).toBe(false);
    expect(TOKEN_RE.test("Bearer whatever")).toBe(false);
  });
});
