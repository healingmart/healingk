// ===== TourAPI 4.3 Enterprise Implementation - 최종 완성 버전 =====
'use strict';

// 런타임 환경 감지 및 폴리필
const isNode = typeof window === 'undefined';
if (isNode && typeof fetch === 'undefined') {
    global.fetch = require('node-fetch');
    global.AbortController = require('abort-controller');
}

// ===== 서비스 시작 시간 추적 =====
const SERVICE_START_TIME = Date.now();

// ===== 동시성 제어 유틸리티 =====
class Semaphore {
    constructor(maxConcurrent) {
        this.maxConcurrent = maxConcurrent;
        this.currentConcurrent = 0;
        this.queue = [];
    }

    async acquire() {
        return new Promise((resolve) => {
            if (this.currentConcurrent < this.maxConcurrent) {
                this.currentConcurrent++;
                resolve();
            } else {
                this.queue.push(resolve);
            }
        });
    }

    release() {
        this.currentConcurrent--;
        if (this.queue.length > 0) {
            const next = this.queue.shift();
            this.currentConcurrent++;
            next();
        }
    }

    async execute(fn) {
        await this.acquire();
        try {
            return await fn();
        } finally {
            this.release();
        }
    }
}

// ===== Accept-Language 파서 =====
class LanguageNegotiator {
    static parseAcceptLanguage(acceptLanguageHeader) {
        if (!acceptLanguageHeader) return [];

        return acceptLanguageHeader
            .split(',')
            .map(lang => {
                const [language, quality = 'q=1'] = lang.trim().split(';');
                const q = parseFloat(quality.split('=')[1]) || 1;
                return { language: language.trim(), quality: q };
            })
            .sort((a, b) => b.quality - a.quality);
    }

    static getBestMatch(acceptLanguageHeader, supportedLanguages) {
        const preferences = this.parseAcceptLanguage(acceptLanguageHeader);
        
        for (const preference of preferences) {
            const lang = preference.language.toLowerCase();
            
            // 정확한 매치 찾기 (예: ko-KR)
            if (supportedLanguages.has(lang)) {
                return lang;
            }
            
            // 언어 코드만 매치 (예: ko-KR -> ko)
            const primaryLang = lang.split('-')[0];
            if (supportedLanguages.has(primaryLang)) {
                return primaryLang;
            }
        }
        
        return null;
    }
}

// ===== 개선된 다국어 지원 시스템 =====
class InternationalizationManager {
    constructor() {
        this.defaultLanguage = 'ko';
        this.currentLanguage = 'ko';
        this.messages = new Map();
        this.supportedLanguages = new Set(['ko', 'en']);
        this.setupMessages();
    }

    setupMessages() {
        // 한국어 메시지 (완전한 세트)
        this.messages.set('ko', {
            VALIDATION_ERROR: '입력값 검증 실패',
            API_TIMEOUT: 'API 요청 시간 초과: {timeout}ms',
            RATE_LIMIT_EXCEEDED: '요청 한도를 초과했습니다',
            CORS_ERROR: '허용되지 않은 Origin입니다',
            INVALID_API_KEY: '유효하지 않은 API 키입니다',
            MISSING_API_KEY: 'API 키가 설정되지 않았습니다',
            UNSUPPORTED_OPERATION: '지원하지 않는 오퍼레이션: {operation}',
            NOT_FOUND: '데이터를 찾을 수 없습니다',
            EMPTY_RESPONSE: 'API 응답이 없습니다',
            HTTP_ERROR: 'HTTP {status}: {statusText}',
            FIELD_REQUIRED: '는 필수 입력값입니다',
            INVALID_FORMAT: '의 형식이 올바르지 않습니다',
            INVALID_RANGE: '의 범위가 올바르지 않습니다',
            TYPE_MISMATCH: '는 {type} 타입이어야 합니다',
            MIN_LENGTH_ERROR: '는 최소 {minLength}자 이상이어야 합니다',
            MAX_LENGTH_ERROR: '는 최대 {maxLength}자 이하여야 합니다',
            NUMERIC_ERROR: '는 숫자여야 합니다',
            ENUM_ERROR: '는 다음 값 중 하나여야 합니다: {values}',
            BATCH_CONTENT_IDS_REQUIRED: '배치 작업에는 contentIds 배열이 필요합니다'
        });

        // 영어 메시지 (완전한 세트)
        this.messages.set('en', {
            VALIDATION_ERROR: 'Validation failed',
            API_TIMEOUT: 'API request timeout: {timeout}ms',
            RATE_LIMIT_EXCEEDED: 'Rate limit exceeded',
            CORS_ERROR: 'Origin not allowed',
            INVALID_API_KEY: 'Invalid API key',
            MISSING_API_KEY: 'API key not configured',
            UNSUPPORTED_OPERATION: 'Unsupported operation: {operation}',
            NOT_FOUND: 'Data not found',
            EMPTY_RESPONSE: 'Empty API response',
            HTTP_ERROR: 'HTTP {status}: {statusText}',
            FIELD_REQUIRED: ' is required',
            INVALID_FORMAT: ' has invalid format',
            INVALID_RANGE: ' is out of range',
            TYPE_MISMATCH: ' must be of type {type}',
            MIN_LENGTH_ERROR: ' must be at least {minLength} characters',
            MAX_LENGTH_ERROR: ' must be at most {maxLength} characters',
            NUMERIC_ERROR: ' must be a number',
            ENUM_ERROR: ' must be one of: {values}',
            BATCH_CONTENT_IDS_REQUIRED: 'Batch operation requires contentIds array'
        });
    }

    setLanguageFromHeader(acceptLanguageHeader) {
        const bestMatch = LanguageNegotiator.getBestMatch(acceptLanguageHeader, this.supportedLanguages);
        if (bestMatch) {
            this.currentLanguage = bestMatch;
        }
    }

    setLanguage(lang) {
        if (this.supportedLanguages.has(lang)) {
            this.currentLanguage = lang;
        }
    }

    getMessage(code, params = {}) {
        const messages = this.messages.get(this.currentLanguage) || this.messages.get(this.defaultLanguage);
        let message = messages[code] || code;
        
        // 템플릿 변수 치환
        Object.entries(params).forEach(([key, value]) => {
            message = message.replace(new RegExp(`{${key}}`, 'g'), value);
        });
        
        return message;
    }

    getSupportedLanguages() {
        return Array.from(this.supportedLanguages);
    }
}

// ===== 상수 관리 시스템 =====
class ConstantsManager {
    constructor() {
        this.initializeConstants();
    }

