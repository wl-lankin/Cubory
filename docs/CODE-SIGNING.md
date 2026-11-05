# Code-Signierung (Windows)

App und Installer werden mit [Azure Artifact Signing](https://learn.microsoft.com/azure/artifact-signing/) signiert. Als Herausgeber steht „Wolfgang Linz“ im Zertifikat, Microsoft hat die Identität geprüft.

## Azure

- Konto `wolfganglinz-signing` (Ressourcengruppe `code-signing`, North Europe, Endpunkt `https://neu.codesigning.azure.net`), Zertifikatprofil `wolfganglinz-public` (Public Trust). Die Zertifikate leben nur wenige Tage und werden von Azure erneuert, der Zeitstempel hält die Signatur danach gültig.
- App-Registrierung `github-code-signing` mit der Rolle „Artifact Signing Certificate Profile Signer“ nur auf diesem Konto. Sie hat kein Passwort: eine Verbundanmeldeinformation vertraut GitHub-OIDC-Tokens für `repo:wl-lankin@27097016/Cubory@1304858013:environment:release`.

## GitHub

- Umgebung `release`, darin laufen die Build-Jobs des Release-Workflows und der Prüf-Workflow.
- Repository-Variablen `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` (IDs, keine Geheimnisse).
- `.github/actions/windows-signing` lädt den Signier-Client von Microsoft (Version und SHA-256 fest) und schreibt dessen `metadata.json`. `sign.ps1` holt für jede Datei ein frisches OIDC-Token und ruft `signtool` mit der Client-DLL auf.
- electron-builder ruft für jede Datei `scripts/sign-windows.cjs` auf (`build.win.signtoolOptions.sign`), das an `sign.ps1` weitergibt. Ohne die Vorbereitung bricht der Build in der CI ab; lokal bleibt er unsigniert. Die `latest.yml` enthält den Hash des signierten Installers.
- `windows-signing-check.yml` baut und signiert ohne Release und prüft die Signaturen. Er läuft bei Pull Requests, die die Signierung ändern, oder von Hand.
