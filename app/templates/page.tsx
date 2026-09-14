"use client";

// Templates: the approved reference designs the team creates from.
// GMs: browse and pick one (jumps into Studio with it selected).
// Marketing/admins: upload references, approve, retire, delete.
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { StudioHeader } from "@/components/studio-header";
import { PoweredBy } from "@/components/powered-by";
import { TemplatePicker } from "@/components/template-picker";

export default function TemplatesPage() {
  const router = useRouter();
  const user = useQuery(api.users.getCurrentUser);
  const canManage = user?.role === "admin" || user?.role === "marketing";
  const initials = user?.name
    ? user.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  return (
    <div className="mm-ambient flex min-h-[100svh] flex-col">
      <StudioHeader user={user} initials={initials} title="Templates" backHref="/" />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 lg:px-6 lg:py-8">
        <div className="mm-fade-up mb-6">
          <h1 className="text-[26px] font-light tracking-tight text-[#F2EEE6]" style={{ fontFamily: "var(--font-display)" }}>
            {canManage ? "Templates" : "Pick a template"}
          </h1>
          <p className="mt-1 text-[13px] text-[#8C8278]">
            {canManage
              ? "Upload a reference, approve it, and every GM can create from it."
              : "Choose a look. Add your event. Done."}
          </p>
        </div>

        {user === undefined ? (
          <p className="text-xs text-[#8C8278]">Loading…</p>
        ) : canManage ? (
          <TemplatePicker mode="manage" />
        ) : (
          <TemplatePicker mode="pick" onPick={(t) => router.push(`/?template=${t._id}`)} />
        )}
      </main>
      <PoweredBy />
    </div>
  );
}
