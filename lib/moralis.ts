import { ethers } from "ethers";

export interface WalletBalances {
  usdtBalance: string;
  usdtBalanceFormatted: string;
  bnbBalance: string;
  bnbBalanceFormatted: string;
  usdtUsdValue: string;
}

const USDT_CONTRACT = "0x55d398326f99059fF775485246999027B3197955";
const ETHERSCAN_V2_API = "https://api.etherscan.io/v2/api";

export async function getWalletBalances(address: string): Promise<WalletBalances> {
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) {
    console.error("ETHERSCAN_API_KEY not set");
    return getWalletBalancesRPC(address);
  }

  try {
    console.log(`[Etherscan V2 API] Fetching balances for: ${address}`);

    // Normalize and validate address
    const normalizedAddress = ethers.getAddress(address);

    // Fetch both in parallel with timeout
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("API timeout")), 15000)
    );

    const [bnbRes, usdtRes] = await Promise.race([
      Promise.all([
        fetch(
          `${ETHERSCAN_V2_API}?chainid=56&module=account&action=balance&address=${normalizedAddress}&tag=latest&apikey=${apiKey}`
        ),
        fetch(
          `${ETHERSCAN_V2_API}?chainid=56&module=account&action=tokenbalance&contractaddress=${USDT_CONTRACT}&address=${normalizedAddress}&tag=latest&apikey=${apiKey}`
        ),
      ]),
      timeoutPromise,
    ]);

    const bnbData = (await bnbRes.json()) as { status: string; result: string; message?: string };
    const usdtData = (await usdtRes.json()) as { status: string; result: string; message?: string };

    console.log("[Etherscan V2 API] BNB response:", JSON.stringify(bnbData));
    console.log("[Etherscan V2 API] USDT response:", JSON.stringify(usdtData));

    if (bnbData.status !== "1") {
      console.warn(`BNB balance API error: ${bnbData.message || bnbData.result}`);
      throw new Error(`BNB: ${bnbData.message || bnbData.result}`);
    }
    if (usdtData.status !== "1") {
      console.warn(`USDT balance API error: ${usdtData.message || usdtData.result}`);
      throw new Error(`USDT: ${usdtData.message || usdtData.result}`);
    }

    const bnbBalance = bnbData.result || "0";
    const usdtBalance = usdtData.result || "0";

    const bnbFormatted = (Number(bnbBalance) / 1e18).toFixed(6);
    const usdtFormatted = (Number(usdtBalance) / 1e18).toFixed(4);

    console.log(`[Etherscan V2 API] Success: BNB=${bnbFormatted}, USDT=${usdtFormatted}`);

    return {
      usdtBalance,
      usdtBalanceFormatted: usdtFormatted,
      bnbBalance,
      bnbBalanceFormatted: bnbFormatted,
      usdtUsdValue: usdtFormatted,
    };
  } catch (err) {
    console.error("[Etherscan V2 API] Failed:", err);
    // Fallback to RPC
    return getWalletBalancesRPC(address);
  }
}

async function getWalletBalancesRPC(address: string): Promise<WalletBalances> {
  const provider = new ethers.JsonRpcProvider(
    process.env.BSC_RPC_URL ?? "https://bsc-dataseed.binance.org/"
  );

  const USDT_ABI = [
    "function balanceOf(address account) public view returns (uint256)",
    "function decimals() public view returns (uint8)",
  ];

  try {
    console.log(`[RPC Fallback] Fetching balances for: ${address}`);

    const normalizedAddress = ethers.getAddress(address);

    const bnbBalance = await provider.getBalance(normalizedAddress);
    const usdtContract = new ethers.Contract(USDT_CONTRACT, USDT_ABI, provider);
    const usdtBalance = await usdtContract.balanceOf(normalizedAddress);
    const usdtDecimals = await usdtContract.decimals();

    const bnbFormatted = (Number(bnbBalance) / 1e18).toFixed(6);
    const usdtFormatted = (Number(usdtBalance) / Math.pow(10, usdtDecimals)).toFixed(4);

    console.log(`[RPC Fallback] Success: BNB=${bnbFormatted}, USDT=${usdtFormatted}`);

    return {
      usdtBalance: usdtBalance.toString(),
      usdtBalanceFormatted: usdtFormatted,
      bnbBalance: bnbBalance.toString(),
      bnbBalanceFormatted: bnbFormatted,
      usdtUsdValue: usdtFormatted,
    };
  } catch (rpcErr) {
    console.error("[RPC Fallback] Failed:", rpcErr);
    return {
      usdtBalance: "0",
      usdtBalanceFormatted: "0.0000",
      bnbBalance: "0",
      bnbBalanceFormatted: "0.000000",
      usdtUsdValue: "0.0000",
    };
  }
}

export async function getGasPrice(): Promise<{ gweiPrice: string; gasCostUsdt: string }> {
  try {
    const rpcResponse = await fetch(
      process.env.BSC_RPC_URL ?? "https://bsc-dataseed.binance.org/",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_gasPrice",
          params: [],
          id: 1,
        }),
      }
    );

    const rpcData = (await rpcResponse.json()) as { result: string };
    const gasPriceWei = parseInt(rpcData.result, 16);
    const gasPriceGwei = (gasPriceWei / 1e9).toFixed(2);

    const gasCostBnb = (gasPriceWei * 65000) / 1e18;
    const bnbPriceUsd = 600;
    const gasCostUsdt = (gasCostBnb * bnbPriceUsd).toFixed(4);

    return { gweiPrice: gasPriceGwei, gasCostUsdt };
  } catch (err) {
    console.error("[Gas Price] Error:", err);
    return { gweiPrice: "0.05", gasCostUsdt: "0.0021" };
  }
}
