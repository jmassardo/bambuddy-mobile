import { joinSession } from "@github/copilot-sdk/extension";

const session = await joinSession({
  hooks: {
    onSessionStart: async () => {
      await session.log("BambuBuddy context loaded");
      return {
        additionalContext: [
          "This is BambuBuddy Mobile, a React Native + TypeScript app for managing Bambu Lab 3D print farms.",
          "Key conventions:",
          "- Use `@/` path aliases for imports from `src/`",
          "- Use `useTheme()` hook for colors and design tokens (never hardcode colors)",
          "- Use React Query (`useQuery`/`useMutation`) for all server data fetching",
          "- Use `StyleSheet.create()` for styles, themed via `tokens.ts`",
          "- API types are in `src/types/api.ts`, API functions in `src/api/<domain>.ts`",
          "- Components go in `src/components/common/` (shared) or `src/components/<feature>/`",
          "- Screens go in `src/screens/`, navigation types in `src/navigation/types.ts`",
          "- Always run `npm run typecheck` and `npm run lint` to validate changes",
          "- Tests use Jest + @testing-library/react-native, files in `src/__tests__/`",
        ].join("\n"),
      };
    },

    onPreToolUse: async (input) => {
      // Remind about typecheck before committing
      if (
        input.toolName === "bash" &&
        typeof input.toolArgs?.command === "string" &&
        input.toolArgs.command.includes("git commit")
      ) {
        return {
          additionalContext:
            "Before committing, ensure you have run `npm run typecheck` and `npm run lint` to catch type errors and lint issues.",
        };
      }
    },
  },
  tools: [],
});
