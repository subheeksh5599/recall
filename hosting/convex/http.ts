import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { registerStaticRoutes } from "@convex-dev/static-hosting";
import { components } from "./_generated/api";

const http = httpRouter();

// The Next.js static export writes each route as `<route>.html`. Serve those for the clean URLs.
// Without this, `/app` has no file extension and the catch-all would fall back to the landing page.
const page = (file: string) =>
  httpAction(async (ctx) => {
    const asset = await ctx.runQuery(components.staticHosting.lib.resolveAssetForHttp, { path: file, spaFallback: false });
    if (!asset?.storageUrl) return new Response("Not Found", { status: 404, headers: { "Content-Type": "text/plain" } });
    const r = await fetch(asset.storageUrl);
    return new Response(r.body, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=0, must-revalidate", "X-Content-Type-Options": "nosniff" },
    });
  });

for (const p of ["/app", "/app/", "/app/index.html"]) http.route({ path: p, method: "GET", handler: page("/app.html") });

registerStaticRoutes(http, components.staticHosting, { spaFallback: false });

export default http;
