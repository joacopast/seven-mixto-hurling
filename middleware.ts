import { NextResponse, type NextRequest } from "next/server";

/**
 * Primera barrera de las áreas privadas: presencia de la cookie de sesión.
 * La verificación real de la sesión y la autorización por rol se hacen en cada
 * Server Component / Server Action con los guards de lib/auth/guards.ts.
 *
 * Se hace por cookie (y no con `auth()`) para no arrastrar el Prisma adapter
 * al runtime edge del middleware — la sesión es de estrategia "database".
 *
 * `/admin` es solo para staff → login dedicado en `/staff` (usuario/contraseña).
 * `/mi-equipo` es para responsables de equipo → magic link en `/ingresar`.
 */
const SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isAdmin = pathname.startsWith("/admin");
  const isTeam = pathname.startsWith("/mi-equipo");
  if (!isAdmin && !isTeam) return NextResponse.next();

  const hasSession = SESSION_COOKIES.some((name) => req.cookies.has(name));
  if (!hasSession) {
    const url = new URL(isAdmin ? "/staff" : "/ingresar", req.nextUrl.origin);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/mi-equipo/:path*"],
};
