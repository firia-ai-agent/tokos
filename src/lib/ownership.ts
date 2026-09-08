export type OrgScoped = {
  organizationId: string;
};

export type ClientScoped = OrgScoped & {
  clientId: string;
};

/** Client portal session may only act on its own org+client rows. */
export function clientOwnsRow(session: ClientScoped, row: ClientScoped): boolean {
  return session.organizationId === row.organizationId && session.clientId === row.clientId;
}

/** Staff may only write/read clients that belong to their organization. */
export function staffOwnsClient(staffOrganizationId: string, client: OrgScoped): boolean {
  return Boolean(staffOrganizationId) && staffOrganizationId === client.organizationId;
}
