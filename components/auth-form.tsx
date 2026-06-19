"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Loader2, ArrowRight } from "lucide-react";

type Mode = "signIn" | "signUp";

const COPY = {
  signIn: {
    heading: "Welcome back",
    submit: "Sign in",
    submitting: "Signing in…",
    error: "Invalid email or password.",
    altText: "No account yet?",
    altLink: "Create one",
    altHref: "/sign-up",
    passwordPlaceholder: "••••••••",
    passwordHint: undefined as string | undefined,
  },
  signUp: {
    heading: "Create your account",
    submit: "Create account",
    submitting: "Creating account…",
    error: "Could not create account. Try a stronger password.",
    altText: "Already have an account?",
    altLink: "Sign in",
    altHref: "/sign-in",
    passwordPlaceholder: "8+ characters",
    passwordHint: "Use at least 8 characters.",
  },
} as const;

export function AuthForm({ mode }: { mode: Mode }) {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const copy = COPY[mode];

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      await signIn("password", { email, password, flow: mode });
      router.push("/");
    } catch (err) {
      // Surface the real server message when it's meaningful (e.g. invite-only),
      // otherwise fall back to the generic copy.
      const raw = err instanceof Error ? err.message : "";
      const friendly = /invite-only/i.test(raw)
        ? "Registration is invite-only. Ask an admin to authorise your email."
        : copy.error;
      setError(friendly);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      <div className="space-y-1">
        <h2 className="text-lg font-medium text-[#F2EEE6]">{copy.heading}</h2>
        {mode === "signUp" && (
          <p className="text-xs text-[#8C8278]">
            Invite-only — use the email your admin authorised.
          </p>
        )}
      </div>

      <div className="space-y-4">
        {/* Email */}
        <div className="space-y-1.5">
          <label htmlFor="email" className="mm-eyebrow block">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="mm-field w-full rounded-lg px-3.5 py-2.5 text-sm text-[#F2EEE6] placeholder:text-[#8C8278]/60"
            placeholder="you@example.com"
          />
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <label htmlFor="password" className="mm-eyebrow block">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={show ? "text" : "password"}
              autoComplete={mode === "signUp" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === "signUp" ? 8 : undefined}
              className="mm-field w-full rounded-lg px-3.5 py-2.5 pr-11 text-sm text-[#F2EEE6] placeholder:text-[#8C8278]/60"
              placeholder={copy.passwordPlaceholder}
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? "Hide password" : "Show password"}
              className="absolute right-1 top-1/2 -translate-y-1/2 grid h-9 w-9 place-items-center rounded-md text-[#8C8278] hover:text-[#F2EEE6] transition-colors cursor-pointer"
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {copy.passwordHint && (
            <p className="text-[11px] text-[#8C8278]/70">{copy.passwordHint}</p>
          )}
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || !email || !password}
        className="mm-cta group flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-[#F7F3EC] disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {copy.submitting}
          </>
        ) : (
          <>
            {copy.submit}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </>
        )}
      </button>

      <p className="text-center text-sm text-[#8C8278]">
        {copy.altText}{" "}
        <Link
          href={copy.altHref}
          className="text-[#CC7A5C] hover:text-[#E0936F] underline-offset-4 hover:underline transition-colors"
        >
          {copy.altLink}
        </Link>
      </p>
    </form>
  );
}
