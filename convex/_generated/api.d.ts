/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as auth from "../auth.js";
import type * as brands from "../brands.js";
import type * as briefs from "../briefs.js";
import type * as decks from "../decks.js";
import type * as decksInternal from "../decksInternal.js";
import type * as devgen from "../devgen.js";
import type * as devseed from "../devseed.js";
import type * as edits from "../edits.js";
import type * as editsValidate from "../editsValidate.js";
import type * as generations from "../generations.js";
import type * as generationsInternal from "../generationsInternal.js";
import type * as http from "../http.js";
import type * as imageBank from "../imageBank.js";
import type * as imageBankActions from "../imageBankActions.js";
import type * as render from "../render.js";
import type * as seed from "../seed.js";
import type * as threads from "../threads.js";
import type * as usage from "../usage.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  auth: typeof auth;
  brands: typeof brands;
  briefs: typeof briefs;
  decks: typeof decks;
  decksInternal: typeof decksInternal;
  devgen: typeof devgen;
  devseed: typeof devseed;
  edits: typeof edits;
  editsValidate: typeof editsValidate;
  generations: typeof generations;
  generationsInternal: typeof generationsInternal;
  http: typeof http;
  imageBank: typeof imageBank;
  imageBankActions: typeof imageBankActions;
  render: typeof render;
  seed: typeof seed;
  threads: typeof threads;
  usage: typeof usage;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
