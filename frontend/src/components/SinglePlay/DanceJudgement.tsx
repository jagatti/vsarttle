import type { ReactNode } from "react";
import type { DanceJudgment } from "@/lib/danceBattle";

export type DanceJudgementKind = DanceJudgment | Lowercase<DanceJudgment> |
  "fever-best" | "fever-middle" | "fever-low";

export function DanceJudgement({ kind, className = "", children }: {
  kind: DanceJudgementKind;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <strong className={`dance-judgement-text dance-judgement-${kind.toLowerCase()} ${className}`.trim()}>
      {children}
    </strong>
  );
}
