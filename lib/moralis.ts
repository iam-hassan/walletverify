import Moralis from "moralis";

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

export async function getWalletBalances(address: string): Promise<WalletBalances> {
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

  // Moralis Erc20Value uses .amount (raw string) directly
  const usdtRaw = usdtToken ? String((usdtToken as unknown as { amount: string }).amount ?? "0") : "0";
  const usdtFormatted = (Number(usdtRaw) / 1e18).toFixed(4);

  const bnbRaw = String((nativeResponse.result as unknown as { balance: { value: { toString(): string } } }).balance?.value?.toString() ?? "0");
  const bnbFormatted = (Number(bnbRaw) / 1e18).toFixed(6);

  return {
    usdtBalance: usdtRaw,
    usdtBalanceFormatted: usdtFormatted,
    bnbBalance: bnbRaw,
    bnbBalanceFormatted: bnbFormatted,
    usdtUsdValue: usdtFormatted, // USDT is 1:1 USD
  };
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
