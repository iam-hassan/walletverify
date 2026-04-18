"use client";

import { useEffect, useState } from "react";
import SendForm from "@/components/send/SendForm";

export default function SendPage() {
  const [onBsc, setOnBsc] = useState<boolean | null>(null);

  useEffect(() => {
    const eth = (window as unknown as { ethereum?: { request(a: { method: string; params?: unknown[] }): Promise<unknown> } }).ethereum;
    if (!eth) {
      // No wallet — show form anyway (desktop or no wallet)
      setOnBsc(true);
      return;
    }

    (async () => {
      try {
        const chainId = await eth.request({ method: "eth_chainId" }) as string;
        if (chainId?.toLowerCase() === "0x38") {
          setOnBsc(true);
          return;
        }

        // Wrong chain — try switch
        try {
          await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x38" }] });
          const after = await eth.request({ method: "eth_chainId" }) as string;
          if (after?.toLowerCase() === "0x38") {
            setOnBsc(true);
            return;
          }
        } catch { /* ignore */ }

        // Switch failed — show the deep link redirect
        setOnBsc(false);
      } catch {
        setOnBsc(true);
      }
    })();
  }, []);

  // Still checking chain
  if (onBsc === null) {
    return (
      <main className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-5">
        <div className="h-10 w-10 rounded-full border-2 border-[#4ade80] border-t-transparent animate-spin" />
      </main>
    );
  }

  // Wrong chain — show redirect instructions
  if (!onBsc) {
    return <BscRedirect />;
  }

  // On BSC — show the form
  return (
    <main className="min-h-screen bg-[#0a0a0a] flex flex-col items-center px-5">
      <div className="w-full max-w-[420px] flex-1 flex flex-col py-10">
        <SendForm />
      </div>
    </main>
  );
}

function BscRedirect() {
  const [appUrl, setAppUrl] = useState("");

  useEffect(() => {
    setAppUrl(window.location.origin + "/send");
  }, []);

  const trustLink = appUrl
    ? `https://link.trustwallet.com/open_url?coin_id=714&url=${encodeURIComponent(appUrl)}`
    : "#";

  // Auto-redirect via trust:// scheme
  useEffect(() => {
    if (!appUrl) return;
    const deepLink = `trust://open_url?coin_id=714&url=${encodeURIComponent(appUrl)}`;
    window.location.href = deepLink;
  }, [appUrl]);

  return (
    <main className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-5">
      <div className="w-full max-w-[420px] flex flex-col items-center gap-6 text-center">
        <div className="text-5xl">🔗</div>
        <h1 className="text-white text-xl font-bold">Switch to BNB Smart Chain</h1>
        <p className="text-gray-400 text-sm leading-relaxed">
          This DApp requires BNB Smart Chain network.
          Tap the button below to reopen with the correct network.
        </p>

        <a
          href={trustLink}
          className="w-full rounded-full bg-[#4ade80] hover:bg-[#22c55e] py-4 text-black font-bold text-base text-center transition-colors"
        >
          Open on BNB Smart Chain
        </a>

        <p className="text-gray-600 text-xs mt-2">
          Or manually switch your wallet network to BNB Smart Chain and refresh this page.
        </p>
      </div>
    </main>
  );
}
