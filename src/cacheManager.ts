// CacheManager class for handling all caching operations
export class CacheManager {
    private static instance: CacheManager;
    private caches: Map<string, any>;
    private cacheTTL: number;
    private maxCacheSize: number;
    private cacheHits: Map<string, number>;

    private constructor(ttlHours: number = 12, maxSizeMB: number = 50) {
        this.caches = new Map();
        this.cacheHits = new Map();
        this.cacheTTL = ttlHours * 60 * 60 * 1000; // Convert hours to milliseconds
        this.maxCacheSize = maxSizeMB * 1024 * 1024; // Convert MB to bytes
    }

    static getInstance(ttlHours?: number, maxSizeMB?: number): CacheManager {
        if (!CacheManager.instance) {
            CacheManager.instance = new CacheManager(ttlHours, maxSizeMB);
        }
        return CacheManager.instance;
    }

    set(key: string, value: any, namespace: string = 'default'): void {
        const cacheKey = `${namespace}:${key}`;
        const cacheEntry = {
            value,
            timestamp: Date.now(),
            size: this.getObjectSize(value)
        };

        // Increment hit counter
        this.cacheHits.set(cacheKey, (this.cacheHits.get(cacheKey) || 0) + 1);

        // Check cache size and evict if needed
        while (this.getCurrentCacheSize() + cacheEntry.size > this.maxCacheSize) {
            this.evictLeastUsed();
        }

        this.caches.set(cacheKey, cacheEntry);
    }

    get<T>(key: string, namespace: string = 'default'): T | null {
        const cacheKey = `${namespace}:${key}`;
        const entry = this.caches.get(cacheKey);

        if (!entry) {
            return null;
        }

        // Check if entry has expired
        if (Date.now() - entry.timestamp > this.cacheTTL) {
            this.caches.delete(cacheKey);
            return null;
        }

        // Increment hit counter
        this.cacheHits.set(cacheKey, (this.cacheHits.get(cacheKey) || 0) + 1);

        return entry.value as T;
    }

    clear(namespace?: string): void {
        if (namespace) {
            // Clear specific namespace
            Array.from(this.caches.keys())
                .filter(key => key.startsWith(`${namespace}:`))
                .forEach(key => this.caches.delete(key));
        } else {
            // Clear all caches
            this.caches.clear();
            this.cacheHits.clear();
        }
    }

    private getCurrentCacheSize(): number {
        let totalSize = 0;
        for (const entry of this.caches.values()) {
            totalSize += entry.size;
        }
        return totalSize;
    }

    private evictLeastUsed(): void {
        let leastUsedKey: string | null = null;
        let leastHits = Infinity;

        for (const [key, hits] of this.cacheHits) {
            if (hits < leastHits) {
                leastHits = hits;
                leastUsedKey = key;
            }
        }

        if (leastUsedKey) {
            this.caches.delete(leastUsedKey);
            this.cacheHits.delete(leastUsedKey);
        }
    }

    private getObjectSize(obj: any): number {
        const str = JSON.stringify(obj);
        return new Blob([str]).size;
    }

    // Add cache analytics
    getStats(): any {
        const totalSize = this.getCurrentCacheSize();
        const itemCount = this.caches.size;
        const hitRates = new Map();

        for (const [key, hits] of this.cacheHits) {
            hitRates.set(key, hits);
        }

        return {
            totalSize: `${(totalSize / 1024 / 1024).toFixed(2)} MB`,
            itemCount,
            hitRates: Object.fromEntries(hitRates),
            maxSize: `${this.maxCacheSize / 1024 / 1024} MB`,
            ttl: `${this.cacheTTL / 1000 / 60 / 60} hours`
        };
    }
}