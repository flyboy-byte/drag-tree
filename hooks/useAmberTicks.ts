import { useEffect, useRef } from "react";
import { playAmberTick } from "@/lib/audio";

// Tick whenever another amber lights (Pro Tree: once, Sportsman: three times).
// Turning ambers off, or the tree resetting, is silent.
export function useAmberTicks(tree: { amber1: boolean; amber2: boolean; amber3: boolean }): void {
  const lit = (tree.amber1 ? 1 : 0) + (tree.amber2 ? 1 : 0) + (tree.amber3 ? 1 : 0);
  const prev = useRef(0);
  useEffect(() => {
    if (lit > prev.current) void playAmberTick();
    prev.current = lit;
  }, [lit]);
}
