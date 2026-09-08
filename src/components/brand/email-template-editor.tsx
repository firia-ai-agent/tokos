"use client";

import { useState } from "react";
import { saveEmailTemplateAction } from "@/app/actions/settings";
import { renderPreview } from "@/lib/email-templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type EditableTemplate = {
  id: string;
  name: string;
  triggerKey: string;
  enabled: boolean;
  fromName: string;
  replyTo: string | null;
  subjectTpl: string;
  bodyTextTpl: string;
  bodyHtmlTpl: string;
  version: number;
};

/**
 * The template editor and its preview. The preview substitutes invented sample values —
 * it never reads a client record, and an unknown `{{var}}` is left visible rather than
 * blanked, so an author sees exactly what the save will reject.
 */
export function EmailTemplateEditor({
  template,
  allowed,
  sample,
  description,
  canEdit,
}: {
  template: EditableTemplate;
  allowed: string[];
  sample: Record<string, string>;
  description: string;
  canEdit: boolean;
}) {
  const [subject, setSubject] = useState(template.subjectTpl);
  const [bodyText, setBodyText] = useState(template.bodyTextTpl);
  const [bodyHtml, setBodyHtml] = useState(template.bodyHtmlTpl);
  const [enabled, setEnabled] = useState(template.enabled);

  return (
    <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
      <section className="rounded-xl bg-card ring-1 ring-teal/15">
        <div className="border-b border-teal/10 px-5 py-3.5">
          <h2 className="font-heading text-xl text-teal-ink">{template.name}</h2>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            <span className="font-mono">{template.triggerKey}</span> · v{template.version} ·{" "}
            {description}
          </p>
        </div>
        <div className="px-5 py-4">
          <form action={saveEmailTemplateAction} className="space-y-4">
            <input type="hidden" name="templateId" value={template.id} />
            <fieldset disabled={!canEdit} className="space-y-4 disabled:opacity-70">
              <label className="flex items-center gap-2.5 text-[13px] font-medium text-teal-ink">
                <input
                  type="checkbox"
                  name="enabled"
                  checked={enabled}
                  onChange={(event) => setEnabled(event.target.checked)}
                  className="size-4 accent-[#2A7A78]"
                />
                Enabled — the outbox only renders enabled templates
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="fromName">From name</Label>
                  <Input id="fromName" name="fromName" defaultValue={template.fromName} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="replyTo">Reply-to</Label>
                  <Input
                    id="replyTo"
                    name="replyTo"
                    type="email"
                    defaultValue={template.replyTo ?? ""}
                    placeholder="hello@yourpractice.com"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="subjectTpl">Subject</Label>
                <Input
                  id="subjectTpl"
                  name="subjectTpl"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bodyTextTpl">Plain text</Label>
                <Textarea
                  id="bodyTextTpl"
                  name="bodyTextTpl"
                  rows={6}
                  value={bodyText}
                  onChange={(event) => setBodyText(event.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bodyHtmlTpl">HTML</Label>
                <Textarea
                  id="bodyHtmlTpl"
                  name="bodyHtmlTpl"
                  rows={5}
                  value={bodyHtml}
                  onChange={(event) => setBodyHtml(event.target.value)}
                  className="font-mono text-[12.5px]"
                />
                <p className="text-[12px] text-muted-foreground">
                  Leave empty to wrap the plain text in paragraphs on save.
                </p>
              </div>

              <Button type="submit">Save template</Button>
            </fieldset>
          </form>
        </div>
      </section>

      <section className="space-y-4">
        <article className="rounded-xl bg-card ring-1 ring-teal/15">
          <div className="border-b border-teal/10 px-4 py-3">
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Preview · sample values
            </p>
          </div>
          <div className="space-y-3 px-4 py-3.5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Subject
              </p>
              <p className="mt-1 text-[13.5px] font-semibold text-teal-ink">
                {renderPreview(subject, sample)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Body
              </p>
              <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-teal-ink">
                {renderPreview(bodyText, sample)}
              </p>
            </div>
            {enabled ? null : (
              <p className="rounded-md bg-coral/10 px-2.5 py-1.5 text-[12px] text-coral ring-1 ring-coral/20">
                Disabled — the outbox falls back to a plain Tokos notice for this trigger.
              </p>
            )}
          </div>
        </article>

        <article className="rounded-xl bg-card ring-1 ring-teal/15">
          <div className="border-b border-teal/10 px-4 py-3">
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Variables this trigger supplies
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 px-4 py-3.5">
            {allowed.map((name) => (
              <span
                key={name}
                className="rounded-md bg-teal/10 px-2 py-1 font-mono text-[11.5px] text-teal-ink"
              >
                {`{{${name}}}`}
              </span>
            ))}
          </div>
          <p className="px-4 pb-3.5 text-[12px] leading-relaxed text-muted-foreground">
            Anything else is refused on save. Form answers never become email variables.
          </p>
        </article>
      </section>
    </div>
  );
}
