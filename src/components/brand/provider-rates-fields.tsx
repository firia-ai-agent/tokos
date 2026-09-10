/**
 * The rate grid and travel radius on `/doula/profile` (TOK-57).
 *
 * This replaces two free-text boxes — "Rates" and "Service area" — that asked a doula to
 * write a sentence and then asked a family to parse one. Now she ticks what she offers,
 * says the number and whether it is by the hour, by the day or for the whole thing, and
 * tells us where she starts from and how far she will drive.
 *
 * Deliberately no client JavaScript: an unticked service still posts its amount, and
 * `parseRatesForm` drops it. So the row can stay filled in while the box is off — a doula
 * who stops offering overnights for a season does not lose the price she had set.
 *
 * Every label, unit and field name comes from `@/lib/provider-rates`. Nothing about which
 * services exist or what they are called is written down here.
 */

import { SERVICE_TYPES } from "@/lib/lead-fields";
import {
  RATE_FIELDS,
  RATE_NOTE_MAX,
  RATE_UNIT_OPTIONS,
  SERVICE_AREA_FIELDS,
  TRAVEL_RADIUS_MAX_MILES,
  amountInputValue,
  serviceLabel,
  type ProviderRate,
} from "@/lib/provider-rates";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  rates: readonly ProviderRate[];
  address: string | null | undefined;
  zip: string | null | undefined;
  radiusMiles: number | null | undefined;
};

export function ProviderRatesFields({ rates, address, zip, radiusMiles }: Props) {
  const byService = new Map(rates.map((rate) => [rate.service, rate]));

  return (
    <div className="space-y-5">
      <section className="space-y-2.5">
        <div>
          <h3 className="font-heading text-[15px] font-semibold text-teal-ink">
            What you offer, and what you charge
          </h3>
          <p className="text-[13px] text-muted-foreground">
            Tick what you take on. Families see these on your public page.
          </p>
        </div>
        <div className="divide-y divide-teal/10 rounded-lg bg-cloud ring-1 ring-teal/10">
          {SERVICE_TYPES.map((service) => {
            const rate = byService.get(service);
            const offeredId = RATE_FIELDS.offered(service);
            return (
              <div key={service} className="p-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <label
                    htmlFor={offeredId}
                    className="flex min-w-[9.5rem] flex-1 cursor-pointer items-center gap-2.5 text-[13.5px] font-medium text-teal-ink"
                  >
                    <input
                      id={offeredId}
                      name={offeredId}
                      type="checkbox"
                      defaultChecked={Boolean(rate)}
                      className="size-4 shrink-0 accent-teal"
                    />
                    {serviceLabel(service)}
                  </label>
                  <div className="flex items-center gap-1.5">
                    <span aria-hidden className="text-[13px] text-muted-foreground">
                      $
                    </span>
                    <Input
                      name={RATE_FIELDS.amount(service)}
                      type="text"
                      inputMode="decimal"
                      aria-label={`${serviceLabel(service)} rate`}
                      placeholder="0"
                      defaultValue={amountInputValue(rate?.amountCents)}
                      className="h-9 w-24 bg-white"
                    />
                  </div>
                  <select
                    name={RATE_FIELDS.unit(service)}
                    aria-label={`${serviceLabel(service)} rate basis`}
                    defaultValue={rate?.unit ?? "hourly"}
                    className="h-9 rounded-md border border-teal/20 bg-white px-2 text-[13px] text-teal-ink"
                  >
                    {RATE_UNIT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <Input
                  name={RATE_FIELDS.note(service)}
                  maxLength={RATE_NOTE_MAX}
                  aria-label={`${serviceLabel(service)} note`}
                  placeholder="Anything included — optional"
                  defaultValue={rate?.note ?? ""}
                  className="mt-2 h-8 bg-white text-[13px]"
                />
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-2.5">
        <div>
          <h3 className="font-heading text-[15px] font-semibold text-teal-ink">
            Where you work
          </h3>
          <p className="text-[13px] text-muted-foreground">
            Where you set out from, and how far you are happy to drive.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1.6fr_0.8fr_0.9fr]">
          <div className="space-y-1.5">
            <Label htmlFor={SERVICE_AREA_FIELDS.address}>Town or address</Label>
            <Input
              id={SERVICE_AREA_FIELDS.address}
              name={SERVICE_AREA_FIELDS.address}
              placeholder="Arlington, VA"
              defaultValue={address ?? ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={SERVICE_AREA_FIELDS.zip}>ZIP</Label>
            <Input
              id={SERVICE_AREA_FIELDS.zip}
              name={SERVICE_AREA_FIELDS.zip}
              inputMode="numeric"
              placeholder="22201"
              defaultValue={zip ?? ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={SERVICE_AREA_FIELDS.radius}>Will drive</Label>
            <div className="flex items-center gap-2">
              <Input
                id={SERVICE_AREA_FIELDS.radius}
                name={SERVICE_AREA_FIELDS.radius}
                inputMode="numeric"
                max={TRAVEL_RADIUS_MAX_MILES}
                placeholder="25"
                defaultValue={radiusMiles ?? ""}
                className="w-20"
              />
              <span className="text-[13px] text-muted-foreground">miles</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
