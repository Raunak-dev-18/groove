import type { NextRequest } from "next/server";
import { db } from "@/db";
import { jamMessages } from "@/db/schema";
import { fail, handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { getJamMessages, isJamParticipant } from "@/lib/queries";

/** Chat history / polling. ?after=<ISO> returns newer messages only. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireUser(req);
    const { id } = await params;
    if (!(await isJamParticipant(id, session.user.id))) {
      return fail("You are not in this jam", 403);
    }
    const after = new URL(req.url).searchParams.get("after");
    const messages = await getJamMessages(id, after, after ? 100 : 50);
    return ok({ messages });
  });
}

/** Send a chat message. Body: { content } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireUser(req);
    const { id } = await params;
    if (!(await isJamParticipant(id, session.user.id))) {
      return fail("You are not in this jam", 403);
    }
    const body = await req.json().catch(() => ({}));
    const content = (body.content ?? "").toString().trim().slice(0, 500);
    if (!content) return fail("Message cannot be empty", 400);

    const [msg] = await db
      .insert(jamMessages)
      .values({ jamId: id, userId: session.user.id, content })
      .returning();

    return ok(
      {
        message: {
          id: msg.id,
          userId: session.user.id,
          userName: session.user.name,
          userImage: session.user.image ?? null,
          content: msg.content,
          createdAt: msg.createdAt.toISOString(),
        },
      },
      201,
    );
  });
}
