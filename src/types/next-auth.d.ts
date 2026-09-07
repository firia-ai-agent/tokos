import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      actorType: "staff" | "client";
      organizationId: string;
      membershipRole?: "owner" | "admin" | "doula";
      clientId?: string;
    };
  }

  interface User {
    actorType: "staff" | "client";
    organizationId: string;
    membershipRole?: "owner" | "admin" | "doula";
    clientId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    actorType?: "staff" | "client";
    organizationId?: string;
    membershipRole?: "owner" | "admin" | "doula";
    clientId?: string;
  }
}
