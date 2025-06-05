// ===== alltourism-main.js - 한국관광공사 API 메인 시스템 =====
'use strict';

// 파일 1에서 가져오기
const {
    RuntimeEnvironment,
    SERVICE_START_TIME,
    ResourceManager,
    ServiceContainer,
    Semaphore,
    LanguageNegotiator,
    InternationalizationManager,
    ConstantsManager,
    ConfigManager,
    Logger
} = require('./alltourism-core');

/**
 * @typedef {Object} CacheItem
 * @property {*} data - 캐시된 데이터
 * @property {number} timestamp - 저장 시간
 * @property {number} size - 데이터 크기
 */

// ===== 고급 캐시 시스템 =====
class AdvancedCache {
    constructor(container) {
        this.container = container;
        this.configManager = container.get('config');
        this.logger = container.get('logger');
        this.resourceManager = container.resourceManager;

        this.cache = new Map();
        this.accessTimes = new Map();
        this.stats = {
            hitCount: 0,
            missCount: 0,
            evictionCount: 0,
            setCount: 0
        };

        this.maxSize = this.configManager.get('maxCacheSize');
        this.ttl = this.configManager.get('cacheTtl');
        this.sizeTracker = 0;
        this.maxMemorySize = this.configManager.get('maxMemorySize');

        this.memoryMonitor = {
            checkInterval: this.configManager.get('memoryCheckInterval'),
            threshold: this.configManager.get('memoryThreshold'),
            lastCheck: Date.now(),
            intervalId: null
        };

        this.cleanupIntervalId = null;
        this.startCleanupWorker();
        this.startMemoryMonitoring();
        this.setupConfigSubscription();
    }

    /**
     * 설정 변경을 구독합니다
     */
    setupConfigSubscription() {
        this.configManager.subscribe((key, newValue, oldValue) => {
            if (key === 'maxCacheSize') {
                this.maxSize = newValue;
                this.logger.info('Cache max size updated', { old: oldValue, new: newValue });
                if (newValue < oldValue && this.cache.size > newValue) {
                    this.enforceSizeLimit();
                }
            } else if (key === 'cacheTtl') {
                this.ttl = newValue;
                this.logger.info('Cache TTL updated', { old: oldValue, new: newValue });
            } else if (key === 'maxMemorySize') {
                this.maxMemorySize = newValue;
                this.logger.info('Cache max memory updated', { old: oldValue, new: newValue });
            } else if (key === 'memoryCheckInterval') {
                this.memoryMonitor.checkInterval = newValue;
                this.restartMemoryMonitoring();
            } else if (key === 'memoryThreshold') {
                this.memoryMonitor.threshold = newValue;
            }
        });
    }

