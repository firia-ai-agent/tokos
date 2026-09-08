import { describe, expect, it } from "vitest";
import {
  answeredCount,
  answeredFields,
  assertAnswersNotInEmail,
  fieldIdFromLabel,
  formReminderVars,
  isSensitiveField,
  parseFieldSpec,
  readAnswers,
  sensitiveFieldIds,
  type FormSchema,
} from "./forms";

const SCHEMA: FormSchema = {
  fields: [
    { id: "preferred_name", label: "What should we call you?", type: "text" },
    { id: "support_style", label: "How do you want company during labor?", type: "textarea" },
    { id: "household_notes", label: "Who else is on your team at home?", type: "textarea" },
    { id: "quiet_thing", label: "Anything you want held quietly?", type: "textarea", sensitive: true },
  ],
};

describe("sensitive field detection (TOK-27)", () => {
  it("honors an explicit sensitive flag whatever the wording", () => {
    expect(isSensitiveField({ id: "quiet_thing", label: "Favorite snack", type: "text", sensitive: true })).toBe(
      true,
    );
  });

  it("flags questions whose wording reads as health or notes", () => {
    expect(isSensitiveField({ id: "household_notes", label: "Who else is at home?", type: "text" })).toBe(true);
    expect(isSensitiveField({ id: "hx", label: "Any medical history to know?", type: "text" })).toBe(true);
    expect(isSensitiveField({ id: "atmosphere", label: "What would make the room feel yours?", type: "text" })).toBe(
      false,
    );
  });

  it("lists the sensitive ids for badging", () => {
    expect(sensitiveFieldIds(SCHEMA)).toEqual(["household_notes", "quiet_thing"]);
  });
});

describe("template builder parsing (TOK-27)", () => {
  it("derives ids, defaults the type, and marks the sensitive column", () => {
    const fields = parseFieldSpec(
      ["What should we call you? | text", "Birth wishes | textarea", "Private context | textarea | sensitive"].join(
        "\n",
      ),
    );
    expect(fields).toEqual([
      { id: "what_should_we_call_you", label: "What should we call you?", type: "text" },
      { id: "birth_wishes", label: "Birth wishes", type: "textarea" },
      { id: "private_context", label: "Private context", type: "textarea", sensitive: true },
    ]);
  });

  it("falls back to text for an unknown type and skips blank lines", () => {
    const fields = parseFieldSpec("\n  \nDue date | calendar\n");
    expect(fields).toEqual([{ id: "due_date", label: "Due date", type: "text" }]);
  });

  it("marks sensitive wording even without the column", () => {
    const [field] = parseFieldSpec("Any allergies we should plan around? | text");
    expect(field.sensitive).toBe(true);
  });

  it("keeps duplicate labels on distinct ids", () => {
    const fields = parseFieldSpec("Contact | text\nContact | text");
    expect(fields.map((field) => field.id)).toEqual(["contact", "contact_2"]);
  });

  it("never produces an empty id", () => {
    expect(fieldIdFromLabel("?!")).toBe("field");
  });
});

describe("answer reading and review (TOK-27)", () => {
  const formData = new FormData();
  formData.set("assignmentId", "ffffffff-ffff-4fff-8fff-ffffffffffff");
  formData.set("field-preferred_name", "Jordan");
  formData.set("field-support_style", "Stay close, talk me through it");
  formData.set("$ACTION_ID_x", "noise");

  it("takes only field-* entries, so form plumbing is never an answer", () => {
    expect(readAnswers(formData.entries())).toEqual({
      preferred_name: "Jordan",
      support_style: "Stay close, talk me through it",
    });
  });

  it("renders every question, answered or not, with its badge state", () => {
    const entries = answeredFields(SCHEMA, readAnswers(formData.entries()));
    expect(entries).toHaveLength(4);
    expect(entries[0]).toEqual({ field: SCHEMA.fields[0], value: "Jordan", sensitive: false });
    expect(entries[2].value).toBe("");
    expect(entries[2].sensitive).toBe(true);
    expect(answeredCount(SCHEMA, readAnswers(formData.entries()))).toBe(2);
  });
});

describe("PHI firewall: form answers never ride an email (TOK-27)", () => {
  const vars = formReminderVars({
    clientName: "Jordan",
    portalUrl: "https://tokos.test/portal/forms",
    openCount: 3,
  });

  it("builds reminder vars from a name, a link, and a count only", () => {
    expect(vars).toEqual({
      client_name: "Jordan",
      portal_url: "https://tokos.test/portal/forms",
      open_forms: "3",
    });
  });

  it("passes when the vars carry no answers", () => {
    expect(() =>
      assertAnswersNotInEmail(vars, {
        support_style: "Stay close, talk me through it",
        household_notes: "My sister Rae is staying the first week",
      }, "test"),
    ).not.toThrow();
  });

  // The var key here is deliberately innocuous, so the throw can only come from the
  // answer check rather than from the key regex in lib/phi.
  it("throws when a free-text answer is spliced into a var", () => {
    expect(() =>
      assertAnswersNotInEmail(
        { ...vars, summary: "Jordan wrote: My sister Rae is staying the first week" },
        { household_notes: "My sister Rae is staying the first week" },
        "test",
      ),
    ).toThrow(/PHI firewall: answer "household_notes"/);
  });

  it("throws on a sensitive answer even when it only appears as a fragment", () => {
    expect(() =>
      assertAnswersNotInEmail(
        { ...vars, portal_url: "https://tokos.test/portal?prefill=twin%20loss" },
        { quiet_thing: "twin%20loss" },
        "test",
      ),
    ).toThrow(/PHI firewall/);
  });

  it("does not mistake the greeting for a leaked answer", () => {
    expect(() =>
      assertAnswersNotInEmail(vars, { preferred_name: "Jordan" }, "test"),
    ).not.toThrow();
  });

  it("still rejects a PHI-shaped var key on top of the answer check", () => {
    expect(() =>
      assertAnswersNotInEmail({ ...vars, visit_note: "n/a" }, {}, "test"),
    ).toThrow(/PHI firewall/);
  });

  it("refuses to build reminder vars around a PHI-shaped client name", () => {
    expect(() =>
      formReminderVars({
        clientName: "x".repeat(40) + " prenatal health summary",
        portalUrl: "https://tokos.test/portal",
        openCount: 1,
      }),
    ).toThrow(/PHI firewall/);
  });
});
