const databaseUrl = () => {
  const servicesUrl =
    process.env.SERMON_API_URL ?? "http://127.0.0.1:3001/services";
  return servicesUrl.replace(/\/services$/, "/people");
};

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await fetch(databaseUrl(), { cache: "no-store" });
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
