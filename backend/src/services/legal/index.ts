import { type LegalAnalysisResult, type LegalPerspective } from '../../../types.js';
import { ai, model, Type } from '../ai/index.js';

export const analyzeLegalDocument = async (documentText: string, perspective: LegalPerspective): Promise<LegalAnalysisResult> => {
  const legalPrompt = `
You are a world-class AI legal analyst. Your task is to perform a detailed risk analysis of the provided legal document from the perspective of a **${perspective}**.

**Document Text:**
---
${documentText}
---

**Instructions:**
1.  **Overall Risk:** Start by providing an 'overallRisk' object.
    *   'level': A single risk level ('Critical', 'High', 'Medium', 'Low') for the entire document from the chosen perspective.
    *   'summary': A concise, two-sentence executive summary explaining the primary risks or lack thereof.
2.  **Clause-by-Clause Analysis:** Provide an 'analysis' array of objects, one for each significant clause or section you identify (e.g., "Liability," "Data Processing," "Confidentiality," "Termination"). For each clause:
    *   'clause': The name of the clause (e.g., "Limitation of Liability").
    *   'summary': A brief, plain-language summary of what the clause means.
    *   'risk': A detailed explanation of the specific risks this clause poses to the **${perspective}**. Be specific.
    *   'riskLevel': The risk level for this specific clause.
    *   'recommendation': A concrete, actionable recommendation for how the **${perspective}** could negotiate or amend this clause to mitigate risk.

Your final output must be a single, valid JSON object adhering to this structure. Do not include any other text or markdown.
        `;

  const legalSchema = {
    type: Type.OBJECT,
    properties: {
      overallRisk: {
        type: Type.OBJECT,
        properties: {
          level: { type: Type.STRING },
          summary: { type: Type.STRING },
        },
        required: ['level', 'summary'],
      },
      analysis: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            clause: { type: Type.STRING },
            summary: { type: Type.STRING },
            risk: { type: Type.STRING },
            riskLevel: { type: Type.STRING },
            recommendation: { type: Type.STRING },
          },
          required: ['clause', 'summary', 'risk', 'riskLevel', 'recommendation'],
        },
      },
    },
    required: ['overallRisk', 'analysis'],
  };

  const result = await ai.models.generateContent({
    model,
    contents: legalPrompt,
    config: { responseMimeType: 'application/json', responseSchema: legalSchema },
  });

  const resultText = result.text;
  if (!resultText) throw new Error('AI analysis returned an empty response.');

  return JSON.parse(resultText) as LegalAnalysisResult;
};
