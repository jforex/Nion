import { createPublicClient, createWalletClient, http, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// ── X Layer testnet (chain 1952) ──────────────────────────────────────────
export const xLayerTestnet = defineChain({
  id: 1952,
  name: "X Layer Testnet",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://testrpc.xlayer.tech/terigon"] },
  },
  blockExplorers: {
    default: {
      name: "OKX Explorer",
      url: "https://www.okx.com/web3/explorer/xlayer-test",
    },
  },
  testnet: true,
});

// ── Deployed contract addresses ───────────────────────────────────────────
export const MOCK_USDC_ADDRESS =
  "0x2426e6b69868B5aABb476C01e7ca3b8487Dbe902" as const;
export const TRIAGE_ORACLE_ADDRESS =
  "0x3220eeE91D6C00332899C58A0425F5bbF656d691" as const;

// ── ABIs (only the functions we actually call) ────────────────────────────
export const TRIAGE_ORACLE_ABI = [
  {
    type: "function",
    name: "settleClaim",
    stateMutability: "nonpayable",
    inputs: [
      { name: "policyholder", type: "address" },
      { name: "photoHash", type: "bytes32" },
      { name: "damagePercent", type: "uint8" },
      { name: "payoutAmount", type: "uint256" },
    ],
    outputs: [{ name: "paid", type: "bool" }],
  },
  {
    type: "function",
    name: "settleClaimFrom",
    stateMutability: "nonpayable",
    inputs: [
      { name: "vault", type: "address" },
      { name: "policyholder", type: "address" },
      { name: "photoHash", type: "bytes32" },
      { name: "damagePercent", type: "uint8" },
      { name: "payoutAmount", type: "uint256" },
    ],
    outputs: [{ name: "paid", type: "bool" }],
  },
  {
    type: "function",
    name: "anchored",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "damageThreshold",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const MOCK_USDC_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

// ── Read client (public — anyone can read the chain) ──────────────────────
export const publicClient = createPublicClient({
  chain: xLayerTestnet,
  transport: http(),
});

// ── Write client (agent — signs settlement transactions) ──────────────────
// The agent's private key lives ONLY in .env.local, never in code or git.
export function getAgentWalletClient() {
  const pk = process.env.AGENT_PRIVATE_KEY;
  if (!pk) throw new Error("AGENT_PRIVATE_KEY is not set in .env.local");

  const account = privateKeyToAccount(pk as `0x${string}`);
  return createWalletClient({
    account,
    chain: xLayerTestnet,
    transport: http(),
  });
}