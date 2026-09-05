# Third-Party Notices

Handy Convert v1.0.0 contains no bundled third-party runtime library code.

The application uses browser-native APIs and system fonts only. The repository retains the `htmlapps-template` dependency-management and GitHub Actions infrastructure so future dependencies, if any, can be pinned, verified, embedded at build time, and documented here.

If a package is added later:

1. Declare its exact version, license, homepage, and embedded assets in `dependencies.json`.
2. Synchronize and commit `dependencies.lock.json` using the template maintenance script.
3. Include all notices and license text required for redistribution.
4. Update this file and both README files when the dependency affects privacy, size, or capability.
