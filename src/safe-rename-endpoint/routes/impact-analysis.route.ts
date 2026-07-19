import type { Request, ImpactAnalysisRequest, ImpactAnalysisResult } from "../types";
import type { Response } from "express";
import type { EndpointExtensionContext } from "@directus/types/dist/extensions";
import { validateImpactAnalysisRequest } from "../validators/impact-analysis.validator";
import {
  analyzeCollectionRename,
  analyzeFieldRename,
} from "../services/impact-analysis.service";

export function registerImpactAnalysisRoute(router: any, context: any) {
  const { logger } = context as EndpointExtensionContext;

  router.post(
    "/impact/analyze",
    async (req: Request<ImpactAnalysisRequest>, res: Response) => {
      if (!req.accountability?.admin) {
        return res.status(403).json({
          error: "Admin privileges required",
        });
      }

      try {
        const requestBody = validateImpactAnalysisRequest(req.body);

        let result: ImpactAnalysisResult;

        if (requestBody.type === "collection") {
          result = await analyzeCollectionRename(
            requestBody.collection,
            requestBody.newName,
            context,
          );
        } else {
          result = await analyzeFieldRename(
            requestBody.collection,
            requestBody.field!,
            requestBody.newName,
            context,
          );
        }

        return res.status(200).json(result);
      } catch (error: any) {
        logger.error(error);

        return res.status(400).json({
          error: error.message,
        });
      }
    },
  );
}