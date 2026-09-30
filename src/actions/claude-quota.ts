import {
	action,
	type DidReceiveSettingsEvent,
	type KeyDownEvent,
	SingletonAction,
	streamDeck,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";

import { formatCountdown, probe, type Snapshot, UsageApiPausedError } from "../probe.js";
import { resolveSettings, type Settings } from "../settings.js";
import { buildErrorSvg, buildLoadingSvg, buildSvg, type RenderInput } from "../svg-builder.js";

const SPINNER_FRAME_MS = 90;
const SPINNER_STEP_DEG = 18;

// Multiple keys (one per profile/device) each run their own poll timer. A
// snapshot fetched by one key moments ago is reused by the others so the
// rate-limited usage endpoint sees one request per interval, not one per key.
// Kept just under the interval so the reuse window closes before the next tick
// rather than swallowing it.
const SNAPSHOT_REUSE_RATIO = 0.75;

@action({ UUID: "com.asuka.claude-quota.5h" })
export class ClaudeQuotaAction extends SingletonAction<Settings> {
	private pollTimers = new Map<string, NodeJS.Timeout>();
	private spinnerTimers = new Map<string, NodeJS.Timeout>();
	private spinnerAngles = new Map<string, number>();
	private inFlight = new Set<string>();
	private settings = new Map<string, Settings>();
	private lastSnapshot: Snapshot | null = null;
	private lastUpdatedAt: number | null = null;

	override async onWillAppear(ev: WillAppearEvent<Settings>): Promise<void> {
		this.settings.set(ev.action.id, ev.payload.settings ?? {});
		await this.update(ev.action);
		this.armPollTimer(ev.action);
	}

	override onWillDisappear(ev: WillDisappearEvent<Settings>): void {
		this.stopSpinner(ev.action.id);
		this.clearPollTimer(ev.action.id);
		this.settings.delete(ev.action.id);
	}

	override async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
		streamDeck.logger.info("manual refresh requested");
		this.settings.set(ev.action.id, ev.payload.settings ?? {});
		await this.update(ev.action, { force: true });
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<Settings>): Promise<void> {
		const incoming = ev.payload.settings ?? {};
		this.settings.set(ev.action.id, incoming);
		streamDeck.logger.info(`settings updated for ${ev.action.id}`);
		this.armPollTimer(ev.action);
		if (this.lastSnapshot) {
			await this.render(ev.action, this.lastSnapshot);
		} else {
			await this.renderEmpty(ev.action);
		}
	}

	// resolveSettings already clamps to the endpoint's floor, so this is the one
	// place the interval is derived and both the timer and the reuse window
	// stay in step with it.
	private pollIntervalMs(actionId: string): number {
		return resolveSettings(this.settings.get(actionId)).pollSeconds * 1000;
	}

	private armPollTimer(action: WillAppearEvent["action"]): void {
		this.clearPollTimer(action.id);
		const timer = setInterval(() => {
			void this.update(action);
		}, this.pollIntervalMs(action.id));
		this.pollTimers.set(action.id, timer);
	}

	private clearPollTimer(actionId: string): void {
		const timer = this.pollTimers.get(actionId);
		if (timer) {
			clearInterval(timer);
			this.pollTimers.delete(actionId);
		}
	}

	private async update(action: WillAppearEvent["action"], opts: { force?: boolean } = {}): Promise<void> {
		if (this.inFlight.has(action.id)) {
			streamDeck.logger.debug("update skipped — probe already in flight");
			return;
		}
		if (
			!opts.force &&
			this.lastSnapshot &&
			this.lastUpdatedAt !== null &&
			Date.now() - this.lastUpdatedAt < this.pollIntervalMs(action.id) * SNAPSHOT_REUSE_RATIO
		) {
			streamDeck.logger.debug("update reused fresh snapshot from another key");
			await this.render(action, this.lastSnapshot);
			return;
		}
		this.inFlight.add(action.id);
		this.startSpinner(action);
		try {
			const snapshot = await probe();
			this.lastSnapshot = snapshot;
			this.lastUpdatedAt = Date.now();
			this.stopSpinner(action.id);
			await this.render(action, snapshot);
			streamDeck.logger.info(
				`updated: 5h=${snapshot.sessionPercent}% reset=${formatCountdown(snapshot.sessionResetMinutes)} 7d=${snapshot.weeklyPercent}% fable=${snapshot.fablePercent ?? "—"}%`,
			);
		} catch (err) {
			this.stopSpinner(action.id);
			const message = err instanceof Error ? err.message : String(err);
			// A pause is the designed response to a 429, not a fault — logging it
			// as an error would bury the real failures in the plugin log.
			if (err instanceof UsageApiPausedError) {
				streamDeck.logger.info(message);
			} else {
				streamDeck.logger.error(`probe failed: ${message}`);
			}
			if (this.lastSnapshot && this.lastSnapshot.sessionPercent !== null) {
				streamDeck.logger.info("keeping last good snapshot on probe failure");
				await this.render(action, this.lastSnapshot);
			} else {
				await action.setImage(buildErrorSvg(message));
			}
		} finally {
			this.inFlight.delete(action.id);
		}
	}

	private startSpinner(action: WillAppearEvent["action"]): void {
		this.stopSpinner(action.id);
		this.spinnerAngles.set(action.id, 0);
		const tick = () => {
			const angle = this.spinnerAngles.get(action.id) ?? 0;
			const base = this.snapshotToRenderInput(action.id, this.lastSnapshot);
			void action.setImage(buildLoadingSvg(base, angle));
			this.spinnerAngles.set(action.id, (angle + SPINNER_STEP_DEG) % 360);
		};
		tick();
		const timer = setInterval(tick, SPINNER_FRAME_MS);
		this.spinnerTimers.set(action.id, timer);
	}

	private stopSpinner(actionId: string): void {
		const timer = this.spinnerTimers.get(actionId);
		if (timer) {
			clearInterval(timer);
			this.spinnerTimers.delete(actionId);
			this.spinnerAngles.delete(actionId);
		}
	}

	private async render(action: WillAppearEvent["action"], snapshot: Snapshot): Promise<void> {
		const input = this.snapshotToRenderInput(action.id, snapshot);
		await action.setImage(buildSvg(input ?? this.emptyRenderInput(action.id)));
	}

	private async renderEmpty(action: WillAppearEvent["action"]): Promise<void> {
		await action.setImage(buildSvg(this.emptyRenderInput(action.id)));
	}

	private snapshotToRenderInput(actionId: string, snapshot: Snapshot | null): RenderInput | null {
		if (!snapshot || snapshot.sessionPercent === null) return null;
		return {
			session: {
				percent: snapshot.sessionPercent,
				countdown: formatCountdown(snapshot.sessionResetMinutes),
			},
			weekly: {
				percent: snapshot.weeklyPercent,
				countdown: formatCountdown(snapshot.weeklyResetMinutes),
			},
			fable: {
				percent: snapshot.fablePercent,
				countdown: formatCountdown(snapshot.fableResetMinutes),
			},
			isActive: true,
			settings: this.settings.get(actionId),
		};
	}

	private emptyRenderInput(actionId: string): RenderInput {
		return {
			session: { percent: null, countdown: "—" },
			weekly: { percent: null, countdown: "—" },
			fable: { percent: null, countdown: "—" },
			isActive: false,
			settings: this.settings.get(actionId),
		};
	}
}