    /**
     * 캐시 키를 생성합니다
     * @param {string} operation - 오퍼레이션
     * @param {Object} params - 매개변수
     * @returns {string} 생성된 캐시 키
     */
    generateKey(operation, params) {
        const normalizeValue = (value) => {
            if (Array.isArray(value)) return value.sort().join(',');
            if (typeof value === 'object' && value !== null) {
                return JSON.stringify(value, Object.keys(value).sort());
            }
            return String(value);
        };

        const sortedEntries = Object.entries(params)
            .filter(([_, value]) => value !== undefined && value !== null && value !== '')
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}:${normalizeValue(value)}`)
            .join('|');

        return `${operation}:${sortedEntries}`;
    }

    /**
     * 데이터 크기를 추정합니다
     * @param {*} data - 데이터
     * @returns {number} 추정 크기 (바이트)
     */
    estimateSize(data) {
        try {
            if (typeof data === 'string') {
                return data.length * 2; // UTF-16
            }

            if (typeof data === 'object' && data !== null) {
                const str = JSON.stringify(data);
                return str.length * 2 + 100; // JSON overhead
            }

            return 50; // 기본 오버헤드
        } catch {
            return 50;
        }
    }

    /**
     * 캐시에서 값을 가져옵니다
     * @param {string} key - 캐시 키
     * @returns {*} 캐시된 값 또는 null
     */
    get(key) {
        if (!key || typeof key !== 'string') {
            return null;
        }

        const item = this.cache.get(key);

        if (!item) {
            this.stats.missCount++;
            this.logger.debug('Cache miss', { key });
            return null;
        }

        const now = Date.now();

        if (now - item.timestamp > this.ttl) {
            this.delete(key);
            this.stats.missCount++;
            this.logger.debug('Cache expired', { key, age: now - item.timestamp });
            return null;
        }

        this.accessTimes.set(key, now);
        this.stats.hitCount++;
        this.logger.debug('Cache hit', { key });
        return item.data;
    }

    /**
     * 캐시에 값을 저장합니다
     * @param {string} key - 캐시 키
     * @param {*} data - 저장할 데이터
     */
    set(key, data) {
        if (!key || typeof key !== 'string' || data === undefined) {
            return;
        }

        const now = Date.now();
        const size = this.estimateSize(data);

        // 메모리 한도 체크
        if (this.sizeTracker + size > this.maxMemorySize) {
            this.evictByMemory();
        }

        // 크기 한도 체크
        if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
            this.evictLRU();
        }

        // 기존 아이템이 있으면 크기 차감
        const existingItem = this.cache.get(key);
        if (existingItem) {
            this.sizeTracker -= existingItem.size;
        }

        this.cache.set(key, {
            data,
            timestamp: now,
            size
        });

        this.accessTimes.set(key, now);
        this.sizeTracker += size;
        this.stats.setCount++;

        this.logger.debug('Cache set', {
            key,
            dataSize: size,
            totalSize: this.sizeTracker,
            cacheSize: this.cache.size
        });
    }

    /**
     * 캐시에서 항목을 삭제합니다
     * @param {string} key - 캐시 키
     * @returns {boolean} 삭제 성공 여부
     */
    delete(key) {
        const item = this.cache.get(key);
        if (item) {
            this.sizeTracker = Math.max(0, this.sizeTracker - item.size);
            this.cache.delete(key);
            this.accessTimes.delete(key);
            return true;
        }
        return false;
    }

    /**
     * LRU 정책으로 항목을 제거합니다
     */
    evictLRU() {
        let oldestKey = null;
        let oldestTime = Date.now();

        for (const [key, time] of this.accessTimes.entries()) {
            if (time < oldestTime) {
                oldestTime = time;
                oldestKey = key;
            }
        }

        if (oldestKey) {
            this.delete(oldestKey);
            this.stats.evictionCount++;
            this.logger.debug('LRU eviction', { evictedKey: oldestKey });
        }
    }

    /**
     * 메모리 기반으로 항목을 제거합니다
     */
    evictByMemory() {
        const targetSize = this.maxMemorySize * 0.6; // 60%까지 줄이기
        let attempts = 0;
        const maxAttempts = this.cache.size;

        while (this.sizeTracker > targetSize && 
               this.cache.size > 0 && 
               attempts < maxAttempts) {
            this.evictLRU();
            attempts++;
        }

        this.logger.info('Memory-based cache eviction completed', {
            remainingSize: this.sizeTracker,
            targetSize,
            cacheSize: this.cache.size,
            attempts
        });
    }

    /**
     * 메모리 모니터링을 시작합니다
     */
    startMemoryMonitoring() {
        if (this.memoryMonitor.intervalId) {
            this.resourceManager.clearInterval(this.memoryMonitor.intervalId);
        }

        this.memoryMonitor.intervalId = this.resourceManager.setInterval(() => {
            const usage = RuntimeEnvironment.getMemoryUsage();

            if (usage.heapTotal > 0) {
                const heapUsagePercent = usage.heapUsed / usage.heapTotal;

                if (heapUsagePercent > this.memoryMonitor.threshold) {
                    this.logger.warn('High memory usage detected', {
                        heapUsagePercent: Math.round(heapUsagePercent * 100),
                        heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
                        heapTotal: Math.round(usage.heapTotal / 1024 / 1024)
                    });

                    this.emergencyCleanup();
                }
            }

            this.memoryMonitor.lastCheck = Date.now();
        }, this.memoryMonitor.checkInterval);
    }

    /**
     * 메모리 모니터링을 재시작합니다
     */
    restartMemoryMonitoring() {
        this.startMemoryMonitoring();
    }

    /**
     * 응급 정리를 수행합니다
     */
    emergencyCleanup() {
        const targetSize = Math.floor(this.cache.size * 0.3); // 30%만 남기기
        let cleanedCount = 0;
        let attempts = 0;
        const maxAttempts = this.cache.size;

        while (this.cache.size > targetSize && 
               this.cache.size > 0 && 
               attempts < maxAttempts) {
            this.evictLRU();
            cleanedCount++;
            attempts++;
        }

        this.logger.info('Emergency cache cleanup completed', {
            remainingItems: this.cache.size,
            cleanedItems: cleanedCount
        });
    }

    /**
     * 크기 제한을 강제합니다
     */
    enforceSizeLimit() {
        let attempts = 0;
        const maxAttempts = this.cache.size;

        while (this.cache.size > this.maxSize && attempts < maxAttempts) {
            this.evictLRU();
            attempts++;
        }
    }

    /**
     * 캐시를 완전히 정리합니다
     */
    clear() {
        this.cache.clear();
        this.accessTimes.clear();
        this.sizeTracker = 0;
        this.stats = {
            hitCount: 0,
            missCount: 0,
            evictionCount: 0,
            setCount: 0
        };
        this.logger.info('Cache cleared');
    }

    /**
     * 캐시 통계를 가져옵니다
     * @returns {Object} 통계 정보
     */
    getStats() {
        const totalRequests = this.stats.hitCount + this.stats.missCount;
        const hitRate = totalRequests > 0 ? (this.stats.hitCount / totalRequests) * 100 : 0;

        const memoryUsage = RuntimeEnvironment.getMemoryUsage();

        return {
            ...this.stats,
            hitRate: Math.round(hitRate * 100) / 100,
            size: this.cache.size,
            maxSize: this.maxSize,
            memorySize: this.sizeTracker,
            maxMemorySize: this.maxMemorySize,
            memoryUsage: {
                heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
                heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
                external: Math.round(memoryUsage.external / 1024 / 1024),
                rss: Math.round(memoryUsage.rss / 1024 / 1024)
            },
            efficiency: {
                memoryPerItem: this.cache.size > 0 ? Math.round(this.sizeTracker / this.cache.size) : 0,
                avgAccessTime: this.getAverageAccessTime()
            }
        };
    }

    /**
     * 평균 접근 시간을 가져옵니다
     * @returns {number} 평균 접근 시간 (밀리초)
     */
    getAverageAccessTime() {
        if (this.accessTimes.size === 0) return 0;

        const now = Date.now();
        const totalAge = Array.from(this.accessTimes.values())
            .reduce((sum, time) => sum + (now - time), 0);

        return Math.round(totalAge / this.accessTimes.size);
    }

    /**
     * 정리 워커를 시작합니다
     */
    startCleanupWorker() {
        this.cleanupIntervalId = this.resourceManager.setInterval(() => {
            const now = Date.now();
            let cleanedCount = 0;
            let freedMemory = 0;

            for (const [key, item] of this.cache.entries()) {
                if (now - item.timestamp > this.ttl) {
                    freedMemory += item.size;
                    this.delete(key);
                    cleanedCount++;
                }
            }

            if (cleanedCount > 0) {
                this.logger.debug('Scheduled cache cleanup completed', {
                    cleanedCount,
                    freedMemory,
                    remainingItems: this.cache.size
                });
            }
        }, Math.min(this.ttl / 2, 5 * 60 * 1000)); // TTL의 절반 또는 5분 중 짧은 것
    }

    /**
     * 캐시를 파괴합니다
     */
    destroy() {
        if (this.cleanupIntervalId) {
            this.resourceManager.clearInterval(this.cleanupIntervalId);
            this.cleanupIntervalId = null;
        }

        if (this.memoryMonitor.intervalId) {
            this.resourceManager.clearInterval(this.memoryMonitor.intervalId);
            this.memoryMonitor.intervalId = null;
        }

        this.clear();
    }
}

// ===== 레이트 리미터 =====
class RateLimiter {
    constructor(container) {
        this.container = container;
        this.configManager = container.get('config');
        this.logger = container.get('logger');
        this.resourceManager = container.resourceManager;

        this.requests = new Map();
        this.limit = this.configManager.get('rateLimitPerMinute');
        this.windowMs = 60 * 1000;
        this.cleanupIntervalId = null;

        this.setupConfigSubscription();
        this.startCleanup();
    }

    /**
     * 설정 변경을 구독합니다
     */
    setupConfigSubscription() {
        this.configManager.subscribe((key, newValue, oldValue) => {
            if (key === 'rateLimitPerMinute') {
                this.limit = newValue;
                this.logger.info('Rate limit updated', { old: oldValue, new: newValue });
            }
        });
    }

    /**
     * 클라이언트의 요청이 허용되는지 확인합니다
     * @param {string} clientId - 클라이언트 ID
     * @returns {boolean} 허용 여부
     */
    isAllowed(clientId) {
        if (!clientId || typeof clientId !== 'string') {
            return false;
        }

        const now = Date.now();
        const windowStart = now - this.windowMs;

        if (!this.requests.has(clientId)) {
            this.requests.set(clientId, []);
        }

        const clientRequests = this.requests.get(clientId);

        // 윈도우 밖의 요청 제거
        const validRequests = clientRequests.filter(timestamp => timestamp > windowStart);
        this.requests.set(clientId, validRequests);

        if (validRequests.length >= this.limit) {
            this.logger.debug('Rate limit exceeded', {
                clientId,
                requestCount: validRequests.length,
                limit: this.limit
            });
            return false;
        }

        validRequests.push(now);
        return true;
    }

    /**
     * 정리 작업을 시작합니다
     */
    startCleanup() {
        this.cleanupIntervalId = this.resourceManager.setInterval(() => {
            this.cleanup();
        }, this.windowMs);
    }

    /**
     * 만료된 요청 기록을 정리합니다
     */
    cleanup() {
        const now = Date.now();
        const windowStart = now - this.windowMs;
        let cleanedClients = 0;

        for (const [clientId, requests] of this.requests.entries()) {
            const validRequests = requests.filter(timestamp => timestamp > windowStart);

            if (validRequests.length === 0) {
                this.requests.delete(clientId);
                cleanedClients++;
            } else {
                this.requests.set(clientId, validRequests);
            }
        }

        if (cleanedClients > 0) {
            this.logger.debug('Rate limiter cleanup completed', {
                cleanedClients,
                remainingClients: this.requests.size
            });
        }
    }

    /**
     * 클라이언트의 남은 할당량을 가져옵니다
     * @param {string} clientId - 클라이언트 ID
     * @returns {number} 남은 할당량
     */
    getRemainingQuota(clientId) {
        if (!clientId || !this.requests.has(clientId)) {
            return this.limit;
        }

        const now = Date.now();
        const windowStart = now - this.windowMs;
        const validRequests = this.requests.get(clientId).filter(
            timestamp => timestamp > windowStart
        );

        return Math.max(0, this.limit - validRequests.length);
    }

    /**
     * 레이트 리미터 통계를 가져옵니다
     * @returns {Object} 통계 정보
     */
    getStats() {
        return {
            totalClients: this.requests.size,
            limit: this.limit,
            windowMs: this.windowMs,
            activeRequests: Array.from(this.requests.values())
                .reduce((sum, requests) => sum + requests.length, 0)
        };
    }

    /**
     * 레이트 리미터를 파괴합니다
     */
    destroy() {
        if (this.cleanupIntervalId) {
            this.resourceManager.clearInterval(this.cleanupIntervalId);
            this.cleanupIntervalId = null;
        }

        this.requests.clear();
    }
}

// ===== 커스텀 에러 클래스들 =====
class TourismApiError extends Error {
    constructor(messageCode, operation, statusCode = 500, details = {}, params = {}, i18nInstance = null) {
        const message = i18nInstance ? i18nInstance.getMessage(messageCode, params) : messageCode;

        super(message);
        this.name = 'TourismApiError';
        this.code = messageCode;
        this.operation = operation;
        this.statusCode = statusCode;
        this.details = details;
        this.timestamp = new Date().toISOString();

        // V8 엔진에서 스택 트레이스 캡처
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, TourismApiError);
        }
    }

    toJSON() {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            operation: this.operation,
            statusCode: this.statusCode,
            details: this.details,
            timestamp: this.timestamp
        };
    }
}

class ValidationError extends TourismApiError {
    constructor(message, field, value, i18nInstance = null) {
        super('VALIDATION_ERROR', 'validation', 400, { field, value }, {}, i18nInstance);
        this.name = 'ValidationError';
        this.message = message;
        this.field = field;
        this.value = value;
    }
}

class ApiTimeoutError extends TourismApiError {
    constructor(operation, timeout, i18nInstance = null) {
        super('API_TIMEOUT', operation, 408, { timeout }, { timeout }, i18nInstance);
        this.name = 'ApiTimeoutError';
        this.timeout = timeout;
    }
}

class RateLimitError extends TourismApiError {
    constructor(limit, remaining, i18nInstance = null) {
        super('RATE_LIMIT_EXCEEDED', 'rateLimit', 429, { limit, remaining }, {}, i18nInstance);
        this.name = 'RateLimitError';
        this.limit = limit;
        this.remaining = remaining;
    }
}

class NetworkError extends TourismApiError {
    constructor(operation, originalError, i18nInstance = null) {
        super('NETWORK_ERROR', operation, 503, { originalError: originalError.message }, {}, i18nInstance);
        this.name = 'NetworkError';
        this.originalError = originalError;
    }
}

// ===== 입력 검증 시스템 =====
class InputValidator {
    constructor(container) {
        this.container = container;
        this.i18n = container.get('i18n');
        this.schemas = new Map();
        this.customValidators = new Map();
        this.setupSchemas();
        this.registerCustomValidators();
    }

    /**
     * 검증 스키마를 설정합니다
     */
    setupSchemas() {
        const commonSchema = {
            numOfRows: { type: 'string', pattern: /^\d+$/, min: 1, max: 1000 },
            pageNo: { type: 'string', pattern: /^\d+$/, min: 1, max: 1000 },
            arrange: { type: 'string', enum: ['A', 'B', 'C', 'D', 'E', 'O', 'Q', 'R'] }
        };

        const locationSchema = {
            userLat: { type: 'string', pattern: /^-?\d+\.?\d*$/, custom: 'latitude' },
            userLng: { type: 'string', pattern: /^-?\d+\.?\d*$/, custom: 'longitude' },
            radius: { type: 'string', pattern: /^\d+\.?\d*$/, min: 0.1, max: 20000 }
        };

        this.schemas.set('areaBasedList', {
            ...commonSchema,
            ...locationSchema,
            contentTypeId: { type: 'string', enum: ['12', '14', '15', '25', '28', '32', '38', '39'] },
            areaCode: { type: 'string', pattern: /^\d{1,2}$/, min: 1, max: 39 },
            sigunguCode: { type: 'string', pattern: /^\d{1,5}$/ },
            cat1: { type: 'string', pattern: /^[A-Z]\d{2}$/ },
            cat2: { type: 'string', pattern: /^[A-Z]\d{4}$/ },
            cat3: { type: 'string', pattern: /^[A-Z]\d{6}$/ },
            modifiedtime: { type: 'string', pattern: /^\d{8}$/ }
        });

        this.schemas.set('locationBasedList', {
            ...commonSchema,
            mapX: { type: 'string', required: true, pattern: /^\d+\.?\d*$/, custom: 'longitude' },
            mapY: { type: 'string', required: true, pattern: /^\d+\.?\d*$/, custom: 'latitude' },
            radius: { type: 'string', required: true, pattern: /^\d+$/, min: 1, max: 20000 },
            contentTypeId: { type: 'string', enum: ['12', '14', '15', '25', '28', '32', '38', '39'] }
        });

        this.schemas.set('searchKeyword', {
            ...commonSchema,
            ...locationSchema,
            keyword: { type: 'string', required: true, minLength: 1, maxLength: 100, custom: 'keyword' },
            contentTypeId: { type: 'string', enum: ['12', '14', '15', '25', '28', '32', '38', '39'] },
            areaCode: { type: 'string', pattern: /^\d{1,2}$/ },
            sigunguCode: { type: 'string', pattern: /^\d{1,5}$/ }
        });

        this.schemas.set('detailCommon', {
            contentId: { type: 'string', required: true, pattern: /^\d+$/ },
            defaultYN: { type: 'string', enum: ['Y', 'N'] },
            firstImageYN: { type: 'string', enum: ['Y', 'N'] },
            areacodeYN: { type: 'string', enum: ['Y', 'N'] },
            catcodeYN: { type: 'string', enum: ['Y', 'N'] },
            addrinfoYN: { type: 'string', enum: ['Y', 'N'] },
            mapinfoYN: { type: 'string', enum: ['Y', 'N'] },
            overviewYN: { type: 'string', enum: ['Y', 'N'] }
        });

        this.schemas.set('detailIntro', {
            contentId: { type: 'string', required: true, pattern: /^\d+$/ },
            contentTypeId: { type: 'string', required: true, enum: ['12', '14', '15', '25', '28', '32', '38', '39'] }
        });

        this.schemas.set('batchDetail', {
            contentIds: { type: 'object', required: true, isArray: true, custom: 'contentIdArray' }
        });
    }

    /**
     * 커스텀 검증자들을 등록합니다
     */
    registerCustomValidators() {
        this.customValidators.set('latitude', (value) => {
            const num = parseFloat(value);
            return !isNaN(num) && num >= -90 && num <= 90;
        });

        this.customValidators.set('longitude', (value) => {
            const num = parseFloat(value);
            return !isNaN(num) && num >= -180 && num <= 180;
        });

        this.customValidators.set('keyword', (value) => {
            if (typeof value !== 'string') return false;
            const trimmed = value.trim();
            // XSS 및 SQL 인젝션 방지 강화
            const dangerousPatterns = [
                /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
                /javascript:/gi,
                /on\w+\s*=/gi,
                /'.*?(\b(union|select|insert|delete|drop|update|exec)\b).*?'/gi,
                /[<>"'&`]/
            ];
            
            return trimmed.length > 0 && 
                   trimmed.length <= 100 && 
                   !dangerousPatterns.some(pattern => pattern.test(trimmed));
        });

        this.customValidators.set('contentIdArray', (value) => {
            if (!Array.isArray(value)) return false;
            if (value.length === 0 || value.length > 50) return false; // 배치 크기 제한
            
            // 중복 제거 및 유효성 확인
            const uniqueIds = [...new Set(value)];
            return uniqueIds.every(id => 
                typeof id === 'string' && 
                /^\d+$/.test(id) && 
                parseInt(id) > 0 && 
                parseInt(id) <= 999999999 // 합리적인 ID 범위
            );
        });
    }

    /**
     * 타입을 검증합니다
     * @param {*} value - 검증할 값
     * @param {string} expectedType - 예상 타입
     * @param {string} fieldName - 필드명
     */
    validateType(value, expectedType, fieldName) {
        if (value !== null && value !== undefined) {
            const actualType = Array.isArray(value) ? 'array' : typeof value;
            if (actualType !== expectedType) {
                throw new ValidationError(
                    `${fieldName} must be of type ${expectedType}, got ${actualType}`,
                    fieldName,
                    value,
                    this.i18n
                );
            }
        }
    }

    /**
     * 오퍼레이션과 매개변수를 검증합니다
     * @param {string} operation - 오퍼레이션
     * @param {Object} params - 매개변수
     * @returns {boolean} 검증 성공 여부
     */
    validate(operation, params) {
        if (!operation || typeof operation !== 'string') {
            throw new ValidationError(
                'Operation must be a non-empty string',
                'operation',
                operation,
                this.i18n
            );
        }

        const schema = this.schemas.get(operation);
        if (!schema) {
            throw new ValidationError(
                this.i18n.getMessage('UNSUPPORTED_OPERATION', { operation }),
                'operation',
                operation,
                this.i18n
            );
        }

        if (!params || typeof params !== 'object') {
            throw new ValidationError(
                'Parameters must be an object',
                'params',
                params,
                this.i18n
            );
        }

        const errors = [];

        for (const [field, rules] of Object.entries(schema)) {
            try {
                this.validateField(field, params[field], rules);
            } catch (error) {
                errors.push(error.message);
            }
        }

        if (errors.length > 0) {
            throw new ValidationError(
                `${this.i18n.getMessage('VALIDATION_ERROR')}: ${errors.join(', ')}`,
                'validation',
                params,
                this.i18n
            );
        }

        return true;
    }

    /**
     * 개별 필드를 검증합니다
     * @param {string} field - 필드명
     * @param {*} value - 값
     * @param {Object} rules - 검증 규칙
     */
    validateField(field, value, rules) {
        // 필수 체크
        if (rules.required && (value === undefined || value === null || 
            (typeof value === 'string' && value.trim() === ''))) {
            throw new Error(`${field}${this.i18n.getMessage('FIELD_REQUIRED')}`);
        }

        // 값이 없으면 나머지 검증 건너뛰기
        if (value === undefined || value === null || value === '') {
            return;
        }

        // 배열 타입 체크
        if (rules.isArray && !Array.isArray(value)) {
            throw new Error(`${field} must be an array`);
        }

        // 타입 체크
        if (!rules.isArray && rules.type) {
            this.validateType(value, rules.type, field);
        }

        // 패턴 체크
        if (rules.pattern && typeof value === 'string' && !rules.pattern.test(value)) {
            throw new Error(`${field}${this.i18n.getMessage('INVALID_FORMAT')}`);
        }

        // 문자열 길이 체크
        if (typeof value === 'string') {
            if (rules.minLength && value.length < rules.minLength) {
                throw new Error(`${field}${this.i18n.getMessage('MIN_LENGTH_ERROR', { minLength: rules.minLength })}`);
            }
            if (rules.maxLength && value.length > rules.maxLength) {
                throw new Error(`${field}${this.i18n.getMessage('MAX_LENGTH_ERROR', { maxLength: rules.maxLength })}`);
            }
        }

        // 숫자 범위 체크
        if (rules.min !== undefined || rules.max !== undefined) {
            const numValue = parseFloat(value);
            if (isNaN(numValue)) {
                throw new Error(`${field}${this.i18n.getMessage('NUMERIC_ERROR')}`);
            }
            if (rules.min !== undefined && numValue < rules.min) {
                throw new Error(`${field}${this.i18n.getMessage('INVALID_RANGE')}`);
            }
            if (rules.max !== undefined && numValue > rules.max) {
                throw new Error(`${field}${this.i18n.getMessage('INVALID_RANGE')}`);
            }
        }

        // Enum 체크
        if (rules.enum && !rules.enum.includes(value)) {
            throw new Error(`${field}${this.i18n.getMessage('ENUM_ERROR', { values: rules.enum.join(', ') })}`);
        }

        // 커스텀 검증
        if (rules.custom && this.customValidators.has(rules.custom)) {
            const customValidator = this.customValidators.get(rules.custom);
            if (!customValidator(value)) {
                throw new Error(`${field}${this.i18n.getMessage('INVALID_FORMAT')}`);
            }
        }
    }
}


