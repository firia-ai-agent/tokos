import { describe, expect, it } from "vitest";
import {
  allowedVars,
  nextTemplateVersion,
  renderPreview,
  sampleVars,
  templateChanged,
  templateVars,
  unknownVars,
} from "./email-templates";

describe("template variables", () => {
  it("gives every trigger the common three plus its own", () => {
    expect(allowedVars("invoice_due").sort()).toEqual([
      "client_name",
      "invoice_number",
      "org_name",
      "portal_url",
    ]);
    expect(allowedVars("agreement_sent")).toContain("sign_url");
    // The welcome names the person who sent it (TOK-38 B11) — and only that trigger,
    // because it is the only one that supplies the value at enqueue time.
    expect(allowedVars("client_welcome")).toContain("doula_name");
    expect(allowedVars("invoice_due")).not.toContain("doula_name");
    expect(sampleVars("client_welcome", "NOVA").doula_name).toBeTruthy();
    expect(allowedVars("doula_invited")).toContain("invite_url");
  });

  it("reads vars out of a template, whitespace and all", () => {
    expect(templateVars("Hi {{ client_name }}, open {{portal_url}} — {{client_name}}").sort()).toEqual(
      ["client_name", "portal_url"],
    );
  });
});

describe("unknownVars — the editor's PHI firewall", () => {
  it("passes a template that only uses what the trigger supplies", () => {
    expect(
      unknownVars("form_reminder", {
        subjectTpl: "A form is waiting",
        bodyTextTpl: "Hi {{client_name}}, {{open_forms}} open at {{portal_url}}",
        bodyHtmlTpl: "<p>{{org_name}}</p>",
      }),
    ).toEqual([]);
  });

  it("refuses a var reaching for a form answer", () => {
    expect(
      unknownVars("form_reminder", {
        subjectTpl: "{{answer_1}}",
        bodyTextTpl: "Hi {{client_name}}",
        bodyHtmlTpl: "",
      }),
    ).toEqual(["answer_1"]);
  });

  it("refuses a var that belongs to a different trigger", () => {
    expect(
      unknownVars("form_reminder", { bodyTextTpl: "Sign at {{sign_url}}" }),
    ).toEqual(["sign_url"]);
  });

  it("reports every offender once, sorted", () => {
    expect(
      unknownVars("invoice_due", {
        subjectTpl: "{{zzz}} {{aaa}}",
        bodyTextTpl: "{{aaa}}",
        bodyHtmlTpl: "{{invoice_number}}",
      }),
    ).toEqual(["aaa", "zzz"]);
  });
});

describe("version bump", () => {
  it("publishes one past the highest version that exists", () => {
    expect(nextTemplateVersion([1, 2, 3])).toBe(4);
    expect(nextTemplateVersion([3, 1, 2])).toBe(4);
  });

  it("starts at 1 when there is no history", () => {
    expect(nextTemplateVersion([])).toBe(1);
  });

  it("never fills a gap or reuses a number", () => {
    expect(nextTemplateVersion([1, 5])).toBe(6);
    expect(nextTemplateVersion(["4", null, undefined])).toBe(5);
  });
});

describe("templateChanged", () => {
  const before = { subjectTpl: "a", bodyTextTpl: "b", bodyHtmlTpl: "<p>b</p>" };

  it("is false when the wording is untouched", () => {
    expect(templateChanged(before, { ...before })).toBe(false);
  });

  it("is true for any of the three parts", () => {
    expect(templateChanged(before, { ...before, subjectTpl: "z" })).toBe(true);
    expect(templateChanged(before, { ...before, bodyTextTpl: "z" })).toBe(true);
    expect(templateChanged(before, { ...before, bodyHtmlTpl: "z" })).toBe(true);
  });
});

describe("preview", () => {
  it("substitutes sample values and leaves an unknown var visible", () => {
    expect(renderPreview("Hi {{client_name}} — {{answer_1}}", sampleVars("form_reminder", "NOVA"))).toBe(
      "Hi Sample Family — {{answer_1}}",
    );
  });

  it("only samples vars the trigger supplies", () => {
    const vars = sampleVars("invoice_due", "NOVA");
    expect(vars.org_name).toBe("NOVA");
    expect(vars.invoice_number).toBeDefined();
    expect(vars.sign_url).toBeUndefined();
  });
});
