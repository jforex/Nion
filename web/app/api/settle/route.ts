import { NextRequest, NextResponse } from "next/server";
import { keccak256, toBytes } from "viem";
import {
  publicClient,
  getAgentWalletClient,
  TRIAGE_ORACLE_ADDRESS,
  TRIAGE_ORACLE_ABI,
} from "@/lib/contracts";
import { computePayout } from "@/lib/damage";

export async function POST(req: NextRequest) {
  try {
    const {
      policyholder,
      imageBase64,
      damageScore,
      coverageLimitUsd,
      deductibleUsd = 0,
      coverageCode, // optional: insurer-signed { vault, coverage, expiry, nonce, signature }
    } = await req.json();

    // A valid coverage code is authoritative — its signed `coverage` replaces
    // any caller-asserted limit, and the contract caps the payout at it.
    const useCode =
      coverageCode &&
      typeof coverageCode === "object" &&
      /^0x[0-9a-fA-F]{40}$/.test(coverageCode.vault ?? "") &&
      /^0x[0-9a-fA-F]{64}$/.test(coverageCode.nonce ?? "") &&
      typeof coverageCode.signature === "string" &&
      coverageCode.coverage != null &&
      coverageCode.expiry != null;
    const coverageUsd = useCode
      ? Number(coverageCode.coverage) / 1_000_000
      : coverageLimitUsd;

    if (
      !policyholder ||
      !imageBase64 ||
      typeof damageScore !== "number" ||
      typeof coverageUsd !== "number"
    ) {
      return NextResponse.json(
        { error: "policyholder, imageBase64, damageScore, and coverageLimitUsd (or coverageCode) required" },
        { status: 400 }
      );
    }

    const photoHash = keccak256(toBytes(imageBase64));

    const alreadyUsed = await publicClient.readContract({
      address: TRIAGE_ORACLE_ADDRESS,
      abi: TRIAGE_ORACLE_ABI,
      functionName: "anchored",
      args: [photoHash],
    });
    if (alreadyUsed) {
      return NextResponse.json(
        { error: "This photo has already been used for a claim." },
        { status: 409 }
      );
    }

    const payoutAmount = computePayout(damageScore, coverageUsd, deductibleUsd);

    const wallet = getAgentWalletClient();
    const txHash = useCode
      ? await wallet.writeContract({
          address: TRIAGE_ORACLE_ADDRESS,
          abi: TRIAGE_ORACLE_ABI,
          functionName: "settleClaimWithCode",
          args: [
            coverageCode.vault as `0x${string}`,
            policyholder as `0x${string}`,
            BigInt(coverageCode.coverage),
            BigInt(coverageCode.expiry),
            coverageCode.nonce as `0x${string}`,
            coverageCode.signature as `0x${string}`,
            photoHash,
            damageScore,
            payoutAmount,
          ],
        })
      : await wallet.writeContract({
      address: TRIAGE_ORACLE_ADDRESS,
      abi: TRIAGE_ORACLE_ABI,
      functionName: "settleClaim",
      args: [
        policyholder as `0x${string}`,
        photoHash,
        damageScore,
        payoutAmount,
      ],
    });

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    });

    const paid = damageScore >= 40 && payoutAmount > 0n;

    return NextResponse.json({
      txHash,
      photoHash,
      payoutAmount: payoutAmount.toString(),
      paid,
      blockNumber: receipt.blockNumber.toString(),
      explorerUrl: `https://www.okx.com/web3/explorer/xlayer-test/tx/${txHash}`,
    });
  } catch (err: any) {
    console.error("settle error:", err);
    return NextResponse.json(
      { error: err?.shortMessage || err?.message || "internal error" },
      { status: 500 }
    );
  }
}
