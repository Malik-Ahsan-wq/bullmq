import { NextResponse } from "next/server";

export function proxy(request) {
  const response = NextResponse.next();

  // X-Content-Type-Options: Prevent MIME type sniffing
  response.headers.set("X-Content-Type-Options", "nosniff");

  // X-Frame-Options: Prevent clickjacking
  response.headers.set("X-Frame-Options", "DENY");

  // X-XSS-Protection: Enable XSS filter in legacy browsers
  response.headers.set("X-XSS-Protection", "1; mode=block");

  // Referrer-Policy: Control referrer information
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // X-DNS-Prefetch-Control: Prevent DNS prefetching
  response.headers.set("X-DNS-Prefetch-Control", "off");

  // Strict-Transport-Security: Enforce HTTPS (max-age 1 year)
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains; preload"
  );

  // X-Permitted-Cross-Domain-Policies: Restrict cross-domain requests
  response.headers.set("X-Permitted-Cross-Domain-Policies", "none");

  // Content-Security-Policy: Restrict resource loading
  response.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'self';"
  );

  // Permissions-Policy: Control browser features
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()"
  );

  // X-Download-Options: Prevent IE from executing downloads
  response.headers.set("X-Download-Options", "noopen");

  // Remove server header (if present)
  response.headers.delete("Server");
  response.headers.delete("X-Powered-By");

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
