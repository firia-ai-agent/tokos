import { describe, expect, it } from "vitest";
import {
  EMERGENCY_CONTACT_EMPTY,
  emergencyContact,
  emergencyContactLine,
} from "./emergency-contact";

describe("emergency contact", () => {
  it("reads a name and a number as one line", () => {
    expect(emergencyContact({ name: "  Sam   Rivera ", phone: "(571) 555-0110" })).toEqual({
      name: "Sam Rivera",
      phone: "(571) 555-0110",
      reachable: true,
      summary: "Sam Rivera · (571) 555-0110",
    });
  });

  it("does not call a name with no number reachable", () => {
    const contact = emergencyContact({ name: "Sam Rivera", phone: "" });
    expect(contact.reachable).toBe(false);
    expect(contact.summary).toBe("Sam Rivera");
  });

  it("says so plainly on the doula's record when nothing is on file", () => {
    expect(emergencyContactLine({})).toBe(EMERGENCY_CONTACT_EMPTY);
    expect(emergencyContactLine({ name: "  ", phone: null })).toBe(EMERGENCY_CONTACT_EMPTY);
  });

  it("prints a number alone rather than nothing", () => {
    expect(emergencyContactLine({ phone: "(571) 555-0110" })).toBe("(571) 555-0110");
  });
});