// ===== HTTP 클라이언트 =====
class HttpClient {
    constructor(container) {
        this.container = container;
        this.configManager = container.get('config');
        this.constants = container.get('constants');
        this.logger = container.get('logger');
        this.resourceManager = container.resourceManager;

        this.timeout = this.configManager.get('apiTimeout');
        this.retryAttempts = this.configManager.get('retryAttempts');
        this.retryDelay = this.configManager.get('retryDelay');
        this.maxConcurrent = this.configManager.get('maxConcurrent');
        this.userAgent = `${this.configManager.get('appName')}/v${this.configManager.get('version')}`;

        this.semaphore = new Semaphore(this.maxConcurrent);
        this.requestStats = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            averageResponseTime: 0,
            totalResponseTime: 0
        };

        this.setupConfigSubscription();
    }

    /**
     * 설정 변경을 구독합니다
     */
    setupConfigSubscription() {
        this.configManager.subscribe((key, newValue, oldValue) => {
            if (key === 'apiTimeout') {
                this.timeout = newValue;
                this.logger.info('HTTP timeout updated', { old: oldValue, new: newValue });
            }
            if (key === 'retryAttempts') {
                this.retryAttempts = newValue;
                this.logger.info('Retry attempts updated', { old: oldValue, new: newValue });
            }
            if (key === 'retryDelay') {
                this.retryDelay = newValue;
                this.logger.info('Retry delay updated', { old: oldValue, new: newValue });
            }
            if (key === 'maxConcurrent') {
                this.semaphore.destroy();
                this.semaphore = new Semaphore(newValue);
                this.maxConcurrent = newValue;
                this.logger.info('Max concurrent updated', { old: oldValue, new: newValue });
            }
            if (key === 'appName' || key === 'version') {
                this.userAgent = `${this.configManager.get('appName')}/v${this.configManager.get('version')}`;
            }
        });
    }

    /**
     * HTTP 요청을 수행합니다
     * @param {string} url - 요청 URL
     * @param {Object} options - 요청 옵션
     * @returns {Promise<Response>} 응답 객체
     */
    async request(url, options = {}) {
        return this.semaphore.execute(async () => {
            return this._performRequest(url, options);
        });
    }

    /**
     * 실제 HTTP 요청을 수행합니다
     * @param {string} url - 요청 URL
     * @param {Object} options - 요청 옵션
     * @returns {Promise<Response>} 응답 객체
     * @private
     */
    async _performRequest(url, options = {}) {
        const startTime = Date.now();
        this.requestStats.totalRequests++;

        for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
            const controller = new AbortController();
            const timeoutId = this.resourceManager.setTimeout(() => {
                controller.abort();
            }, this.timeout);

            try {
                this.logger.debug('HTTP request attempt', {
                    url: this._sanitizeUrl(url),
                    attempt,
                    maxAttempts: this.retryAttempts
                });

                const response = await fetch(url, {
                    ...options,
                    signal: controller.signal,
                    headers: {
                        'User-Agent': this.userAgent,
                        'Accept': 'application/json',
                        'Accept-Encoding': this.configManager.get('enableCompression') ? 'gzip, deflate' : 'identity',
                        'Cache-Control': 'no-cache',
                        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
                        ...options.headers
                    }
                });

                this.resourceManager.clearTimeout(timeoutId);

                if (!response.ok) {
                    const i18n = this.container.get('i18n');
                    throw new TourismApiError(
                        'HTTP_ERROR',
                        'request',
                        response.status,
                        {
                            url: this._sanitizeUrl(url),
                            status: response.status,
                            statusText: response.statusText
                        },
                        { status: response.status, statusText: response.statusText },
                        i18n
                    );
                }

                const responseTime = Date.now() - startTime;
                this._updateStats(responseTime, true);

                this.logger.metric('http_request_duration', responseTime, {
                    url: new URL(url).pathname,
                    status: response.status,
                    attempt
                });

                return response;
            } catch (error) {
                this.resourceManager.clearTimeout(timeoutId);

                if (error.name === 'AbortError') {
                    const i18n = this.container.get('i18n');
                    error = new ApiTimeoutError('request', this.timeout, i18n);
                } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
                    const i18n = this.container.get('i18n');
                    error = new NetworkError('request', error, i18n);
                }

                this.logger.warn('HTTP request failed', {
                    url: this._sanitizeUrl(url),
                    attempt,
                    error: error.message,
                    errorCode: error.code,
                    willRetry: attempt < this.retryAttempts
                });

                if (attempt === this.retryAttempts) {
                    this._updateStats(Date.now() - startTime, false);
                    throw error;
                }

                const delay = this.retryDelay * Math.pow(2, attempt - 1); // 지수 백오프
                await new Promise(resolve => this.resourceManager.setTimeout(resolve, delay));
            }
        }
    }

    /**
     * URL에서 민감한 정보를 제거합니다
     * @param {string} url - 원본 URL
     * @returns {string} 정리된 URL
     * @private
     */
    _sanitizeUrl(url) {
        try {
            const urlObj = new URL(url);
            urlObj.searchParams.delete('serviceKey'); // API 키 제거
            return urlObj.toString();
        } catch {
            return 'invalid-url';
        }
    }

    /**
     * 요청 통계를 업데이트합니다
     * @param {number} responseTime - 응답 시간
     * @param {boolean} success - 성공 여부
     * @private
     */
    _updateStats(responseTime, success) {
        if (success) {
            this.requestStats.successfulRequests++;
        } else {
            this.requestStats.failedRequests++;
        }

        this.requestStats.totalResponseTime += responseTime;
        this.requestStats.averageResponseTime =
            this.requestStats.totalResponseTime / this.requestStats.totalRequests;
    }

    /**
     * 관광 데이터 API를 호출합니다
     * @param {string} endpoint - API 엔드포인트
     * @param {Object} params - 요청 매개변수
     * @returns {Promise<Object>} API 응답 데이터
     */
    async getTourismData(endpoint, params = {}) {
        const apiKey = this.configManager.get('apiKey');

        if (!apiKey) {
            const i18n = this.container.get('i18n');
            throw new TourismApiError('MISSING_API_KEY', endpoint, 500, {}, {}, i18n);
        }

        const url = this.constants.getApiUrl(endpoint);

        // 필수 파라미터 설정
        const queryParams = new URLSearchParams({
            serviceKey: apiKey,
            MobileOS: 'ETC',
            MobileApp: this.configManager.get('appName'),
            _type: 'json',
            ...params
        });

        const fullUrl = `${url}?${queryParams}`;

        this.logger.debug('Tourism API request', {
            endpoint,
            url: this._sanitizeUrl(fullUrl),
            paramCount: Object.keys(params).length
        });

        const response = await this.request(fullUrl);
        const data = await response.json();

        // API 응답 검증
        this._validateApiResponse(data, endpoint);

        return data;
    }

    /**
     * API 응답을 검증합니다
     * @param {Object} data - 응답 데이터
     * @param {string} endpoint - 엔드포인트
     * @private
     */
    _validateApiResponse(data, endpoint) {
        const i18n = this.container.get('i18n');

        if (!data || !data.response) {
            throw new TourismApiError(
                'EMPTY_RESPONSE',
                endpoint,
                500,
                { data },
                {},
                i18n
            );
        }

        const resultCode = data.response?.header?.resultCode;
        const resultMsg = data.response?.header?.resultMsg;

        if (resultCode && resultCode !== '0000' && resultCode !== '00') {
            throw new TourismApiError(
                'API_ERROR',
                endpoint,
                500,
                { resultCode, originalMessage: resultMsg },
                { message: resultMsg || 'Unknown API error' },
                i18n
            );
        }
    }

    /**
     * 배치 요청을 수행합니다
     * @param {Array} requests - 요청 배열
     * @returns {Promise<Array>} 응답 배열
     */
    async batchRequest(requests) {
        if (!Array.isArray(requests) || requests.length === 0) {
            return [];
        }

        if (!this.configManager.get('enableBatching')) {
            return Promise.all(requests.map(req => this.request(req.url, req.options)));
        }

        const batchSize = this.configManager.get('maxBatchSize');
        const results = [];

        for (let i = 0; i < requests.length; i += batchSize) {
            const batch = requests.slice(i, i + batchSize);
            const batchPromises = batch.map(req =>
                this.request(req.url, req.options)
                    .catch(error => ({
                        error: error instanceof TourismApiError ? error.toJSON() : {
                            name: error.name,
                            message: error.message,
                            stack: error.stack
                        },
                        request: req
                    }))
            );

            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);

            // 배치 간 딜레이
            if (i + batchSize < requests.length) {
                await new Promise(resolve =>
                    this.resourceManager.setTimeout(resolve, 100)
                );
            }
        }

        return results;
    }

    /**
     * HTTP 클라이언트 통계를 가져옵니다
     * @returns {Object} 통계 정보
     */
    getStats() {
        return {
            ...this.requestStats,
            successRate: this.requestStats.totalRequests > 0
                ? (this.requestStats.successfulRequests / this.requestStats.totalRequests) * 100
                : 0,
            semaphoreStats: this.semaphore.getStats()
        };
    }

    /**
     * HTTP 클라이언트를 파괴합니다
     */
    destroy() {
        this.semaphore.destroy();
    }
}

