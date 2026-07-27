import { joinSession } from "@github/copilot-sdk/extension";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

async function runCommand(command, args, cwd) {
  try {
    const { stdout, stderr } = await exec(command, args, {
      cwd,
      timeout: 300_000,
      env: { ...process.env, FORCE_COLOR: "0" },
    });
    return { success: true, output: stdout || stderr || "Done" };
  } catch (error) {
    return {
      success: false,
      output: error.stderr || error.stdout || error.message,
    };
  }
}

const session = await joinSession({
  hooks: {},
  tools: [
    {
      name: "bambuddy_validate",
      description:
        "Run TypeScript type checking and ESLint on the BambuBuddy codebase. Use this to validate changes before committing. Returns combined output from both checks.",
      parameters: {
        type: "object",
        properties: {
          fix: {
            type: "boolean",
            description:
              "When true, run ESLint with --fix to auto-fix issues. Default: false.",
          },
        },
      },
      handler: async (args) => {
        const cwd = process.cwd();
        const results = [];

        await session.log("Running TypeScript type check...", {
          ephemeral: true,
        });
        const tsResult = await runCommand("npx", ["tsc", "--noEmit"], cwd);
        results.push(
          `## TypeScript Check: ${tsResult.success ? "✅ PASSED" : "❌ FAILED"}\n${tsResult.output}`
        );

        const lintArgs = ["eslint", "src/"];
        if (args?.fix) lintArgs.push("--fix");

        await session.log("Running ESLint...", { ephemeral: true });
        const lintResult = await runCommand("npx", lintArgs, cwd);
        results.push(
          `## ESLint: ${lintResult.success ? "✅ PASSED" : "❌ FAILED"}\n${lintResult.output}`
        );

        const allPassed = tsResult.success && lintResult.success;
        return {
          textResultForLlm: results.join("\n\n"),
          resultType: allPassed ? "success" : "failure",
        };
      },
    },
    {
      name: "bambuddy_test",
      description:
        "Run Jest tests for BambuBuddy. Optionally filter by test file pattern. Returns test results.",
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description:
              "Test file pattern to filter (e.g., 'PrinterCard' or 'api/client'). Omit to run all tests.",
          },
          coverage: {
            type: "boolean",
            description: "Generate coverage report. Default: false.",
          },
        },
      },
      handler: async (args) => {
        const cwd = process.cwd();
        const jestArgs = ["jest", "--no-coverage"];

        if (args?.pattern) {
          jestArgs.push("--testPathPattern", args.pattern);
        }
        if (args?.coverage) {
          jestArgs.splice(jestArgs.indexOf("--no-coverage"), 1, "--coverage");
        }

        await session.log(
          `Running tests${args?.pattern ? ` matching "${args.pattern}"` : ""}...`,
          { ephemeral: true }
        );
        const result = await runCommand("npx", jestArgs, cwd);

        return {
          textResultForLlm: `## Test Results: ${result.success ? "✅ PASSED" : "❌ FAILED"}\n${result.output}`,
          resultType: result.success ? "success" : "failure",
        };
      },
    },
    {
      name: "bambuddy_api_types",
      description:
        "Search BambuBuddy API type definitions in src/types/api.ts. This file is ~4000 lines, so use this tool to find specific types by name or keyword instead of reading the whole file.",
      parameters: {
        type: "object",
        properties: {
          search: {
            type: "string",
            description:
              "Type name or keyword to search for (e.g., 'Printer', 'QueueItem', 'Permission')",
          },
        },
        required: ["search"],
      },
      handler: async (args) => {
        const cwd = process.cwd();
        const result = await runCommand(
          "grep",
          [
            "-n",
            "-i",
            "-A",
            "20",
            "--color=never",
            args.search,
            "src/types/api.ts",
          ],
          cwd
        );
        if (!result.success && !result.output) {
          return `No types found matching "${args.search}"`;
        }
        // Trim to reasonable length
        const lines = result.output.split("\n").slice(0, 100);
        if (lines.length === 100) {
          lines.push(
            `\n... (truncated, refine your search for "${args.search}")`
          );
        }
        return lines.join("\n");
      },
    },
  ],
});
