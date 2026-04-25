/**
 * Qwen Mode Proxy Extension
 *
 * Intercepts OpenAI-completions API requests to the llamacpp provider
 * and injects mode-specific sampling parameters (temperature, top_p,
 * top_k, min_p, presence_penalty, repetition_penalty).
 *
 * Modes:
 *   - thinking : General tasks (creative, exploratory)
 *   - coding   : Precise coding tasks (WebDev, etc.)
 *   - instruct : Non-thinking / instruction-following
 *
 * Commands:
 *   /mode thinking  — Switch to thinking mode
 *   /mode coding    — Switch to coding mode
 *   /mode instruct  — Switch to instruct mode
 *   /mode           — Show current mode
 *
 * Usage:
 *   Placed in ~/.pi/agent/extensions/qwen-mode-proxy/index.ts
 *   Auto-discovered by pi. Reload with /reload.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

// ── Mode definitions ────────────────────────────────────────────────

type ModeName = "thinking" | "coding" | "instruct";

interface ModeParams {
	/** Sampling temperature (0.0–2.0) */
	temperature: number;
	/** Nucleus sampling top_p (0.0–1.0) */
	top_p: number;
	/** Top-k sampling (0 = disabled, >0 = keep top k tokens) */
	top_k: number;
	/** Minimum P ratio (0.0–1.0, 0 = disabled) */
	min_p: number;
	/** Presence penalty (-2.0–2.0, rewards new topics) */
	presence_penalty: number;
	/** Repetition penalty (1.0 = disabled, >1.0 penalizes repeats) */
	repetition_penalty: number;
}

const MODES: Record<ModeName, ModeParams> = {
	/** Thinking mode — creative, exploratory, maximises diversity */
	thinking: {
		temperature: 1.0,
		top_p: 0.95,
		top_k: 20,
		min_p: 0.0,
		presence_penalty: 0.0,
		repetition_penalty: 1.0,
	},
	/** Coding mode — precise, deterministic, low temperature */
	coding: {
		temperature: 0.6,
		top_p: 0.95,
		top_k: 20,
		min_p: 0.0,
		presence_penalty: 0.0,
		repetition_penalty: 1.0,
	},
	/** Instruct mode — balanced, with presence penalty for variety */
	instruct: {
		temperature: 0.7,
		top_p: 0.8,
		top_k: 20,
		min_p: 0.0,
		presence_penalty: 1.5,
		repetition_penalty: 1.0,
	},
};

const MODE_LABELS: Record<ModeName, string> = {
	thinking: "🧠 Thinking",
	coding: "💻 Coding",
	instruct: "📝 Instruct",
};

const MODE_COLORS: Record<ModeName, "info" | "success" | "warning"> = {
	thinking: "info",
	coding: "success",
	instruct: "warning",
};

const CUSTOM_ENTRY_TYPE = "qwen-mode-proxy";
const TARGET_MODEL = "llamacpp"; // matches the model id in models.json

// ── Helpers ─────────────────────────────────────────────────────────

function isLlamacppPayload(payload: unknown): boolean {
	if (payload && typeof payload === "object" && "model" in payload) {
		return (payload as Record<string, unknown>).model === TARGET_MODEL;
	}
	return false;
}

function updateUi(ctx: ExtensionContext, mode: ModeName) {
	const label = MODE_LABELS[mode];
	const color = MODE_COLORS[mode];
	ctx.ui.setStatus("qwen-mode", label);
}

// ── Extension ───────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	// In-memory state (lost on reload — restored from session in session_start)
	let currentMode: ModeName = "thinking";

	// ── Restore mode from session ───────────────────────────────────
	pi.on("session_start", async (_event, ctx) => {
		const entries = ctx.sessionManager.getEntries();
		// Find the last saved mode entry
		for (let i = entries.length - 1; i >= 0; i--) {
			const entry = entries[i];
			if (entry.type === "custom" && entry.customType === CUSTOM_ENTRY_TYPE) {
				const saved = (entry as any).data as { mode?: ModeName };
				if (saved.mode && saved.mode in MODES) {
					currentMode = saved.mode;
				}
				break; // use the most recent saved mode
			}
		}
		updateUi(ctx, currentMode);
	});

	// ── Persist mode on shutdown ────────────────────────────────────
	pi.on("session_shutdown", async (_event, _ctx) => {
		pi.appendEntry(CUSTOM_ENTRY_TYPE, { mode: currentMode });
	});

	// ── Intercept provider requests ─────────────────────────────────
	pi.on("before_provider_request", (event, _ctx) => {
		// Only modify requests for our target model
		if (!isLlamacppPayload(event.payload)) return;

		const payload = event.payload as Record<string, unknown>;
		const params = MODES[currentMode];

		// Inject mode-specific sampling parameters.
		// These override whatever pi set by default.
		payload.temperature = params.temperature;
		payload.top_p = params.top_p;
		payload.top_k = params.top_k;
		payload.min_p = params.min_p;
		payload.presence_penalty = params.presence_penalty;
		payload.repetition_penalty = params.repetition_penalty;

		return payload;
	});

	// ── Update status bar on model select ───────────────────────────
	pi.on("model_select", async (_event, ctx) => {
		updateUi(ctx, currentMode);
	});

	// ── /mode command ───────────────────────────────────────────────
	pi.registerCommand("mode", {
		description: "Switch Qwen sampling mode (thinking/coding/instruct)",
		argumentHint: "[thinking|coding|instruct]",
		getArgumentCompletions: (prefix: string) => {
			const candidates: Array<{ value: string; label: string }> = [];
			for (const name of ["thinking", "coding", "instruct"]) {
				if (prefix === "" || name.startsWith(prefix)) {
					candidates.push({ value: name, label: MODE_LABELS[name as ModeName] });
				}
			}
			return candidates.length > 0 ? candidates : null;
		},
		handler: async (args, ctx) => {
			const arg = args?.trim().toLowerCase();

			// No argument: show current mode details
			if (!arg || arg === "") {
				const params = MODES[currentMode];
				const detailLines = [
					`${MODE_LABELS[currentMode]} (current)`,
					"",
					`  temperature    ${params.temperature}`,
					`  top_p          ${params.top_p}`,
					`  top_k          ${params.top_k}`,
					`  min_p          ${params.min_p}`,
					`  presence_penalty ${params.presence_penalty}`,
					`  repetition_penalty ${params.repetition_penalty}`,
					"",
					`Switch: /mode thinking | /mode coding | /mode instruct`,
				];
				ctx.ui.setWidget("qwen-mode", detailLines);
				updateUi(ctx, currentMode);
				return;
			}

			// Known mode: switch to it
			if (arg in MODES) {
				const oldMode = currentMode;
				currentMode = arg as ModeName;

				// Persist to session
				pi.appendEntry(CUSTOM_ENTRY_TYPE, { mode: currentMode });

				updateUi(ctx, currentMode);

				if (oldMode !== currentMode) {
					ctx.ui.notify(
						`Mode: ${MODE_LABELS[oldMode]} → ${MODE_LABELS[currentMode]}`,
						MODE_COLORS[currentMode],
					);
				} else {
					ctx.ui.notify(
						`${MODE_LABELS[currentMode]} (already active)`,
						MODE_COLORS[currentMode],
					);
				}
				return;
			}

			// Unknown argument
			ctx.ui.notify(
				`Unknown mode "${arg}". Use: thinking, coding, or instruct`,
				"error",
			);
		},
	});
}
