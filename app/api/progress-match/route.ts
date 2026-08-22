const databaseUrl =
  process.env.SERMON_API_URL?.replace(/\/services$/, "/progress-match") ??
  "http://127.0.0.1:3001/progress-match";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).search;
    const response = await fetch(`${databaseUrl}${query}`, { cache: "no-store" });
    return new Response(await response.text(), {
      status: response.status,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } catch {
    return Response.json(
      { error: "The SQLite database service is unavailable." },
      { status: 503 },
    );
  }
}