// ===== 보안 및 인증 시스템 =====
class SecurityManager {
    constructor(container) {
        this.container = container;
        this.configManager = container.get('config');
        this.logger = container.get('logger');

        this.allowedOrigins = this.configManager.get('allowedOrigins');
        this.allowedApiKeys = this.configManager.get('allowedApiKeys');
        this.developmentOrigins = this.configManager.get('developmentOrigins');
        this.securityEnabled = this.configManager.get('securityEnabled');

        this.securityHeaders = {
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'X-XSS-Protection': '1; mode=block',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
            'Content-Security-Policy': "default-src 'self'",
            'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
            'X-Powered-By': 'AllTourism-Enterprise'
        };

        this.setupConfigSubscription();
    }

    /**
     * 설정 변경을 구독합니다
     */
    setupConfigSubscription() {
        this.configManager.subscribe((key, newValue) => {
            if (key === 'allowedOrigins') {
                this.allowedOrigins = newValue;
            } else if (key === 'allowedApiKeys') {
                this.allowedApiKeys = newValue;
            } else if (key === 'securityEnabled') {
                this.securityEnabled = newValue;
            }
        });
    }

    /**
     * 요청을 검증합니다
     * @param {Object} req - 요청 객체
     * @param {Object} res - 응답 객체
     * @returns {Object} 검증 결과
     */
    validateRequest(req, res) {
        const clientId = this.getClientId(req);
        const rateLimiter = this.container.get('rateLimiter');
        const i18n = this.container.get('i18n');

        // 레이트 리미팅 체크
        if (!rateLimiter.isAllowed(clientId)) {
            const remaining = rateLimiter.getRemainingQuota(clientId);
            throw new RateLimitError(this.configManager.get('rateLimitPerMinute'), remaining, i18n);
        }

        // 보안 검증 (개발 환경에서는 선택적)
        if (this.securityEnabled) {
            this.handleCors(req, res);
            this.validateApiKey(req);
        } else {
            this.handleCors(req, res); // CORS는 항상 처리
        }

        this.setSecurityHeaders(res);

        const remaining = rateLimiter.getRemainingQuota(clientId);
        res.setHeader('X-RateLimit-Limit', this.configManager.get('rateLimitPerMinute'));
        res.setHeader('X-RateLimit-Remaining', remaining);
        res.setHeader('X-RateLimit-Reset', new Date(Date.now() + 60000).toISOString());

        return { clientId, remaining };
    }

    /**
     * 클라이언트 ID를 생성합니다
     * @param {Object} req - 요청 객체
     * @returns {string} 클라이언트 ID
     */
    getClientId(req) {
        const forwarded = req.headers['x-forwarded-for'];
        const realIp = req.headers['x-real-ip'];
        const ip = forwarded ? forwarded.split(',')[0].trim() : 
                   realIp || req.connection?.remoteAddress || 
                   req.socket?.remoteAddress || 'unknown';

        const apiKey = req.headers['x-api-key'];
        const userAgent = req.headers['user-agent'];

        // API 키가 있으면 우선 사용
        if (apiKey) {
            return `api:${this._hashString(apiKey)}`;
        }

        // IP + User-Agent 조합으로 클라이언트 식별
        return `ip:${ip}:${this._hashString(userAgent || 'unknown')}`;
    }

    /**
     * 문자열을 해시화합니다
     * @param {string} str - 해시할 문자열
     * @returns {string} 해시된 문자열
     * @private
     */
    _hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 32-bit integer로 변환
        }
        return Math.abs(hash).toString(36);
    }

    /**
     * CORS를 처리합니다
     * @param {Object} req - 요청 객체
     * @param {Object} res - 응답 객체
     */
    handleCors(req, res) {
        const origin = req.headers.origin;
        const isDevelopment = this.configManager.get('environment') === 'development';
        const i18n = this.container.get('i18n');

        // * 허용하는 경우
        if (this.allowedOrigins.includes('*')) {
            res.setHeader('Access-Control-Allow-Origin', '*');
        }
        // 명시적으로 허용된 Origin
        else if (origin && this.allowedOrigins.includes(origin)) {
            res.setHeader('Access-Control-Allow-Origin', origin);
        }
        // 개발 환경에서 로컬 Origin 허용
        else if (origin && isDevelopment && this.isLocalOrigin(origin)) {
            this.logger.warn('Development mode: allowing local origin', { origin });
            res.setHeader('Access-Control-Allow-Origin', origin);
        }
        // Origin이 제공되었지만 허용되지 않은 경우
        else if (origin && this.securityEnabled) {
            this.logger.error('Unauthorized origin blocked', { origin });
            throw new TourismApiError('CORS_ERROR', 'security', 403, { origin }, {}, i18n);
        }
        // Origin이 없는 경우 (서버-서버 통신 등) 허용
        else if (!origin) {
            res.setHeader('Access-Control-Allow-Origin', '*');
        }

        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers',
            'Content-Type, Authorization, X-API-Key, X-Request-ID, X-Client-Version, Accept-Language');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Max-Age', '3600');
    }

    /**
     * 로컬 Origin인지 확인합니다
     * @param {string} origin - Origin
     * @returns {boolean} 로컬 Origin 여부
     */
    isLocalOrigin(origin) {
        if (!origin) return false;

        try {
            const url = new URL(origin);
            const hostname = url.hostname.toLowerCase();

            return hostname === 'localhost' ||
                hostname === '127.0.0.1' ||
                hostname.endsWith('.local') ||
                this.developmentOrigins.includes(origin);
        } catch {
            return false;
        }
    }

    /**
     * API 키를 검증합니다
     * @param {Object} req - 요청 객체
     */
    validateApiKey(req) {
        if (this.allowedApiKeys.length === 0) return;

        const apiKey = req.headers['x-api-key'];
        const i18n = this.container.get('i18n');

        if (!apiKey || !this.allowedApiKeys.includes(apiKey)) {
            this.logger.warn('Invalid API key attempt', {
                hasKey: !!apiKey,
                keyLength: apiKey ? apiKey.length : 0
            });
            throw new TourismApiError('INVALID_API_KEY', 'security', 401, {}, {}, i18n);
        }
    }

    /**
     * 보안 헤더를 설정합니다
     * @param {Object} res - 응답 객체
     */
    setSecurityHeaders(res) {
        Object.entries(this.securityHeaders).forEach(([header, value]) => {
            res.setHeader(header, value);
        });

        // CSP 헤더 개선
        const cspValue = [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline'", // 필요에 따라 조정
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: https:",
            "connect-src 'self' https://apis.data.go.kr",
            "font-src 'self'",
            "object-src 'none'",
            "media-src 'self'",
            "frame-src 'none'"
        ].join('; ');

        res.setHeader('Content-Security-Policy', cspValue);
    }
}

// ===== 응답 포매터 =====
class ResponseFormatter {
    /**
     * 성공 응답을 포맷합니다
     * @param {string} operation - 오퍼레이션
     * @param {*} data - 데이터
     * @param {Object} metadata - 메타데이터
     * @param {Object} performance - 성능 정보
     * @returns {Object} 포맷된 응답
     */
    static formatSuccess(operation, data, metadata = {}, performance = {}) {
        return {
            success: true,
            operation,
            data,
            metadata: {
                ...metadata,
                version: '2.0.0',
                timestamp: new Date().toISOString(),
                performance: {
                    ...performance,
                    memoryUsage: this._getMemoryInfo()
                }
            }
        };
    }

    /**
     * 에러 응답을 포맷합니다
     * @param {Error} error - 에러 객체
     * @param {string} operation - 오퍼레이션
     * @returns {Object} 포맷된 에러 응답
     */
    static formatError(error, operation = null) {
        const isProduction = RuntimeEnvironment.getEnvironmentVariable('NODE_ENV') === 'production';

        const response = {
            success: false,
            error: {
                message: error.message || 'Unknown error',
                code: error.code || 'INTERNAL_ERROR',
                operation: operation || error.operation,
                timestamp: new Date().toISOString(),
                statusCode: error.statusCode || 500
            }
        };

        if (!isProduction) {
            response.error.details = error.details || {};
            if (error.stack) {
                response.error.stack = error.stack;
            }
        }

        return response;
    }

    /**
     * 응답에 캐시 정보를 추가합니다
     * @param {Object} response - 응답 객체
     * @param {boolean} fromCache - 캐시에서 온 데이터 여부
     * @param {Object} cacheStats - 캐시 통계
     * @returns {Object} 캐시 정보가 추가된 응답
     */
    static addCacheInfo(response, fromCache = false, cacheStats = null) {
        response.metadata = response.metadata || {};
        response.metadata.cache = {
            fromCache,
            stats: cacheStats
        };
        return response;
    }

    /**
     * 메모리 정보를 가져옵니다
     * @returns {Object} 메모리 정보
     * @private
     */
    static _getMemoryInfo() {
        const usage = RuntimeEnvironment.getMemoryUsage();
        return {
            heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
            heapTotal: Math.round(usage.heapTotal / 1024 / 1024)
        };
    }
}

// ===== API 응답 처리기 =====
class ApiResponseProcessor {
    /**
     * 응답에서 아이템들을 추출합니다
     * @param {Object} data - API 응답 데이터
     * @returns {Array} 추출된 아이템 배열
     */
    static extractItems(data) {
        const items = data.response?.body?.items?.item ||
                     data.items?.item ||
                     data.response?.body?.item ||
                     [];
        return Array.isArray(items) ? items : items ? [items] : [];
    }

    /**
     * 기본 아이템을 처리합니다
     * @param {Object} item - 원본 아이템
     * @param {Object} container - 서비스 컨테이너
     * @returns {Object|null} 처리된 아이템
     */
    static processBasicItem(item, container) {
        if (!item || typeof item !== 'object') {
            return null;
        }

        const mapx = this._parseCoordinate(item.mapx);
        const mapy = this._parseCoordinate(item.mapy);

        const constants = container.get('constants');
        const i18n = container.get('i18n');
        const contentType = constants.get('CONTENT_TYPE_MAP', item.contenttypeid);
        const areaInfo = constants.get('AREA_CODE_MAP', item.areacode);
        const currentLang = i18n.currentLanguage;

        return {
            contentId: item.contentid,
            contentTypeId: item.contenttypeid,
            title: this.sanitizeHtml(item.title),
            addr1: item.addr1 || null,
            addr2: item.addr2 || null,
            zipcode: item.zipcode || null,
            tel: item.tel || null,
            firstimage: item.firstimage || null,
            firstimage2: item.firstimage2 || null,
            cpyrhtDivCd: item.cpyrhtDivCd || null,
            mapx: mapx,
            mapy: mapy,
            mlevel: this._parseInt(item.mlevel),
            areacode: item.areacode || null,
            sigungucode: item.sigungucode || null,
            cat1: item.cat1 || null,
            cat2: item.cat2 || null,
            cat3: item.cat3 || null,
            createdtime: item.createdtime || null,
            modifiedtime: item.modifiedtime || null,
            telname: item.telname || null,
            homepage: this.sanitizeHtml(item.homepage) || null,
            overview: this.sanitizeHtml(item.overview) || null,
            meta: {
                typeName: constants.getContentTypeName(item.contenttypeid, currentLang),
                typeIcon: contentType?.icon || '📍',
                areaName: constants.getAreaName(item.areacode, currentLang),
                areaEmoji: areaInfo?.emoji || '📍',
                hasImage: !!(item.firstimage || item.firstimage2),
                hasLocation: !!(mapx && mapy),
                hasOverview: !!item.overview,
                hasHomepage: !!item.homepage,
                hasTel: !!item.tel,
                lastUpdated: this.formatDate(item.modifiedtime),
                completeness: this.calculateCompleteness(item)
            }
        };
    }

