import { facebookErrorResponse } from "@/lib/facebook/errors";
import { checkSession, resetSession, startLogin } from "@/lib/facebook/session";

export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json({ status: await checkSession() });
  } catch (error) {
    return facebookErrorResponse(error);
  }
}

export async function POST() {
  try {
    return Response.json({ status: await startLogin() });
  } catch (error) {
    return facebookErrorResponse(error);
  }
}

export async function DELETE() {
  try {
    return Response.json({ status: await resetSession() });
  } catch (error) {
    return facebookErrorResponse(error);
  }
}
