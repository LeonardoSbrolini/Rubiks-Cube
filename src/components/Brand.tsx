/** Logo: cubo isométrico (mesmo desenho do favicon). */
export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/logo.svg" alt="" aria-hidden className={`logo-mark drop-shadow-[0_4px_14px_rgba(167,139,250,0.35)] ${className}`} />
  );
}
