import { describe, expect, it } from "vitest";
import {
  PROVIDER_HANDOUT_FALLBACK_TITLE,
  isPersonalResource,
  providerFirstName,
  providerHandoutBody,
  providerHandoutTitle,
  titleNamesSomeoneElse,
  visibleResources,
} from "./provider-resources";

const MAYA = "aaaaaaaa-0000-4000-8000-000000000001";
const PRIYA = "aaaaaaaa-0000-4000-8000-000000000002";

describe("provider-named handout title", () => {
  it("is built from the owning provider, not typed", () => {
    expect(providerHandoutTitle("Maya Chen")).toBe("What Maya does (and does not do)");
    expect(providerHandoutTitle("Priya Raman")).toBe("What Priya does (and does not do)");
  });

  it("never emits a Maya-named title for someone who is not Maya", () => {
    for (const name of ["Priya Raman", "Alex Ruiz", "Renée Dubois", "sam"]) {
      expect(providerHandoutTitle(name)).not.toContain("Maya");
    }
  });

  it("names the practice rather than a founder when there is no name to use", () => {
    expect(providerHandoutTitle("")).toBe(PROVIDER_HANDOUT_FALLBACK_TITLE);
    expect(providerHandoutTitle(null)).toBe(PROVIDER_HANDOUT_FALLBACK_TITLE);
    expect(providerHandoutTitle(undefined)).not.toContain("Maya");
  });

  it("uses the first name only", () => {
    expect(providerFirstName("  Maya  Chen ")).toBe("Maya");
    expect(providerFirstName(null)).toBe("");
  });

  it("keeps the person's voice without putting a name in the sentences", () => {
    const body = providerHandoutBody();
    expect(body).toContain("I stay with you");
    expect(body).not.toContain("Maya");
    expect(body).not.toContain("your doula");
  });

  it("flags a title that belongs to somebody else", () => {
    const mayasTitle = providerHandoutTitle("Maya Chen");
    expect(titleNamesSomeoneElse(mayasTitle, "Priya Raman")).toBe(true);
    expect(titleNamesSomeoneElse(mayasTitle, "Maya Chen")).toBe(false);
  });
});

describe("library visibility", () => {
  const library = [
    { id: "r1", title: "What Maya does (and does not do)", ownerUserId: MAYA },
    { id: "r2", title: "What Priya does (and does not do)", ownerUserId: PRIYA },
    { id: "r3", title: "Comfort measures to practice before labor", ownerUserId: null },
  ];

  it("keeps Maya's named handout out of Priya's library", () => {
    const priyasLibrary = visibleResources(library, PRIYA);
    expect(priyasLibrary.map((row) => row.id)).toEqual(["r2", "r3"]);
    expect(priyasLibrary.some((row) => row.title.includes("Maya"))).toBe(false);
  });

  it("still shows Maya her own named handout", () => {
    expect(visibleResources(library, MAYA).map((row) => row.id)).toEqual(["r1", "r3"]);
  });

  it("shows practice-owned handouts to everyone", () => {
    for (const viewer of [MAYA, PRIYA, "someone-else"]) {
      expect(visibleResources(library, viewer).map((row) => row.id)).toContain("r3");
    }
  });

  it("knows a personal row from a practice row", () => {
    expect(isPersonalResource(library[0])).toBe(true);
    expect(isPersonalResource(library[2])).toBe(false);
    expect(isPersonalResource({ id: "x", title: "x" })).toBe(false);
  });
});
