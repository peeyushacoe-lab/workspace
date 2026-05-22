import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login", request.url));
  response.cookies.delete("cybersage_admin");
  response.cookies.delete("cybersage_session");
  response.cookies.delete("cybersage_user");
  return response;
}
