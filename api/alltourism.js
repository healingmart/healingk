// ===== TourAPI 4.3 Enterprise - 최종 완성 버전 =====
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
            
            if (supportedLanguages.has(lang)) {
                return lang;
            }
            
            const primaryLang = lang.split('-')[0];
            if (supportedLanguages.has(primaryLang)) {
                return primaryLang;
            }
        }
        
        return null;
    }
}

// ===== 다국어 지원 시스템 =====
class InternationalizationManager {
    constructor() {
        this.defaultLanguage = 'ko';
        this.currentLanguage = 'ko';
        this.messages = new Map();
        this.supportedLanguages = new Set(['ko', 'en']);
        this.setupMessages();
    }

    setupMessages() {
        this.messages.set('ko', {
            VALIDATION_ERROR: '입력값 검증 실패',
            API_TIMEOUT: 'API 요청 시간 초과: {timeout}ms',
            RATE_LIMIT_EXCEEDED: '요청 한도를 초과했습니다',
            CORS_ERROR: '허용되지 않은 Origin입니다',
            INVALID_API_KEY: '유효하지 않은 API 키입니다',
            MISSING_API_KEY: 'TOURISM_API_KEY 또는 KTO_API_KEY 환경변수가 설정되지 않았습니다',
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
            BATCH_CONTENT_IDS_REQUIRED: '배치 작업에는 contentIds 배열이 필요합니다',
            CONFIG_VALIDATION_FAILED: '설정 검증 실패',
            API_ERROR: 'API 호출 오류'
        });

        this.messages.set('en', {
            VALIDATION_ERROR: 'Validation failed',
            API_TIMEOUT: 'API request timeout: {timeout}ms',
            RATE_LIMIT_EXCEEDED: 'Rate limit exceeded',
            CORS_ERROR: 'Origin not allowed',
            INVALID_API_KEY: 'Invalid API key',
            MISSING_API_KEY: 'TOURISM_API_KEY or KTO_API_KEY environment variable not configured',
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
            BATCH_CONTENT_IDS_REQUIRED: 'Batch operation requires contentIds array',
            CONFIG_VALIDATION_FAILED: 'Configuration validation failed',
            API_ERROR: 'API call error'
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

        // ✅ 올바른 API 엔드포인트 (KorService2 사용)
        this.API_BASE_URL = 'https://apis.data.go.kr/B551011/KorService2';
        
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
            // ✅ TOURISM_API_KEY와 KTO_API_KEY만 사용
            apiKey: null,
            appName: 'HealingK-TourAPI',
            version: '4.3.0-Enterprise',
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
            maxMemorySize: 50 * 1024 * 1024,
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
            defaultLanguage: 'ko',
            memoryCheckInterval: 30000,
            memoryThreshold: 0.9
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

    getApiUrl(endpoint) {
        return `${this.API_BASE_URL}/${this.API_ENDPOINTS[endpoint]}`;
    }
}

// ===== 설정 관리 시스템 =====
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

    parseIntWithDefault(value, defaultValue) {
        const parsed = parseInt(value);
        return isNaN(parsed) ? defaultValue : parsed;
    }

    parseFloatWithDefault(value, defaultValue) {
        const parsed = parseFloat(value);
        return isNaN(parsed) ? defaultValue : parsed;
    }

    loadConfig() {
        const constants = new ConstantsManager();
        const defaultConfig = { ...constants.DEFAULT_CONFIG };
        
        // ✅ TOURISM_API_KEY와 KTO_API_KEY만 확인
        const apiKey = process.env.TOURISM_API_KEY || 
                      process.env.KTO_API_KEY || 
                      defaultConfig.apiKey;
        
        return {
            ...defaultConfig,
            apiKey: apiKey,
            allowedOrigins: this.parseArray(process.env.ALLOWED_ORIGINS) || defaultConfig.allowedOrigins,
            allowedApiKeys: this.parseArray(process.env.ALLOWED_API_KEYS) || defaultConfig.allowedApiKeys,
            rateLimitPerMinute: this.parseIntWithDefault(process.env.RATE_LIMIT, defaultConfig.rateLimitPerMinute),
            maxCacheSize: this.parseIntWithDefault(process.env.MAX_CACHE_SIZE, defaultConfig.maxCacheSize),
            maxMemorySize: this.parseIntWithDefault(process.env.MAX_MEMORY_SIZE, defaultConfig.maxMemorySize),
            cacheTtl: this.parseIntWithDefault(process.env.CACHE_TTL, defaultConfig.cacheTtl),
            apiTimeout: this.parseIntWithDefault(process.env.API_TIMEOUT, defaultConfig.apiTimeout),
            retryAttempts: this.parseIntWithDefault(process.env.RETRY_ATTEMPTS, defaultConfig.retryAttempts),
            retryDelay: this.parseIntWithDefault(process.env.RETRY_DELAY, defaultConfig.retryDelay),
            maxConcurrent: this.parseIntWithDefault(process.env.MAX_CONCURRENT, defaultConfig.maxConcurrent),
            enableMetrics: process.env.ENABLE_METRICS === 'true',
            enableCompression: process.env.ENABLE_COMPRESSION !== 'false',
            enableBatching: process.env.ENABLE_BATCHING === 'true',
            maxBatchSize: this.parseIntWithDefault(process.env.MAX_BATCH_SIZE, defaultConfig.maxBatchSize),
            environment: process.env.NODE_ENV || defaultConfig.environment,
            logLevel: process.env.LOG_LEVEL || defaultConfig.logLevel,
            defaultLanguage: process.env.DEFAULT_LANGUAGE || defaultConfig.defaultLanguage,
            memoryCheckInterval: this.parseIntWithDefault(process.env.MEMORY_CHECK_INTERVAL, defaultConfig.memoryCheckInterval),
            memoryThreshold: this.parseFloatWithDefault(process.env.MEMORY_THRESHOLD, defaultConfig.memoryThreshold)
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
        
        if (!this.config.apiKey) {
            errors.push('TOURISM_API_KEY 또는 KTO_API_KEY 환경변수가 설정되지 않았습니다');
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

    hasValidApiKey() {
        return !!this.config.apiKey;
    }
}

// ===== 로깅 시스템 =====
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

// ===== 캐시 시스템 =====
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
        this.maxMemorySize = this.configManager.get('maxMemorySize');
        
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
            } else if (key === 'maxMemorySize') {
                this.maxMemorySize = newValue;
                this.logger.info('Cache max memory updated', { old: oldValue, new: newValue });
            }
        });
    }

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

