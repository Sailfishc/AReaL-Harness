[中文](CHANGELOG.md) | **English**

# Changelog

## Unreleased

- The CLI installer checks shared services before installation/upgrades and excludes concurrent installations. Download, validation and entry-switch failures preserve the old installation and user data.
- CLI installation verifies the program version and reports PATH conflicts. Preview CLI builds can upgrade to the matching formal version.
- GUI update-check errors are visible. Native validation timeouts keep the backend running; unknown backend-stop results cannot trigger repeated installation.
- Back up configuration and history before upgrading. GUI previews require manual installation; older versions may not read newer data formats.

Installation, upgrade and verification commands: [CLI guide](docs/guides/installation.en.md) and [GUI guide](clients/gui/README.en.md#installation-and-updates).
