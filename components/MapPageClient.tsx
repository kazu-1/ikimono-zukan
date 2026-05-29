"use client";

import dynamic from "next/dynamic";
import type { Observation } from "@/types";

const FullMap = dynamic(() => import("./FullMap"), { ssr: false });

interface Props {
  items: Observation[];
}

export default function MapPageClient({ items }: Props) {
  return <FullMap items={items} />;
}
