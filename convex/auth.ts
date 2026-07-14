import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";

// Company staff self-register with a work email; external guests still need an
// admin invite. Exact-domain match (leading "@") so look-alikes are rejected:
// "x@notmadmonkeyhostels.com" and "x@madmonkeyhostels.com.evil.com" both fail.
const COMPANY_EMAIL_DOMAIN = "@madmonkeyhostels.com";
const DEFAULT_CAP_USD = 50;

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
  callbacks: {
    async createOrUpdateUser(ctx, args) {
      if (args.existingUserId) return args.existingUserId;

      const email = (args.profile.email ?? "").trim().toLowerCase();
      const name = args.profile.name ?? email.split("@")[0] ?? "User";

      // ── Password recovery re-link ──
      // If a user row already exists for this email but has NO password
      // account (an admin wiped the stale credential), attach the new
      // credentials to the existing user instead of creating a duplicate —
      // keeps their role, gallery and history. Unreachable for hijacking:
      // sign-up on an email whose credential still exists fails earlier in
      // the provider, and brand-new emails still hit the domain gate below.
      const existingUser = await ctx.db
        .query("users")
        .filter((q) => q.eq(q.field("email"), email))
        .first();
      if (existingUser) return existingUser._id;

      // ── Registration policy ──
      // Self-serve, company-domain only: anyone with an @madmonkeyhostels.com
      // email can create an account; every other email is rejected. There are
      // no invites — access is defined solely by having a company email.
      if (!email.endsWith(COMPANY_EMAIL_DOMAIN)) {
        throw new Error(
          "Sign-up is limited to @madmonkeyhostels.com email addresses.",
        );
      }

      // New staff get a standard "user" seat on the active brand at the default
      // cap. Admin is granted separately (admin:bootstrapAdmin / the Members UI).
      const brand = await ctx.db
        .query("brands")
        .filter((q) => q.eq(q.field("isActive"), true))
        .first();
      if (!brand) {
        throw new Error("No active brand configured — contact an admin.");
      }

      return await ctx.db.insert("users", {
        email,
        name,
        role: "user",
        brandId: brand._id,
        monthlyCapUsd: DEFAULT_CAP_USD,
        isActive: true,
        createdAt: Date.now(),
      });
    },
  },
});
