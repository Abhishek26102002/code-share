import { CodeRoom } from "@/components/code-room";

export default async function RoomPage({
  params
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;

  return <CodeRoom roomId={roomId} />;
}
