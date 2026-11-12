import { handleJob } from "@/lib/jobs/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Delivery only; each other worker has its own schedule and failure domain.
export const GET = (request: Request) => handleJob(request, "messages");
