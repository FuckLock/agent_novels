import { getChatHistory, clearChatHistory } from '@/app/lib/novels';
import { enforceAccess } from '@/app/lib/server/security/access-control';
import {
  clearAgentConversations,
  listAgentConversations,
} from '@/app/lib/server/script/text-artifact-service';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name } = await params;
  const decodedName = decodeURIComponent(name);

  try {
    const dbMessages = await listAgentConversations(decodedName);
    const messages = dbMessages.length > 0 ? dbMessages : await getChatHistory(decodedName);
    return Response.json({ messages });
  } catch {
    return Response.json({ messages: [] });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name } = await params;
  const decodedName = decodeURIComponent(name);

  try {
    await clearChatHistory(decodedName);
    await clearAgentConversations(decodedName);
    return Response.json({ success: true });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
