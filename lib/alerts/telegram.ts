import { getDb } from "@/db";
import {
  alertDeliveries,
  assets,
  featureSnapshots,
  modelArtifacts,
  predictions,
} from "@/db/schema";
import { getAlertConfiguration } from "@/lib/providers/config";
import { and, desc, eq, gte, isNotNull } from "drizzle-orm";

export interface TelegramAlertStatus {
  enabled: boolean;
  configured: boolean;
  probabilityThreshold: number;
  policy: "validated-shadow-predictions-only";
  tradingEnabled: false;
}

export interface TelegramAlertRun {
  status: "disabled" | "not-configured" | "dry-run" | "delivered" | "unavailable";
  considered: number;
  eligible: number;
  delivered: number;
  failed: number;
  skippedPreviouslyDelivered: number;
  details: Array<{
    predictionId: string;
    mint: string;
    symbol: string;
    probability: number;
    action: "would-send" | "delivered" | "failed" | "skipped";
    reason: string | null;
  }>;
  reason: string | null;
}

interface TelegramResponse {
  ok?: boolean;
  description?: string;
  result?: { message_id?: number };
}

function percent(value: number): string {
  return new Intl.NumberFormat("en", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
}

function secondsLabel(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3_600) return `${seconds / 60}m`;
  return `${seconds / 3_600}h`;
}

function parsePredictionTarget(value: string): {
  horizonSeconds: number | null;
  orderSizeUsd: number | null;
} {
  try {
    const parsed = JSON.parse(value) as {
      target?: { horizonSeconds?: unknown; orderSizeUsd?: unknown };
    };
    const horizonSeconds = typeof parsed.target?.horizonSeconds === "number"
      ? parsed.target.horizonSeconds
      : null;
    const orderSizeUsd = typeof parsed.target?.orderSizeUsd === "number"
      ? parsed.target.orderSizeUsd
      : null;
    return { horizonSeconds, orderSizeUsd };
  } catch {
    return { horizonSeconds: null, orderSizeUsd: null };
  }
}

export function formatShadowAlert(args: {
  name: string;
  symbol: string;
  mint: string;
  probability: number;
  lowerBound: number | null;
  upperBound: number | null;
  referenceClock: string;
  cutoffSeconds: number;
  horizonSeconds: number | null;
  orderSizeUsd: number | null;
  publicAppUrl: string | null;
}): string {
  const interval = args.lowerBound === null || args.upperBound === null
    ? "interval unavailable"
    : `${percent(args.lowerBound)}–${percent(args.upperBound)} interval`;
  const target = [
    args.orderSizeUsd === null ? null : `$${args.orderSizeUsd.toLocaleString("en-US")} order`,
    args.horizonSeconds === null ? null : `${secondsLabel(args.horizonSeconds)} horizon`,
  ].filter(Boolean).join(" · ");
  const reportUrl = args.publicAppUrl
    ? `${args.publicAppUrl}/?screen=report&mint=${encodeURIComponent(args.mint)}`
    : null;
  return [
    `MemeTrace shadow alert — ${args.name} ($${args.symbol})`,
    `${percent(args.probability)} calibrated pump probability · ${interval}`,
    `${secondsLabel(args.cutoffSeconds)} after ${args.referenceClock}${target ? ` · ${target}` : ""}`,
    `Mint: ${args.mint}`,
    reportUrl,
    "Research alert only. No trade was submitted.",
  ].filter(Boolean).join("\n");
}

export function getTelegramAlertStatus(): TelegramAlertStatus {
  const config = getAlertConfiguration();
  return {
    enabled: config.enabled,
    configured: Boolean(config.telegramBotToken && config.telegramChatId),
    probabilityThreshold: config.probabilityThreshold,
    policy: "validated-shadow-predictions-only",
    tradingEnabled: false,
  };
}

