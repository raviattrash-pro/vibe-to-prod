---
name: offline-first
description: Design offline-capable applications: local storage strategy, sync protocols, conflict resolution policies, optimistic UI updates, retry queues, and graceful degradation under unreliable network conditions.
---

# Offline and Synchronization Design

## Purpose

Define how the application stores data locally, synchronises with the server, resolves conflicts, and degrades gracefully when the network is unavailable or unreliable.

## Activate when

When offline use, synchronization, or unreliable networks are required by the user or the deployment context. Select this capability only when it applies to the request.

## Inputs

- offline workflows (which features must work offline)
- conflict policy (last-write-wins, merge, manual)
- connectivity assumptions (intermittent, fully offline, low bandwidth)
- data sensitivity and size

## Procedure

1. Identify which features must work offline, which can degrade gracefully, and which require connectivity. Produce an offline capability matrix.
2. Choose a local storage strategy appropriate to data size and structure: IndexedDB for structured data, Cache API for assets, localStorage for small key-value config. Document storage quotas and eviction behaviour.
3. Design the sync protocol: define what triggers sync (connectivity restored, user action, interval), what data is synced (full vs incremental), and how sync state is tracked (timestamps, version vectors, sequence IDs).
4. Define the conflict resolution policy for each data type: last-write-wins (with server timestamp), field-level merge, or manual user resolution. Document which policy applies where and why.
5. Implement a retry queue for failed writes: queue mutations when offline, replay them in order on reconnection, handle permanent failures (409 conflict, 410 gone) distinctly from transient failures (503, timeout).
6. Design optimistic UI updates: show the user the expected result immediately, mark it as pending, and reconcile when the server confirms or rejects. Handle rollback for rejected mutations.
7. Test under degraded conditions: simulate offline (airplane mode), slow network (3G throttling), and intermittent connectivity. Verify that data is not lost, duplicated, or corrupted.

## Avoid

- Caching authenticated API responses or user credentials in local storage without reviewing privacy implications.
- Assuming unlimited local storage; browsers enforce quotas and may evict data under storage pressure.
- Using last-write-wins as the default conflict policy for all data types without considering merge alternatives for collaborative data.
- Claiming offline support works without testing under actual degraded connectivity.

## Expected outputs

- sync design document
- conflict handling strategy
- failure recovery procedures
- local storage architecture
- offline capability matrix

## Validation

- define consistency expectations for each data type
- cover retries and conflicts with specific policies
- test degraded connectivity scenarios
- storage quotas and eviction documented
- Report checks that were not run as unverified.
- Provide evidence references and actionable remediation for failures.
