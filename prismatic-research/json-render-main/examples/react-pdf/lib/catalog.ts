import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react-pdf/server";
import { standardComponentDefinitions } from "@json-render/react-pdf/catalog";

export const pdfCatalog = defineCatalog(schema, {
  components: standardComponentDefinitions,
  actions: {},
});
