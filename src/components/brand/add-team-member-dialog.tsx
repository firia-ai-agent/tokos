"use client";

/**
 * The Add-team-member popup on `/doula/team` (TOK-57).
 *
 * The founder asked for the thing she saw on a competitor's screen: "can click add team
 * member account which opens up a popup". Three fields — who she is, where to write to
 * her, what she does here — and nothing else, because an invite is not an HR record.
 *
 * The dialog only holds the form. `inviteStaffAction` re-parses and re-checks everything
 * it posts (`parseAddTeamMember`, then `canInviteStaff`), so nothing here is trusted; the
 * `required` attributes just save the person a round trip.
 */

import { useState } from "react";
import { INVITABLE_ROLES, roleLabel } from "@/lib/team";
import { inviteStaffAction } from "@/app/actions/team";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AddTeamMemberDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Add team member</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-teal-ink">Add a team member</DialogTitle>
          <DialogDescription>
            She gets an email with her own link to join. She picks her password on the way
            in — you never set one for her.
          </DialogDescription>
        </DialogHeader>
        <form action={inviteStaffAction} className="space-y-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="addMemberName">Name</Label>
            <Input id="addMemberName" name="name" required placeholder="Alex Rivera" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="addMemberEmail">Work email</Label>
            <Input
              id="addMemberEmail"
              name="email"
              type="email"
              required
              placeholder="alex@practice.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="addMemberRole">Role</Label>
            <select
              id="addMemberRole"
              name="role"
              defaultValue="doula"
              className="h-9 w-full rounded-md border border-teal/20 bg-card px-2.5 text-[13px] text-teal-ink focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/25"
            >
              {INVITABLE_ROLES.map((role) => (
                <option key={role} value={role}>
                  {roleLabel(role)}
                </option>
              ))}
            </select>
            <p className="text-[12px] text-muted-foreground">
              Admins can invite and match. Ownership stays with you.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm">
              Send invite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
