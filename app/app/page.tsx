import Image from "next/image";

export default function Home() {
  return (
    <main className="flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center gap-10 px-6 text-center">
      <Image
        src="/logo.svg"
        alt="SIRENRUN, ride or bust"
        width={632}
        height={180}
        priority
        unoptimized
        className="h-auto w-full max-w-md"
      />
      <div className="space-y-2">
        <p className="text-lg text-balance">Drive an onchain getaway. Trade how long it lasts.</p>
        <p className="text-sm text-muted">Devnet build in progress.</p>
      </div>
    </main>
  );
}
