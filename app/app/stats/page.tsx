import type { Metadata } from "next";
import { StatsDashboard } from "../../components/stats-dashboard";

export const metadata: Metadata = { title: "Stats · SIRENRUN" };

export default function StatsPage() {
  return <StatsDashboard />;
}
