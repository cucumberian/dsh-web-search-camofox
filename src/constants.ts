/**
 * Constant defaults shared by the camofox search provider and its plugin. Kept
 * in one module so the plugin's `apply` and the provider agree on the same values.
 * @module @deepseek-ai/dsh-web-search-camofox/constants
 */

import type { CamofoxEngine } from './types.ts'

/** Default camofox-browser REST base URL (the container's API port). */
export const CAMOFOX_DEFAULT_BASE_URL = 'http://localhost:9377'

/** Default camofox user identity. */
export const CAMOFOX_DEFAULT_USER_ID = 'default-user'

/** Default camofox session key used by this provider. */
export const CAMOFOX_DEFAULT_SESSION_KEY = 'dsh-web-search'

/** Default search-engine macro. */
export const CAMOFOX_DEFAULT_ENGINE: CamofoxEngine = 'google'