"use client";

// Admin-only member management: adjust every member's role + monthly spend cap.
// Staff self-register with an @madmonkeyhostels.com email — there are no invites.
// All actions are gated server-side by `requireAdmin` in convex/admin.ts.

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Users, Loader2, Check } from "lucide-react";

type Member = {
  _id: Id<"users">;
  email: string;
  name: string;
  role: string;
  monthlyCapUsd: number;
  isActive: boolean;
};

export function AdminMembers() {
  const data = useQuery(api.admin.listMembers);
  const setUserCap = useMutation(api.admin.setUserCap);
  const setUserRole = useMutation(api.admin.setUserRole);

  if (data === undefined) {
    return (
      <section className="mm-card rounded-xl p-6 text-sm text-[#5E564F]">Loading members…</section>
    );
  }

  return (
    <section className="mm-card mm-fade-up rounded-xl p-6">
      <div className="flex items-center gap-2.5">
        <Users className="h-4 w-4 text-[#D2452B]" />
        <h2 className="text-sm font-medium text-[#15110E]">Members</h2>
        <span className="rounded-full border border-[rgba(21,17,14,0.1)] px-2 py-0.5 text-[9px] uppercase tracking-widest text-[#5E564F]">
          admin
        </span>
      </div>

      {/* ── Self-registration note ── */}
      <p className="mt-4 rounded-lg border border-[rgba(21,17,14,0.08)] bg-[rgba(21,17,14,0.02)] px-4 py-3 text-[11px] text-[#5E564F]">
        Anyone with an <span className="text-[#3A332D]">@madmonkeyhostels.com</span> email can
        create their own account — no invites needed. New members start as{" "}
        <span className="text-[#3A332D]">User</span> with a $50/month cap; adjust role and cap below.
      </p>

      {/* ── Members table ── */}
      <div className="mt-6">
        <p className="text-[11px] font-medium text-[#3A332D]">All members ({data.users.length})</p>
        <div className="mt-2 overflow-hidden rounded-lg border border-[rgba(21,17,14,0.08)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[rgba(21,17,14,0.08)] text-[10px] uppercase tracking-wide text-[#5E564F]">
                <th className="px-3 py-2 text-left font-medium">Member</th>
                <th className="px-3 py-2 text-left font-medium">Role</th>
                <th className="px-3 py-2 text-left font-medium">Spend cap ($/mo)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(21,17,14,0.06)]">
              {data.users.map((u) => (
                <MemberRow
                  key={u._id}
                  u={u}
                  isMe={u._id === data.meId}
                  onCap={async (id, c) => {
                    await setUserCap({ userId: id, monthlyCapUsd: c });
                  }}
                  onRole={async (id, r) => {
                    await setUserRole({ userId: id, role: r });
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function MemberRow({
  u,
  isMe,
  onCap,
  onRole,
}: {
  u: Member;
  isMe: boolean;
  onCap: (userId: Id<"users">, cap: number) => Promise<void>;
  onRole: (userId: Id<"users">, role: string) => Promise<void>;
}) {
  const [cap, setCap] = useState(u.monthlyCapUsd);
  const [savingCap, setSavingCap] = useState(false);
  const [savedCap, setSavedCap] = useState(false);
  const dirty = Math.round(cap) !== u.monthlyCapUsd;

  async function saveCap() {
    if (!dirty || savingCap) return;
    setSavingCap(true);
    try {
      await onCap(u._id, Math.max(0, Math.round(cap)));
      setSavedCap(true);
      setTimeout(() => setSavedCap(false), 1500);
    } finally {
      setSavingCap(false);
    }
  }

  return (
    <tr className="text-[#3A332D]">
      <td className="px-3 py-2.5">
        <div className="text-[#15110E]">
          {u.name || u.email}
          {isMe && <span className="ml-2 text-[10px] text-[#D2452B]">you</span>}
        </div>
        {u.name && <div className="text-[11px] text-[#5E564F]">{u.email}</div>}
      </td>
      <td className="px-3 py-2.5">
        {isMe ? (
          <span className="rounded-full border border-[rgba(21,17,14,0.1)] px-2 py-0.5 text-[10px] uppercase tracking-widest text-[#5E564F]">
            {u.role}
          </span>
        ) : (
          <select
            defaultValue={u.role}
            onChange={(e) => void onRole(u._id, e.target.value)}
            className="mm-field rounded-lg px-2 py-1 text-xs text-[#15110E]"
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        )}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[#5E564F]">$</span>
          <input
            type="number"
            min={0}
            value={cap}
            onChange={(e) => setCap(Number(e.target.value) || 0)}
            className="mm-field w-20 rounded-lg px-2 py-1 text-xs text-[#15110E]"
          />
          <button
            type="button"
            onClick={saveCap}
            disabled={!dirty || savingCap}
            className={`flex items-center rounded-md px-2 py-1 text-[11px] transition-colors disabled:opacity-40 ${
              dirty ? "bg-[#D2452B]/20 text-[#E8553A] hover:bg-[#D2452B]/30" : "text-[#5E564F]"
            }`}
          >
            {savingCap ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : savedCap ? (
              <Check className="h-3 w-3 text-emerald-400" />
            ) : (
              "Save"
            )}
          </button>
        </div>
      </td>
    </tr>
  );
}
