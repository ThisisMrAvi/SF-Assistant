// src/services/requestDeduplicationManager.ts

/**
 * Manages in-flight requests to prevent duplicate API calls
 * When multiple requests for the same resource come in,
 * they share the same promise instead of making duplicate API calls
 */
export class RequestDeduplicationManager {
    private inFlightRequests: Map<string, Promise<any>> = new Map();
    private REQUEST_TIMEOUT_MS = 30000; // 30 seconds
    private requestTimestamps: Map<string, number> = new Map();
    private requestSubscribers: Map<string, Set<string>> = new Map(); // Maps requestKey to set of panelIds

    /**
     * Execute a request or return existing promise if already in flight
     * 
     * @param requestKey Unique identifier for the request (e.g., "fetch-objects-standard")
     * @param executor Function that performs the actual API call
     * @returns Promise that resolves to the result
     * 
     * @example
     * const result = await dedupManager.executeOnce('fetch-objects-standard', async () => {
     *     return await getObjectList(false);
     * });
     */
    async executeOnce<T>(
        requestKey: string,
        executor: () => Promise<T>
    ): Promise<T> {
        // If request is already in flight, return the existing promise
        if (this.inFlightRequests.has(requestKey)) {
            return this.inFlightRequests.get(requestKey) as Promise<T>;
        }

        // Start new request
        const promise = executor()
            .then((result) => {
                return result;
            })
            .catch((error) => {
                throw error;
            })
            .finally(() => {
                // Schedule cleanup after timeout
                setTimeout(() => {
                    this.inFlightRequests.delete(requestKey);
                    this.requestTimestamps.delete(requestKey);
                    this.requestSubscribers.delete(requestKey);
                }, this.REQUEST_TIMEOUT_MS);
            });

        this.inFlightRequests.set(requestKey, promise);
        this.requestTimestamps.set(requestKey, Date.now());

        return promise as Promise<T>;
    }

    /**
     * Check if a request is currently in flight
     */
    isInFlight(requestKey: string): boolean {
        return this.inFlightRequests.has(requestKey);
    }

    /**
     * Get the timestamp when a request started (if in flight)
     */
    getRequestStartTime(requestKey: string): number | null {
        return this.requestTimestamps.get(requestKey) ?? null;
    }

    /**
     * Get elapsed time for a request (if in flight)
     */
    getElapsedTime(requestKey: string): number {
        const startTime = this.requestTimestamps.get(requestKey);
        if (!startTime) return 0;
        return Date.now() - startTime;
    }

    /**
     * Force cleanup of a specific request
     */
    clearRequest(requestKey: string): void {
        this.inFlightRequests.delete(requestKey);
        this.requestTimestamps.delete(requestKey);
    }

    /**
     * Clear all in-flight requests
     */
    clearAll(): void {
        this.inFlightRequests.clear();
        this.requestTimestamps.clear();
        this.requestSubscribers.clear();
    }

    /**
     * Register a panel as a subscriber to a request
     * Call this before executeOnce() to track which panels requested this data
     */
    subscribeToRequest(requestKey: string, panelId: string): void {
        if (!this.requestSubscribers.has(requestKey)) {
            this.requestSubscribers.set(requestKey, new Set());
        }
        this.requestSubscribers.get(requestKey)!.add(panelId);
    }

    /**
     * Get all panels subscribed to a request
     */
    getSubscribers(requestKey: string): Set<string> {
        return this.requestSubscribers.get(requestKey) || new Set();
    }

    /**
     * Clear subscribers for a request (call after broadcast)
     */
    clearSubscribers(requestKey: string): void {
        this.requestSubscribers.delete(requestKey);
    }

    /**
     * Get statistics about current in-flight requests
     */
    getStats(): {
        count: number;
        requests: Array<{ key: string; elapsedMs: number }>;
    } {
        const requests = Array.from(this.requestTimestamps.entries()).map(([key, timestamp]) => ({
            key,
            elapsedMs: Date.now() - timestamp,
        }));

        return {
            count: requests.length,
            requests,
        };
    }
}

// Singleton instance
export const requestDedup = new RequestDeduplicationManager();
