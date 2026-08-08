import { env } from "../env";

export interface RetrievedDocument {
  id: string;
  title: string;
  department: string;
  body: string;
}

const SYSTEM_PROMPT =
  "Answer only using the documents provided below. If the answer is not contained in them, " +
  "say you don't have that information — do not use outside knowledge.";

export async function synthesizeAnswer(question: string, documents: RetrievedDocument[]): Promise<string> {
  if (!env.openRouterApiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  const context = documents
    .map((doc, i) => `[Document ${i + 1}: "${doc.title}" (${doc.department})]\n${doc.body}`)
    .join("\n\n");

  const response = await fetch(env.openRouterApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.openRouterApiKey}`,
    },
    body: JSON.stringify({
      model: env.openRouterModel,
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Documents:\n\n${context}\n\nQuestion: ${question}` },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter request failed (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const answer = data.choices?.[0]?.message?.content;
  if (!answer) {
    throw new Error("OpenRouter response did not contain an answer");
  }
  return answer;
}
