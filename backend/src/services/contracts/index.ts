import { type GeneratedContract } from '../../../types.js';
import { ai, model, Type } from '../ai/index.js';

export const generateContract = async (contractType: string, details: string, templateContent?: string): Promise<GeneratedContract> => {
  let generationPrompt: string;

  if (templateContent) {
    console.log(`[SERVER] Received request to generate contract from a template.`);
    generationPrompt = `
You are an expert legal AI assistant. Your task is to complete the provided contract template using the key details supplied by the user in a structured JSON format.
Diligently and accurately fill in the placeholders in the template (like "[Disclosing Party Name]", "[Effective Date]", "[Term]", etc.) with the corresponding values from the user's JSON details.
If a detail is provided by the user but has no clear placeholder in the template, try to incorporate it logically where it makes sense.
The final title should be taken from the template's likely title or a generic one if none is obvious.

**Contract Template to Complete:**
---
${templateContent}
---

**User's Key Details (JSON Format):**
---
${details}
---

Your output must be a JSON object with "title" and "content" keys. The "content" must be the fully completed contract as a well-structured HTML string. Follow these formatting rules STRICTLY:
- Use <h2> for main section headers (e.g., "1. Confidentiality").
- Use <h3> for sub-section headers if needed.
- Use <p> for all paragraphs of text. Each paragraph must be in its own tag.
- Use <strong> to emphasize important terms, party names, or dates.
- Use <ul> and <li> for any enumerated lists.
- DO NOT return a single block of text. The document must be properly structured with these HTML tags to be readable.

Return ONLY the valid JSON object.`;
  } else {
    console.log(`[SERVER] Received request to generate a ${contractType} from scratch.`);
    generationPrompt = `
You are an expert legal AI specializing in contract drafting. Generate a standard, professional **${contractType}**.
Incorporate the following key details provided by the user in a structured JSON format:
---
${details}
---
The generated contract should be robust, clear, and follow best practices. 

Your output must be a JSON object with "title" (e.g., "Mutual Non-Disclosure Agreement") and "content" keys. The "content" must be the fully completed contract as a well-structured HTML string. Follow these formatting rules STRICTLY:
- Use <h2> for main section headers (e.g., "1. Confidentiality").
- Use <h3> for sub-section headers if needed.
- Use <p> for all paragraphs of text. Each paragraph must be in its own tag.
- Use <strong> to emphasize important terms, party names, or dates.
- Use <ul> and <li> for any enumerated lists.
- DO NOT return a single block of text. The document must be properly structured with these HTML tags to be readable.

Return ONLY the valid JSON object.`;
  }

  const generationSchema = {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      content: { type: Type.STRING },
    },
    required: ['title', 'content'],
  };

  const result = await ai.models.generateContent({
    model,
    contents: generationPrompt,
    config: { responseMimeType: 'application/json', responseSchema: generationSchema },
  });

  const resultText = result.text;
  if (!resultText) throw new Error('AI contract generation returned an empty response.');

  return JSON.parse(resultText) as GeneratedContract;
};
