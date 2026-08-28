import { FacebookError, facebookErrorResponse } from "@/lib/facebook/errors";
import { getFacebookPost } from "@/lib/facebook/navigation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 4_096) {
      throw new FacebookError("INVALID_URL", "La solicitud es demasiado grande.", 413);
    }

    const body = (await request.json().catch(() => null)) as { url?: unknown } | null;
    return Response.json({ post: await getFacebookPost(body?.url) });
  } catch (error) {
    return facebookErrorResponse(error);
  }
}