    /**
     * 좌표를 파싱합니다
     * @param {*} coord - 좌표 값
     * @returns {number|null} 파싱된 좌표
     * @private
     */
    static _parseCoordinate(coord) {
        if (!coord || coord === '' || coord === '0') return null;
        const num = parseFloat(coord);
        return isNaN(num) ? null : num;
    }

    /**
     * 정수를 파싱합니다
     * @param {*} value - 값
     * @returns {number|null} 파싱된 정수
     * @private
     */
    static _parseInt(value) {
        if (!value) return null;
        const num = parseInt(value);
        return isNaN(num) ? null : num;
    }

    /**
     * HTML을 안전하게 정리합니다
     * @param {string} text - 정리할 텍스트
     * @returns {string|null} 정리된 텍스트
     */
    static sanitizeHtml(text) {
        if (!text || typeof text !== 'string') return null;

        return text
            // 위험한 스크립트 태그 완전 제거
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            // 일반 HTML 태그 제거
            .replace(/<[^>]*>/g, '')
            // 자바스크립트 프로토콜 제거
            .replace(/javascript:/gi, '')
            // 이벤트 핸들러 제거
            .replace(/on\w+\s*=/gi, '')
            // HTML 엔티티 변환
            .replace(/&nbsp;/g, ' ')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&#x27;/g, "'")
            .replace(/&#x2F;/g, '/')
            // 연속된 공백 정리
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * 날짜 문자열을 포맷합니다
     * @param {string} dateString - 날짜 문자열 (YYYYMMDDHHMMSS)
     * @returns {string|null} ISO 날짜 문자열
     */
    static formatDate(dateString) {
        if (!dateString || typeof dateString !== 'string' || dateString.length !== 14) {
            return null;
        }

        try {
            const year = dateString.substring(0, 4);
            const month = dateString.substring(4, 6);
            const day = dateString.substring(6, 8);
            const hour = dateString.substring(8, 10);
            const minute = dateString.substring(10, 12);
            const second = dateString.substring(12, 14);

            const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);

            if (isNaN(date.getTime())) {
                return null;
            }

            return date.toISOString();
        } catch {
            return null;
        }
    }

    /**
     * 데이터 완성도를 계산합니다
     * @param {Object} item - 아이템 객체
     * @returns {number} 완성도 (0-100)
     */
    static calculateCompleteness(item) {
        const fields = [
            'title', 'addr1', 'tel', 'firstimage', 'mapx', 'mapy',
            'overview', 'homepage', 'cat1', 'cat2', 'cat3'
        ];

        const filledFields = fields.filter(field => {
            const value = item[field];
            return value && value !== '' && value !== '0' && value !== 'null';
        }).length;

        return Math.round((filledFields / fields.length) * 100);
    }
}

// ===== 지리 유틸리티 =====
class GeoUtils {
    /**
     * 두 지점 간의 거리를 계산합니다 (Haversine 공식)
     * @param {number} lat1 - 첫 번째 지점의 위도
     * @param {number} lon1 - 첫 번째 지점의 경도
     * @param {number} lat2 - 두 번째 지점의 위도
     * @param {number} lon2 - 두 번째 지점의 경도
     * @returns {number|null} 거리 (km)
     */
    static calculateDistance(lat1, lon1, lat2, lon2) {
        try {
            // 입력값 검증
            const coords = [lat1, lon1, lat2, lon2].map(coord => {
                const num = parseFloat(coord);
                if (isNaN(num)) throw new Error('Invalid coordinate');
                return num;
            });

            const [pLat1, pLon1, pLat2, pLon2] = coords;

            // 좌표 범위 검증
            if (Math.abs(pLat1) > 90 || Math.abs(pLat2) > 90 ||
                Math.abs(pLon1) > 180 || Math.abs(pLon2) > 180) {
                return null;
            }

            // Haversine 공식 정확도 개선
            const R = 6371.0088; // 더 정확한 지구 반지름 (km)
            const dLat = this.toRadians(pLat2 - pLat1);
            const dLon = this.toRadians(pLon2 - pLon1);

            const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                      Math.cos(this.toRadians(pLat1)) * 
                      Math.cos(this.toRadians(pLat2)) *
                      Math.sin(dLon/2) * Math.sin(dLon/2);

            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            return R * c;
        } catch {
            return null;
        }
    }

    /**
     * 도를 라디안으로 변환합니다
     * @param {number} degrees - 도
     * @returns {number} 라디안
     */
    static toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }

    /**
     * 아이템들에 거리 정보를 추가합니다
     * @param {Array} items - 아이템 배열
     * @param {string} userLat - 사용자 위도
     * @param {string} userLng - 사용자 경도
     * @param {string} radius - 반경 (선택사항)
     * @returns {Array} 거리 정보가 추가된 아이템 배열
     */
    static addDistanceInfo(items, userLat, userLng, radius = null) {
        if (!userLat || !userLng || !Array.isArray(items)) {
            return items;
        }

        const userLatNum = parseFloat(userLat);
        const userLngNum = parseFloat(userLng);

        if (isNaN(userLatNum) || isNaN(userLngNum)) {
            return items;
        }

        const itemsWithDistance = items.map(item => {
            if (item && item.mapx && item.mapy) {
                const distance = this.calculateDistance(userLatNum, userLngNum, item.mapy, item.mapx);
                return {
                    ...item,
                    distance: distance ? Math.round(distance * 100) / 100 : null,
                    meta: {
                        ...item.meta,
                        distanceText: distance ? this.formatDistance(distance) : null,
                        bearing: this.calculateBearing(userLatNum, userLngNum, item.mapy, item.mapx),
                        direction: this.getDirectionText(this.calculateBearing(userLatNum, userLngNum, item.mapy, item.mapx))
                    }
                };
            }
            return { ...item, distance: null };
        });

        let filteredItems = itemsWithDistance;

        // 반경 필터링
        if (radius && !isNaN(parseFloat(radius))) {
            const radiusKm = parseFloat(radius);
            filteredItems = itemsWithDistance.filter(item =>
                item.distance === null || item.distance <= radiusKm
            );
        }

        // 거리순 정렬
        return filteredItems.sort((a, b) => {
            const distA = a.distance !== null ? a.distance : 999999;
            const distB = b.distance !== null ? b.distance : 999999;
            return distA - distB;
        });
    }

    /**
     * 두 지점 간의 방위각을 계산합니다
     * @param {number} lat1 - 시작점 위도
     * @param {number} lon1 - 시작점 경도
     * @param {number} lat2 - 끝점 위도
     * @param {number} lon2 - 끝점 경도
     * @returns {number|null} 방위각 (0-360도)
     */
    static calculateBearing(lat1, lon1, lat2, lon2) {
        try {
            const dLon = this.toRadians(lon2 - lon1);
            const lat1Rad = this.toRadians(lat1);
            const lat2Rad = this.toRadians(lat2);

            const y = Math.sin(dLon) * Math.cos(lat2Rad);
            const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
                      Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);

            const bearing = Math.atan2(y, x) * 180 / Math.PI;
            return (bearing + 360) % 360; // 0-360도로 정규화
        } catch {
            return null;
        }
    }

    /**
     * 거리를 사용자 친화적으로 포맷합니다
     * @param {number} distance - 거리 (km)
     * @returns {string|null} 포맷된 거리
     */
    static formatDistance(distance) {
        if (typeof distance !== 'number' || isNaN(distance)) {
            return null;
        }

        if (distance < 1) {
            return `${Math.round(distance * 1000)}m`;
        } else if (distance < 10) {
            return `${Math.round(distance * 10) / 10}km`;
        } else {
            return `${Math.round(distance)}km`;
        }
    }

    /**
     * 방위각을 방향 텍스트로 변환합니다
     * @param {number} bearing - 방위각
     * @returns {string|null} 방향 텍스트
     */
    static getDirectionText(bearing) {
        if (typeof bearing !== 'number' || isNaN(bearing)) {
            return null;
        }

        const directions = [
            '북', '북동', '동', '남동', '남', '남서', '서', '북서'
        ];

        const index = Math.round(bearing / 45) % 8;
        return directions[index];
    }
}


// ===== 테스트 러너 =====
class TestRunner {
    constructor(container) {
        this.container = container;
        this.tests = [];
        this.results = {
            passed: 0,
            failed: 0,
            skipped: 0,
            errors: [],
            duration: 0
        };
        this.beforeEachHooks = [];
        this.afterEachHooks = [];
    }

    /**
     * 각 테스트 전에 실행할 훅을 추가합니다
     * @param {Function} hook - 훅 함수
     * @returns {TestRunner} 체이닝을 위한 자기 참조
     */
    beforeEach(hook) {
        if (typeof hook === 'function') {
            this.beforeEachHooks.push(hook);
        }
        return this;
    }

    /**
     * 각 테스트 후에 실행할 훅을 추가합니다
     * @param {Function} hook - 훅 함수
     * @returns {TestRunner} 체이닝을 위한 자기 참조
     */
    afterEach(hook) {
        if (typeof hook === 'function') {
            this.afterEachHooks.push(hook);
        }
        return this;
    }

    /**
     * 테스트를 추가합니다
     * @param {string} name - 테스트 이름
     * @param {Function} testFn - 테스트 함수
     * @param {Object} options - 테스트 옵션
     * @returns {TestRunner} 체이닝을 위한 자기 참조
     */
    addTest(name, testFn, options = {}) {
        if (typeof name === 'string' && typeof testFn === 'function') {
            this.tests.push({
                name,
                testFn,
                skip: options.skip || false,
                timeout: options.timeout || 5000
            });
        }
        return this;
    }

    /**
     * 건너뛸 테스트를 추가합니다
     * @param {string} name - 테스트 이름
     * @param {Function} testFn - 테스트 함수
     * @param {Object} options - 테스트 옵션
     * @returns {TestRunner} 체이닝을 위한 자기 참조
     */
    skip(name, testFn, options = {}) {
        return this.addTest(name, testFn, { ...options, skip: true });
    }

    /**
     * 모든 테스트를 실행합니다
     * @returns {Promise<Object>} 테스트 결과
     */
    async runAll() {
        console.log('🧪 Running comprehensive tests...');
        const startTime = Date.now();

        for (const test of this.tests) {
            if (test.skip) {
                this.results.skipped++;
                console.log(`⏭️  ${test.name} (skipped)`);
                continue;
            }

            try {
                // beforeEach 훅 실행
                for (const hook of this.beforeEachHooks) {
                    await hook();
                }

                // 타임아웃 설정
                await Promise.race([
                    test.testFn(),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Test timeout')), test.timeout)
                    )
                ]);

                this.results.passed++;
                console.log(`✅ ${test.name}`);

                // afterEach 훅 실행
                for (const hook of this.afterEachHooks) {
                    await hook();
                }
            } catch (error) {
                this.results.failed++;
                this.results.errors.push({
                    test: test.name,
                    error: error.message,
                    stack: error.stack
                });
                console.log(`❌ ${test.name}: ${error.message}`);
            }
        }

        this.results.duration = Date.now() - startTime;
        const total = this.results.passed + this.results.failed;
        const successRate = total > 0 ? Math.round((this.results.passed / total) * 100) : 0;

        console.log(`\n📊 Test Results: ${this.results.passed}/${total} passed (${successRate}%)`);
        console.log(`⏱️  Duration: ${this.results.duration}ms`);

        if (this.results.skipped > 0) {
            console.log(`⏭️  Skipped: ${this.results.skipped}`);
        }

        if (this.results.errors.length > 0) {
            console.log('\n❌ Failed tests:');
            this.results.errors.forEach(({ test, error }) => {
                console.log(`  - ${test}: ${error}`);
            });
        }

