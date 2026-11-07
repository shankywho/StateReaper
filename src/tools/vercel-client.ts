/**
 * src/tools/vercel-client.ts
 * Vercel deployment teardown and usage management wrappers.
 *
 * Implements deterministic dry-run/mock simulation for local testing,
 * and live Vercel REST API calls with graceful 403/404 handling in production.
 */

import axios from 'axios';
import { config } from '../config';

export class VercelDomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode?: number,
    public readonly originalError?: unknown,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'VercelDomainError';
  }
}

export interface PruneResult {
  readonly success: boolean;
  readonly deletedId: string;
  readonly deletedAt: string;
  readonly provider: 'vercel';
  readonly note?: string;
}

/**
 * Prunes an orphaned Vercel preview deployment via the Vercel REST API.
 * Endpoint: DELETE https://api.vercel.com/v13/deployments/{id}
 */
export async function pruneDeployment(deploymentId: string): Promise<PruneResult> {
  // Local / Dry Run / Mock execution
  if (config.useMockTelemetry || !config.vercelApiToken) {
    console.log(`[Vercel Client] [DRY RUN] Requesting deletion of orphaned deployment: ${deploymentId}`);
    console.log(`[Vercel Client] [DRY RUN] Deployment ${deploymentId} successfully deleted.`);

    return {
      success: true,
      deletedId: deploymentId,
      deletedAt: new Date().toISOString(),
      provider: 'vercel',
    };
  }

  // Live Vercel REST API execution
  const teamParam = config.vercelTeamId ? `?teamId=${encodeURIComponent(config.vercelTeamId)}` : '';
  const endpoint = `https://api.vercel.com/v13/deployments/${encodeURIComponent(deploymentId)}${teamParam}`;

  try {
    console.log(`[Vercel Client] DELETE ${endpoint}`);

    await axios.delete(endpoint, {
      headers: {
        Authorization: `Bearer ${config.vercelApiToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 10_000,
    });

    console.log(`[Vercel Client] Successfully deleted deployment ${deploymentId}`);

    return {
      success: true,
      deletedId: deploymentId,
      deletedAt: new Date().toISOString(),
      provider: 'vercel',
    };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      const responseData = err.response?.data as { error?: { message?: string } } | undefined;
      const apiMessage = responseData?.error?.message ?? err.message;

      // Graceful 404 handling: target deployment does not exist or was already removed
      if (status === 404) {
        console.warn(`[Vercel Client] Deployment ${deploymentId} was already pruned or not found (404). Reconciled.`);
        return {
          success: true,
          deletedId: deploymentId,
          deletedAt: new Date().toISOString(),
          provider: 'vercel',
          note: 'Resource already deleted (HTTP 404)',
        };
      }

      // Graceful 403 handling: token lacks authorization
      if (status === 403) {
        throw new VercelDomainError(
          'VERCEL_PERMISSION_DENIED',
          `Insufficient permissions for VERCEL_API_TOKEN on deployment ${deploymentId}: ${apiMessage}`,
          403,
          err,
        );
      }

      throw new VercelDomainError(
        'VERCEL_API_ERROR',
        `Vercel API returned HTTP ${status ?? 'unknown'}: ${apiMessage}`,
        status,
        err,
      );
    }

    const message = err instanceof Error ? err.message : String(err);
    throw new VercelDomainError('VERCEL_UNKNOWN_ERROR', `Failed to prune deployment ${deploymentId}: ${message}`, undefined, err);
  }
}
