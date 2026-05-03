import { Loader as LoaderIcon } from "lucide-react";

import { cn } from "@/lib/utils";

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <LoaderIcon
      role="status"
      aria-label="Loading"
      className={cn("spinner-line-fade size-4", className)}
      {...props}
    />
  );
}

export { Spinner };