        return {
            ...this.results,
            total,
            successRate,
            summary: `${this.results.passed}/${total} tests passed (${successRate}%)`
        };
    }

    /**
     * 조건을 검증합니다
     * @param {boolean} condition - 검증할 조건
     * @param {string} message - 실패 시 메시지
     */
    assert(condition, message) {
        if (!condition) {
            throw new Error(message || 'Assertion failed');
        }
    }

    /**
     * 값이 같은지 검증합니다
     * @param {*} actual - 실제 값
     * @param {*} expected - 예상 값
     * @param {string} message - 실패 시 메시지
     */
    assertEqual(actual, expected, message) {
        if (actual !== expected) {
            throw new Error(message || `Expected ${expected}, got ${actual}`);
        }
    }

    /**
     * 함수가 에러를 던지는지 검증합니다
     * @param {Function} fn - 테스트할 함수
     * @param {Function} expectedError - 예상 에러 클래스
     * @param {string} message - 실패 시 메시지
     */
    assertThrows(fn, expectedError, message) {
        let thrown = false;
        try {
            fn();
        } catch (error) {
            thrown = true;
            if (expectedError && !(error instanceof expectedError)) {
                throw new Error(message || `Expected ${expectedError.name}, got ${error.constructor.name}`);
            }
        }

        if (!thrown) {
            throw new Error(message || 'Expected function to throw an error');
        }
    }
}

// ===== API 핸들러 클래스 =====
class AllTourismApiHandlers {
    /**
     * 지역 기반 목록 API를 처리합니다
     * @param {Object} container - 서비스 컨테이너
     * @param {Object} params - 요청 매개변수
     * @returns {Promise<Object>} 처리된 응답
     */
    static async handleAreaBasedList(container, params) {
        const startTime = Date.now();
        const validator = container.get('validator');
        const cache = container.get('cache');
        const httpClient = container.get('httpClient');
        const logger = container.get('logger');

        try {
            validator.validate('areaBasedList', params);
        } catch (error) {
            logger.error('Validation failed for areaBasedList', error);
            throw error;
        }

        const {
            numOfRows = '10',
            pageNo = '1',
            arrange = 'C',
            contentTypeId = '',
            areaCode = '',
            sigunguCode = '',
            cat1 = '',
            cat2 = '',
            cat3 = '',
            modifiedtime = '',
            userLat = '',
            userLng = '',
            radius = ''
        } = params;

        const cacheableParams = {
            numOfRows, pageNo, arrange, contentTypeId, areaCode,
            sigunguCode, cat1, cat2, cat3, modifiedtime
        };

        const cacheKey = cache.generateKey('areaBasedList', cacheableParams);

        // 위치 필터가 없을 때만 캐시 사용
        if (!userLat && !userLng) {
            const cachedData = cache.get(cacheKey);
            if (cachedData) {
                logger.metric('cache_hit', 1, { operation: 'areaBasedList' });
                return ResponseFormatter.addCacheInfo(cachedData, true, cache.getStats());
            }
        }

        const apiParams = {
            numOfRows,
            pageNo,
            arrange
        };

        const optionalParams = { contentTypeId, areaCode, sigunguCode, cat1, cat2, cat3, modifiedtime };

        Object.entries(optionalParams).forEach(([key, value]) => {
            if (value) apiParams[key] = value;
        });

        const data = await httpClient.getTourismData('areaBasedList', apiParams);

        const items = ApiResponseProcessor.extractItems(data);
        let processedItems = items
            .map(item => ApiResponseProcessor.processBasicItem(item, container))
            .filter(item => item !== null);

        // 위치 기반 필터링 및 정렬
        if (userLat && userLng) {
            processedItems = GeoUtils.addDistanceInfo(processedItems, userLat, userLng, radius);
        }

        const totalCount = data.response?.body?.totalCount || processedItems.length;
        const apiTime = Date.now() - startTime;

        const result = ResponseFormatter.formatSuccess('areaBasedList', {
            items: processedItems,
            pagination: {
                totalCount,
                pageNo: parseInt(pageNo),
                numOfRows: parseInt(numOfRows),
                totalPages: Math.ceil(totalCount / parseInt(numOfRows)),
                hasNext: (parseInt(pageNo) * parseInt(numOfRows)) < totalCount,
                hasPrev: parseInt(pageNo) > 1
            },
            searchInfo: {
                params: optionalParams,
                hasLocationFilter: !!(userLat && userLng),
                locationFilter: userLat && userLng ? {
                    lat: parseFloat(userLat),
                    lng: parseFloat(userLng),
                    radius: radius ? parseFloat(radius) : null
                } : null
            }
        }, {
            operation: 'areaBasedList',
            itemCount: processedItems.length,
            searchCriteria: Object.keys(optionalParams).filter(key => optionalParams[key]).length,
            cached: false
        }, {
            apiResponseTime: apiTime,
            totalProcessingTime: Date.now() - startTime
        });

        // 위치 필터가 없을 때만 캐시 저장
        if (!userLat && !userLng) {
            cache.set(cacheKey, result);
            logger.metric('cache_set', 1, { operation: 'areaBasedList' });
        }

        logger.metric('api_request_success', 1, {
            operation: 'areaBasedList',
            itemCount: processedItems.length,
            fromCache: false
        });

        return result;
    }

    /**
     * 상세 공통 정보 API를 처리합니다
     * @param {Object} container - 서비스 컨테이너
     * @param {Object} params - 요청 매개변수
     * @returns {Promise<Object>} 처리된 응답
     */
    static async handleDetailCommon(container, params) {
        const startTime = Date.now();
        const validator = container.get('validator');
        const cache = container.get('cache');
        const httpClient = container.get('httpClient');
        const logger = container.get('logger');
        const i18n = container.get('i18n');

        try {
            validator.validate('detailCommon', params);
        } catch (error) {
            logger.error('Validation failed for detailCommon', error);
            throw error;
        }

        const { contentId, ...optionalParams } = params;
        const cacheKey = cache.generateKey('detailCommon', { contentId });

        const cachedData = cache.get(cacheKey);
        if (cachedData) {
            logger.metric('cache_hit', 1, { operation: 'detailCommon' });
            return ResponseFormatter.addCacheInfo(cachedData, true, cache.getStats());
        }

        const apiParams = {
            contentId,
            defaultYN: 'Y',
            firstImageYN: 'Y',
            areacodeYN: 'Y',
            catcodeYN: 'Y',
            addrinfoYN: 'Y',
            mapinfoYN: 'Y',
            overviewYN: 'Y',
            ...optionalParams
        };

        const data = await httpClient.getTourismData('detailCommon', apiParams);

        const items = ApiResponseProcessor.extractItems(data);
        if (items.length === 0) {
            throw new TourismApiError('NOT_FOUND', 'detailCommon', 404, { contentId }, {}, i18n);
        }

        const item = items[0];
        const processedItem = ApiResponseProcessor.processBasicItem(item, container);

        if (!processedItem) {
            throw new TourismApiError('NOT_FOUND', 'detailCommon', 404, { contentId }, {}, i18n);
        }

        const apiTime = Date.now() - startTime;

        const result = ResponseFormatter.formatSuccess('detailCommon', processedItem, {
            operation: 'detailCommon',
            contentId,
            dataSource: 'AllTourism API 2.0',
            cached: false
        }, {
            apiResponseTime: apiTime,
            totalProcessingTime: Date.now() - startTime
        });

        cache.set(cacheKey, result);
        logger.metric('cache_set', 1, { operation: 'detailCommon' });
        logger.metric('api_request_success', 1, {
            operation: 'detailCommon',
            contentId,
            fromCache: false
        });

        return result;
    }

    /**
     * 키워드 검색 API를 처리합니다
     * @param {Object} container - 서비스 컨테이너
     * @param {Object} params - 요청 매개변수
     * @returns {Promise<Object>} 처리된 응답
     */
    static async handleSearchKeyword(container, params) {
        const startTime = Date.now();
        const validator = container.get('validator');
        const cache = container.get('cache');
        const httpClient = container.get('httpClient');
        const logger = container.get('logger');

        try {
            validator.validate('searchKeyword', params);
        } catch (error) {
            logger.error('Validation failed for searchKeyword', error);
            throw error;
        }

        const {
            keyword,
            areaCode = '',
            sigunguCode = '',
            contentTypeId = '',
            numOfRows = '10',
            pageNo = '1',
            arrange = 'C',
            cat1 = '',
            cat2 = '',
            cat3 = '',
            userLat = '',
            userLng = '',
            radius = ''
        } = params;

        const cacheableParams = {
            keyword, areaCode, sigunguCode, contentTypeId,
            numOfRows, pageNo, arrange, cat1, cat2, cat3
        };

        const cacheKey = cache.generateKey('searchKeyword', cacheableParams);

        // 위치 필터가 없을 때만 캐시 사용
        if (!userLat && !userLng) {
            const cachedData = cache.get(cacheKey);
            if (cachedData) {
                logger.metric('cache_hit', 1, { operation: 'searchKeyword' });
                return ResponseFormatter.addCacheInfo(cachedData, true, cache.getStats());
            }
        }

        const apiParams = {
            keyword: encodeURIComponent(keyword.trim()),
            numOfRows,
            pageNo,
            arrange
        };

        const optionalParams = { areaCode, sigunguCode, contentTypeId, cat1, cat2, cat3 };

        Object.entries(optionalParams).forEach(([key, value]) => {
            if (value) apiParams[key] = value;
        });

        const data = await httpClient.getTourismData('searchKeyword', apiParams);

        const items = ApiResponseProcessor.extractItems(data);
        let processedItems = items
            .map(item => ApiResponseProcessor.processBasicItem(item, container))
            .filter(item => item !== null);

        // 위치 기반 필터링 및 정렬
        if (userLat && userLng) {
            processedItems = GeoUtils.addDistanceInfo(processedItems, userLat, userLng, radius);
        }

        const totalCount = data.response?.body?.totalCount || processedItems.length;
        const apiTime = Date.now() - startTime;

        const result = ResponseFormatter.formatSuccess('searchKeyword', {
            items: processedItems,
            searchKeyword: keyword,
            pagination: {
                totalCount,
                pageNo: parseInt(pageNo),
                numOfRows: parseInt(numOfRows),
                totalPages: Math.ceil(totalCount / parseInt(numOfRows)),
                hasNext: (parseInt(pageNo) * parseInt(numOfRows)) < totalCount,
                hasPrev: parseInt(pageNo) > 1
            },
            searchInfo: {
                params: optionalParams,
                hasLocationFilter: !!(userLat && userLng),
                locationFilter: userLat && userLng ? {
                    lat: parseFloat(userLat),
                    lng: parseFloat(userLng),
                    radius: radius ? parseFloat(radius) : null
                } : null
            }
        }, {
            operation: 'searchKeyword',
            keyword,
            itemCount: processedItems.length,
            cached: false
        }, {
            apiResponseTime: apiTime,
            totalProcessingTime: Date.now() - startTime
        });

        // 위치 필터가 없을 때만 캐시 저장
        if (!userLat && !userLng) {
            cache.set(cacheKey, result);
            logger.metric('cache_set', 1, { operation: 'searchKeyword' });
        }

        logger.metric('api_request_success', 1, {
            operation: 'searchKeyword',
            keyword,
            itemCount: processedItems.length,
            fromCache: false
        });

        return result;
    }

