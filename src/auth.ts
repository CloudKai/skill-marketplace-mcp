import { getVercelOidcToken } from '@vercel/oidc';
export async function rankingToken(): Promise<string | undefined> {
  if (!process.env.VERCEL_OIDC_TOKEN && !process.env.VERCEL_PROJECT_ID) return undefined;
  return await getVercelOidcToken();
}