    initializeConstants() {
        this.SUPPORTED_OPERATIONS = [
            'areaCode', 'categoryCode', 'areaBasedList', 'locationBasedList', 
            'searchKeyword', 'searchFestival', 'searchStay', 'detailCommon', 
            'detailIntro', 'detailInfo', 'detailImage', 'areaBasedSyncList',
            'detailPetTour', 'ldongCode', 'lclsSystmCode', 'batchDetail'
        ];

        this.CONTENT_TYPE_MAP = {
            '12': { name: '관광지', icon: '🏛️', en: 'Tourist Spot' },
            '14': { name: '문화시설', icon: '🎭', en: 'Cultural Facility' },
            '15': { name: '축제/공연/행사', icon: '🎪', en: 'Festival/Event' },
            '25': { name: '여행코스', icon: '🗺️', en: 'Travel Course' },
            '28': { name: '레포츠', icon: '⛷️', en: 'Leisure Sports' },
            '32': { name: '숙박', icon: '🏨', en: 'Accommodation' },
            '38': { name: '쇼핑', icon: '🛍️', en: 'Shopping' },
            '39': { name: '음식점', icon: '🍽️', en: 'Restaurant' }
        };

        this.AREA_CODE_MAP = {
            '1': { name: '서울', emoji: '🏙️', en: 'Seoul' },
            '2': { name: '인천', emoji: '✈️', en: 'Incheon' },
            '3': { name: '대전', emoji: '🏢', en: 'Daejeon' },
            '4': { name: '대구', emoji: '🌆', en: 'Daegu' },
            '5': { name: '광주', emoji: '🌸', en: 'Gwangju' },
            '6': { name: '부산', emoji: '🌊', en: 'Busan' },
            '7': { name: '울산', emoji: '🏭', en: 'Ulsan' },
            '8': { name: '세종', emoji: '🏛️', en: 'Sejong' },
            '31': { name: '경기', emoji: '🏘️', en: 'Gyeonggi' },
            '32': { name: '강원', emoji: '⛰️', en: 'Gangwon' },
            '33': { name: '충북', emoji: '🏔️', en: 'Chungbuk' },
            '34': { name: '충남', emoji: '🌾', en: 'Chungnam' },
            '35': { name: '경북', emoji: '🏯', en: 'Gyeongbuk' },
            '36': { name: '경남', emoji: '🏞️', en: 'Gyeongnam' },
            '37': { name: '전북', emoji: '🌿', en: 'Jeonbuk' },
            '38': { name: '전남', emoji: '🍃', en: 'Jeonnam' },
            '39': { name: '제주', emoji: '🌺', en: 'Jeju' }
        };

        this.API_ENDPOINTS = {
            areaCode: 'areaCode2',
            categoryCode: 'categoryCode2',
            areaBasedList: 'areaBasedList2',
            locationBasedList: 'locationBasedList2',
            searchKeyword: 'searchKeyword2',
            searchFestival: 'searchFestival2',
            searchStay: 'searchStay2',
            detailCommon: 'detailCommon2',
            detailIntro: 'detailIntro2',
            detailInfo: 'detailInfo2',
            detailImage: 'detailImage2',
            areaBasedSyncList: 'areaBasedSyncList2',
            detailPetTour: 'detailPetTour2',
            ldongCode: 'ldongCode2',
            lclsSystmCode: 'lclsSystmCode2'
        };

        this.DEFAULT_CONFIG = {
            tourApiKey: null,
            allowedOrigins: [
                'https://your-blog.com',
                'https://www.your-blog.com',
                'https://your-travel-site.com',
                'http://localhost:3000',
                'http://localhost:8080'
            ],
            allowedApiKeys: [],
            rateLimitPerMinute: 1000,
            maxCacheSize: 5000,
            cacheTtl: 30 * 60 * 1000,
            apiTimeout: 15000,
            retryAttempts: 3,
            retryDelay: 1000,
            maxConcurrent: 10,
            enableMetrics: false,
            enableCompression: true,
            enableBatching: true,
            maxBatchSize: 5,
            environment: 'development',
            logLevel: 'info',
            defaultLanguage: 'ko'
        };
    }

    get(category, key = null) {
        if (key === null) {
            return this[category];
        }
        return this[category]?.[key];
    }

    isValidOperation(operation) {
        return this.SUPPORTED_OPERATIONS.includes(operation);
    }

    getContentTypeName(contentTypeId, lang = 'ko') {
        const contentType = this.CONTENT_TYPE_MAP[contentTypeId];
        if (!contentType) return lang === 'en' ? 'Other' : '기타';
        return lang === 'en' ? contentType.en : contentType.name;
    }

    getAreaName(areaCode, lang = 'ko') {
        const area = this.AREA_CODE_MAP[areaCode];
        if (!area) return lang === 'en' ? 'Other' : '기타';
        return lang === 'en' ? area.en : area.name;
    }
}

// ===== 의존성 주입 기반 설정 관리 시스템 =====
class ConfigManager {
    constructor() {
        this.config = this.loadConfig();
        this.validators = new Map();
        this.subscribers = new Set();
        this.environmentOverrides = new Map();
        this.initialized = false;
        
        this.registerValidators();
        this.setupEnvironmentOverrides();
        this.applyEnvironmentOverrides(this.config);
        this.initialized = true;
    }

    loadConfig() {
        const constants = new ConstantsManager();
        const defaultConfig = { ...constants.DEFAULT_CONFIG };
        
        // 환경변수에서 설정 로드
        return {
            ...defaultConfig,
            tourApiKey: process.env.TOURISM_API_KEY || process.env.TOUR_API_KEY || defaultConfig.tourApiKey,
            allowedOrigins: this.parseArray(process.env.ALLOWED_ORIGINS) || defaultConfig.allowedOrigins,
            allowedApiKeys: this.parseArray(process.env.ALLOWED_API_KEYS) || defaultConfig.allowedApiKeys,
            rateLimitPerMinute: parseInt(process.env.RATE_LIMIT) || defaultConfig.rateLimitPerMinute,
            maxCacheSize: parseInt(process.env.MAX_CACHE_SIZE) || defaultConfig.maxCacheSize,
            cacheTtl: parseInt(process.env.CACHE_TTL) || defaultConfig.cacheTtl,
            apiTimeout: parseInt(process.env.API_TIMEOUT) || defaultConfig.apiTimeout,
            retryAttempts: parseInt(process.env.RETRY_ATTEMPTS) || defaultConfig.retryAttempts,
            retryDelay: parseInt(process.env.RETRY_DELAY) || defaultConfig.retryDelay,
            maxConcurrent: parseInt(process.env.MAX_CONCURRENT) || defaultConfig.maxConcurrent,
            enableMetrics: process.env.ENABLE_METRICS === 'true',
            enableCompression: process.env.ENABLE_COMPRESSION !== 'false',
            enableBatching: process.env.ENABLE_BATCHING === 'true',
            maxBatchSize: parseInt(process.env.MAX_BATCH_SIZE) || defaultConfig.maxBatchSize,
            environment: process.env.NODE_ENV || defaultConfig.environment,
            logLevel: process.env.LOG_LEVEL || defaultConfig.logLevel,
            defaultLanguage: process.env.DEFAULT_LANGUAGE || defaultConfig.defaultLanguage
        };
    }

    parseArray(envVar) {
        if (!envVar) return null;
        return envVar.split(',').map(item => item.trim()).filter(item => item.length > 0);
    }

    setupEnvironmentOverrides() {
        this.environmentOverrides.set('production', {
            allowedOrigins: (origins) => origins.filter(origin => !origin.includes('localhost')),
            enableMetrics: true,
            logLevel: 'warn'
        });

        this.environmentOverrides.set('development', {
            enableMetrics: false,
            logLevel: 'debug'
        });
    }

