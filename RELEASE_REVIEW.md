# Review before making this repository public

- [x] Confirm every included source file, image, document and test fixture is yours to publish. Publication rights were confirmed by the project owner; this edition uses no copied product images or customer fixtures.
- [x] Review the entire **new** Git history and tracked files for credentials, personal information, internal URLs, production prompts, private prose and deployment identifiers.
- [x] Run a local secret scanner on this new repository and inspect any findings. Scanner silence is not proof that commercial IP is absent.
- [x] Confirm the README's production/public distinction, feature claims and provenance table remain accurate after edits.
- [x] Run `npm run test:all`, compile Pages Functions, and complete the local `npm run smoke` check.
- [ ] Decide separately whether to offer a deployed public demo. Provision new D1/Queue resources and review rate limits first; do not attach production resources.
- [x] Choose a license deliberately if reuse by others is desired. No license is included; this is shared for evaluation only.

Release scope: **source-only portfolio repository; no public web demo is deployed**.

Local preparation: the new repository has no inherited Git history. A targeted credential-pattern search found no real credentials, and `npx --yes @secretlint/quick-start '**/*'` exited with status 0 and no findings. The only UUID-like deployment value is an all-zero local D1 placeholder.
