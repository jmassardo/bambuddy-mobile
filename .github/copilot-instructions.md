# BambuBuddy Mobile — Copilot Instructions

## App Overview

**BambuBuddy Companion** is a cross-platform mobile app (iOS & Android) for managing Bambu Lab 3D print farms. It connects to a self-hosted BambuBuddy server and provides real-time printer monitoring, print queue management, file browsing, spool inventory tracking, and more.

- **Bundle ID**: `com.dxrf.bambuddy`
- **Framework**: React Native 0.86 + TypeScript (strict mode)
- **State management**: Zustand (server URL) + React Query v5 (data fetching/caching) + React Context (auth, toast, theme)
- **Navigation**: React Navigation (bottom tabs + native stacks + modals)
- **Styling**: React Native `StyleSheet.create()` with centralized design tokens (`src/theme/tokens.ts`)
- **Icons**: Lucide React Native (SVG vector icons)
- **Node version**: pinned in `.nvmrc` (≥ 22.11.0)
- **Ruby version**: pinned in `.ruby-version` (≥ 3.1.0)

## Project Structure

```
src/
├── api/           # API client layer — one file per domain (printers, queue, files, etc.)
│   ├── http.ts    # Core HTTP client: fetch wrapper, Bearer auth, Keychain token storage
│   ├── client.ts  # Unified API client export
│   └── server.ts  # Zustand store for server URL (persisted via AsyncStorage)
├── components/    # Reusable UI components, organized by feature
│   ├── common/    # AppUI (Button, Card, Input, Badge, etc.), StateScreens, Charts
│   ├── printers/  # PrinterCard, AddPrinterModal, PrintModal
│   ├── queue/     # QueueItemCard
│   ├── archives/  # ArchiveCard, CompareArchivesModal
│   ├── projects/  # ProjectActionModals
│   ├── inventory/ # Filament/spool components
│   └── settings/  # Settings section components
├── contexts/      # React Context providers (AuthContext, ToastContext)
├── hooks/         # Custom hooks (useWebSocket for real-time updates)
├── navigation/    # RootNavigator (auth gate), MainNavigator (tabs), type defs
├── screens/       # Screen components (~23 screens)
├── theme/         # ThemeProvider, design tokens (colors, spacing, typography)
├── types/         # TypeScript type definitions (api.ts is ~4000 lines)
├── utils/         # Utility functions
└── __tests__/     # Jest test files mirroring src/ structure
ios/               # Xcode project, CocoaPods (Podfile)
android/           # Gradle project, build configs
fastlane/          # Fastfile (build/beta/submit lanes), Matchfile, Appfile
```

## Build & Run Commands

```bash
# Development
npm start                     # Start Metro bundler
npm run ios                   # Run on iOS simulator
npm run android               # Run on Android emulator

# Building
npm run build:ios:debug       # Fastlane → Xcode debug build (simulator)
npm run build:ios:release     # Fastlane → Xcode release build (signed)
npm run build:android:debug   # Fastlane → Gradle assembleDebug
npm run build:android:release # Fastlane → Gradle bundleRelease

# Distribution
npm run beta:ios              # Build + upload to TestFlight
npm run beta:android          # Build + upload to Google Play (internal)

# Quality
npm test                      # Jest test suite
npm run lint                  # ESLint (src/)
npm run typecheck             # tsc --noEmit

# iOS native deps (after changing native modules)
cd ios && bundle exec pod install && cd ..
```

## Code Conventions

### TypeScript
- **Strict mode** is enabled — never use `any` unless absolutely necessary
- **Path aliases**: use `@/` for `src/` imports (e.g., `import { Button } from '@/components/common/AppUI'`)
- All API response types are defined in `src/types/api.ts`

### React & Components
- **Functional components only** with hooks
- **StyleSheet.create()** for all styles — no inline style objects in render
- Feature-specific components go in `src/components/<feature>/`
- Shared/reusable components go in `src/components/common/`
- Use design tokens from `src/theme/tokens.ts` for colors, spacing, and typography
- Use `useTheme()` hook to access the current theme in components

### State & Data Fetching
- **React Query** for all server data — never store fetched data in local state
  - Default staleTime: 30 seconds
  - Query keys pattern: `['resourceName', id?]`
