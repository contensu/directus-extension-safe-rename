import { defineEndpoint } from "@directus/extensions-sdk";
import { registerRenameCollectionRoute } from "./routes/rename-collection.route";
import { registerRenameFieldRoute } from "./routes/rename-field.route";
import { registerImpactAnalysisRoute } from "./routes/impact-analysis.route";

export default defineEndpoint({
  id: "safe-rename",

  handler: (router, context) => {
    registerImpactAnalysisRoute(router, context);
    registerRenameCollectionRoute(router, context);
    registerRenameFieldRoute(router, context);
  },
});
