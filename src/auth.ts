import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clientPortalAccess, memberships, users } from "@/db/schema";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      authorize: async (credentials) => {
        const email = String(credentials.email ?? "")
          .trim()
          .toLowerCase();
        const password = String(credentials.password ?? "");
        if (!email || !password) return null;

        const db = getDb();
        const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
        if (!user) return null;

        const valid = await compare(password, user.passwordHash);
        if (!valid) return null;

        const [membership] = await db
          .select()
          .from(memberships)
          .where(eq(memberships.userId, user.id))
          .limit(1);

        if (membership) {
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            actorType: "staff" as const,
            organizationId: membership.organizationId,
            membershipRole: membership.role as "owner" | "admin" | "doula",
          };
        }

        const [portal] = await db
          .select()
          .from(clientPortalAccess)
          .where(eq(clientPortalAccess.userId, user.id))
          .limit(1);

        if (portal) {
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            actorType: "client" as const,
            organizationId: portal.organizationId,
            clientId: portal.clientId,
          };
        }

        return null;
      },
    }),
  ],
  callbacks: {
    authorized({ auth: session, request }) {
      const path = request.nextUrl.pathname;
      const isStaff = path.startsWith("/doula");
      const isClient = path.startsWith("/portal");
      const isStub = path.startsWith("/stub");
      if (!isStaff && !isClient && !isStub) return true;
      if (!session?.user) return false;
      if (isStaff) return session.user.actorType === "staff";
      if (isClient || isStub) return session.user.actorType === "client";
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.actorType = user.actorType;
        token.organizationId = user.organizationId;
        token.membershipRole = user.membershipRole;
        token.clientId = user.clientId;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.actorType = token.actorType === "client" ? "client" : "staff";
        session.user.organizationId = typeof token.organizationId === "string" ? token.organizationId : "";
        session.user.membershipRole =
          token.membershipRole === "owner" ||
          token.membershipRole === "admin" ||
          token.membershipRole === "doula"
            ? token.membershipRole
            : undefined;
        session.user.clientId = typeof token.clientId === "string" ? token.clientId : undefined;
      }
      return session;
    },
  },
});