    /**
     * 위치 기반 목록 API를 처리합니다
     * @param {Object} container - 서비스 컨테이너
     * @param {Object} params - 요청 매개변수
     * @returns {Promise<Object>} 처리된 응답
     */
    static async handleLocationBasedList(container, params) {
        const startTime = Date.now();
        const validator = container.get('validator');
        const httpClient = container.get('httpClient');
        const logger = container.get('logger');

        try {
            validator.validate('locationBasedList', params);
        } catch (error) {
            logger.error('Validation failed for locationBasedList', error);
            throw error;
        }

        const {
            mapX,
            mapY,
            radius,
            numOfRows = '10',
            pageNo = '1',
            arrange = 'E',
            contentTypeId = '',
            areaCode = '',
            sigunguCode = '',
            cat1 = '',
            cat2 = '',
            cat3 = '',
            modifiedtime = ''
        } = params;

        const apiParams = {
            mapX,
            mapY,
            radius,
            numOfRows,
            pageNo,
            arrange
        };

        const optionalParams = { contentTypeId, areaCode, sigunguCode, cat1, cat2, cat3, modifiedtime };

        Object.entries(optionalParams).forEach(([key, value]) => {
            if (value) apiParams[key] = value;
        });

        const data = await httpClient.getTourismData('locationBasedList', apiParams);

        const items = ApiResponseProcessor.extractItems(data);
        const processedItems = items
            .map(item => ({
                ...ApiResponseProcessor.processBasicItem(item, container),
                dist: parseFloat(item.dist) || null
            }))
            .filter(item => item !== null);

        const totalCount = data.response?.body?.totalCount || processedItems.length;
        const apiTime = Date.now() - startTime;

        const result = ResponseFormatter.formatSuccess('locationBasedList', {
            items: processedItems,
            searchCenter: {
                lat: parseFloat(mapY),
                lng: parseFloat(mapX),
                radius: parseFloat(radius)
            },
            pagination: {
                totalCount,
                pageNo: parseInt(pageNo),
                numOfRows: parseInt(numOfRows),
                totalPages: Math.ceil(totalCount / parseInt(numOfRows)),
                hasNext: (parseInt(pageNo) * parseInt(numOfRows)) < totalCount,
                hasPrev: parseInt(pageNo) > 1
            }
        }, {
            operation: 'locationBasedList',
            searchParams: { mapX, mapY, radius, contentTypeId },
            itemCount: processedItems.length,
            cached: false
        }, {
            apiResponseTime: apiTime,
            totalProcessingTime: Date.now() - startTime
        });

        logger.metric('api_request_success', 1, {
            operation: 'locationBasedList',
            itemCount: processedItems.length,
            fromCache: false
        });

        return result;
    }

    /**
     * 배치 상세 정보 API를 처리합니다
     * @param {Object} container - 서비스 컨테이너
     * @param {Array} contentIds - 콘텐츠 ID 배열
     * @returns {Promise<Object>} 처리된 응답
     */
    static async handleBatchDetail(container, contentIds) {
        const validator = container.get('validator');
        const configManager = container.get('config');
        const logger = container.get('logger');
        const i18n = container.get('i18n');
        const cache = container.get('cache');

        try {
            validator.validate('batchDetail', { contentIds });
        } catch (error) {
            logger.error('Validation failed for batchDetail', error);
            throw error;
        }

        if (!Array.isArray(contentIds) || contentIds.length === 0) {
            throw new ValidationError(
                i18n.getMessage('BATCH_CONTENT_IDS_REQUIRED'),
                'contentIds',
                contentIds,
                i18n
            );
        }

        // 중복 제거
        const uniqueIds = [...new Set(contentIds)];
        const batchSize = configManager.get('maxBatchSize');
        const results = [];

        // 캐시 확인 먼저
        const cachedResults = [];
        const uncachedIds = [];

        for (const id of uniqueIds) {
            const cacheKey = cache.generateKey('detailCommon', { contentId: id });
            const cached = cache.get(cacheKey);
            if (cached) {
                cachedResults.push({ ...cached, fromCache: true });
            } else {
                uncachedIds.push(id);
            }
        }

        results.push(...cachedResults);

        // 미캐시된 것들만 API 호출
        for (let i = 0; i < uncachedIds.length; i += batchSize) {
            const batch = uncachedIds.slice(i, i + batchSize);
            const promises = batch.map(contentId =>
                AllTourismApiHandlers.handleDetailCommon(container, { contentId })
                    .catch(error => ({
                        error: error instanceof TourismApiError ? error.toJSON() : {
                            name: error.name,
                            message: error.message,
                            stack: error.stack
                        },
                        contentId,
                        success: false
                    }))
            );

            const batchResults = await Promise.all(promises);
            results.push(...batchResults);

            // 배치 간 딜레이
            if (i + batchSize < uncachedIds.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        const successCount = results.filter(r => r.success !== false).length;
        const errorCount = results.length - successCount;
        const cacheHitCount = cachedResults.length;

        return ResponseFormatter.formatSuccess('batchDetail', {
            results,
            summary: {
                total: uniqueIds.length,
                success: successCount,
                error: errorCount,
                cached: cacheHitCount,
                successRate: Math.round((successCount / uniqueIds.length) * 100),
                cacheHitRate: Math.round((cacheHitCount / uniqueIds.length) * 100)
            }
        }, {
            operation: 'batchDetail',
            batchSize: batchSize,
            totalBatches: Math.ceil(uncachedIds.length / batchSize),
            originalRequestCount: contentIds.length,
            uniqueRequestCount: uniqueIds.length
        });
    }
}

// ===== 서비스 컨테이너 설정 및 초기화 =====
const container = new ServiceContainer();

container
    .register('constants', () => new ConstantsManager())
    .register('i18n', () => new InternationalizationManager())
    .register('config', (container) => new ConfigManager(container))
    .register('logger', (container) => new Logger(container))
    .register('cache', (container) => new AdvancedCache(container))
    .register('rateLimiter', (container) => new RateLimiter(container))
    .register('validator', (container) => new InputValidator(container))
    .register('httpClient', (container) => new HttpClient(container))
    .register('security', (container) => new SecurityManager(container));

// 비동기 초기화
let containerInitialized = false;
let initializationError = null;

/**
 * 컨테이너를 초기화합니다
 * @returns {Promise<ServiceContainer>} 초기화된 컨테이너
 */
async function initializeContainer() {
    if (containerInitialized) return container;

    try {
        await container.initialize();
        containerInitialized = true;

        const configManager = container.get('config');
        const logger = container.get('logger');
        const i18n = container.get('i18n');

        // 언어 설정
        i18n.setLanguage(configManager.get('defaultLanguage'));

        // 설정 검증
        try {
            configManager.validateConfig();
            logger.info('✅ Configuration validated successfully', {
                apiKey: configManager.hasValidApiKey() ? 'Configured' : 'Missing',
                environment: configManager.get('environment'),
                version: configManager.get('version')
            });
        } catch (error) {
            logger.error('❌ Configuration validation failed', error);
            if (configManager.get('environment') === 'production') {
                throw error;
            }
        }

        return container;
    } catch (error) {
        initializationError = error;
        console.error('Container initialization failed:', error);
        throw error;
    }
}

// 즉시 초기화 시작
const initPromise = initializeContainer();

// ===== 메인 핸들러 =====
async function allTourismHandler(req, res) {
    const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    const startTime = Date.now();

    try {
        await initPromise;

        if (!containerInitialized) {
            throw initializationError || new Error('Container not initialized');
        }

        const logger = container.get('logger');
        const i18n = container.get('i18n');
        const configManager = container.get('config');
        const constants = container.get('constants');

        // Accept-Language 헤더에서 언어 설정
        const acceptLanguage = req.headers['accept-language'];
        if (acceptLanguage) {
            i18n.setLanguageFromHeader(acceptLanguage);
        }

        logger.info('API request received', {
            requestId,
            method: req.method,
            url: req.url ? req.url.split('?')[0] : 'unknown',
            userAgent: req.headers['user-agent'],
            origin: req.headers.origin,
            language: i18n.currentLanguage,
            acceptLanguage,
            contentLength: req.headers['content-length']
        });

        // OPTIONS 요청 처리
        if (req.method === 'OPTIONS') {
            const security = container.get('security');
            security.handleCors(req, res);
            res.status(200).end();
            return;
        }

        // 보안 검증
        const security = container.get('security');
        const securityInfo = security.validateRequest(req, res);

        // 요청 파라미터 추출
        const { operation = 'areaBasedList', ...params } = req.method === 'GET' ? 
            (req.query || {}) : (req.body || {});

        // API 키 확인
        if (!configManager.hasValidApiKey()) {
            throw new TourismApiError('MISSING_API_KEY', 'configuration', 500, {}, {}, i18n);
        }

        // 오퍼레이션 검증
        if (!constants.isValidOperation(operation)) {
            throw new ValidationError(
                i18n.getMessage('UNSUPPORTED_OPERATION', { operation }),
                'operation',
                operation,
                i18n
            );
        }

        logger.info('Processing API operation', {
            requestId,
            operation,
            paramCount: Object.keys(params).length,
            clientId: securityInfo.clientId,
            hasLocationParams: !!(params.userLat && params.userLng),
            language: i18n.currentLanguage
        });

        // 오퍼레이션 실행
        let result;
        switch (operation) {
            case 'areaBasedList':
                result = await AllTourismApiHandlers.handleAreaBasedList(container, params);
                break;
            case 'detailCommon':
                result = await AllTourismApiHandlers.handleDetailCommon(container, params);
                break;
            case 'searchKeyword':
                result = await AllTourismApiHandlers.handleSearchKeyword(container, params);
                break;
            case 'locationBasedList':
                result = await AllTourismApiHandlers.handleLocationBasedList(container, params);
                break;
            case 'batchDetail':
                result = await AllTourismApiHandlers.handleBatchDetail(container, params.contentIds);
                break;
            default:
                throw new ValidationError(
                    i18n.getMessage('UNSUPPORTED_OPERATION', { operation }),
                    'operation',
                    operation,
                    i18n
                );
        }

        const totalTime = Date.now() - startTime;

        // 성능 정보 추가
        result.metadata.performance = {
            ...result.metadata.performance,
            totalRequestTime: totalTime,
            timestamp: new Date().toISOString(),
            requestId
        };

        // 시스템 정보 추가
        result.metadata.system = {
            version: configManager.get('version'),
            environment: configManager.get('environment'),
            nodeVersion: RuntimeEnvironment.isNode ? process.version : 'browser',
            uptime: Date.now() - SERVICE_START_TIME,
            language: i18n.currentLanguage,
            supportedLanguages: i18n.getSupportedLanguages(),
            cacheStats: container.get('cache').getStats(),
            httpStats: container.get('httpClient').getStats(),
            rateLimiterStats: container.get('rateLimiter').getStats(),
            memoryUsage: RuntimeEnvironment.getMemoryUsage()
        };

        // 개발 환경에서만 디버그 정보 추가
        if (configManager.get('environment') === 'development') {
            result.metadata.debug = {
                containerServices: Array.from(container.services.keys()),
                securityEnabled: configManager.get('securityEnabled'),
                metricsEnabled: configManager.get('enableMetrics')
            };
        }

        logger.info('API request completed successfully', {
            requestId,
            operation,
            totalTime,
            itemCount: result.data.items ? result.data.items.length : 
                      (result.data.results ? result.data.results.length : 1),
            fromCache: result.metadata.cache?.fromCache || false,
            language: i18n.currentLanguage
        });

        logger.metric('request_success', 1, {
            operation,
            statusCode: 200,
            responseTime: totalTime,
            language: i18n.currentLanguage
        });

        res.status(200).json(result);
    } catch (error) {
        const totalTime = Date.now() - startTime;

        // 에러 로깅
        if (containerInitialized) {
            const logger = container.get('logger');
            logger.error('API request failed', {
                requestId,
                error: error.message,
                code: error.code,
                operation: error.operation,
                totalTime,
                statusCode: error.statusCode || 500
            });

            logger.metric('request_error', 1, {
                operation: error.operation || 'unknown',
                errorCode: error.code || 'UNKNOWN',
                statusCode: error.statusCode || 500
            });
        } else {
            console.error('Request failed during initialization:', error);
        }

        // 에러 응답 생성
        const errorResponse = ResponseFormatter.formatError(error, error.operation);
        errorResponse.metadata = {
            requestId,
            totalTime,
            timestamp: new Date().toISOString(),
            containerInitialized
        };

        res.status(error.statusCode || 500).json(errorResponse);
    }
}

// ===== 헬스체크 시스템 =====
async function healthCheck() {
    try {
        await initPromise;

        const memoryUsage = RuntimeEnvironment.getMemoryUsage();
        const preciseUptime = Date.now() - SERVICE_START_TIME;

        let systemInfo = {
            status: 'healthy',
            version: '2.0.0',
            uptime: {
                milliseconds: preciseUptime,
                seconds: Math.floor(preciseUptime / 1000),
                minutes: Math.floor(preciseUptime / 60000),
                hours: Math.floor(preciseUptime / 3600000)
            },
            memory: {
                heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
                heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
                external: Math.round(memoryUsage.external / 1024 / 1024),
                rss: Math.round(memoryUsage.rss / 1024 / 1024)
            },
            timestamp: new Date().toISOString(),
            environment: RuntimeEnvironment.isNode ? 'node' : 'browser'
        };

        if (containerInitialized) {
            const configManager = container.get('config');
            const cache = container.get('cache');
            const logger = container.get('logger');
            const httpClient = container.get('httpClient');
            const rateLimiter = container.get('rateLimiter');
            const i18n = container.get('i18n');

            systemInfo = {
                ...systemInfo,
                cache: cache.getStats(),
                httpClient: httpClient.getStats(),
                rateLimiter: rateLimiter.getStats(),
                metrics: {
                    collected: logger.getMetrics().length,
                    recentErrors: logger.getMetrics().filter(m =>
                        m.metric === 'request_error' &&
                        Date.now() - m.timestamp < 300000
                    ).length
                },
                config: {
                    environment: configManager.get('environment'),
                    enableMetrics: configManager.get('enableMetrics'),
                    enableBatching: configManager.get('enableBatching'),
                    rateLimitPerMinute: configManager.get('rateLimitPerMinute'),
                    maxCacheSize: configManager.get('maxCacheSize'),
                    maxConcurrent: configManager.get('maxConcurrent'),
                    supportedLanguages: i18n.getSupportedLanguages(),
                    currentLanguage: i18n.currentLanguage,
                    apiKeyConfigured: configManager.hasValidApiKey(),
                    securityEnabled: configManager.get('securityEnabled')
                },
                services: {
                    registered: Array.from(container.services.keys()),
                    initialized: container.isInitialized()
                }
            };
        } else {
            systemInfo.status = 'initializing';
            systemInfo.initializationError = initializationError?.message;
        }

        return systemInfo;
    } catch (error) {
        return {
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString(),
            containerInitialized,
            initializationError: initializationError?.message
        };
    }
}

// ===== 테스트 시스템 =====
async function runTests() {
    const testRunner = new TestRunner(container);

    testRunner
        .beforeEach(async () => {
            await initPromise;
        })
        .addTest('Environment Detection Test', async () => {
            testRunner.assert(
                RuntimeEnvironment.isNode || RuntimeEnvironment.isBrowser,
                'Runtime environment should be detected'
            );
        })
        .addTest('Container Initialization Test', async () => {
            testRunner.assert(containerInitialized, 'Container should be initialized');
            testRunner.assert(container.isInitialized(), 'Container initialization flag should be true');
        })
        .addTest('Configuration Test', async () => {
            const configManager = container.get('config');
            testRunner.assert(configManager.get('environment') !== undefined, 'Environment should be defined');
            testRunner.assert(configManager.get('version') === '2.0.0', 'Version should be 2.0.0');
            testRunner.assert(typeof configManager.get('rateLimitPerMinute') === 'number', 'Rate limit should be number');
        })
        .addTest('Constants Test', async () => {
            const constants = container.get('constants');
            testRunner.assert(constants.isValidOperation('areaBasedList'), 'areaBasedList should be valid operation');
            testRunner.assert(!constants.isValidOperation('invalidOperation'), 'invalidOperation should be invalid');
            testRunner.assert(constants.getApiUrl('areaBasedList').includes('areaBasedList2'), 'API URL should be correct');
        })
        .addTest('API Key Test', async () => {
            const configManager = container.get('config');
            testRunner.assert(configManager.hasValidApiKey(), 'API key should be configured');
        })
        .addTest('Cache Test', async () => {
            const cache = container.get('cache');
            const testKey = 'test-key-' + Date.now();
            const testData = { test: 'data', timestamp: Date.now() };

            cache.set(testKey, testData);
            const retrieved = cache.get(testKey);

            testRunner.assert(retrieved !== null, 'Cache should store and retrieve data');
            testRunner.assertEqual(retrieved.test, testData.test, 'Retrieved data should match stored data');

            cache.delete(testKey); // 정리
        })
        .addTest('I18n Test', async () => {
            const i18n = container.get('i18n');

            i18n.setLanguage('en');
            testRunner.assertEqual(i18n.getMessage('NOT_FOUND'), 'Data not found', 'English message should work');

            i18n.setLanguage('ko');
            testRunner.assertEqual(i18n.getMessage('NOT_FOUND'), '데이터를 찾을 수 없습니다', 'Korean message should work');

            i18n.setLanguage('ja');
            testRunner.assertEqual(i18n.getMessage('NOT_FOUND'), 'データが見つかりません', 'Japanese fallback should work');
        })
        .addTest('Integration: Full API Flow', async () => {
            const response = await AllTourismApiHandlers.handleAreaBasedList(
                container, 
                { numOfRows: '5', pageNo: '1' }
            );
            
            testRunner.assert(response.success, 'API call should succeed');
            testRunner.assert(Array.isArray(response.data.items), 'Should return items array');
            testRunner.assert(response.data.pagination, 'Should include pagination');
        });

    return testRunner.runAll();
}

// ===== 모듈 내보내기 =====
module.exports = {
    // 메인 함수들
    handler: allTourismHandler,
    healthCheck,
    runTests,

    // 컨테이너 및 서비스들
    container: () => initPromise.then(() => container),
    getContainer: async () => {
        await initPromise;
        return container;
    },

    // 개별 서비스 접근
    getService: async (serviceName) => {
        await initPromise;
        return container.get(serviceName);
    },

    // 클래스들
    AllTourismApiHandlers,
    AdvancedCache,
    RateLimiter,
    TourismApiError,
    ValidationError,
    ApiTimeoutError,
    RateLimitError,
    NetworkError,
    InputValidator,
    HttpClient,
    SecurityManager,
    ResponseFormatter,
    ApiResponseProcessor,
    GeoUtils,
    TestRunner,

    // 상태 정보
    isInitialized: () => containerInitialized,
    getInitializationError: () => initializationError,

    // 초기화 함수
    initialize: initializeContainer
};

// ===== Express.js 미들웨어 =====
module.exports.middleware = function(req, res, next) {
    allTourismHandler(req, res).catch(next);
};

// ===== Serverless 핸들러 =====
module.exports.serverless = async function(event, context) {
    try {
        const req = {
            method: event.httpMethod || event.requestContext?.http?.method || 'GET',
            headers: event.headers || {},
            query: event.queryStringParameters || {},
            body: event.body ? (typeof event.body === 'string' ? JSON.parse(event.body) : event.body) : {},
            url: event.path || event.rawPath || '/'
        };

        const res = {
            statusCode: 200,
            headers: {},
            body: '',
            status: function(code) { this.statusCode = code; return this; },
            json: function(data) { 
                this.body = JSON.stringify(data); 
                this.headers['Content-Type'] = 'application/json'; 
                return this; 
            },
            setHeader: function(name, value) { this.headers[name] = value; },
            end: function() { return this; }
        };

        await allTourismHandler(req, res);

        return {
            statusCode: res.statusCode,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
                ...res.headers
            },
            body: res.body || ''
        };
    } catch (error) {
        console.error('Serverless handler error:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                success: false,
                error: {
                    message: error.message,
                    code: 'SERVERLESS_ERROR',
                    timestamp: new Date().toISOString()
                }
            })
        };
    }
};

