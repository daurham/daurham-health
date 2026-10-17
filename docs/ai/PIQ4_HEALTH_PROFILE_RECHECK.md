# PIQ-4.2 — Current Health Profile late-read integrity (development only)

## Reason

A saved owner Health Profile can be edited after Ask Health loads it and before
the final evidence packet is composed. A profile's active medications,
allergies, conditions, training limitations, dietary context, height,
birthdate or physiological-reference value must not be sent as if the initial
values remain current. This is especially important in broad Personalized and
Deep Dive questions that automatically include relevant saved context.

## Implementation

One additional read of the existing singleton Health Profile service is
performed at the end of the loader only for **current, personalized/smart/deep**
queries. Historical as-of and General Only are not described as source-verified
by this current check. The recheck validates each schema field and compares
all owner-visible saved clinical/profile fields **and updatedAt** to the
initially loaded record. This includes initially empty profile records so
a newly saved singleton fails closed. An unreadable database, malformed
profile or changed record returns `changed_or_unavailable`.

If consistency cannot be verified, the evidence packet withholds both stable
demographics (age, height, DOB) and clinical context (medications, dose,
status, allergies, conditions, training and dietary notes, sex reference).
Instead it adds one non-substantive, privacy-safe source warning. It does not
misinterpret an absent record as lack of allergies or illness and never logs
or exports owner profile contents. The packet fingerprint changes for cache
segregation. Independent Activity, Nutrition, Training, Sleep and other
domain evidence is unaffected.

## Scope and release safety

This uses one additional **local read-only SQL call**, no new paid AI request,
no migration and no production mutation. It is not a transaction or a promise
that the profile cannot change after the final read; array ordering and even
updatedAt-only changes conservatively invalidate earlier data. It does not
independently verify historical profile values, medical diagnoses, medication
ingestion or clinical advice. No main merge until the owner acceptance gate.
