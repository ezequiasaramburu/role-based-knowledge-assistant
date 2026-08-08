import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  openRouterApiKey: process.env.OPENROUTER_API_KEY ?? "",
  openRouterModel: process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini",
  openRouterApiUrl: process.env.OPENROUTER_API_URL ?? "https://openrouter.ai/api/v1/chat/completions",
  port: Number(process.env.PORT ?? 4000),
};
