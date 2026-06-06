import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
  callbacks: {
    async createOrUpdateUser(ctx, args) {
      if (args.existingUserId) return args.existingUserId;

      const brand = await ctx.db
        .query("brands")
        .filter((q) => q.eq(q.field("isActive"), true))
        .first();

      const email = args.profile.email ?? "";
      const name =
        args.profile.name ?? email.split("@")[0] ?? "User";

      return await ctx.db.insert("users", {
        email,
        name,
        role: "marketer",
        brandId: brand?._id,
        monthlyCapUsd: 0,
        isActive: true,
        createdAt: Date.now(),
      });
    },
  },
});
