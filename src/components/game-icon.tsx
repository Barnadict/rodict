import Image from "next/image";
import { Gamepad2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A game's small Roblox icon for lists (Task #103), from the `ICON_SIZE.small`
 * thumbnails. Falls back to a neutral tile when Roblox has no icon.
 */
export function GameIcon({
  src,
  size = 32,
  className,
}: {
  src: string | null | undefined;
  size?: number;
  className?: string;
}) {
  const box = cn("shrink-0 overflow-hidden rounded-md bg-muted", className);
  if (!src) {
    return (
      <span
        aria-hidden="true"
        className={cn(box, "inline-flex items-center justify-center text-muted-foreground")}
        style={{ width: size, height: size }}
      >
        <Gamepad2 className="size-1/2" />
      </span>
    );
  }
  return (
    <Image
      src={src}
      alt=""
      width={size}
      height={size}
      className={cn(box, "object-cover")}
      unoptimized
    />
  );
}
