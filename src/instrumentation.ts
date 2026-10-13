import type { Instrumentation } from "next";
import { logEvent } from "@/lib/logger";

/**
 * Every unhandled server error lands here as structured JSON, which a log
 * drain or error tracker can ingest. Request bodies and headers are never logged.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  logEvent("error", "request.unhandled_error", {
    error,
    digest: (error as { digest?: string }).digest,
    path: request.path,
    method: request.method,
    routeType: context.routeType,
    routePath: context.routePath,
  });
};
