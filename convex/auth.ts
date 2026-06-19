import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
  callbacks: {
    async createOrUpdateUser(ctx, args) {
      if (args.existingUserId) return args.existingUserId;

      const email = (args.profile.email ?? "").trim().toLowerCase();
      const name = args.profile.name ?? email.split("@")[0] ?? "User";

      // ── Invite-only registration ──
      // A new account may only be created if an admin pre-authorised this
      // email via an invite. No invite → hard reject.
      const invite = await ctx.db
        .query("invites")
        .filter((q) =>
          q.and(
            q.eq(q.field("email"), email),
            q.eq(q.field("usedAt"), undefined),
          ),
        )
        .first();

      if (!invite) {
        throw new Error(
          "Registration is invite-only. Ask an admin to authorise your email.",
        );
      }

      const userId = await ctx.db.insert("users", {
        email,
        name,
        role: invite.role,
        brandId: invite.brandId,
        monthlyCapUsd: invite.monthlyCapUsd, // default $50 set at invite time
        isActive: true,
        createdAt: Date.now(),
      });

      // Burn the invite so it can't be reused.
      await ctx.db.patch(invite._id, { usedAt: Date.now() });

      return userId;
    },
  },
});
