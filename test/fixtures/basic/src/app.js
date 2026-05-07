const databaseUrl = process.env.DATABASE_URL;
const publicUrl = import.meta.env.NEXT_PUBLIC_APP_URL;
const optionalToken = process.env["MISSING_API_TOKEN"];

export function config() {
  return { databaseUrl, publicUrl, optionalToken };
}

