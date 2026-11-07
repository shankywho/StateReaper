/**
 * src/tools/aws-client.ts
 * AWS EC2 snapshot and termination wrappers (read-safe / write-gated).
 *
 * Provides deterministic simulation in mock / dry-run mode (default for local judging),
 * and live AWS SDK calls with structured domain errors in production.
 */

import {
  EC2Client,
  DescribeInstancesCommand,
  CreateSnapshotCommand,
  TerminateInstancesCommand,
} from '@aws-sdk/client-ec2';
import { config } from '../config';

export class AwsDomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly originalError?: unknown,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'AwsDomainError';
  }
}

export interface SnapshotResult {
  readonly snapshotId: string;
  readonly volumeId: string;
  readonly instanceId: string;
  readonly createdAt: string;
}

export interface TerminationResult {
  readonly instanceId: string;
  readonly previousState: string;
  readonly currentState: string;
  readonly terminatedAt: string;
}

/**
 * Classifies AWS SDK exceptions into structured, deterministic domain errors.
 */
function classifyAwsError(err: unknown, defaultCode: string, context: string): AwsDomainError {
  if (err instanceof AwsDomainError) return err;

  const errName = typeof err === 'object' && err !== null && 'name' in err ? String(err.name) : '';
  const errCode = typeof err === 'object' && err !== null && 'Code' in err ? String(err.Code) : '';
  const message = err instanceof Error ? err.message : String(err);

  if (
    errName === 'UnauthorizedOperation' ||
    errCode === 'UnauthorizedOperation' ||
    errName.includes('AccessDenied') ||
    message.includes('not authorized') ||
    message.includes('AccessDenied')
  ) {
    return new AwsDomainError(
      'AWS_IAM_PERMISSION_DENIED',
      `IAM authorization denied during ${context}: ${message}`,
      err,
    );
  }

  if (
    errName.includes('NotFound') ||
    errCode.includes('NotFound') ||
    errName === 'InvalidInstanceID.NotFound' ||
    errCode === 'InvalidInstanceID.NotFound'
  ) {
    return new AwsDomainError(
      'AWS_INSTANCE_NOT_FOUND',
      `Target EC2 instance was not found during ${context}: ${message}`,
      err,
    );
  }

  if (errName === 'InvalidVolume.NotFound' || errCode === 'InvalidVolume.NotFound') {
    return new AwsDomainError(
      'AWS_VOLUME_NOT_FOUND',
      `Attached EBS volume not found during ${context}: ${message}`,
      err,
    );
  }

  if (errName === 'AuthFailure' || errCode === 'AuthFailure') {
    return new AwsDomainError(
      'AWS_AUTH_FAILURE',
      `Invalid AWS credentials or security token during ${context}: ${message}`,
      err,
    );
  }

  return new AwsDomainError(defaultCode, `AWS SDK execution failure during ${context}: ${message}`, err);
}

/**
 * Creates an EBS snapshot of the root attached volume for an instance before termination.
 */
