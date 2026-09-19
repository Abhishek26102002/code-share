import * as React from "react";
import { cn } from "@/lib/utils";

const controlClassName =
  "h-11 w-full rounded-full border border-[var(--input)] bg-[var(--card-strong)] px-4 text-sm text-[var(--foreground)] outline-none transition-colors placeholder:text-[var(--muted)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-60";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(controlClassName, className)} {...props} />
  )
);
Input.displayName = "Input";

const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select ref={ref} className={cn(controlClassName, "pr-3", className)} {...props}>
    {children}
  </select>
));
Select.displayName = "Select";

function Field({
  label,
  hint,
  children
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.2em] text-[var(--muted)]">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs text-[var(--muted)]">{hint}</span> : null}
    </label>
  );
}

export { Input, Select, Field };
