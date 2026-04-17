import Moralis from "moralis";
import { ethers } from "ethers";

let initialized = false;

export async function initMoralis() {
  if (!initialized) {
    await Moralis.start({ apiKey: process.env.MORALIS_API_KEY! });
    initialized = true;
  }
}

export interface WalletBalances {
  usdtBalance: string;
  usdtBalanceFormatted: string;
  bnbBalance: string;
  bnbBalanceFormatted: string;
  usdtUsdValue: string;
}

const USDT_CONTRACT = "0x55d398326f99059fF775485246999027B3197955";
const BSC_CHAIN = "0x38"; // 56 in hex
const ETHERSCAN_API = "https://api.etherscan.io/v2/api"; // Works for all chains including BSC
const ETHERSCAN_API_KEY = "XVRBVR648F49HREW28J6UB34GNMR8ZG3S2";

export async function getWalletBalances(address: string): Promise<WalletBalances> {
  try {
    return await getWalletBalancesEtherscan(address);
  } catch (etherscanErr) {
    console.warn("Etherscan API failed, falling back to Moralis:", etherscanErr);
    try {
      return await getWalletBalancesMoralis(address);
    } catch (moralisErr) {
      console.warn("Moralis failed, falling back to RPC:", moralisErr);
      return getWalletBalancesRPC(address);
    }
  }
}

async function getWalletBalancesEtherscan(address: string): Promise<WalletBalances> {
  try {
    console.log(`[Etherscan API] Fetching balances for: ${address}`);

    // Normalize address
    const normalizedAddress = ethers.getAddress(address);

    // Get BNB balance (chainid=56 for BSC)
    const bnbResponse = await fetch(
      `${ETHERSCAN_API}?chainid=56&module=account&action=balance&address=${normalizedAddress}&tag=latest&apikey=${ETHERSCAN_API_KEY}`
    );
    const bnbData = (await bnbResponse.json()) as { status: string; result: string };
    if (bnbData.status !== "1") {
      throw new Error(`BNB balance API error: ${bnbData.result}`);
    }
    const bnbBalance = bnbData.result || "0";
    const bnbFormatted = (Number(bnbBalance) / 1e18).toFixed(6);

    // Get USDT balance via token balance API (chainid=56 for BSC)
    const usdtResponse = await fetch(
      `${ETHERSCAN_API}?chainid=56&module=account&action=tokenbalance&contractaddress=${USDT_CONTRACT}&address=${normalizedAddress}&tag=latest&apikey=${ETHERSCAN_API_KEY}`
    );
    const usdtData = (await usdtResponse.json()) as { status: string; result: string };
    if (usdtData.status !== "1") {
      throw new Error(`USDT balance API error: ${usdtData.result}`);
    }
    const usdtBalance = usdtData.result || "0";
    const usdtFormatted = (Number(usdtBalance) / 1e18).toFixed(4);

    console.log(`[Etherscan API] Success: BNB=${bnbFormatted}, USDT=${usdtFormatted}`);

    return {
      usdtBalance: usdtBalance,
      usdtBalanceFormatted: usdtFormatted,
      bnbBalance: bnbBalance,
      bnbBalanceFormatted: bnbFormatted,
      usdtUsdValue: usdtFormatted,
    };
  } catch (err) {
    console.error("[Etherscan API] Failed:", err);
    throw err;
  }
}

async function getWalletBalancesMoralis(address: string): Promise<WalletBalances> {
  try {
    await initMoralis();

    const [tokenResponse, nativeResponse] = await Promise.all([
      Moralis.EvmApi.token.getWalletTokenBalances({
        address,
        chain: BSC_CHAIN,
        tokenAddresses: [USDT_CONTRACT],
      }),
      Moralis.EvmApi.balance.getNativeBalance({
        address,
        chain: BSC_CHAIN,
      }),
    ]);

    const usdtToken = tokenResponse.result.find(
      (t) => t.token?.contractAddress.checksum.toLowerCase() === USDT_CONTRACT.toLowerCase()
    );

    const usdtRaw = usdtToken ? String((usdtToken as unknown as { amount: string }).amount ?? "0") : "0";
    const usdtFormatted = (Number(usdtRaw) / 1e18).toFixed(4);

    const bnbRaw = String((nativeResponse.result as unknown as { balance: { value: { toString(): string } } }).balance?.value?.toString() ?? "0");
    const bnbFormatted = (Number(bnbRaw) / 1e18).toFixed(6);

    console.log(`[Moralis] Success: BNB=${bnbFormatted}, USDT=${usdtFormatted}`);

    return {
      usdtBalance: usdtRaw,
      usdtBalanceFormatted: usdtFormatted,
      bnbBalance: bnbRaw,
      bnbBalanceFormatted: bnbFormatted,
      usdtUsdValue: usdtFormatted,
    };
  } catch (err) {
    console.error("[Moralis] Failed:", err);
    throw err;
  }
}

async function getWalletBalancesRPC(address: string): Promise<WalletBalances> {
  const provider = new ethers.JsonRpcProvider(process.env.BSC_RPC_URL ?? "https://bsc-dataseed.binance.org/");

  const USDT_ABI = [
    "function balanceOf(address account) public view returns (uint256)",
    "function decimals() public view returns (uint8)",
  ];

  try {
    console.log(`[RPC Fallback] Fetching balances for: ${address}`);
    
    // Validate and normalize address
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
    // Return zero balances as last resort (won't hang)
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
  await initMoralis();

  // Fetch gas price from BSC RPC directly
  const rpcResponse = await fetch(process.env.BSC_RPC_URL ?? "https://bsc-dataseed.binance.org/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "eth_gasPrice", params: [], id: 1 }),
  });
  const rpcData = await rpcResponse.json();
  const gasPriceWei = parseInt(rpcData.result, 16);
  const gasPriceGwei = (gasPriceWei / 1e9).toFixed(2);

  // transferFrom gas estimate ~65000 units
  const gasCostBnb = (gasPriceWei * 65000) / 1e18;

  // Approximate BNB price in USD — fetched via Moralis token price
  let bnbPriceUsd = 600; // fallback
  try {
    const priceResponse = await Moralis.EvmApi.token.getTokenPrice({
      address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", // WBNB
      chain: BSC_CHAIN,
    });
    bnbPriceUsd = priceResponse.result.usdPrice ?? 600;
  } catch {
    // use fallback
  }

  const gasCostUsdt = (gasCostBnb * bnbPriceUsd).toFixed(4);

  return { gweiPrice: gasPriceGwei, gasCostUsdt };
}
