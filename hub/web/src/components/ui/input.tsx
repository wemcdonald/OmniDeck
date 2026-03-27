import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex h-9 w-full rounded bg-surface-container-high border border-outline-variant px-3 py-2 text-sm font-body text-foreground transition-colors",
        "placeholder:text-muted-foreground",
        "focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
