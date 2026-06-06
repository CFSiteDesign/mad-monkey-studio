import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  isAuthenticatedNextjs,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);

export default convexAuthNextjsMiddleware(async (request) => {
  const authed = await isAuthenticatedNextjs();
  if (!isPublicRoute(request) && !authed) {
    return nextjsMiddlewareRedirect(request, "/sign-in");
  }
  if (isPublicRoute(request) && authed) {
    return nextjsMiddlewareRedirect(request, "/");
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|svg|jpg|jpeg|png|gif|webp|avif|ico|woff2?|ttf|otf)).*)",
    "/(api|trpc)(.*)",
  ],
};
