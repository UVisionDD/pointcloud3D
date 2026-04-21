import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublic = createRouteMatcher([
  "/",
  "/pricing",
  "/guide",
  "/terms",
  "/privacy",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks/(.*)", // Stripe/Clerk webhooks must be public.
  // Guest upload flow: you can upload and run a job without an account.
  // Download / paid export still gates via Clerk + Stripe in the route itself.
  "/api/upload-url",
  "/api/jobs",
  "/api/jobs/(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublic(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Run on everything except static files and Next internals.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
