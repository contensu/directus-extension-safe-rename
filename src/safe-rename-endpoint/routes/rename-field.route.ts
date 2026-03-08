import type { Request, RenameFieldRequest } from "../types";
import type { Response } from "express";
import type { EndpointExtensionContext } from "@directus/types/dist/extensions";
import { renameField } from "../services/rename-field.service";
import { validateRenameFieldsRequest } from "../validators/rename-field.validator";

export function registerRenameFieldRoute(router: any, context: any) {
  const { logger } = context as EndpointExtensionContext;

  router.post(
    "/fields/rename",
    async (req: Request<RenameFieldRequest>, res: Response) => {
      if (!req.accountability?.admin) {
        return res.status(403).json({
          error: "Admin privileges required",
        });
      }

      try {
        const requestBody = validateRenameFieldsRequest(req.body);

        await renameField(requestBody, context);

        return res.status(200).json({
          message: "Field(s) renamed successfully",
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
