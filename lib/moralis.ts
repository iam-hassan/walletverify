import { ethers } from "ethers";

export interface WalletBalances {
  usdtBalance: string;
  usdtBalanceFormatted: string;
  bnbBalance: string;
  bnbBalanceFormatted: string;
  usdtUsdValue: string;
}

const USDT_CONTRACT = "0x55d398326f99059fF775485246999027B3197955";
const BSC_RPC = "https://bsc-dataseed.binance.org/";

export async function getWalletBalances(address: string): Promise<WalletBalances> {
  try {
    console.log(`[Direct RPC] Fetching balances for: ${address}`);

    // Normalize and validate address
    const normalizedAddress = ethers.getAddress(address);

    const provider = new ethers.JsonRpcProvider(process.env.BSC_RPC_URL || BSC_RPC);

    // Get BNB balance
    const bnbBalance = await provider.getBalance(normalizedAddress);

    // Get USDT balance
    const USDT_ABI = ["function balanceOf(address) view returns (uint256)"];
    const usdtContract = new ethers.Contract(USDT_CONTRACT, USDT_ABI, provider);
    const usdtBalance = await usdtContract.balanceOf(normalizedAddress);

    const bnbFormatted = (Number(bnbBalance) / 1e18).toFixed(6);
    const usdtFormatted = (Number(usdtBalance) / 1e18).toFixed(4);

    console.log(`[Direct RPC] Success: BNB=${bnbFormatted}, USDT=${usdtFormatted}`);

    return {
      usdtBalance: usdtBalance.toString(),
      usdtBalanceFormatted: usdtFormatted,
      bnbBalance: bnbBalance.toString(),
      bnbBalanceFormatted: bnbFormatted,
      usdtUsdValue: usdtFormatted,
    };
  } catch (err) {
    console.error("[Direct RPC] Error:", err);
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
    const provider = new ethers.JsonRpcProvider(process.env.BSC_RPC_URL || BSC_RPC);
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice || BigInt(0);
    const gasPriceGwei = (Number(gasPrice) / 1e9).toFixed(2);

    const gasCostBnb = (Number(gasPrice) * 65000) / 1e18;
    const bnbPriceUsd = 600;
    const gasCostUsdt = (gasCostBnb * bnbPriceUsd).toFixed(4);

    return { gweiPrice: gasPriceGwei, gasCostUsdt };
  } catch (err) {
    console.error("[Gas Price] Error:", err);
    return { gweiPrice: "0.05", gasCostUsdt: "0.0021" };
  }
}
