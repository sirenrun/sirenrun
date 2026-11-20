import { ARENAS } from "@sirenrun/sim";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Channel } from "../../../components/channel";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: `CH-${id} · SIRENRUN` };
}

/** Channels are numbered from 1 in the URL; arenas from 0 onchain. */
export default async function ChannelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const channel = Number(id);
  if (!Number.isInteger(channel) || channel < 1 || channel > ARENAS) notFound();
  return <Channel arena={channel - 1} />;
}
