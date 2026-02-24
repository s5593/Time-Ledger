import React from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  isLoading?: boolean;
};

export function Button({
  variant = "secondary",
  isLoading = false,
  disabled,
  children,
  className,
  ...rest
}: Props) {
  const isDisabled = disabled || isLoading;

  const base =
    "tl-btn";
  const v =
    variant === "primary"
      ? "tl-btn--primary"
      : variant === "ghost"
        ? "tl-btn--ghost"
        : "tl-btn--secondary";

  return (
    <button
      {...rest}
      disabled={isDisabled}
      className={[base, v, className].filter(Boolean).join(" ")}
      aria-busy={isLoading ? "true" : undefined}
    >
      {isLoading ? "Generating…" : children}
    </button>
  );
}