- **Zustand** only for client-side persistent state (server URL)
- **React Context** for cross-cutting concerns (auth, toast, theme)
- **WebSocket** for real-time updates — invalidates React Query cache on server events

### API Layer
- All API functions live in `src/api/<domain>.ts`
- HTTP client (`src/api/http.ts`) handles auth tokens, error parsing, and retries
- Auth tokens are stored in the platform Keychain (iOS) / Keystore (Android)
- The `ApiError` class provides structured error handling
- File uploads use XMLHttpRequest for progress tracking

### Navigation
- Auth flow: ServerSetup → Setup → Login → Main (tabs)
- Bottom tabs: Dashboard, Queue, Archives, Files, More
- Feature screens are presented as modals over the main tab navigator
- Navigation types are defined in `src/navigation/types.ts`

### Testing
- **Jest** with `@react-native/jest-preset`
- Test files live in `src/__tests__/` mirroring the source structure
- Mock setup is in `jest.setup.js` (AsyncStorage, Keychain, NFC, device info, etc.)
- Use `@testing-library/react-native` for component tests
- Test file naming: `<ComponentName>.test.tsx` or `<module>.test.ts`

### Linting & Formatting
- **ESLint** with `@react-native` config
- **Prettier**: single quotes, trailing commas, avoid arrow parens
- Always run `npm run lint` and `npm run typecheck` before committing

## Architecture Patterns

### Authentication Flow
1. User configures server URL (persisted in AsyncStorage)
2. `POST /auth/login` returns token (or `pre_auth_token` if 2FA required)
3. Token stored in Keychain, attached as `Bearer` header to all requests
4. `AuthContext` manages user state, permissions, and session lifecycle
5. Media streams use separate scoped tokens (`camera_stream` scope)

### Real-Time Updates
- `useWebSocket` hook connects to the BambuBuddy server WebSocket
- Events like `printer_status`, `print_complete`, `inventory_changed` invalidate relevant React Query caches
- Printer status updates are throttled (100ms), other invalidations are debounced (2s)

### Error Handling
- Global `ErrorBoundary` wraps the app with fallback UI
- React Query `MutationCache` handles global mutation errors
- `ApiError` class parses structured errors from the server
- Network errors trigger toast notifications via `ToastContext`

## CI/CD Pipeline (GitHub Actions)

The CI workflow (`.github/workflows/ci.yml`) runs on push/PR to `main` or `dev`:
1. **TypeScript check** — `npx tsc --noEmit`
2. **Lint** — `npm run lint`
3. **Build iOS** — `bundle exec fastlane ios build_debug` (macOS runner)
4. **Build Android** — `bundle exec fastlane android build_debug` (Ubuntu runner, Java 17)

## Key Dependencies

| Category | Libraries |
|----------|-----------|
| Navigation | `@react-navigation/native`, `@react-navigation/native-stack`, `@react-navigation/bottom-tabs` |
| State | `zustand`, `@tanstack/react-query` |
| Storage | `@react-native-async-storage/async-storage`, `react-native-keychain` |
| UI | `lucide-react-native`, `react-native-svg`, `react-native-reanimated` |
| Media | `react-native-vision-camera`, `react-native-image-picker` |
| Device | `react-native-nfc-manager`, `react-native-device-info`, `react-native-haptic-feedback` |
| Charts | `react-native-chart-kit` |

## Common Tasks

### Adding a new screen
1. Create `src/screens/MyScreen.tsx`
2. Add the screen to `src/navigation/types.ts` (param types)
3. Register in `RootNavigator.tsx` (if modal) or `MainNavigator.tsx` (if tab)
4. Add navigation from the "More" screen if it's a feature screen

### Adding a new API endpoint
1. Add TypeScript types to `src/types/api.ts`
2. Create or update the appropriate `src/api/<domain>.ts` file
3. Use `useQuery` / `useMutation` hooks in the consuming component
4. Add WebSocket cache invalidation in `src/hooks/useWebSocket.ts` if needed

### Adding a new reusable component
1. Create in `src/components/common/` (shared) or `src/components/<feature>/` (domain-specific)
2. Use `useTheme()` for colors and design tokens
3. Export from the appropriate index file
4. Add tests in `src/__tests__/components/`