    applyEnvironmentOverrides(config) {
        const env = config.environment;
        const overrides = this.environmentOverrides.get(env);
        
        if (overrides) {
            Object.entries(overrides).forEach(([key, value]) => {
                if (typeof value === 'function') {
                    config[key] = value(config[key]);
                } else {
                    config[key] = value;
                }
            });
        }
    }

    registerValidators() {
        this.validators.set('allowedOrigins', (value) => {
            if (!Array.isArray(value)) throw new Error('allowedOrigins must be an array');
            return value.every(origin => typeof origin === 'string' && origin.length > 0);
        });

        this.validators.set('rateLimitPerMinute', (value) => {
            const num = parseInt(value);
            return !isNaN(num) && num > 0 && num <= 10000;
        });

        this.validators.set('maxCacheSize', (value) => {
            const num = parseInt(value);
            return !isNaN(num) && num > 0 && num <= 100000;
        });

        this.validators.set('apiTimeout', (value) => {
            const num = parseInt(value);
            return !isNaN(num) && num >= 1000 && num <= 60000;
        });

        this.validators.set('cacheTtl', (value) => {
            const num = parseInt(value);
            return !isNaN(num) && num >= 60000;
        });

        this.validators.set('maxConcurrent', (value) => {
            const num = parseInt(value);
            return !isNaN(num) && num > 0 && num <= 50;
        });
    }

    get(key) {
        return this.config[key];
    }

    set(key, value) {
        if (this.validators.has(key)) {
            if (!this.validators.get(key)(value)) {
                throw new Error(`Invalid value for config key: ${key}`);
            }
        }

        const oldValue = this.config[key];
        this.config[key] = value;

        if (this.initialized) {
            this.notifySubscribers(key, value, oldValue);
        }
    }

    subscribe(callback) {
        this.subscribers.add(callback);
        return () => this.subscribers.delete(callback);
    }

    notifySubscribers(key, newValue, oldValue) {
        this.subscribers.forEach(callback => {
            try {
                callback(key, newValue, oldValue);
            } catch (error) {
                console.error('Config subscriber error:', error);
            }
        });
    }

    validateConfig() {
        const errors = [];
        
        if (!this.config.tourApiKey) {
            errors.push('TOURISM_API_KEY 환경변수가 설정되지 않았습니다');
        }
        
        if (this.config.rateLimitPerMinute <= 0) {
            errors.push('rateLimitPerMinute은 0보다 커야 합니다');
        }
        
        if (errors.length > 0) {
            throw new Error(`설정 검증 실패: ${errors.join(', ')}`);
        }
        
        return true;
    }

    isInitialized() {
        return this.initialized;
    }
}

// ===== 고급 로깅 시스템 =====
class Logger {
    constructor(configManager) {
        this.configManager = configManager;
        this.logLevel = this.configManager?.get('logLevel') || 'info';
        this.logLevels = {
            debug: 0,
            info: 1,
            warn: 2,
            error: 3
        };
        this.metricsBuffer = [];
        this.maxMetricsBuffer = 1000;
        
        this.setupConfigSubscription();
    }

    setupConfigSubscription() {
        if (this.configManager) {
            this.configManager.subscribe((key, newValue) => {
                if (key === 'logLevel') {
                    this.logLevel = newValue;
                }
            });
        }
    }

    shouldLog(level) {
        return this.logLevels[level] >= this.logLevels[this.logLevel];
    }

    formatMessage(level, message, data = {}) {
        const timestamp = new Date().toISOString();
        
        return {
            timestamp,
            level: level.toUpperCase(),
            message,
            data,
            pid: process.pid,
            environment: this.configManager?.get('environment') || 'unknown',
            uptime: this.getPreciseUptime()
        };
    }

    getPreciseUptime() {
        return Date.now() - SERVICE_START_TIME;
    }

    debug(message, data) {
        if (this.shouldLog('debug')) {
            console.debug('🔍', JSON.stringify(this.formatMessage('debug', message, data)));
        }
    }

    info(message, data) {
        if (this.shouldLog('info')) {
            console.log('ℹ️', JSON.stringify(this.formatMessage('info', message, data)));
        }
    }

    warn(message, data) {
        if (this.shouldLog('warn')) {
            console.warn('⚠️', JSON.stringify(this.formatMessage('warn', message, data)));
        }
    }

    error(message, error) {
        if (this.shouldLog('error')) {
            const errorData = error instanceof Error ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
                code: error.code
            } : error;
            
            console.error('🚨', JSON.stringify(this.formatMessage('error', message, errorData)));
        }
    }

    metric(metricName, value, tags = {}) {
        if (this.configManager?.get('enableMetrics')) {
            const metricData = {
                metric: metricName,
                value,
                tags,
                timestamp: Date.now()
            };
            
            this.metricsBuffer.push(metricData);
            
            if (this.metricsBuffer.length > this.maxMetricsBuffer) {
                this.metricsBuffer = this.metricsBuffer.slice(-this.maxMetricsBuffer);
            }
            
            this.info('METRIC', metricData);
        }
    }

    getMetrics() {
        return [...this.metricsBuffer];
    }

    clearMetrics() {
        this.metricsBuffer = [];
    }
}

