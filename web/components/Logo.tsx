"use client";

import Image from "next/image";

export default function Logo({ size = 32 }: { size?: number; tone?: "paper" | "amber" }) {
  return (
    <Image
      src="/nion-mark.png"
      alt="Nion"
      width={size}
      height={size}
      priority
      style={{ display: "block", objectFit: "contain" }}
    />
  );
}
