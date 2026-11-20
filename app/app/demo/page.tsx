import type { Metadata } from "next";
import { DemoChannel } from "../../components/demo-channel";

export const metadata: Metadata = { title: "Demo run · SIRENRUN" };

export default function DemoPage() {
  return <DemoChannel />;
}