async function sendTelegramMessage(
  token: string,
  chatId: string,
  message: string,
): Promise<{ messageId: string | null }> {
  const response = await fetch(
    `https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8_000),
    },
  );
  const body = await response.json().catch(() => ({})) as TelegramResponse;
  if (!response.ok || !body.ok) {
    throw new Error(body.description || `Telegram returned HTTP ${response.status}.`);
  }
  return {
    messageId: body.result?.message_id === undefined
      ? null
      : String(body.result.message_id),
  };
}

export async function runTelegramShadowAlerts(args: {
  dryRun?: boolean;
  limit?: number;
} = {}): Promise<TelegramAlertRun> {
  const config = getAlertConfiguration();
  const dryRun = args.dryRun === true;
  const limit = Math.max(1, Math.min(25, Math.floor(args.limit ?? 10)));
  if (!config.enabled && !dryRun) {
    return {
      status: "disabled",
      considered: 0,
      eligible: 0,
      delivered: 0,
      failed: 0,
      skippedPreviouslyDelivered: 0,
      details: [],
      reason: "MEMETRACE_ALERTS_ENABLED is not true.",
    };
  }
  if ((!config.telegramBotToken || !config.telegramChatId) && !dryRun) {
    return {
      status: "not-configured",
      considered: 0,
      eligible: 0,
      delivered: 0,
      failed: 0,
      skippedPreviouslyDelivered: 0,
      details: [],
      reason: "TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required.",
    };
  }

  try {
    const db = await getDb();
    const rows = await db
      .select({
        predictionId: predictions.id,
        probability: predictions.probability,
        lowerBound: predictions.lowerBound,
        upperBound: predictions.upperBound,
        explanationJson: predictions.explanationJson,
        mint: assets.mintAddress,
        name: assets.name,
        symbol: assets.symbol,
        cutoffSeconds: featureSnapshots.cutoffSeconds,
        featureSetVersion: featureSnapshots.featureSetVersion,
      })
      .from(predictions)
      .innerJoin(assets, eq(predictions.assetId, assets.id))
      .innerJoin(featureSnapshots, eq(predictions.featureSnapshotId, featureSnapshots.id))
      .innerJoin(modelArtifacts, and(
        eq(predictions.modelVersion, modelArtifacts.modelVersion),
        eq(modelArtifacts.status, "validated"),
      ))
      .where(and(
        eq(predictions.mode, "shadow"),
        isNotNull(predictions.probability),
        gte(predictions.probability, config.probabilityThreshold),
      ))
      .orderBy(desc(predictions.writtenAt))
      .limit(limit);

    const details: TelegramAlertRun["details"] = [];
    let delivered = 0;
    let failed = 0;
    let skippedPreviouslyDelivered = 0;
    for (const row of rows) {
      if (row.probability === null) continue;
      const [prior] = await db
        .select({ status: alertDeliveries.status })
        .from(alertDeliveries)
        .where(and(
          eq(alertDeliveries.predictionId, row.predictionId),
          eq(alertDeliveries.channel, "telegram"),
        ))
        .limit(1);
      if (prior?.status === "delivered") {
        skippedPreviouslyDelivered += 1;
        details.push({
          predictionId: row.predictionId,
          mint: row.mint,
          symbol: row.symbol,
          probability: row.probability,
          action: "skipped",
          reason: "Already delivered.",
        });
        continue;
      }
      if (dryRun) {
        details.push({
          predictionId: row.predictionId,
          mint: row.mint,
          symbol: row.symbol,
          probability: row.probability,
          action: "would-send",
          reason: null,
        });
        continue;
      }

      const referenceClock = row.featureSetVersion.endsWith(":graduation")
        ? "graduation"
        : "launch";
      const target = parsePredictionTarget(row.explanationJson);
      const attemptedAt = new Date().toISOString();
      try {
        const sent = await sendTelegramMessage(
          config.telegramBotToken as string,
          config.telegramChatId as string,
          formatShadowAlert({
            name: row.name,
            symbol: row.symbol,
            mint: row.mint,
            probability: row.probability,
            lowerBound: row.lowerBound,
            upperBound: row.upperBound,
            referenceClock,
            cutoffSeconds: row.cutoffSeconds,
            horizonSeconds: target.horizonSeconds,
            orderSizeUsd: target.orderSizeUsd,
            publicAppUrl: config.publicAppUrl,
          }),
        );
        await db.insert(alertDeliveries).values({
          id: `alert:${row.predictionId}:telegram`,
          predictionId: row.predictionId,
          channel: "telegram",
          status: "delivered",
          attemptedAt,
          deliveredAt: new Date().toISOString(),
          providerMessageId: sent.messageId,
          failureReason: null,
        }).onConflictDoUpdate({
          target: alertDeliveries.id,
          set: {
            status: "delivered",
            attemptedAt,
            deliveredAt: new Date().toISOString(),
            providerMessageId: sent.messageId,
            failureReason: null,
          },
        });
        delivered += 1;
        details.push({
          predictionId: row.predictionId,
          mint: row.mint,
          symbol: row.symbol,
          probability: row.probability,
          action: "delivered",
          reason: null,
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Telegram delivery failed.";
        await db.insert(alertDeliveries).values({
          id: `alert:${row.predictionId}:telegram`,
          predictionId: row.predictionId,
          channel: "telegram",
          status: "failed",
          attemptedAt,
          deliveredAt: null,
          providerMessageId: null,
          failureReason: reason.slice(0, 500),
        }).onConflictDoUpdate({
          target: alertDeliveries.id,
          set: {
            status: "failed",
            attemptedAt,
            deliveredAt: null,
            providerMessageId: null,
            failureReason: reason.slice(0, 500),
          },
        });
        failed += 1;
        details.push({
          predictionId: row.predictionId,
          mint: row.mint,
          symbol: row.symbol,
          probability: row.probability,
          action: "failed",
          reason,
        });
      }
    }

    return {
      status: dryRun ? "dry-run" : delivered > 0 ? "delivered" : "unavailable",
      considered: rows.length,
      eligible: rows.length - skippedPreviouslyDelivered,
      delivered,
      failed,
      skippedPreviouslyDelivered,
      details,
      reason: rows.length === 0
        ? "No validated shadow prediction meets the configured threshold."
        : delivered === 0 && !dryRun && failed === 0
          ? "No undelivered eligible prediction was available."
          : null,
    };
  } catch (error) {
    return {
      status: "unavailable",
      considered: 0,
      eligible: 0,
      delivered: 0,
      failed: 0,
      skippedPreviouslyDelivered: 0,
      details: [],
      reason: error instanceof Error
        ? `Alert data is unavailable: ${error.message}`
        : "Alert data is unavailable.",
    };
  }
}

