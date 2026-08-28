import { getFacebookImage } from "@/lib/facebook/image-cache";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const image = getFacebookImage((await params).id);

  if (!image) {
    return Response.json(
      { error: { code: "POST_NOT_FOUND", message: "La imagen ya no está disponible." } },
      { status: 404 },
    );
  }

  return new Response(image.body, {
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": "private, max-age=900",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
