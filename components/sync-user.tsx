"use client";

import { useEffect } from "react";
import { useMutation } from "convex/react";
import { useAuth } from "@clerk/nextjs";
import { api } from "@/convex/_generated/api";

export function SyncUser() {
  const { isSignedIn } = useAuth();
  const syncUser = useMutation(api.users.syncUser);

  useEffect(() => {
    if (isSignedIn) syncUser();
  }, [isSignedIn, syncUser]);

  return null;
}
