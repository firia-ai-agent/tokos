export { auth as proxy } from "@/auth";

export const config = {
  matcher: ["/doula/:path*", "/portal/:path*"],
};