// ===== Cloudflare Workers 핸들러 =====
module.exports.cloudflareWorker = async function(request, env, ctx) {
    try {
        const url = new URL(request.url);
        const req = {
            method: request.method,
            headers: Object.fromEntries(request.headers.entries()),
            query: Object.fromEntries(url.searchParams.entries()),
            body: request.method !== 'GET' ? await request.json() : {},
            url: url.pathname
        };

        const res = {
            statusCode: 200,
            headers: {},
            body: '',
            status: function(code) { this.statusCode = code; return this; },
            json: function(data) { 
                this.body = JSON.stringify(data); 
                this.headers['Content-Type'] = 'application/json'; 
                return this; 
            },
            setHeader: function(name, value) { this.headers[name] = value; },
            end: function() { return this; }
        };

        await allTourismHandler(req, res);

        return new Response(res.body, {
            status: res.statusCode,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
                ...res.headers
            }
        });
    } catch (error) {
        return new Response(JSON.stringify({
            success: false,
            error: {
                message: error.message,
                code: 'WORKER_ERROR',
                timestamp: new Date().toISOString()
            }
        }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
    }
};

// ===== 정리 함수 =====
module.exports.cleanup = async function() {
    if (containerInitialized) {
        try {
            container.destroy();
            console.log('🧹 AllTourism Enterprise API System cleaned up successfully');
        } catch (error) {
            console.error('Cleanup error:', error);
        }
    }
};

// ===== Process 이벤트 핸들러 (Node.js 환경에서만) =====
if (RuntimeEnvironment.isNode) {
    // Graceful shutdown
    process.on('SIGTERM', async () => {
        console.log('SIGTERM received, shutting down gracefully');
        await module.exports.cleanup();
        process.exit(0);
    });

    process.on('SIGINT', async () => {
        console.log('SIGINT received, shutting down gracefully');
        await module.exports.cleanup();
        process.exit(0);
    });

    // 처리되지 않은 예외 처리
    process.on('uncaughtException', (error) => {
        console.error('Uncaught Exception:', error);
        if (containerInitialized) {
            const logger = container.get('logger');
            logger.error('Uncaught Exception', error);
        }
        process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
        console.error('Unhandled Rejection at:', promise, 'reason:', reason);
        if (containerInitialized) {
            const logger = container.get('logger');
            logger.error('Unhandled Rejection', { reason, promise });
        }
    });
}

// ===== 초기화 시작 및 로깅 =====
initPromise.then(() => {
    if (containerInitialized) {
        const configManager = container.get('config');
        const logger = container.get('logger');
        const i18n = container.get('i18n');

        logger.info('🚀 AllTourism Enterprise API System v2.0.0 초기화 완료', {
            version: configManager.get('version'),
            environment: configManager.get('environment'),
            nodeVersion: RuntimeEnvironment.isNode ? process.version : 'browser',
            apiKeyConfigured: configManager.hasValidApiKey(),
            features: {
                caching: true,
                rateLimiting: true,
                metrics: configManager.get('enableMetrics'),
                batching: configManager.get('enableBatching'),
                compression: configManager.get('enableCompression'),
                concurrencyControl: true,
                i18n: true,
                acceptLanguageParsing: true,
                dependencyInjection: true,
                memoryMonitoring: true,
                resourceManagement: true,
                comprehensiveTesting: true,
                gracefulShutdown: RuntimeEnvironment.isNode,
                securityHeaders: true,
                crossPlatformSupport: true
            },
            configuration: {
                concurrentLimit: configManager.get('maxConcurrent'),
                rateLimitPerMinute: configManager.get('rateLimitPerMinute'),
                cacheMaxSize: configManager.get('maxCacheSize'),
                apiTimeout: configManager.get('apiTimeout'),
                retryAttempts: configManager.get('retryAttempts'),
                securityEnabled: configManager.get('securityEnabled')
            },
            internationalization: {
                supportedLanguages: i18n.getSupportedLanguages(),
                currentLanguage: i18n.currentLanguage,
                fallbackChain: true
            },
            services: {
                registered: Array.from(container.services.keys()),
                initialized: container.isInitialized(),
                singletons: Array.from(container.singletons.keys())
            },
            platform: {
                runtime: RuntimeEnvironment.isNode ? 'Node.js' : 
                        RuntimeEnvironment.isBrowser ? 'Browser' : 
                        RuntimeEnvironment.isWebWorker ? 'WebWorker' : 'Unknown',
                memoryUsage: RuntimeEnvironment.getMemoryUsage()
            },
            startupTime: Date.now() - SERVICE_START_TIME
        });
    }
}).catch(error => {
    console.error('🚨 AllTourism Enterprise API System 초기화 실패:', error);
});
