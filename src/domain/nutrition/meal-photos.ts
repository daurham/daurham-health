/** Prepared photo bytes, before multipart overhead. Stays under the server ceiling. */
export const MEAL_PHOTO_SET_CLIENT_MAX_BYTES = 3_800_000

/** Multipart body ceiling for POST /api/nutrition/meal/jobs. Stays under the platform limit. */
export const MEAL_PHOTO_SET_SERVER_MAX_BYTES = 4_200_000

/** Vercel rejects function bodies above 4.5 MB. Application checks happen first. */
export const MEAL_PHOTO_PLATFORM_PAYLOAD_LIMIT_BYTES = 4_500_000

export const MEAL_PHOTO_SET_MAX_COUNT = 3

/** Each view in a multi-photo set. Three of these stay under the client total. */
export const MEAL_PHOTO_SET_PER_PHOTO_MAX_BYTES = 1_200_000

export const MEAL_PHOTO_SET_LONG_EDGE = 1600
export const MEAL_PHOTO_SET_JPEG_QUALITY = 0.82
export const MEAL_PHOTO_SET_FALLBACK_JPEG_QUALITY = 0.7
