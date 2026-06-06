"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SignUpPage() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await signIn("password", { email, password, flow: "signUp" });
      router.push("/");
    } catch {
      setError("Could not create account. Try a stronger password.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-3">
        <div>
          <label className="block text-[10px] tracking-[0.15em] uppercase text-[#8C8278] mb-1.5">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded bg-[#1C1A18] border border-[rgba(242,238,230,0.12)] px-3 py-2.5 text-sm text-[#F2EEE6] placeholder:text-[#8C8278] focus:outline-none focus:border-[#CC7A5C]"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label className="block text-[10px] tracking-[0.15em] uppercase text-[#8C8278] mb-1.5">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="w-full rounded bg-[#1C1A18] border border-[rgba(242,238,230,0.12)] px-3 py-2.5 text-sm text-[#F2EEE6] placeholder:text-[#8C8278] focus:outline-none focus:border-[#CC7A5C]"
            placeholder="8+ characters"
          />
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded bg-[#CC7A5C] hover:bg-[#D4956D] disabled:opacity-50 px-4 py-2.5 text-sm font-medium text-[#F2EEE6] transition-colors"
      >
        {loading ? "Creating account…" : "Create account"}
      </button>

      <p className="text-center text-sm text-[#8C8278]">
        Already have an account?{" "}
        <Link href="/sign-in" className="text-[#CC7A5C] hover:text-[#D4956D]">
          Sign in
        </Link>
      </p>
    </form>
  );
}
