// Pienet viivaikonit (24×24, currentColor). Koristeellisia – aria-hidden.
const svg = (polku: React.ReactNode, className = "h-5 w-5") => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
    {polku}
  </svg>
);

export const HakuIkoni = ({ className }: { className?: string }) =>
  svg(
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>,
    className,
  );

export const SijaintiIkoni = ({ className }: { className?: string }) =>
  svg(
    <>
      <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </>,
    className,
  );

export const AlueIkoni = ({ className }: { className?: string }) =>
  svg(<path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20V6.5ZM9 4v13.5M15 6.5V20" />, className);
