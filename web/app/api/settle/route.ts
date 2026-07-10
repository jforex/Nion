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
    } = await req.json();

    if (
      !policyholder ||
      !imageBase64 ||
      typeof damageScore !== "number" ||
      typeof coverageLimitUsd !== "number"
    ) {
      return NextResponse.json(
        { error: "policyholder, imageBase64, damageScore, coverageLimitUsd required" },
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

    const payoutAmount = computePayout(damageScore, coverageLimitUsd, deductibleUsd);

    const wallet = getAgentWalletClient();
    const txHash = await wallet.writeContract({
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
