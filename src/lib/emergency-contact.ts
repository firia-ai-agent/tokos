/**
 * The emergency contact on a family's record (TOK-57).
 *
 * The founder's note on the family profile is one line — "have a section for emergency
 * contact" — but the reason is the whole product: birth work happens at 3am, and the
 * person a doula calls when she cannot reach the family is not a nice-to-have field
 * buried under a heading called "Alternate".
 *
 * The columns already existed as `alternate_contact_*`. They are not renamed: a column
 * rename is a migration with no reader benefit, and everything the family and the doula
 * see comes through these helpers anyway. What changed is that this is now a named
 * section on the portal profile and a line the doula can actually see on the record.
 *
 * Deliberately not PHI: a name, a phone, and how they know each other. No relationship to
 * the pregnancy, no health detail — that lives on forms.
 */

export type EmergencyContactInput = {
  name?: string | null;
  phone?: string | null;
};

export type EmergencyContact = {
  name: string;
  phone: string;
  /** True once there is enough here to actually reach someone. */
  reachable: boolean;
  /** "Sam Rivera · (571) 555-0110" — whatever of it exists, in reading order. */
  summary: string;
};

/** Form field names, shared by the portal form and the action that reads it. */
export const EMERGENCY_CONTACT_FIELDS = {
  name: "alternateContactName",
  phone: "alternateContactPhone",
} as const;

export const EMERGENCY_CONTACT_SECTION_TITLE = "Emergency contact";

export function emergencyContact(input: EmergencyContactInput): EmergencyContact {
  const name = String(input.name ?? "").trim().replace(/\s+/g, " ");
  const phone = String(input.phone ?? "").trim();
  return {
    name,
    phone,
    // A name with no number is not somebody you can call at 3am.
    reachable: Boolean(phone),
    summary: [name, phone].filter(Boolean).join(" · "),
  };
}

/** What the doula's record prints when the family has not filled it in yet. */
export const EMERGENCY_CONTACT_EMPTY = "Not on file";

export function emergencyContactLine(input: EmergencyContactInput): string {
  return emergencyContact(input).summary || EMERGENCY_CONTACT_EMPTY;
}
