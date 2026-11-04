"use client";

import { cn } from "@/lib/utils";

interface AnimatedBorderProps {
  className?: string;
}

export const AnimatedBorder = ({ className }: AnimatedBorderProps) => {
  return (
    <>
      <style jsx>{`
        @property --angle {
          syntax: "<angle>";
          initial-value: 0deg;
          inherits: false;
        }

        @keyframes border-rotate {
          from {
            --angle: 0deg;
          }
          to {
            --angle: 360deg;
          }
        }

        .animate-border-mask {
          animation: border-rotate 2s linear infinite;
          mask-image: conic-gradient(
            from var(--angle),
            transparent 70%,
            black 90%,
            transparent 100%
          );
        }
      `}</style>
      <div
        className={cn(
          "pointer-events-none absolute inset-0 rounded-[inherit] animate-border-mask z-10",
          className,
        )}
      >
        <div
          className="absolute inset-0 rounded-[inherit] border border-blue-400"
          style={{
            boxShadow: "0 0 6px 1px #3b82f6, inset 0 0 2px 0 #3b82f6",
          }}
        />
      </div>
    </>
  );
};
