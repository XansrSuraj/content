import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic redirect only: real authorization happens server-side in every
 * page, action and route handler (requireUser / requireAdmin).
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.has("ts_session")) {
    const url = request.nextUrl.clone();
    url.pathname = "/signin";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/admin/:path*", "/onboarding"],
};
