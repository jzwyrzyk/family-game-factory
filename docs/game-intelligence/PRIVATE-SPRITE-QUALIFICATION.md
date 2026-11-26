# Private sprite slot qualification

General generated-game delivery remains outside the application, gateway, paid worker and preview. The existing generated-manifest validator accepts bundled art only. The following experiment runs on synthetic input in an offline browser harness. It does not add a route, application switch or stored binding.

1. The trusted host supplies its active, permitted play session, family, profile, exact game revision and reviewed compiled artifact digest. An independently reviewed slot specifies the same revision and digest plus one public image alias. Generated code cannot select a private asset.
2. A separate game binding pins the selected artwork revision, content digest and slot alias. The compositor rejects a different revision even when its bytes match. A selected artwork revision supplies its owner, family, expected SHA-256 and PNG bytes. The qualification compositor checks scope, a 2 MiB byte ceiling, PNG signature, a 1024-pixel dimension ceiling and content digest before decode. It rechecks active-session identity and decoded dimensions before painting.
3. The published v2 sandbox runs unmodified. Its worker sees its ordinary public slot and ordinary inputs. The fixture harness reads a QA frame capture and passes the validated, allowlisted image command into a separate trusted compositor. Only the host compositor sees the selected pixels. Aspect-fit preserves their proportions. Closing the grant releases the bitmap. A failed current-session check also closes it.
4. Each fixture starts with an isolated browser and a fresh grant. The test exercises keyboard motion, exact color, transparent margins, wrong family, owner, revision, artifact, pin, digest, consent, unknown alias and revocation. Generated HTML contains neither the private sprite nor the local fixture owner. The run makes no network request after the fixture shell opens.

An operational implementation would need an independently reviewed frame transport, complete camera and layer ordering, scope-bound revision and consent storage, immediate compositor cleanup across every lifecycle transition, backup/recovery, and separate hosted qualification. The prototype paints an isolated slot from a QA frame. It cannot be enabled in production.

[Qualification adapter](../../tools/qualification/private-art-slot.ts) · [Generated v2 browser check](../../tests/generated-private-slot-browser.ts)

[Captured synthetic slot](evidence/generated-slot-compositor.png)
