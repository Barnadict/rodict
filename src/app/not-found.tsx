import Link from "next/link";
import { Compass } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <Compass className="size-8 text-muted-foreground" aria-hidden="true" />
      <h1 className="text-xl font-semibold tracking-tight">Page not found</h1>
      <p className="max-w-md text-muted-foreground">
        This game, genre, or page doesn&apos;t exist — it may have never been tracked, or the link
        is off.
      </p>
      <Button render={<Link href="/" />} className="mt-2">
        Back to dashboard
      </Button>
    </div>
  );
}
