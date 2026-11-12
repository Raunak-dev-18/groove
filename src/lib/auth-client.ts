import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  // same-origin by default; the Expo app talks to the raw REST endpoints
});

export const useSession = authClient.useSession;

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: "user" | "admin" | "super_admin";
};