export async function createEbsSnapshot(
  instanceId: string,
  region?: string,
): Promise<SnapshotResult> {
  const targetRegion = region ?? config.awsRegion;

  // Local / Dry Run / Mock execution
  if (config.useMockTelemetry || !config.awsAccessKeyId || !config.awsSecretAccessKey) {
    const timestamp = Date.now().toString(36);
    const mockVolumeId = `vol-${instanceId.replace(/^i-/, '')}-root`;
    const mockSnapshotId = `snap-${instanceId.replace(/^i-/, '')}-${timestamp}`;

    console.log(`[AWS EC2] [DRY RUN] Initiating EBS snapshot for ${instanceId} (volume: ${mockVolumeId})`);
    console.log(`[AWS EC2] [DRY RUN] Snapshot successfully provisioned: ${mockSnapshotId}`);

    return {
      snapshotId: mockSnapshotId,
      volumeId: mockVolumeId,
      instanceId,
      createdAt: new Date().toISOString(),
    };
  }

  // Live AWS API execution
  const client = new EC2Client({
    region: targetRegion,
    credentials: {
      accessKeyId: config.awsAccessKeyId,
      secretAccessKey: config.awsSecretAccessKey,
    },
  });

  try {
    // 1. Look up instance and resolve attached Root Device Volume ID
    let descRes;
    try {
      const describeCmd = new DescribeInstancesCommand({
        InstanceIds: [instanceId],
      });
      descRes = await client.send(describeCmd);
    } catch (err) {
      throw classifyAwsError(err, 'AWS_DESCRIBE_INSTANCES_FAILED', `DescribeInstances(${instanceId})`);
    }

    const instance = descRes.Reservations?.[0]?.Instances?.[0];
    if (!instance) {
      throw new AwsDomainError(
        'AWS_INSTANCE_NOT_FOUND',
        `DescribeInstances returned no reservations for instance ${instanceId}`,
      );
    }

    const rootDeviceName = instance.RootDeviceName;
    const blockMappings = instance.BlockDeviceMappings ?? [];

    // Find volume mapped to the root device, or fallback to first EBS volume
    const rootMapping = blockMappings.find((m) => m.DeviceName === rootDeviceName) ?? blockMappings[0];
    const volumeId = rootMapping?.Ebs?.VolumeId;

    if (!volumeId) {
      throw new AwsDomainError(
        'AWS_VOLUME_NOT_FOUND',
        `Could not identify attached root EBS volume for instance ${instanceId}`,
      );
    }

    // 2. Issue CreateSnapshotCommand
    try {
      const snapshotCmd = new CreateSnapshotCommand({
        VolumeId: volumeId,
        Description: `StateReaper emergency preservation snapshot for ${instanceId} prior to termination.`,
        TagSpecifications: [
          {
            ResourceType: 'snapshot',
            Tags: [
              { Key: 'ManagedBy', Value: 'StateReaper' },
              { Key: 'OriginalInstanceId', Value: instanceId },
              { Key: 'PreservedAt', Value: new Date().toISOString() },
            ],
          },
        ],
      });

      const snapRes = await client.send(snapshotCmd);
      const snapshotId = snapRes.SnapshotId;

      if (!snapshotId) {
        throw new AwsDomainError('AWS_SNAPSHOT_FAILED', `Snapshot creation returned no SnapshotId for ${volumeId}`);
      }

      console.log(`[AWS EC2] Snapshot ${snapshotId} created for root volume ${volumeId}`);

      return {
        snapshotId,
        volumeId,
        instanceId,
        createdAt: snapRes.StartTime ? snapRes.StartTime.toISOString() : new Date().toISOString(),
      };
    } catch (err) {
      throw classifyAwsError(err, 'AWS_SNAPSHOT_FAILED', `CreateSnapshot(${volumeId})`);
    }
  } catch (err) {
    if (err instanceof AwsDomainError) throw err;
    throw classifyAwsError(err, 'AWS_UNKNOWN_ERROR', `createEbsSnapshot(${instanceId})`);
  }
}

/**
 * Deterministically terminates an EC2 instance.
 */
export async function terminateInstance(
  instanceId: string,
  region?: string,
): Promise<TerminationResult> {
  const targetRegion = region ?? config.awsRegion;

  // Local / Dry Run / Mock execution
  if (config.useMockTelemetry || !config.awsAccessKeyId || !config.awsSecretAccessKey) {
    console.log(`[AWS EC2] [DRY RUN] Calling TerminateInstances on ${instanceId}...`);
    console.log(`[AWS EC2] [DRY RUN] Instance ${instanceId} transitioned from "running" to "terminated"`);

    return {
      instanceId,
      previousState: 'running',
      currentState: 'terminated',
      terminatedAt: new Date().toISOString(),
    };
  }

  // Live AWS API execution
  const client = new EC2Client({
    region: targetRegion,
    credentials: {
      accessKeyId: config.awsAccessKeyId,
      secretAccessKey: config.awsSecretAccessKey,
    },
  });

  try {
    const terminateCmd = new TerminateInstancesCommand({
      InstanceIds: [instanceId],
    });
    const res = await client.send(terminateCmd);

    const stateChange = res.TerminatingInstances?.[0];
    const previousState = stateChange?.PreviousState?.Name ?? 'unknown';
    const currentState = stateChange?.CurrentState?.Name ?? 'shutting-down';

    console.log(`[AWS EC2] TerminateInstances(${instanceId}) success: ${previousState} -> ${currentState}`);

    return {
      instanceId,
      previousState,
      currentState,
      terminatedAt: new Date().toISOString(),
    };
  } catch (err) {
    throw classifyAwsError(err, 'AWS_TERMINATE_FAILED', `TerminateInstances(${instanceId})`);
  }
}
