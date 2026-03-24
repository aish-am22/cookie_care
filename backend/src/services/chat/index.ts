import { ai, model, Type } from '../ai/index.js';

export interface ChatResponse {
  answer: string;
  revisedText: string | null;
}

export const chatWithDocument = async (documentText: string, question: string): Promise<ChatResponse> => {
  const prompt = `You are an interactive legal AI assistant. You can answer questions or perform edits on the provided document.

        **DOCUMENT TEXT:**
        ---
        ${documentText}
        ---
        
        **USER'S INSTRUCTION:** "${question}"

        **Your Task:**
        1.  First, determine the user's intent. Is it a question (e.g., "what does this mean?") or an editing command (e.g., "rephrase this", "add a clause")?
        2.  **If the intent is to ask a question:**
            *   Formulate an answer based ONLY on the document's content.
            *   Return a JSON object: \`{ "answer": "Your detailed answer here.", "revisedText": null }\`
        3.  **If the intent is to edit the document:**
            *   Perform the requested edit (rephrase, add, remove, change) to the best of your ability.
            *   Return a short, conversational confirmation message in the "answer" field (e.g., "Certainly, I have rephrased the termination clause for clarity.").
            *   Return the ENTIRE, full text of the newly modified document in the "revisedText" field.
        
        Your response must be a single, valid JSON object. Do not include any other text or markdown.
        `;

  const chatSchema = {
    type: Type.OBJECT,
    properties: {
      answer: { type: Type.STRING },
      revisedText: { type: [Type.STRING, Type.NULL] },
    },
    required: ['answer', 'revisedText'],
  };

  const result = await ai.models.generateContent({
    model,
    contents: prompt,
    config: { responseMimeType: 'application/json', responseSchema: chatSchema },
  });

  const resultText = result.text;
  if (!resultText) throw new Error('AI chat returned an empty response.');

  return JSON.parse(resultText) as ChatResponse;
};
