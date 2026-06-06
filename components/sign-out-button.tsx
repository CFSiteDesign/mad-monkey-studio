"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";

export function SignOutButton({ initials }: { initials: string }) {
  const { signOut } = useAuthActions();
  const router = useRouter();

  return (
    <button
      onClick={async () => {
        await signOut();
        router.push("/sign-in");
      }}
      className="h-8 w-8 rounded-full bg-[#CC7A5C] text-[#F2EEE6] text-xs font-medium flex items-center justify-center hover:bg-[#D4956D] transition-colors"
      title="Sign out"
    >
      {initials}
    </button>
  );
}
