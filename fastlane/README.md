fastlane documentation
----

# Installation

Make sure you have the latest version of the Xcode command line tools installed:

```sh
xcode-select --install
```

For _fastlane_ installation instructions, see [Installing _fastlane_](https://docs.fastlane.tools/#installing-fastlane)

# Available Actions

## iOS

### ios create_app

```sh
[bundle exec] fastlane ios create_app
```

Register the App ID on the Developer Portal

### ios build_debug

```sh
[bundle exec] fastlane ios build_debug
```

Build iOS debug

### ios build_release

```sh
[bundle exec] fastlane ios build_release
```

Build iOS release

### ios beta

```sh
[bundle exec] fastlane ios beta
```

Submit to TestFlight

### ios submit

```sh
[bundle exec] fastlane ios submit
```

Submit to App Store

----


## Android

### android build_debug

```sh
[bundle exec] fastlane android build_debug
```

Build Android debug APK

### android build_release

```sh
[bundle exec] fastlane android build_release
```

Build Android release AAB

### android beta

```sh
[bundle exec] fastlane android beta
```

Submit to Google Play (internal testing)

### android submit

```sh
[bundle exec] fastlane android submit
```

Submit to Google Play (production)

----

This README.md is auto-generated and will be re-generated every time [_fastlane_](https://fastlane.tools) is run.

More information about _fastlane_ can be found on [fastlane.tools](https://fastlane.tools).

The documentation of _fastlane_ can be found on [docs.fastlane.tools](https://docs.fastlane.tools).
