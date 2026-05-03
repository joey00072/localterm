import { describe, expect, it } from "vitest";
import { generateFriendlyId } from "./friendly-id.js";

const FRIENDLY_ID_PATTERN = /^[a-z]+-[a-z]+-[a-z2-9]{4}$/;

describe("generateFriendlyId", () => {
  it("matches the adjective-animal-suffix shape", () => {
    for (let attempt = 0; attempt < 64; attempt += 1) {
      expect(generateFriendlyId()).toMatch(FRIENDLY_ID_PATTERN);
    }
  });

  it("produces overwhelmingly unique ids across many calls", () => {
    const seen = new Set<string>();
    const ATTEMPTS = 1024;
    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
      seen.add(generateFriendlyId());
    }
    expect(seen.size).toBeGreaterThan(ATTEMPTS - 5);
  });
});
