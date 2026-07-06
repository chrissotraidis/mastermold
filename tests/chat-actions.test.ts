/// <reference types="bun" />

/**
 * Chat actions (docs/chat-actions.md): Master Mold's small bounded actuation
 * surface. Proves parsing is strict, forbidden powers are structurally absent,
 * execution routes through the same clamped control functions as the panel /
 * Analyst, and everything lands in the activity log. Temp stores, no network.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  actionTier,
  executeChatAction,
  extractActionBlock,
  parseActionIntent,
} from "../src/chat/actions";
import { buildLocalCommandAnswer } from "../src/chat/local-commands";
import { DEFAULT_STRATEGY_PARAMS } from "../src/autopilot/params";
import { __resetAutopilotStoreForTests, autopilotStore } from "../src/autopilot/store";

let prevAutopilotDb: string | undefined;
let prevDb: string | undefined;

beforeEach(() => {
  prevAutopilotDb = process.env.AUTOPILOT_DB;
  prevDb = process.env.MASTERMOLD_DB;
  const dir = mkdtempSync(join(tmpdir(), "mm-chat-actions-"));
  process.env.AUTOPILOT_DB = join(dir, "autopilot.db.json");
  process.env.MASTERMOLD_DB = join(dir, "mastermold.db.json");
  __resetAutopilotStoreForTests();
});

afterEach(() => {
  if (prevAutopilotDb === undefined) delete process.env.AUTOPILOT_DB;
  else process.env.AUTOPILOT_DB = prevAutopilotDb;
  if (prevDb === undefined) delete process.env.MASTERMOLD_DB;
  else process.env.MASTERMOLD_DB = prevDb;
  __resetAutopilotStoreForTests();
});

describe("parsing is strict", () => {
  test("GIVEN valid intents THEN they parse; garbage and unknown kinds do not", () => {
    expect(parseActionIntent({ kind: "halt" })).toEqual({ kind: "halt" });
    expect(parseActionIntent({ kind: "set_param", changes: { take_profit_r: 1.8 } })).toMatchObject({ kind: "set_param" });
    expect(parseActionIntent({ kind: "release_kill_switch" })).toBeNull(); // structurally impossible
    expect(parseActionIntent({ kind: "set_mode", mode: "live" })).toBeNull();
    expect(parseActionIntent({ kind: "set_param", changes: { max_trade_usd: 500 } })).toBeNull(); // caps are NOT params
    expect(parseActionIntent({ kind: "set_param", changes: { take_profit_r: "2" } })).toBeNull(); // non-numeric
    expect(parseActionIntent(null)).toBeNull();
  });

  test("GIVEN a model reply with a fenced action block THEN it extracts; malformed blocks are ignored", () => {
    const reply = 'Sure — tightening the target.\n```action\n{"kind":"set_param","changes":{"take_profit_r":1.8},"reason":"choppy tape"}\n```';
    const extracted = extractActionBlock(reply);
    expect(extracted?.intent).toMatchObject({ kind: "set_param", changes: { take_profit_r: 1.8 } });
    expect(extractActionBlock("no block here")).toBeNull();
    expect(extractActionBlock("```action\nnot json\n```")).toBeNull();
  });

  test("GIVEN tiers THEN halting/stopping/acks are instant, arming/params require confirm", () => {
    expect(actionTier({ kind: "halt" })).toBe("instant");
    expect(actionTier({ kind: "stop" })).toBe("instant");
    expect(actionTier({ kind: "ack_alert", alert_id: "x" })).toBe("instant");
    expect(actionTier({ kind: "arm_paper" })).toBe("confirm");
    expect(actionTier({ kind: "set_param", changes: { take_profit_r: 1.8 } })).toBe("confirm");
  });
});

describe("execution routes through the real controls", () => {
  test("GIVEN halt THEN the kill switch engages, the mode halts, and the tape logs 'chat'", () => {
    const result = executeChatAction({ kind: "halt" });
    expect(result.ok).toBe(true);
    const state = autopilotStore().botState();
    expect(state.kill_switch).toBe(true);
    expect(state.mode).toBe("halted");
    expect(autopilotStore().activity(5).some((row) => row.kind === "chat")).toBe(true);
  });

  test("GIVEN arm_paper after a halt THEN the same mode rules refuse it (kill switch first)", () => {
    executeChatAction({ kind: "halt" });
    const armed = executeChatAction({ kind: "arm_paper" });
    expect(armed.ok).toBe(false);
    expect(armed.message).toContain("Kill switch");
  });

  test("GIVEN set_param inside the rails THEN it applies with a changelog entry; outside the rails it is refused", () => {
    const applied = executeChatAction({ kind: "set_param", changes: { take_profit_r: 1.8 }, reason: "test tweak" });
    expect(applied.ok).toBe(true);
    expect(autopilotStore().strategyParams().take_profit_r).toBe(1.8);
    const entry = autopilotStore().paramChangelog(5)[0];
    expect(entry.source).toBe("operator");
    expect(entry.reason).toContain("via chat");

    const refused = executeChatAction({ kind: "set_param", changes: { take_profit_r: 99 } });
    expect(refused.ok).toBe(false);
    expect(refused.message).toContain("rail");
    expect(autopilotStore().strategyParams().take_profit_r).toBe(1.8); // unchanged
  });

  test("GIVEN arm then stop via actions THEN modes follow", () => {
    expect(executeChatAction({ kind: "arm_paper" }).ok).toBe(true);
    expect(autopilotStore().botState().mode).toBe("paper");
    expect(executeChatAction({ kind: "stop" }).ok).toBe(true);
    expect(autopilotStore().botState().mode).toBe("off");
  });
});

describe("instant phrases in the local command layer", () => {
  test("GIVEN 'halt the bot' in chat THEN it executes immediately and answers with the state", async () => {
    const answer = await buildLocalCommandAnswer("halt the bot");
    expect(answer?.body).toContain("kill switch is engaged");
    expect(autopilotStore().botState().kill_switch).toBe(true);
  });

  test("GIVEN 'stop the bot' THEN mode goes off; params stay untouched", async () => {
    executeChatAction({ kind: "arm_paper" });
    const answer = await buildLocalCommandAnswer("stop the bot");
    expect(answer?.body).toContain("stopped");
    expect(autopilotStore().botState().mode).toBe("off");
    expect(autopilotStore().strategyParams()).toEqual(DEFAULT_STRATEGY_PARAMS);
  });
});
