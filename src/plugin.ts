import streamDeck from "@elgato/streamdeck";

import { ClaudeQuotaAction } from "./actions/claude-quota.js";

streamDeck.logger.setLevel("info");

streamDeck.actions.registerAction(new ClaudeQuotaAction());

streamDeck.connect();
