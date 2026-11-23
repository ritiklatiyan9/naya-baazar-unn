import handler from "vinext/server/fetch-handler";
import { handleApi } from "../src/server-api.mjs";

export default {
  fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    if (new URL(request.url).pathname.startsWith("/api/")) return handleApi(request, env);
    return handler.fetch(request, env, ctx);
  },
};