    estimateSize(data) {
        try {
            if (typeof data === 'string') {
                return data.length * 2;
            }
            
            if (typeof data === 'object' && data !== null) {
                const str = JSON.stringify(data);
                return str.length * 2 + 50;
            }
            
            return 50;
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

// ===== 레이트 리미터 =====
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

// ===== 커스텀 에러 클래스 =====
class TourApiError extends Error {
    constructor(messageCode, operation, statusCode = 500, details = {}, params = {}, i18nInstance = null) {
        const message = i18nInstance ? 
            i18nInstance.getMessage(messageCode, params) : 
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
    constructor(message, field, value, i18nInstance = null) {
        super('VALIDATION_ERROR', 'validation', 400, { field, value }, {}, i18nInstance);
        this.name = 'ValidationError';
        this.message = message;
    }
}

class ApiTimeoutError extends TourApiError {
    constructor(operation, timeout, i18nInstance = null) {
        super('API_TIMEOUT', operation, 408, { timeout }, { timeout }, i18nInstance);
        this.name = 'ApiTimeoutError';
    }
}

class RateLimitError extends TourApiError {
    constructor(limit, remaining, i18nInstance = null) {
        super('RATE_LIMIT_EXCEEDED', 'rateLimit', 429, { limit, remaining }, {}, i18nInstance);
        this.name = 'RateLimitError';
    }
}

// ===== 입력 검증 시스템 =====
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
                operation,
                this.i18n
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

            if (rules.isArray && !Array.isArray(value)) {
                errors.push(`${field} must be an array`);
                continue;
            }

            if (!rules.isArray && rules.type && typeof value !== rules.type) {
                errors.push(`${field}${this.i18n.getMessage('TYPE_MISMATCH', { type: rules.type })}`);
                continue;
            }

            if (rules.pattern && typeof value === 'string' && !rules.pattern.test(value)) {
                errors.push(`${field}${this.i18n.getMessage('INVALID_FORMAT')}`);
                continue;
            }

            if (rules.minLength && typeof value === 'string' && value.length < rules.minLength) {
                errors.push(`${field}${this.i18n.getMessage('MIN_LENGTH_ERROR', { minLength: rules.minLength })}`);
            }

            if (rules.maxLength && typeof value === 'string' && value.length > rules.maxLength) {
                errors.push(`${field}${this.i18n.getMessage('MAX_LENGTH_ERROR', { maxLength: rules.maxLength })}`);
            }

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

            if (rules.enum && !rules.enum.includes(value)) {
                errors.push(`${field}${this.i18n.getMessage('ENUM_ERROR', { values: rules.enum.join(', ') })}`);
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
}

// ===== HTTP 클라이언트 =====
class HttpClient {
    constructor(configManager, logger) {
        this.configManager = configManager;
        this.logger = logger;
        this.timeout = this.configManager.get('apiTimeout');
        this.retryAttempts = this.configManager.get('retryAttempts');
        this.retryDelay = this.configManager.get('retryDelay');
        this.maxConcurrent = this.configManager.get('maxConcurrent');
        
        this.userAgent = `${this.configManager.get('appName')}/v${this.configManager.get('version')}`;
        
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
            if (key === 'appName' || key === 'version') {
                this.userAgent = `${this.configManager.get('appName')}/v${this.configManager.get('version')}`;
            }
        });
    }

    async request(url, options = {}) {
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
                        'Accept': 'application/json',
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

    // ✅ 올바른 한국관광공사 API 호출 메소드
    async getTourismData(endpoint, params = {}) {
        const constants = new ConstantsManager();
        const apiKey = this.configManager.get('apiKey');
        
        if (!apiKey) {
            throw new TourApiError('MISSING_API_KEY', endpoint);
        }

        const url = constants.getApiUrl(endpoint);
        
        // ✅ 필수 파라미터 설정
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
            url: fullUrl,
            params: Object.fromEntries(queryParams)
        });

        const response = await this.request(fullUrl);
        const data = await response.json();

        // ✅ API 응답 코드 검증
        const resultCode = data.response?.header?.resultCode;
        if (resultCode !== '0000' && resultCode !== '00') {
            const errorMessage = data.response?.header?.resultMsg || 'Unknown API error';
            throw new TourApiError(
                'API_ERROR',
                endpoint,
                500,
                { resultCode, originalMessage: errorMessage }
            );
        }

        return data;
    }

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
            
            if (i + batchSize < requests.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        return results;
    }
}

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