// ===== 개선된 메모리 효율적인 캐시 시스템 =====
class AdvancedCache {
    constructor(configManager, logger) {
        this.configManager = configManager;
        this.logger = logger;
        this.cache = new Map();
        this.accessTimes = new Map();
        this.stats = {
            hitCount: 0,
            missCount: 0,
            evictionCount: 0
        };
        
        this.maxSize = this.configManager.get('maxCacheSize');
        this.ttl = this.configManager.get('cacheTtl');
        this.sizeTracker = 0;
        this.maxMemorySize = 50 * 1024 * 1024; // 50MB
        
        this.startCleanupWorker();
        this.setupConfigSubscription();
    }

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
            }
        });
    }

    generateKey(operation, params) {
        const sortedEntries = Object.entries(params)
            .filter(([_, value]) => value !== undefined && value !== null && value !== '')
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}:${value}`)
            .join('|');
        
        return `${operation}:${sortedEntries}`;
    }

    estimateSize(data) {
        try {
            if (typeof data === 'string') {
                return data.length * 2; // UTF-16
            }
            
            if (typeof data === 'object' && data !== null) {
                const str = JSON.stringify(data);
                return str.length * 2 + 50; // 객체 오버헤드 추가
            }
            
            return 50; // 기본값
        } catch {
            return 50;
        }
    }

    get(key) {
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

    set(key, data) {
        const now = Date.now();
        const size = this.estimateSize(data);
        
        if (this.sizeTracker + size > this.maxMemorySize) {
            this.evictByMemory();
        }
        
        if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
            this.evictLRU();
        }

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
        
        this.logger.debug('Cache set', { key, dataSize: size, totalSize: this.sizeTracker });
    }

    delete(key) {
        const item = this.cache.get(key);
        if (item) {
            this.sizeTracker -= item.size;
            this.cache.delete(key);
            this.accessTimes.delete(key);
        }
    }

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

    evictByMemory() {
        const targetSize = this.maxMemorySize * 0.5;
        
        while (this.sizeTracker > targetSize && this.cache.size > 0) {
            this.evictLRU();
        }
        
        this.logger.info('Memory-based cache eviction completed', { 
            remainingSize: this.sizeTracker,
            targetSize 
        });
    }

    enforceSizeLimit() {
        while (this.cache.size > this.maxSize) {
            this.evictLRU();
        }
    }

    clear() {
        this.cache.clear();
        this.accessTimes.clear();
        this.sizeTracker = 0;
        this.logger.info('Cache cleared');
    }

    getStats() {
        const totalRequests = this.stats.hitCount + this.stats.missCount;
        const hitRate = totalRequests > 0 ? (this.stats.hitCount / totalRequests) * 100 : 0;
        
        const memoryUsage = process.memoryUsage();

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
                external: Math.round(memoryUsage.external / 1024 / 1024)
            }
        };
    }

    startCleanupWorker() {
        setInterval(() => {
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
                    freedMemory 
                });
            }
        }, 5 * 60 * 1000);
    }
}

// ===== 개선된 레이트 리미터 =====
class RateLimiter {
    constructor(configManager, logger) {
        this.configManager = configManager;
        this.logger = logger;
        this.requests = new Map();
        this.limit = this.configManager.get('rateLimitPerMinute');
        this.windowMs = 60 * 1000;
        
        this.setupConfigSubscription();
        setInterval(() => this.cleanup(), this.windowMs);
    }

    setupConfigSubscription() {
        this.configManager.subscribe((key, newValue, oldValue) => {
            if (key === 'rateLimitPerMinute') {
                this.limit = newValue;
                this.logger.info('Rate limit updated', { old: oldValue, new: newValue });
            }
        });
    }

    isAllowed(clientId) {
        const now = Date.now();
        const windowStart = now - this.windowMs;
        
        if (!this.requests.has(clientId)) {
            this.requests.set(clientId, []);
        }

        const clientRequests = this.requests.get(clientId);
        
        const validRequests = clientRequests.filter(timestamp => timestamp > windowStart);
        this.requests.set(clientId, validRequests);

        if (validRequests.length >= this.limit) {
            return false;
        }

        validRequests.push(now);
        return true;
    }

    cleanup() {
        const now = Date.now();
        const windowStart = now - this.windowMs;

        for (const [clientId, requests] of this.requests.entries()) {
            const validRequests = requests.filter(timestamp => timestamp > windowStart);
            
            if (validRequests.length === 0) {
                this.requests.delete(clientId);
            } else {
                this.requests.set(clientId, validRequests);
            }
        }
    }

    getRemainingQuota(clientId) {
        if (!this.requests.has(clientId)) {
            return this.limit;
        }

        const now = Date.now();
        const windowStart = now - this.windowMs;
        const validRequests = this.requests.get(clientId).filter(
            timestamp => timestamp > windowStart
        );

        return Math.max(0, this.limit - validRequests.length);
    }
}

// ===== 개선된 커스텀 에러 클래스 =====
class TourApiError extends Error {
    constructor(messageCode, operation, statusCode = 500, details = {}, params = {}) {
        // i18n이 초기화되기 전에는 기본 메시지 사용
        const message = (typeof i18n !== 'undefined') ? 
            i18n.getMessage(messageCode, params) : 
            messageCode;
        
        super(message);
        this.name = 'TourApiError';
        this.code = messageCode;
        this.operation = operation;
        this.statusCode = statusCode;
        this.details = details;
        this.timestamp = new Date().toISOString();
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

class ValidationError extends TourApiError {
    constructor(message, field, value) {
        super('VALIDATION_ERROR', 'validation', 400, { field, value });
        this.name = 'ValidationError';
        this.message = message; // 사용자 정의 메시지 사용
    }
}

class ApiTimeoutError extends TourApiError {
    constructor(operation, timeout) {
        super('API_TIMEOUT', operation, 408, { timeout }, { timeout });
        this.name = 'ApiTimeoutError';
    }
}

class RateLimitError extends TourApiError {
    constructor(limit, remaining) {
        super('RATE_LIMIT_EXCEEDED', 'rateLimit', 429, { limit, remaining });
        this.name = 'RateLimitError';
    }
}

// ===== 완전히 다국어화된 입력 검증 시스템 =====
class InputValidator {
    constructor(i18n) {
        this.i18n = i18n;
        this.schemas = new Map();
        this.setupSchemas();
    }

    setupSchemas() {
        const commonSchema = {
            numOfRows: { type: 'string', pattern: /^\d+$/, min: 1, max: 1000 },
            pageNo: { type: 'string', pattern: /^\d+$/, min: 1, max: 1000 },
            arrange: { type: 'string', enum: ['A', 'B', 'C', 'D', 'E', 'O', 'Q', 'R'] }
        };

        this.schemas.set('areaBasedList', {
            ...commonSchema,
            contentTypeId: { type: 'string', enum: ['12', '14', '15', '25', '28', '32', '38', '39'] },
            areaCode: { type: 'string', pattern: /^\d{1,2}$/ },
            sigunguCode: { type: 'string', pattern: /^\d{1,5}$/ },
            cat1: { type: 'string', pattern: /^[A-Z]\d{2}$/ },
            cat2: { type: 'string', pattern: /^[A-Z]\d{4}$/ },
            cat3: { type: 'string', pattern: /^[A-Z]\d{6}$/ },
            modifiedtime: { type: 'string', pattern: /^\d{8}$/ },
            userLat: { type: 'string', pattern: /^-?\d+\.?\d*$/ },
            userLng: { type: 'string', pattern: /^-?\d+\.?\d*$/ },
            radius: { type: 'string', pattern: /^\d+\.?\d*$/ }
        });

        this.schemas.set('locationBasedList', {
            ...commonSchema,
            mapX: { type: 'string', required: true, pattern: /^\d+\.?\d*$/ },
            mapY: { type: 'string', required: true, pattern: /^\d+\.?\d*$/ },
            radius: { type: 'string', required: true, pattern: /^\d+$/, min: 1, max: 20000 }
        });

        this.schemas.set('searchKeyword', {
            ...commonSchema,
            keyword: { type: 'string', required: true, minLength: 1, maxLength: 100 }
        });

        this.schemas.set('detailCommon', {
            contentId: { type: 'string', required: true, pattern: /^\d+$/ }
        });

        this.schemas.set('detailIntro', {
            contentId: { type: 'string', required: true, pattern: /^\d+$/ },
            contentTypeId: { type: 'string', required: true, enum: ['12', '14', '15', '25', '28', '32', '38', '39'] }
        });

        this.schemas.set('batchDetail', {
            contentIds: { type: 'object', required: true, isArray: true }
        });
    }

    validate(operation, params) {
        const schema = this.schemas.get(operation);
        if (!schema) {
            throw new ValidationError(
                this.i18n.getMessage('UNSUPPORTED_OPERATION', { operation }), 
                'operation', 
                operation
            );
        }

        const errors = [];

        for (const [field, rules] of Object.entries(schema)) {
            if (rules.required && (!params[field] || (typeof params[field] === 'string' && params[field].trim() === ''))) {
                errors.push(`${field}${this.i18n.getMessage('FIELD_REQUIRED')}`);
                continue;
            }

            const value = params[field];
            if (value === undefined || value === null || value === '') {
                continue;
            }

            // 배열 타입 검증
            if (rules.isArray && !Array.isArray(value)) {
                errors.push(`${field} must be an array`);
                continue;
            }

            // 타입 검증 (배열이 아닌 경우)
            if (!rules.isArray && rules.type && typeof value !== rules.type) {
                errors.push(`${field}${this.i18n.getMessage('TYPE_MISMATCH', { type: rules.type })}`);
                continue;
            }

            // 패턴 검증
            if (rules.pattern && typeof value === 'string' && !rules.pattern.test(value)) {
                errors.push(`${field}${this.i18n.getMessage('INVALID_FORMAT')}`);
                continue;
            }

            // 길이 검증
            if (rules.minLength && typeof value === 'string' && value.length < rules.minLength) {
                errors.push(`${field}${this.i18n.getMessage('MIN_LENGTH_ERROR', { minLength: rules.minLength })}`);
            }

            if (rules.maxLength && typeof value === 'string' && value.length > rules.maxLength) {
                errors.push(`${field}${this.i18n.getMessage('MAX_LENGTH_ERROR', { maxLength: rules.maxLength })}`);
            }

            // 숫자 범위 검증
            if (rules.min !== undefined || rules.max !== undefined) {
                const numValue = parseInt(value);
                if (isNaN(numValue)) {
                    errors.push(`${field}${this.i18n.getMessage('NUMERIC_ERROR')}`);
                } else {
                    if (rules.min !== undefined && numValue < rules.min) {
                        errors.push(`${field}${this.i18n.getMessage('INVALID_RANGE')}`);
                    }
                    if (rules.max !== undefined && numValue > rules.max) {
                        errors.push(`${field}${this.i18n.getMessage('INVALID_RANGE')}`);
                    }
                }
            }

            // 열거형 검증
            if (rules.enum && !rules.enum.includes(value)) {
                errors.push(`${field}${this.i18n.getMessage('ENUM_ERROR', { values: rules.enum.join(', ') })}`);
            }
        }

        if (errors.length > 0) {
            throw new ValidationError(`${this.i18n.getMessage('VALIDATION_ERROR')}: ${errors.join(', ')}`, 'validation', params);
        }

        return true;
    }
}

// ===== 동시성 제어가 포함된 HTTP 클라이언트 =====
class HttpClient {
    constructor(configManager, logger) {
        this.configManager = configManager;
        this.logger = logger;
        this.timeout = this.configManager.get('apiTimeout');
        this.retryAttempts = this.configManager.get('retryAttempts');
        this.retryDelay = this.configManager.get('retryDelay');
        this.maxConcurrent = this.configManager.get('maxConcurrent');
        this.userAgent = 'HealingK-TourAPI/4.3.0-Enterprise';
        
        // 동시성 제어를 위한 세마포어
        this.semaphore = new Semaphore(this.maxConcurrent);
        
        this.setupConfigSubscription();
    }

    setupConfigSubscription() {
        this.configManager.subscribe((key, newValue) => {
            if (key === 'apiTimeout') this.timeout = newValue;
            if (key === 'retryAttempts') this.retryAttempts = newValue;
            if (key === 'retryDelay') this.retryDelay = newValue;
            if (key === 'maxConcurrent') {
                this.semaphore = new Semaphore(newValue);
                this.maxConcurrent = newValue;
            }
        });
    }

    async request(url, options = {}) {
        // 동시성 제어 적용
        return this.semaphore.execute(async () => {
            return this._performRequest(url, options);
        });
    }

    async _performRequest(url, options = {}) {
        const startTime = Date.now();
        
        for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.timeout);
            
            try {
                this.logger.debug('HTTP request attempt', { 
                    url, 
                    attempt, 
                    maxAttempts: this.retryAttempts 
                });

                const response = await fetch(url, {
                    ...options,
                    signal: controller.signal,
                    headers: {
                        'User-Agent': this.userAgent,
                        'Accept': 'application/json,application/xml',
                        'Accept-Encoding': this.configManager.get('enableCompression') ? 'gzip, deflate' : 'identity',
                        ...options.headers
                    }
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    throw new TourApiError(
                        'HTTP_ERROR',
                        'request',
                        response.status,
                        { url, status: response.status, statusText: response.statusText },
                        { status: response.status, statusText: response.statusText }
                    );
                }

                const responseTime = Date.now() - startTime;
                this.logger.metric('http_request_duration', responseTime, { 
                    url: new URL(url).pathname,
                    status: response.status,
                    attempt
                });

                return response;
                
            } catch (error) {
                clearTimeout(timeoutId);
                
                if (error.name === 'AbortError') {
                    error = new ApiTimeoutError('request', this.timeout);
                }

                this.logger.warn('HTTP request failed', { 
                    url, 
                    attempt, 
                    error: error.message,
                    willRetry: attempt < this.retryAttempts
                });

                if (attempt === this.retryAttempts) {
                    throw error;
                }

                const delay = this.retryDelay * Math.pow(2, attempt - 1);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    async get(url, params = {}) {
        const urlObj = new URL(url);
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                urlObj.searchParams.append(key, value);
            }
        });

        return this.request(urlObj.toString());
    }

    // 개선된 배치 요청 처리
    async batchRequest(requests) {
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
                        error: error instanceof TourApiError ? error.toJSON() : error.message, 
                        request: req 
                    }))
            );
            
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
            
            // API 요청 제한 준수를 위한 지연
            if (i + batchSize < requests.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        return results;
    }
}

// ===== 의존성 주입 기반 초기화 =====

// 순차적 초기화
const i18n = new InternationalizationManager();
const constants = new ConstantsManager();
const configManager = new ConfigManager();

// 설정 검증
try {
    configManager.validateConfig();
} catch (error) {
    console.error('Configuration validation failed:', error.message);
    process.exit(1);
}

// 의존성을 주입하여 다른 컴포넌트들 초기화
const logger = new Logger(configManager);
const rateLimiter = new RateLimiter(configManager, logger);
const cache = new AdvancedCache(configManager, logger);
const validator = new InputValidator(i18n);
const httpClient = new HttpClient(configManager, logger);

// 최종 설정 적용
i18n.setLanguage(configManager.get('defaultLanguage'));

// ===== 보안 및 인증 시스템 =====
class SecurityManager {
    constructor(configManager, logger) {
        this.configManager = configManager;
        this.logger = logger;
        this.allowedOrigins = this.configManager.get('allowedOrigins');
        this.allowedApiKeys = this.configManager.get('allowedApiKeys');
        this.securityHeaders = {
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'X-XSS-Protection': '1; mode=block',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
            'Content-Security-Policy': "default-src 'self'",
            'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
        };
    }

    validateRequest(req, res) {
        const clientId = this.getClientId(req);
        
        if (!rateLimiter.isAllowed(clientId)) {
            const remaining = rateLimiter.getRemainingQuota(clientId);
            throw new RateLimitError(this.configManager.get('rateLimitPerMinute'), remaining);
        }

        this.handleCors(req, res);
        this.validateApiKey(req);
        this.setSecurityHeaders(res);
        
        const remaining = rateLimiter.getRemainingQuota(clientId);
        res.setHeader('X-RateLimit-Limit', this.configManager.get('rateLimitPerMinute'));
        res.setHeader('X-RateLimit-Remaining', remaining);
        res.setHeader('X-RateLimit-Reset', new Date(Date.now() + 60000).toISOString());

        return { clientId, remaining };
    }

    getClientId(req) {
        const forwarded = req.headers['x-forwarded-for'];
        const ip = forwarded ? forwarded.split(',')[0] : req.connection?.remoteAddress || 'unknown';
        const apiKey = req.headers['x-api-key'];
        
        return apiKey ? `api:${apiKey}` : `ip:${ip}`;
    }

    handleCors(req, res) {
        const origin = req.headers.origin;
        const isDevelopment = this.configManager.get('environment') === 'development';
        
        if (this.allowedOrigins.includes('*')) {
            res.setHeader('Access-Control-Allow-Origin', '*');
        } else if (origin && this.allowedOrigins.includes(origin)) {
            res.setHeader('Access-Control-Allow-Origin', origin);
        } else if (origin && isDevelopment) {
            this.logger.warn('Development mode: allowing unauthorized origin', { origin });
            res.setHeader('Access-Control-Allow-Origin', origin);
        } else if (origin) {
            this.logger.error('Unauthorized origin blocked', { origin });
            throw new TourApiError('CORS_ERROR', 'security', 403, { origin });
        }

        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 
            'Content-Type, Authorization, X-API-Key, X-Request-ID, X-Client-Version, Accept-Language');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Max-Age', '3600');
    }

    validateApiKey(req) {
        if (this.allowedApiKeys.length === 0) return;

        const apiKey = req.headers['x-api-key'];
        if (!apiKey || !this.allowedApiKeys.includes(apiKey)) {
            throw new TourApiError('INVALID_API_KEY', 'security', 401);
        }
    }

    setSecurityHeaders(res) {
        Object.entries(this.securityHeaders).forEach(([header, value]) => {
            res.setHeader(header, value);
        });
    }
}

// ===== 응답 포매터 =====
class ResponseFormatter {
    static formatSuccess(operation, data, metadata = {}, performance = {}) {
        return {
            success: true,
            operation,
            data,
            metadata: {
                ...metadata,
                version: '4.3.0-Enterprise',
                timestamp: new Date().toISOString(),
                performance
            }
        };
    }

    static formatError(error, operation = null) {
        const isProduction = configManager.get('environment') === 'production';
        
        const response = {
            success: false,
            error: {
                message: error.message,
                code: error.code || 'INTERNAL_ERROR',
                operation: operation || error.operation,
                timestamp: new Date().toISOString()
            }
        };

        if (!isProduction) {
            response.error.details = error.details || {};
            response.error.stack = error.stack;
        }

        return response;
    }

    static addCacheInfo(response, fromCache = false, cacheStats = null) {
        response.metadata = response.metadata || {};
        response.metadata.cache = {
            fromCache,
            stats: cacheStats
        };
        return response;
    }
}

// ===== API 응답 처리기 =====
class ApiResponseProcessor {
    static validateApiResponse(data, operation) {
        if (!data) {
            throw new TourApiError('EMPTY_RESPONSE', operation);
        }
        
        const resultCode = data.resultCode || data.response?.header?.resultCode;
        const validCodes = ['0', '0000', '00'];
        
        if (!validCodes.includes(resultCode)) {
            const errorMessage = data.response?.header?.resultMsg || 
                               data.resultMsg || '알 수 없는 오류';
            throw new TourApiError(
                'API_ERROR', 
                operation, 
                500,
                { resultCode, originalMessage: errorMessage }
            );
        }
        
        return true;
    }

    static extractItems(data) {
        const items = data.response?.body?.items?.item || 
                     data.items?.item || 
                     data.response?.body?.item ||
                     [];
        return Array.isArray(items) ? items : items ? [items] : [];
    }

    static processBasicItem(item) {
        const mapx = item.mapx && item.mapx !== '' && item.mapx !== '0' ? 
                    parseFloat(item.mapx) : null;
        const mapy = item.mapy && item.mapy !== '' && item.mapy !== '0' ? 
                    parseFloat(item.mapy) : null;

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
            mlevel: item.mlevel ? parseInt(item.mlevel) : null,
            areacode: item.areacode || null,
            sigungucode: item.sigungucode || null,
            cat1: item.cat1 || null,
            cat2: item.cat2 || null,
            cat3: item.cat3 || null,
            createdtime: item.createdtime || null,
            modifiedtime: item.modifiedtime || null,
            lDongRegnCd: item.lDongRegnCd || null,
            lDongSignguCd: item.lDongSignguCd || null,
            lclsSystm1: item.lclsSystm1 || null,
            lclsSystm2: item.lclsSystm2 || null,
            lclsSystm3: item.lclsSystm3 || null,
            meta: {
                typeName: constants.getContentTypeName(item.contenttypeid, currentLang),
                typeIcon: contentType?.icon || '📍',
                areaName: constants.getAreaName(item.areacode, currentLang),
                areaEmoji: areaInfo?.emoji || '📍',
                hasImage: !!(item.firstimage || item.firstimage2),
                hasLocation: !!(mapx && mapy),
                lastUpdated: item.modifiedtime ? 
                    this.formatDate(item.modifiedtime) : null
            }
        };
    }

    static sanitizeHtml(text) {
        if (!text) return null;
        return text.replace(/<[^>]*>/g, '').trim();
    }

    static formatDate(dateString) {
        if (!dateString || dateString.length !== 14) return null;
        
        try {
            const year = dateString.substring(0, 4);
            const month = dateString.substring(4, 6);
            const day = dateString.substring(6, 8);
            const hour = dateString.substring(8, 10);
            const minute = dateString.substring(10, 12);
            const second = dateString.substring(12, 14);
            
            return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`).toISOString();
        } catch {
            return null;
        }
    }
}

