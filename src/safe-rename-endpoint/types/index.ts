import { Accountability } from "@directus/types/dist/accountability";
import { EndpointExtensionContext } from "@directus/types/dist/extensions";
import type { Request as _Request, Router } from "express";

export type EndpointConfigFunction = (
  router: Router,
  context: EndpointExtensionContext,
) => void;

export interface Request<T> extends _Request {
  accountability?: Accountability;
  body: T;
}

export type RenameCollectionRequest = {
  sourceCollection: string;
  targetCollection: string;
};

export interface RenameFieldRequest {
  collection: string;
  fields: {
    sourceField: string;
    targetField: string;
  }[];
}
