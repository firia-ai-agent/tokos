import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function PostLoginPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.actorType === "client") redirect("/portal");
  redirect("/doula");
}
