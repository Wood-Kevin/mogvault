import { NextResponse } from "next/server";

export async function GET() {
  const id     = process.env.BLIZZARD_CLIENT_ID     ?? "";
  const secret = process.env.BLIZZARD_CLIENT_SECRET ?? "";
  const region = process.env.BLIZZARD_REGION        ?? "us";

  const creds = Buffer.from(`${id}:${secret}`).toString("base64");

  let tokenStatus = 0;
  let tokenError  = "";
  try {
    const res = await fetch("https://oauth.battle.net/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${creds}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      cache: "no-store",
    });
    tokenStatus = res.status;
    if (!res.ok) tokenError = await res.text();
  } catch (e) {
    tokenError = String(e);
  }

  return NextResponse.json({
    CLIENT_ID_len:     id.length,
    CLIENT_SECRET_len: secret.length,
    REGION:            region,
    tokenHttpStatus:   tokenStatus,
    tokenError:        tokenError || null,
  });
}
