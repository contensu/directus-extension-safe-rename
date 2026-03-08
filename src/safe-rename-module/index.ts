import { defineModule } from "@directus/extensions-sdk";
import safeRename from "./safe-rename.vue";

export default defineModule({
  id: "safe-rename",
  name: "Safe Rename",
  icon: "drive_file_rename_outline",
  routes: [
    {
      name: "safe-rename",
      path: ":collection?",
      component: safeRename,
    },
  ],
  preRegisterCheck: (user) => user.admin_access === true,
});
