# Body Shortcut capture

A Shortcut can stage a Body measurement. Health does not save it until you open the review page and tap Save measurement.

The capture token is a server secret. It is not an owner session, and it cannot read Body history or save a measurement by itself. Do not put a real token in the Shortcut if you share the shortcut file. Store it in the Shortcut on your phone.

## Actions

1. Generate UUID. Use that value as `captureId`.
2. Ask for the measurements you want. Weight uses `lb` or `kg`. Body fat uses `percent`. Circumferences use `in` or `cm`. Leave out any measurement you did not take.
3. Current Date.
4. If that date does not include a numeric timezone offset, add Format Date:
   - Date: Current Date
   - Format: Custom
   - Format String: `yyyy-MM-dd'T'HH:mm:ssxxx`
   Phoenix time then looks like `2026-09-27T17:06:00-07:00`.
5. Dictionary:

```json
{
  "version": "body-capture-v1",
  "captureId": "<UUID from step 1>",
  "capturedAt": "<formatted date>",
  "timezone": "America/Phoenix",
  "metrics": [
    { "key": "weight", "value": 190.4, "unit": "lb" }
  ],
  "notes": null
}
```

6. Get Contents of URL:
   - Method: POST
   - URL: `https://health.daurham.com/api/ingest/body`
   - Request body: JSON, the dictionary from step 5
   - Headers: `Authorization` = `Bearer <BODY_CAPTURE_TOKEN>`
7. Get `reviewPath` from the response dictionary.
8. Open URL: `https://health.daurham.com` plus `reviewPath`.

The review address is only `/body/inbox/` and the capture id. It does not include the weight, notes, or token.

9. On that page, check the time and the values, change anything that is wrong, then tap Save measurement. Discard leaves the capture out of Body.

Sending the same UUID again with the same measurements returns the same review link. Sending that UUID with different measurements is rejected and does not replace the first capture.