// ===== 지리 유틸리티 =====
class GeoUtils {
    static calculateDistance(lat1, lon1, lat2, lon2) {
        try {
            const R = 6371;
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            
            const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
            
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            return R * c;
        } catch {
            return null;
        }
    }

    static addDistanceInfo(items, userLat, userLng, radius = null) {
        if (!userLat || !userLng) return items;

        const userLatNum = parseFloat(userLat);
        const userLngNum = parseFloat(userLng);
        
        if (isNaN(userLatNum) || isNaN(userLngNum)) return items;

        const itemsWithDistance = items.map(item => {
            if (item.mapx && item.mapy) {
                const distance = this.calculateDistance(userLatNum, userLngNum, item.mapy, item.mapx);
                return { 
                    ...item, 
                    distance: distance ? Math.round(distance * 100) / 100 : null,
                    meta: {
                        ...item.meta,
                        distanceText: distance ? this.formatDistance(distance) : null
                    }
                };
            }
            return { ...item, distance: null };
        });

        let filteredItems = itemsWithDistance;
        if (radius && !isNaN(parseFloat(radius))) {
            const radiusKm = parseFloat(radius);
            filteredItems = itemsWithDistance.filter(item => 
                item.distance === null || item.distance <= radiusKm
            );
        }

        return filteredItems.sort((a, b) => {
            const distA = a.distance !== null ? a.distance : 999999;
            const distB = b.distance !== null ? b.distance : 999999;
            return distA - distB;
        });
    }

