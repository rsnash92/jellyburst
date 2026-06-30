import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <div className="flex flex-col items-center gap-6">
        <span className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
          AI Generation Studio
        </span>
        <h1 className="bg-gradient-to-b from-foreground to-muted-foreground bg-clip-text text-6xl font-semibold tracking-tight text-transparent sm:text-7xl">
          JellyBurst
        </h1>
        <p className="max-w-md text-lg leading-8 text-muted-foreground">
          Generate AI images, video, audio and 3D from one fast, asset-first
          studio. One tap to Burst.
        </p>
        <Button size="lg" disabled>
          Coming soon
        </Button>
      </div>
    </main>
  );
}
