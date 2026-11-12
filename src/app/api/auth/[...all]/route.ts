import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  return auth.handler(req);
}

export async function POST(req: NextRequest) {
  return auth.handler(req);
}
