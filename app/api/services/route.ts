const databaseUrl = process.env.SERMON_API_URL ?? "http://127.0.0.1:3001/services";

async function forward(method: "GET" | "POST", request?: Request) {
  try {
    const response = await fetch(databaseUrl, {
      method,
      headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
      body: method === "POST" ? await request?.text() : undefined,
      cache: "no-store",
    });
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

export const dynamic = "force-dynamic";

export async function GET() {
  return forward("GET");
}

export async function POST(request: Request) {
  return forward("POST", request);
}
