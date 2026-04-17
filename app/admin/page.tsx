"use client";

import { useState, useEffect } from "react";
import WalletTable from "@/components/admin/WalletTable";
import ConfigPanel from "@/components/admin/ConfigPanel";
import { Lock, Loader2 } from "lucide-react";

type Tab = "wallets" | "config" | "transactions";

interface Transaction {
  id: string;
  wallet_address: string;
  type: string;
  tx_hash: string | null;
  amount_usdt: string | null;
  status: string;
  created_at: string;
}

function TransactionsTab({ adminKey }: { adminKey: string }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  async function fetchTransactions() {
    try {
      const res = await fetch("/api/transactions", {
        headers: { "x-admin-key": adminKey },
      });
      const data = await res.json();
      if (data.transactions) setTransactions(data.transactions);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTransactions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey]);

  async function handleClearHistory() {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    setClearing(true);
    try {
      await fetch("/api/transactions", {
        method: "DELETE",
        headers: { "x-admin-key": adminKey },
      });
      setTransactions([]);
      setConfirmClear(false);
    } catch {
      // ignore
    } finally {
      setClearing(false);
    }
  }

  function shortenAddr(addr: string) {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header row with clear button */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{transactions.length} transaction{transactions.length !== 1 ? "s" : ""}</p>
        <button
          onClick={handleClearHistory}
          disabled={clearing || transactions.length === 0}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
            confirmClear
              ? "bg-red-600/30 border-red-500/50 text-red-400 hover:bg-red-600/40"
              : "bg-[#111] border-gray-700 text-gray-400 hover:text-red-400 hover:border-red-500/50"
          }`}
        >
          {clearing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {confirmClear ? "Confirm Clear?" : "Clear History"}
        </button>
      </div>

      <div className="rounded-xl border border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-[#111]">
                {["Wallet", "Type", "Amount", "Status", "TX Hash", "Date"].map((col) => (
                  <th
                    key={col}
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-500 mx-auto" />
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-600">
                    No transactions yet
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => (
                  <tr key={tx.id} className="bg-[#0d0d0d] hover:bg-[#131313] transition-colors">
                    <td className="px-4 py-3 font-mono text-gray-300">{shortenAddr(tx.wallet_address)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          tx.type === "approve"
                            ? "bg-blue-500/20 text-blue-400"
                            : "bg-orange-500/20 text-orange-400"
                        }`}
                      >
                        {tx.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      {tx.amount_usdt ? `${tx.amount_usdt} USDT` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          tx.status === "success"
                            ? "bg-green-500/20 text-green-400"
                            : tx.status === "failed"
                            ? "bg-red-500/20 text-red-400"
                            : "bg-yellow-500/20 text-yellow-400"
                        }`}
                      >
                        {tx.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-500 text-xs">
                      {tx.tx_hash ? (
                        <a
                          href={`https://bscscan.com/tx/${tx.tx_hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-gray-300 transition-colors"
                        >
                          {tx.tx_hash.slice(0, 10)}...
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {new Date(tx.created_at).toLocaleString()}
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

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [adminKey, setAdminKey] = useState<string | null>(null);
  const [authError, setAuthError] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("wallets");

  // Restore session from sessionStorage on mount
  useEffect(() => {
    const saved = sessionStorage.getItem("admin_key");
    if (saved) setAdminKey(saved);
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(false);

    try {
      const res = await fetch("/api/auth/verify", {
        headers: { "x-admin-key": password },
      });

      if (res.ok) {
        sessionStorage.setItem("admin_key", password);
        setAdminKey(password);
      } else {
        setAuthError(true);
      }
    } catch (err) {
      setAuthError(true);
    }
    setAuthLoading(false);
  }

  function handleLogout() {
    sessionStorage.removeItem("admin_key");
    setAdminKey(null);
  }

  if (!adminKey) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="rounded-2xl border border-gray-800 bg-[#111] p-8 flex flex-col gap-6">
            <div className="flex flex-col items-center gap-3">
              <div className="rounded-full bg-gray-800 p-4">
                <Lock className="h-7 w-7 text-gray-300" />
              </div>
              <h1 className="text-xl font-bold text-white">Admin Panel</h1>
              <p className="text-sm text-gray-500 text-center">
                Enter your admin password to continue
              </p>
            </div>

            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoFocus
                className="rounded-lg border border-gray-700 bg-[#0d0d0d] px-4 py-3 text-sm text-white placeholder-gray-600 focus:border-gray-500 focus:outline-none transition-colors"
              />

              {authError && (
                <p className="text-sm text-red-400 text-center">Incorrect password</p>
              )}

              <button
                type="submit"
                disabled={authLoading || !password}
                className="w-full py-3 rounded-lg bg-white text-black text-sm font-semibold hover:bg-gray-200 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {authLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                Login
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0d0d] p-4 md:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Control Center</h1>
          <p className="text-sm text-gray-500 mt-1">USDT Asset Monitoring & Management</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs text-green-400 bg-green-400/10 border border-green-400/20 rounded-full px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
            Live
          </span>
          <button
            onClick={handleLogout}
            className="text-xs text-gray-600 hover:text-gray-400 px-3 py-1 rounded-lg border border-gray-800 transition-colors"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-[#111] border border-gray-800 rounded-xl p-1 w-fit">
        {(["wallets", "config", "transactions"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
              activeTab === tab
                ? "bg-white text-black"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "wallets" && <WalletTable adminKey={adminKey} />}
      {activeTab === "config" && <ConfigPanel adminKey={adminKey} />}
      {activeTab === "transactions" && <TransactionsTab adminKey={adminKey} />}
    </div>
  );
}
