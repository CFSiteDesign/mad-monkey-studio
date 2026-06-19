/* eslint-disable @next/next/no-img-element */

/**
 * Mad Monkey wordmark.
 * variant="white" — white version for dark backgrounds (studio shell, auth page)
 * variant="black" — black version for light backgrounds
 */
export function BrandLogo({
  className = "h-8 w-auto",
  variant = "white",
}: {
  className?: string;
  variant?: "white" | "black";
}) {
  return (
    <img
      src={variant === "black" ? "/mm-logo-black.png" : "/mm-logo-white.png"}
      alt="Mad Monkey"
      className={className}
    />
  );
}
