"use client";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/**
 * A table row that opens `href` when clicked anywhere, with a chevron at the end. Clicks on
 * switches, checkboxes, buttons and links inside the row do their own thing instead.
 * Keyboard users reach the editor through the link in the name cell (or Enter on the row).
 */
export function RowLink({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  const router = useRouter();
  const open = () => router.push(href, { scroll: false });
  return (
    <tr
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a,button,input,label,[role=switch],[data-row-ignore]")) return;
        if (window.getSelection()?.toString()) return; // selecting text, not opening
        open();
      }}
      className={`group cursor-pointer transition-colors duration-150 hover:bg-surface-2/70 ${className}`}
    >
      {children}
      <td className="w-10 pr-3 text-right text-ink-2/40 transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-ink-2">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="inline">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </td>
    </tr>
  );
}
