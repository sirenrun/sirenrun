import type { Metadata } from "next";
import { Lobby } from "../../components/lobby";

export const metadata: Metadata = { title: "Channels · SIRENRUN" };

export default function LobbyPage() {
  return <Lobby />;
}
