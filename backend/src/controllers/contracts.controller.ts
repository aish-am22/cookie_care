import type express from 'express';
import { generateContract as generateContractService } from '../services/contracts/index.js';

interface GenerateContractBody {
  contractType: string;
  details: string;
  templateContent?: string;
}

export const generateContract = async (req: express.Request, res: express.Response): Promise<void> => {
  const { contractType, details, templateContent } = req.body as GenerateContractBody;
  if (!contractType || !details) {
    res.status(400).json({ error: 'Contract type and details are required.' });
    return;
  }

  try {
    const contract = await generateContractService(contractType, details, templateContent);
    res.json(contract);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred.';
    console.error('[SERVER] Contract generation failed:', message);
    res.status(500).json({ error: `Failed to generate contract. ${message}` });
  }
};
