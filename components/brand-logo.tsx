/* eslint-disable @next/next/no-img-element */

/**
 * Mad Monkey wordmark.
 * variant="black" (default): for the warm white Spotted shell
 * variant="white": for dark backgrounds
 * Uses the 600px copies: the full-size black PNG is 2 MB.
 */
export function BrandLogo({
  className = "h-8 w-auto",
  variant = "black",
}: {
  className?: string;
  variant?: "white" | "black";
}) {
  return (
    <img
      src={variant === "black" ? "/mm-logo-black-hd.png" : "/mm-logo-white-hd.png"}
      alt="Mad Monkey"
      className={className}
    />
  );
}
