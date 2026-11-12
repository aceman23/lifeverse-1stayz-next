import { isJobName } from "@/lib/jobs/catalog";
import { handleJob } from "@/lib/jobs/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request, context: { params: Promise<{ job: string }> }) {
  const { job } = await context.params;
  if (!isJobName(job)) return Response.json({ error: "not_found" }, { status: 404 });
  return handleJob(request, job);
}
