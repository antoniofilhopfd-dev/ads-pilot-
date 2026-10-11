"use client";
export function ConfirmButton({ message, className, children, ariaLabel }: { message: string; className?: string; children: React.ReactNode; ariaLabel?: string }) {
  return (
    <button type="submit" aria-label={ariaLabel} className={className} onClick={(e) => { if (!confirm(message)) e.preventDefault(); }}>
      {children}
    </button>
  );
}
