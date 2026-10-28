# punchcard

Office attendance from the employee's own Android phone. A check-in carries three proofs: the phone's location, a signature from a key that only unlocks after a fingerprint, and a photo of the face. The server judges all three, and a rejected check-in is saved with its reason just like an accepted one.

I built this to have one project that goes from a phone's secure hardware to a database row and an admin screen, with each part written by me: the API, the face service, the admin panel and the Android app.

NestJS, Prisma, PostgreSQL, Python with OpenCV, Next.js with Ant Design, Flutter with a small Kotlin channel, Docker Compose.

https://github.com/user-attachments/assets/7b5694cd-ebf5-45b1-988e-67ec58555e2c

The explainer (2:51, captioned, also at [docs/punchcard-explainer.mp4](docs/punchcard-explainer.mp4)) goes through one check-in from enrolment to the saved row. It is drawn, not a screen recording: the phone screens in it are real screenshots from my test phone, and the rejected and accepted rows are my real attempts. The voice is a stock ElevenLabs voice.

## Run it

```bash
PHONE_API_URL=http://192.168.0.10:3200 docker compose up --build
```

Use this machine's LAN IP. It goes into the pairing QR, so it has to be an address the phone can reach, and it is baked into the admin build, so changing it means rebuilding.

Admin panel on http://localhost:3202 (`admin@example.com` / `change-me` unless you set `ADMIN_EMAIL` and `ADMIN_PASSWORD`), API on port 3200, Swagger on `/docs`. The face service has no host port; only the API talks to it.

For a month of made-up attendance to look at: `docker compose exec api node dist/demo` on an empty database.

The phone app:

```bash
cd app
flutter run    # or: flutter build apk
```

The phone needs a screen lock and at least one fingerprint, or pairing refuses to make a key. The app allows plain http, because the demo runs on a LAN.

## A check-in, in order

1. The admin creates the employee, takes a reference photo with the laptop webcam, and shows a pairing QR. The code in it lasts 10 minutes and works once.
2. The app scans it and makes an EC P-256 key in the Android Keystore with `setUserAuthenticationRequired(true)` and authentication for every use. Only the public key goes to the server. Pairing a new phone revokes the old one.
3. At check-in the app asks for a challenge. The server returns a nonce and a liveness action it picked (turn left, turn right, blink, smile), valid for 60 seconds.
4. The app watches the front camera with ML Kit until the person does the action and looks back at the camera, then keeps one JPEG. Location is read the whole time, and the most accurate reading is used.
5. It signs this text inside a BiometricPrompt, so the fingerprint unlocks the key for exactly one signature:

   ```
   punchcard-checkin-v1
   <challengeId>
   <nonce>
   <IN|OUT>
   <lat>
   <lng>
   <accuracyM>
   <mock 0|1>
   <sha256 of the jpeg, hex>
   ```

6. The server claims the challenge with one `UPDATE ... WHERE "usedAt" IS NULL`, so a replay finds nothing to claim. An expired or reused challenge, or a phone that is no longer paired, gets an error and no row. Everything after that is saved, accepted or not. It checks, in this order, and stops at the first failure: the signature verifies, the photo matches the signed hash, GPS accuracy is at most 100 m and not a mock location, the phone is inside the nearest office's radius, and the face service finds exactly one face whose cosine similarity to a reference is at least 0.363.

The row keeps each check's result, the distance, the face score and the reason, so the attendance table shows why something was rejected, not only that it was.

## Decisions worth defending

**The phone collects proof and the server decides.** Anything the app decides, a modified app can fake. The one exception is the liveness action, and the limits below say so.

**The numbers are signed as the strings that go over the wire.** The app formats lat and lng to 6 decimals and accuracy to 1 before signing, and sends those same strings. If the phone signed a double and the server re-formatted what it parsed, one rounding difference would fail a real check-in.

**Each pairing gets its own key alias.** Pairing again makes the new key next to the old one, and the old one is deleted only after the server has accepted the new public key. A pairing that fails halfway leaves the phone still working.

**A new fingerprint kills the key.** `setInvalidatedByBiometricEnrollment(true)`: if someone adds their finger to the employee's phone later, the key stops working and the admin has to pair the phone again.

**Only embeddings are stored, never photos.** The face service is stateless. It returns a 128-float vector scaled to unit length, and the API stores that and computes the cosine itself as a dot product. The app deletes its copy of the photo once it has read it.

**The face service looks for faces on a 640 px copy.** At 1280 px a front-camera selfie fills the frame, and YuNet scored my own face 0.89 to 0.90, under its 0.9 cut-off, so the server said "no face in the photo" to a clear photo. At 640 px the same photos score 0.94.

**The app asks for location before the camera.** Android shows one permission dialog at a time and denies a second request made while the first is open, without showing it. Asking for both at once made the camera look refused when nobody had refused it.

**The challenge is fetched after both permission prompts.** Otherwise the time someone spends reading a dialog comes out of their 60 seconds.

## Known limitations

- The fingerprint proves that a finger enrolled on this phone touched the sensor. It does not prove whose finger. Android never gives an app the fingerprint, so anyone the owner has enrolled passes that step. That is why the face check exists.
- The liveness action is reported by the phone. A modified app can skip it, so it is a deterrent, not proof. Only the face match is judged on the server.
- A good printed photo held up to the camera may pass the face match. Real anti-spoofing is out of scope.
- GPS can be faked. The app sends Android's mock-location flag and the server rejects it, but a rooted phone can hide that flag.
- No Key Attestation, so the server trusts the app's word that the key is in secure hardware.
- Pairing is meant to happen at the office, in front of the admin: the QR lives 10 minutes on the admin's screen. Nothing enforces that. An admin who sends a photo of the QR to someone at home has paired a phone nobody checked.
- 0.363 is the threshold OpenCV publishes for SFace, not one I calibrated. My own phone selfies scored 0.67 to 0.70 against my reference photo. I have not tested a different person against it on real photos, so I can't say how close a lookalike gets.
- Tested on one phone, an OPPO CPH2113 on Android 12. Turn left and turn right depend on which way ML Kit reports the head angle on each front camera, and I have only seen a right turn pass on that one.
- Indoors a single GPS reading can be off by 100 m. The app keeps the best reading from the face check, but an office radius under about 50 m will still reject people standing inside.

## Tests

```bash
cd api && cp .env.test.example .env.test
npx prisma migrate deploy   # against the test database
npm test && npm run test:e2e

cd face && python fetch_models.py && pytest
cd admin && npm test
cd app && flutter test
```

The API's e2e suite runs against a real Postgres with the face service replaced by a stub, and it truncates every table, so `.env.test` must not point at the database you demo with. The face tests that need real photos skip unless `face/tests/faces/` holds `same_a.jpg`, `same_b.jpg` and `other.jpg`. That folder is gitignored, so no faces end up in the repo.

CI runs all of it, and also builds the compose stack and logs in through it.

## Layout

```
api/     NestJS. Admin auth, employees, offices, pairing, challenges, check-in, month report.
face/    FastAPI around OpenCV's YuNet (find the face) and SFace (embed it). Models are
         downloaded by fetch_models.py and checked against pinned hashes, not committed.
admin/   Next.js and Ant Design. The session token is in an httpOnly cookie, and the API
         is reached through a route handler that adds it.
app/     Flutter, Android only. Kotlin for the Keystore key and BiometricPrompt.
```

## Licence

Apache 2.0. The YuNet model is MIT and SFace is Apache 2.0, both from opencv_zoo.