    static formatDistance(distance) {
        if (distance < 1) {
            return `${Math.round(distance * 1000)}m`;
        } else if (distance < 10) {
            return `${Math.round(distance * 10) / 10}km`;
        } else {
            return `${Math.round(distance)}km`;
        }
    }
}

// ===== API 핸들러 클래스 =====
class TourApiHandlers {
    static async handleAreaBasedList(apiKey, params) {
        const startTime = Date.now();
        
        validator.validate('areaBasedList', params);
        
        const {
            numOfRows = '10', pageNo = '1', arrange = 'C',
            contentTypeId = '', areaCode = '', sigunguCode = '',
            cat1 = '', cat2 = '', cat3 = '', modifiedtime = '',
            lDongRegnCd = '', lDongSignguCd = '',
            lclsSystm1 = '', lclsSystm2 = '', lclsSystm3 = '',
            userLat = '', userLng = '', radius = ''
        } = params;

        const cacheableParams = {
            numOfRows, pageNo, arrange, contentTypeId, areaCode, sigunguCode,
            cat1, cat2, cat3, modifiedtime, lDongRegnCd, lDongSignguCd,
            lclsSystm1, lclsSystm2, lclsSystm3
        };
        
        const cacheKey = cache.generateKey('areaBasedList', cacheableParams);
        
        if (!userLat && !userLng) {
            const cachedData = cache.get(cacheKey);
            if (cachedData) {
                logger.metric('cache_hit', 1, { operation: 'areaBasedList' });
                return ResponseFormatter.addCacheInfo(cachedData, true, cache.getStats());
            }
        }

        const baseUrl = 'https://apis.data.go.kr/B551011/KorService2/areaBasedList2';
        const queryParams = {
            serviceKey: apiKey,
            MobileOS: 'ETC',
            MobileApp: 'HealingK-Enterprise',
            _type: 'json',
            numOfRows,
            pageNo,
            arrange
        };

        const optionalParams = {
            contentTypeId, areaCode, sigunguCode, cat1, cat2, cat3, modifiedtime,
            lDongRegnCd, lDongSignguCd, lclsSystm1, lclsSystm2, lclsSystm3
        };

        Object.entries(optionalParams).forEach(([key, value]) => {
            if (value) queryParams[key] = value;
        });

        const response = await httpClient.get(baseUrl, queryParams);
        const data = await response.json();
        
        ApiResponseProcessor.validateApiResponse(data, 'areaBasedList');

        const items = ApiResponseProcessor.extractItems(data);
        let processedItems = items.map(item => ApiResponseProcessor.processBasicItem(item));

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
            searchCriteria: Object.keys(optionalParams).filter(key => optionalParams[key]).length
        }, {
            apiResponseTime: apiTime,
            totalProcessingTime: Date.now() - startTime
        });

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

    static async handleDetailCommon(apiKey, params) {
        const startTime = Date.now();
        
        validator.validate('detailCommon', params);
        
        const { contentId } = params;
        const cacheKey = cache.generateKey('detailCommon', { contentId });
        
        const cachedData = cache.get(cacheKey);
        if (cachedData) {
            logger.metric('cache_hit', 1, { operation: 'detailCommon' });
            return ResponseFormatter.addCacheInfo(cachedData, true, cache.getStats());
        }

        const baseUrl = 'https://apis.data.go.kr/B551011/KorService2/detailCommon2';
        const queryParams = {
            serviceKey: apiKey,
            MobileOS: 'ETC',
            MobileApp: 'HealingK-Enterprise',
            _type: 'json',
            contentId
        };

        const response = await httpClient.get(baseUrl, queryParams);
        const data = await response.json();
        
        ApiResponseProcessor.validateApiResponse(data, 'detailCommon');

        const items = ApiResponseProcessor.extractItems(data);
        if (items.length === 0) {
            throw new TourApiError('NOT_FOUND', 'detailCommon', 404);
        }

        const item = items[0];
        const processedItem = {
            ...ApiResponseProcessor.processBasicItem(item),
            telname: item.telname || null,
            homepage: ApiResponseProcessor.sanitizeHtml(item.homepage) || null,
            overview: ApiResponseProcessor.sanitizeHtml(item.overview) || null,
            meta: {
                ...ApiResponseProcessor.processBasicItem(item).meta,
                hasOverview: !!item.overview,
                hasHomepage: !!item.homepage,
                hasTel: !!item.tel,
                completeness: this.calculateCompleteness(item)
            }
        };

        const apiTime = Date.now() - startTime;

        const result = ResponseFormatter.formatSuccess('detailCommon', processedItem, {
            operation: 'detailCommon',
            contentId,
            dataSource: 'TourAPI 4.3'
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

    static calculateCompleteness(item) {
        const fields = [
            'title', 'addr1', 'tel', 'firstimage', 'mapx', 'mapy', 
            'overview', 'homepage', 'cat1', 'cat2', 'cat3'
        ];
        
        const filledFields = fields.filter(field => 
            item[field] && item[field] !== '' && item[field] !== '0'
        ).length;
        
        return Math.round((filledFields / fields.length) * 100);
    }

    // 개선된 배치 처리 (에러 정보 포함)
    static async handleBatchDetail(apiKey, contentIds) {
        validator.validate('batchDetail', { contentIds });
        
        if (!Array.isArray(contentIds) || contentIds.length === 0) {
            throw new ValidationError(i18n.getMessage('BATCH_CONTENT_IDS_REQUIRED'), 'contentIds', contentIds);
        }
        
        const batchSize = configManager.get('maxBatchSize');
        const results = [];
        
        for (let i = 0; i < contentIds.length; i += batchSize) {
            const batch = contentIds.slice(i, i + batchSize);
            const promises = batch.map(contentId => 
                this.handleDetailCommon(apiKey, { contentId })
                    .catch(error => ({ 
                        error: error instanceof TourApiError ? error.toJSON() : {
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
            
            if (i + batchSize < contentIds.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        const successCount = results.filter(r => r.success !== false).length;
        const errorCount = results.length - successCount;
        
        return ResponseFormatter.formatSuccess('batchDetail', {
            results,
            summary: {
                total: contentIds.length,
                success: successCount,
                error: errorCount,
                successRate: Math.round((successCount / contentIds.length) * 100)
            }
        }, {
            operation: 'batchDetail',
            batchSize: batchSize,
            totalBatches: Math.ceil(contentIds.length / batchSize)
        });
    }
}

// ===== 보안 매니저 초기화 및 메인 핸들러 =====
const securityManager = new SecurityManager(configManager, logger);

async function tourApiHandler(req, res) {
    const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    const startTime = Date.now();
    
    // 언어 설정 (개선된 Accept-Language 파싱)
    const acceptLanguage = req.headers['accept-language'];
    if (acceptLanguage) {
        i18n.setLanguageFromHeader(acceptLanguage);
    }
    
    logger.info('API request received', {
        requestId,
        method: req.method,
        url: req.url,
        userAgent: req.headers['user-agent'],
        origin: req.headers.origin,
        language: i18n.currentLanguage,
        acceptLanguage
    });

    try {
        if (req.method === 'OPTIONS') {
            securityManager.handleCors(req, res);
            res.status(200).end();
            return;
        }

        const securityInfo = securityManager.validateRequest(req, res);
        
        const { operation = 'areaBasedList', ...params } = 
            req.method === 'GET' ? req.query : req.body;
        
        const apiKey = configManager.get('tourApiKey');
        if (!apiKey) {
            throw new TourApiError('MISSING_API_KEY', 'configuration', 500);
        }

        if (!constants.isValidOperation(operation)) {
            throw new ValidationError(
                i18n.getMessage('UNSUPPORTED_OPERATION', { operation }),
                'operation',
                operation
            );
        }

        logger.info('Processing API operation', {
            requestId,
            operation,
            paramCount: Object.keys(params).length,
            clientId: securityInfo.clientId
        });

        let result;
        switch (operation) {
            case 'areaBasedList':
                result = await TourApiHandlers.handleAreaBasedList(apiKey, params);
                break;
            case 'detailCommon':
                result = await TourApiHandlers.handleDetailCommon(apiKey, params);
                break;
            case 'batchDetail':
                result = await TourApiHandlers.handleBatchDetail(apiKey, params.contentIds);
                break;
            default:
                throw new ValidationError(`미구현 오퍼레이션: ${operation}`, 'operation', operation);
        }

        const totalTime = Date.now() - startTime;
        
        result.metadata.performance = {
            ...result.metadata.performance,
            totalRequestTime: totalTime,
            timestamp: new Date().toISOString(),
            requestId
        };

        result.metadata.system = {
            version: '4.3.0-Enterprise',
            environment: configManager.get('environment'),
            nodeVersion: process.version,
            uptime: Date.now() - SERVICE_START_TIME,
            cacheStats: cache.getStats(),
            concurrentRequests: httpClient.semaphore.currentConcurrent
        };

        logger.info('API request completed successfully', {
            requestId,
            operation,
            totalTime,
            fromCache: result.metadata.cache?.fromCache || false
        });

        logger.metric('request_success', 1, {
            operation,
            statusCode: 200,
            responseTime: totalTime
        });

        res.status(200).json(result);

    } catch (error) {
        const totalTime = Date.now() - startTime;
        
        logger.error('API request failed', {
            requestId,
            error: error.message,
            code: error.code,
            operation: error.operation,
            totalTime
        });

        logger.metric('request_error', 1, {
            operation: error.operation || 'unknown',
            errorCode: error.code || 'UNKNOWN',
            statusCode: error.statusCode || 500
        });

        const errorResponse = ResponseFormatter.formatError(error, error.operation);
        errorResponse.metadata = {
            requestId,
            totalTime,
            timestamp: new Date().toISOString()
        };

        res.status(error.statusCode || 500).json(errorResponse);
    }
}

// ===== 헬스체크 시스템 =====
function healthCheck() {
    const memoryUsage = process.memoryUsage();
    const preciseUptime = Date.now() - SERVICE_START_TIME;
    
    return {
        status: 'healthy',
        version: '4.3.0-Enterprise',
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
        cache: cache.getStats(),
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
            rateLimitPerMinute: configManager.get('rateLimitPerMinute'),
            maxCacheSize: configManager.get('maxCacheSize'),
            maxConcurrent: configManager.get('maxConcurrent'),
            supportedLanguages: i18n.getSupportedLanguages()
        },
        timestamp: new Date().toISOString()
    };
}

// ===== 테스트 지원 함수들 =====
function runTests() {
    console.log('🧪 Running comprehensive tests...');
    
    try {
        // 설정 테스트
        assert(configManager.get('environment') !== undefined, 'Environment should be defined');
        assert(constants.isValidOperation('areaBasedList'), 'areaBasedList should be valid operation');
        
        // 캐시 테스트
        cache.set('test-key', { test: 'data' });
        assert(cache.get('test-key') !== null, 'Cache should store and retrieve data');
        
        // 다국어 테스트
        i18n.setLanguage('en');
        assert(i18n.getMessage('NOT_FOUND') === 'Data not found', 'English message should work');
        i18n.setLanguage('ko');
        assert(i18n.getMessage('NOT_FOUND') === '데이터를 찾을 수 없습니다', 'Korean message should work');
        
        // Accept-Language 파싱 테스트
        const parsed = LanguageNegotiator.parseAcceptLanguage('en-US,en;q=0.9,ko;q=0.8');
        assert(parsed.length === 3, 'Should parse 3 language preferences');
        assert(parsed[0].language === 'en-US', 'First preference should be en-US');
        
        // 동시성 제어 테스트
        const semaphore = new Semaphore(2);
        assert(semaphore.maxConcurrent === 2, 'Semaphore should have correct limit');
        
        // 검증 테스트
        try {
            validator.validate('detailCommon', {});
            assert(false, 'Should throw validation error');
        } catch (error) {
            assert(error instanceof ValidationError, 'Should throw ValidationError');
        }
        
        // 배치 검증 테스트
        try {
            validator.validate('batchDetail', { contentIds: 'not-array' });
            assert(false, 'Should throw validation error for non-array');
        } catch (error) {
            assert(error instanceof ValidationError, 'Should throw ValidationError for non-array');
        }
        
        console.log('✅ All comprehensive tests passed!');
        return true;
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        return false;
    }
}

// 간단한 assert 함수
function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

// ===== 모듈 내보내기 =====
module.exports = {
    handler: tourApiHandler,
    healthCheck,
    runTests,
    configManager,
    logger,
    cache,
    i18n,
    constants,
    
    // 테스트용 클래스들
    TourApiHandlers,
    SecurityManager,
    InputValidator,
    ResponseFormatter,
    
    // 유틸리티들
    GeoUtils,
    ApiResponseProcessor,
    LanguageNegotiator,
    Semaphore
};

// Express.js 미들웨어 지원
module.exports.middleware = function(req, res, next) {
    tourApiHandler(req, res).catch(next);
};

// Serverless 함수 지원
module.exports.serverless = async function(event, context) {
    const req = {
        method: event.httpMethod || 'GET',
        headers: event.headers || {},
        query: event.queryStringParameters || {},
        body: event.body ? JSON.parse(event.body) : {}
    };
    
    const res = {
        statusCode: 200,
        headers: {},
        status: function(code) { this.statusCode = code; return this; },
        json: function(data) { this.body = JSON.stringify(data); return this; },
        setHeader: function(name, value) { this.headers[name] = value; },
        end: function() { return this; }
    };
    
    await tourApiHandler(req, res);
    
    return {
        statusCode: res.statusCode,
        headers: res.headers,
        body: res.body || ''
    };
};

// 초기화 로그
logger.info('TourAPI 4.3 Enterprise system initialized', {
    version: '4.3.0-Enterprise',
    environment: configManager.get('environment'),
    features: {
        caching: true,
        rateLimiting: true,
        metrics: configManager.get('enableMetrics'),
        batching: configManager.get('enableBatching'),
        concurrencyControl: true,
        i18n: true,
        acceptLanguageParsing: true,
        dependencyInjection: true
    },
    concurrentLimit: configManager.get('maxConcurrent'),
    supportedLanguages: i18n.getSupportedLanguages()
});