    validateRequest(req, res, rateLimiter, i18n) {
        const clientId = this.getClientId(req);
        
        if (!rateLimiter.isAllowed(clientId)) {
            const remaining = rateLimiter.getRemainingQuota(clientId);
            throw new RateLimitError(this.configManager.get('rateLimitPerMinute'), remaining, i18n);
        }

        this.handleCors(req, res, i18n);
        this.validateApiKey(req, i18n);
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

    handleCors(req, res, i18n) {
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
            throw new TourApiError('CORS_ERROR', 'security', 403, { origin }, {}, i18n);
        }

        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 
            'Content-Type, Authorization, X-API-Key, X-Request-ID, X-Client-Version, Accept-Language');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Max-Age', '3600');
    }

    validateApiKey(req, i18n) {
        if (this.allowedApiKeys.length === 0) return;

        const apiKey = req.headers['x-api-key'];
        
        if (!apiKey || !this.allowedApiKeys.includes(apiKey)) {
            throw new TourApiError('INVALID_API_KEY', 'security', 401, {}, {}, i18n);
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
        const isProduction = process.env.NODE_ENV === 'production';
        
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
    static extractItems(data) {
        const items = data.response?.body?.items?.item || 
                     data.items?.item || 
                     data.response?.body?.item ||
                     [];
        return Array.isArray(items) ? items : items ? [items] : [];
    }

    static processBasicItem(item, constants, i18n) {
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
    static async handleAreaBasedList(httpClient, validator, cache, constants, i18n, logger, params) {
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

        // ✅ 올바른 API 호출
        const apiParams = {
            numOfRows,
            pageNo,
            arrange
        };

        const optionalParams = {
            contentTypeId, areaCode, sigunguCode, cat1, cat2, cat3, modifiedtime,
            lDongRegnCd, lDongSignguCd, lclsSystm1, lclsSystm2, lclsSystm3
        };

        Object.entries(optionalParams).forEach(([key, value]) => {
            if (value) apiParams[key] = value;
        });

        const data = await httpClient.getTourismData('areaBasedList', apiParams);

        const items = ApiResponseProcessor.extractItems(data);
        let processedItems = items.map(item => ApiResponseProcessor.processBasicItem(item, constants, i18n));

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

    static async handleDetailCommon(httpClient, validator, cache, constants, i18n, logger, params) {
        const startTime = Date.now();
        
        validator.validate('detailCommon', params);
        
        const { contentId } = params;
        const cacheKey = cache.generateKey('detailCommon', { contentId });
        
        const cachedData = cache.get(cacheKey);
        if (cachedData) {
            logger.metric('cache_hit', 1, { operation: 'detailCommon' });
            return ResponseFormatter.addCacheInfo(cachedData, true, cache.getStats());
        }

        // ✅ 올바른 API 호출
        const data = await httpClient.getTourismData('detailCommon', { contentId });

        const items = ApiResponseProcessor.extractItems(data);
        if (items.length === 0) {
            throw new TourApiError('NOT_FOUND', 'detailCommon', 404, {}, {}, i18n);
        }

        const item = items[0];
        const processedItem = {
            ...ApiResponseProcessor.processBasicItem(item, constants, i18n),
            telname: item.telname || null,
            homepage: ApiResponseProcessor.sanitizeHtml(item.homepage) || null,
            overview: ApiResponseProcessor.sanitizeHtml(item.overview) || null,
            meta: {
                ...ApiResponseProcessor.processBasicItem(item, constants, i18n).meta,
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

    static async handleSearchKeyword(httpClient, validator, cache, constants, i18n, logger, params) {
        const startTime = Date.now();
        
        validator.validate('searchKeyword', params);
        
        const {
            keyword, areaCode = '', sigunguCode = '',
            numOfRows = '10', pageNo = '1', arrange = 'C',
            cat1 = '', cat2 = '', cat3 = '',
            lDongRegnCd = '', lDongSignguCd = '',
            lclsSystm1 = '', lclsSystm2 = '', lclsSystm3 = '',
            userLat = '', userLng = '', radius = ''
        } = params;

        const cacheableParams = {
            keyword, areaCode, sigunguCode, numOfRows, pageNo, arrange,
            cat1, cat2, cat3, lDongRegnCd, lDongSignguCd,
            lclsSystm1, lclsSystm2, lclsSystm3
        };
        
        const cacheKey = cache.generateKey('searchKeyword', cacheableParams);
        
        if (!userLat && !userLng) {
            const cachedData = cache.get(cacheKey);
            if (cachedData) {
                logger.metric('cache_hit', 1, { operation: 'searchKeyword' });
                return ResponseFormatter.addCacheInfo(cachedData, true, cache.getStats());
            }
        }

        // ✅ 올바른 API 호출
        const apiParams = {
            keyword: encodeURIComponent(keyword),
            numOfRows,
            pageNo,
            arrange
        };

        const optionalParams = {
            areaCode, sigunguCode, cat1, cat2, cat3,
            lDongRegnCd, lDongSignguCd, lclsSystm1, lclsSystm2, lclsSystm3
        };

        Object.entries(optionalParams).forEach(([key, value]) => {
            if (value) apiParams[key] = value;
        });

        const data = await httpClient.getTourismData('searchKeyword', apiParams);

        const items = ApiResponseProcessor.extractItems(data);
        let processedItems = items.map(item => ApiResponseProcessor.processBasicItem(item, constants, i18n));

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
            itemCount: processedItems.length
        }, {
            apiResponseTime: apiTime,
            totalProcessingTime: Date.now() - startTime
        });

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

    static async handleLocationBasedList(httpClient, validator, constants, i18n, logger, params) {
        const startTime = Date.now();
        
        validator.validate('locationBasedList', params);
        
        const {
            mapX, mapY, radius,
            numOfRows = '10', pageNo = '1', arrange = 'E',
            contentTypeId = '', areaCode = '', sigunguCode = '',
            cat1 = '', cat2 = '', cat3 = '', modifiedtime = '',
            lDongRegnCd = '', lDongSignguCd = '',
            lclsSystm1 = '', lclsSystm2 = '', lclsSystm3 = ''
        } = params;

        // ✅ 올바른 API 호출
        const apiParams = {
            mapX,
            mapY,
            radius,
            numOfRows,
            pageNo,
            arrange
        };

        const optionalParams = {
            contentTypeId, areaCode, sigunguCode, cat1, cat2, cat3, modifiedtime,
            lDongRegnCd, lDongSignguCd, lclsSystm1, lclsSystm2, lclsSystm3
        };

        Object.entries(optionalParams).forEach(([key, value]) => {
            if (value) apiParams[key] = value;
        });

        const data = await httpClient.getTourismData('locationBasedList', apiParams);

        const items = ApiResponseProcessor.extractItems(data);
        const processedItems = items.map(item => ({
            ...ApiResponseProcessor.processBasicItem(item, constants, i18n),
            dist: parseFloat(item.dist) || null
        }));

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
            itemCount: processedItems.length
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

    static async handleBatchDetail(httpClient, validator, configManager, constants, i18n, logger, contentIds) {
        validator.validate('batchDetail', { contentIds });
        
        if (!Array.isArray(contentIds) || contentIds.length === 0) {
            throw new ValidationError(
                i18n.getMessage('BATCH_CONTENT_IDS_REQUIRED'), 
                'contentIds', 
                contentIds,
                i18n
            );
        }
        
        const batchSize = configManager.get('maxBatchSize');
        const results = [];
        
        for (let i = 0; i < contentIds.length; i += batchSize) {
            const batch = contentIds.slice(i, i + batchSize);
            const promises = batch.map(contentId => 
                this.handleDetailCommon(httpClient, validator, null, constants, i18n, logger, { contentId })
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

// ===== 시스템 초기화 =====
const constants = new ConstantsManager();
const i18n = new InternationalizationManager();
const configManager = new ConfigManager();

// 설정 검증
try {
    configManager.validateConfig();
    console.log('✅ Configuration validated successfully', {
        apiKey: configManager.hasValidApiKey() ? 'Set' : 'Missing',
        environment: configManager.get('environment')
    });
} catch (error) {
    console.error('❌ Configuration validation failed:', error.message);
    if (configManager.get('environment') !== 'development') {
        process.exit(1);
    }
}

const logger = new Logger(configManager);
const rateLimiter = new RateLimiter(configManager, logger);
const cache = new AdvancedCache(configManager, logger);
const validator = new InputValidator(i18n);
const httpClient = new HttpClient(configManager, logger);
const securityManager = new SecurityManager(configManager, logger);

i18n.setLanguage(configManager.get('defaultLanguage'));

// ===== 메인 핸들러 =====
async function tourApiHandler(req, res) {
    const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    const startTime = Date.now();
    
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
            securityManager.handleCors(req, res, i18n);
            res.status(200).end();
            return;
        }

        const securityInfo = securityManager.validateRequest(req, res, rateLimiter, i18n);
        
        const { operation = 'areaBasedList', ...params } = 
            req.method === 'GET' ? req.query : req.body;
        
        // ✅ API 키 체크
        if (!configManager.hasValidApiKey()) {
            throw new TourApiError('MISSING_API_KEY', 'configuration', 500, {}, {}, i18n);
        }

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
            apiKeyPresent: configManager.hasValidApiKey()
        });

        let result;
        switch (operation) {
            case 'areaBasedList':
                result = await TourApiHandlers.handleAreaBasedList(httpClient, validator, cache, constants, i18n, logger, params);
                break;
            case 'detailCommon':
                result = await TourApiHandlers.handleDetailCommon(httpClient, validator, cache, constants, i18n, logger, params);
                break;
            case 'searchKeyword':
                result = await TourApiHandlers.handleSearchKeyword(httpClient, validator, cache, constants, i18n, logger, params);
                break;
            case 'locationBasedList':
                result = await TourApiHandlers.handleLocationBasedList(httpClient, validator, constants, i18n, logger, params);
                break;
            case 'batchDetail':
                result = await TourApiHandlers.handleBatchDetail(httpClient, validator, configManager, constants, i18n, logger, params.contentIds);
                break;
            default:
                throw new ValidationError(`미구현 오퍼레이션: ${operation}`, 'operation', operation, i18n);
        }

        const totalTime = Date.now() - startTime;
        
        result.metadata.performance = {
            ...result.metadata.performance,
            totalRequestTime: totalTime,
            timestamp: new Date().toISOString(),
            requestId
        };

        result.metadata.system = {
            version: configManager.get('version'),
            environment: configManager.get('environment'),
            nodeVersion: process.version,
            uptime: Date.now() - SERVICE_START_TIME,
            cacheStats: cache.getStats(),
            concurrentRequests: httpClient.semaphore.currentConcurrent,
            apiKeyConfigured: configManager.hasValidApiKey()
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
        version: configManager.get('version'),
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
            supportedLanguages: i18n.getSupportedLanguages(),
            apiKeyConfigured: configManager.hasValidApiKey()
        },
        timestamp: new Date().toISOString()
    };
}

// ===== 테스트 시스템 =====
function runTests() {
    console.log('🧪 Running comprehensive tests...');
    
    const tests = [
        {
            name: 'Configuration Test',
            test: () => {
                if (configManager.get('environment') === undefined) throw new Error('Environment should be defined');
                if (!constants.isValidOperation('areaBasedList')) throw new Error('areaBasedList should be valid operation');
            }
        },
        {
            name: 'API Key Test',
            test: () => {
                if (!configManager.hasValidApiKey()) throw new Error('API key should be configured');
            }
        },
        {
            name: 'Cache Test',
            test: () => {
                cache.set('test-key', { test: 'data' });
                if (cache.get('test-key') === null) throw new Error('Cache should store and retrieve data');
            }
        },
        {
            name: 'I18n Test',
            test: () => {
                i18n.setLanguage('en');
                if (i18n.getMessage('NOT_FOUND') !== 'Data not found') throw new Error('English message should work');
                i18n.setLanguage('ko');
                if (i18n.getMessage('NOT_FOUND') !== '데이터를 찾을 수 없습니다') throw new Error('Korean message should work');
            }
        },
        {
            name: 'Accept-Language Parsing Test',
            test: () => {
                const parsed = LanguageNegotiator.parseAcceptLanguage('en-US,en;q=0.9,ko;q=0.8');
                if (parsed.length !== 3) throw new Error('Should parse 3 language preferences');
                if (parsed[0].language !== 'en-US') throw new Error('First preference should be en-US');
            }
        },
        {
            name: 'Semaphore Test',
            test: () => {
                const semaphore = new Semaphore(2);
                if (semaphore.maxConcurrent !== 2) throw new Error('Semaphore should have correct limit');
            }
        },
        {
            name: 'Validation Test',
            test: () => {
                try {
                    validator.validate('detailCommon', {});
                    throw new Error('Should throw validation error');
                } catch (error) {
                    if (!(error instanceof ValidationError)) throw new Error('Should throw ValidationError');
                }
            }
        }
    ];

    let passed = 0;
    let failed = 0;
    const errors = [];

    for (const testCase of tests) {
        try {
            testCase.test();
            passed++;
            console.log(`✅ ${testCase.name}`);
        } catch (error) {
            failed++;
            errors.push({ test: testCase.name, error: error.message });
            console.log(`❌ ${testCase.name}: ${error.message}`);
        }
    }

    const total = passed + failed;
    const successRate = total > 0 ? Math.round((passed / total) * 100) : 0;
    
    console.log(`\n📊 Test Results: ${passed}/${total} passed (${successRate}%)`);
    
    if (errors.length > 0) {
        console.log('\n❌ Failed tests:');
        errors.forEach(({ test, error }) => {
            console.log(`  - ${test}: ${error}`);
        });
    }

    return {
        passed,
        failed,
        total,
        successRate,
        errors,
        summary: `${passed}/${total} tests passed (${successRate}%)`
    };
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
    
    // 클래스들
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

module.exports.middleware = function(req, res, next) {
    tourApiHandler(req, res).catch(next);
};

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
logger.info('🚀 TourAPI 4.3 Enterprise system initialized', {
    version: configManager.get('version'),
    environment: configManager.get('environment'),
    apiKeyConfigured: configManager.hasValidApiKey(),
    features: {
        caching: true,
        rateLimiting: true,
        metrics: configManager.get('enableMetrics'),
        batching: configManager.get('enableBatching'),
        concurrencyControl: true,
        i18n: true,
        acceptLanguageParsing: true,
        correctApiIntegration: true
    },
    concurrentLimit: configManager.get('maxConcurrent'),
    supportedLanguages: i18n.getSupportedLanguages()
});
