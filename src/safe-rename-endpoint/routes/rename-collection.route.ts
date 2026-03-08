import { validateRenameCollectionRequest } from "../validators/rename-collection.validator";
import { renameCollection } from "../services/rename-collection.service";
import type { Request, RenameCollectionRequest } from "../types";
import type { Response } from "express";
import type { EndpointExtensionContext } from "@directus/types/dist/extensions";

export function registerRenameCollectionRoute(router: any, context: any) {
  const { logger } = context as EndpointExtensionContext;

  router.post(
    "/collections/rename",
    async (req: Request<RenameCollectionRequest>, res: Response) => {
      if (!req.accountability?.admin) {
        return res.status(403).json({
          error: "Admin privileges required",
        });
      }

      try {
        const requestBody = validateRenameCollectionRequest(req.body);

        await renameCollection(requestBody, context);

        return res.status(200).json({
          message: "Collection renamed successfully",
        });
      } catch (error: any) {
        logger.error(error);

        return res.status(400).json({
          error: error.message,
        });
      }
    },
  );
}
