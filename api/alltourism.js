// ===== TourAPI 4.3 Enterprise Implementation - TOUR_API_KEY 완전 제거 버전 =====
'use strict';

// 런타임 환경 감지 및 폴리필
const isNode = typeof window === 'undefined';
if (isNode && typeof fetch === 'undefined') {
    global.fetch = require('node-fetch');
    global.AbortController = require('abort-controller');
}

// ===== 서비스 시작 시간 추적 =====
const SERVICE_START_TIME = Date.now();

// ===== 의존성 주입 컨테이너 =====
class ServiceContainer {
    constructor() {
        this.services = new Map();
        this.singletons = new Map();
        this.initialized = false;
    }

    register(name, factory, singleton = true) {
        this.services.set(name, { factory, singleton });
        return this;
    }

    get(name) {
        if (!this.services.has(name)) {
            throw new Error(`Service '${name}' not registered`);
        }

        const service = this.services.get(name);
        
        if (service.singleton) {
            if (!this.singletons.has(name)) {
                this.singletons.set(name, service.factory(this));
            }
            return this.singletons.get(name);
        }

        return service.factory(this);
    }

    initialize() {
        if (this.initialized) return this;
        
        // 의존성 순서대로 초기화
        const initOrder = ['constants', 'i18n', 'config', 'logger', 'cache', 'rateLimiter', 'validator', 'httpClient', 'security'];
        
        for (const serviceName of initOrder) {
            if (this.services.has(serviceName)) {
                this.get(serviceName);
            }
        }
        
        this.initialized = true;
        return this;
    }

    isInitialized() {
        return this.initialized;
    }
}

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
            CONFIG_VALIDATION_FAILED: '설정 검증 실패'
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
            CONFIG_VALIDATION_FAILED: 'Configuration validation failed'
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
            // ✅ 완전히 수정: tourApiKey만 사용
            tourApiKey: null,
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
            maxMemorySize: 50 * 1024 * 1024, // 50MB
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
            memoryThreshold: 0.9,
            // ✅ 개발 모드에서 샘플 데이터 사용 여부
            useSampleData: false
        };

        // ✅ 샘플 데이터 추가 (개발/테스트용)
        this.SAMPLE_DATA = {
            areaBasedList: {
                success: true,
                operation: 'areaBasedList',
                data: {
                    items: [
                        {
                            contentId: '126508',
                            contentTypeId: '12',
                            title: '경복궁',
                            addr1: '서울특별시 종로구 사직로 161',
                            firstimage: 'https://tong.visitkorea.or.kr/cms/resource/83/2678083_image2_1.JPG',
                            mapx: 126.9769,
                            mapy: 37.5788,
                            areacode: '1',
                            cat1: 'A02',
                            cat2: 'A0201',
                            cat3: 'A02010100',
                            meta: {
                                typeName: '관광지',
                                typeIcon: '🏛️',
                                areaName: '서울',
                                areaEmoji: '🏙️',
                                hasImage: true,
                                hasLocation: true,
                                completeness: 85
                            }
                        }
                    ],
                    pagination: {
                        totalCount: 1,
                        pageNo: 1,
                        numOfRows: 10,
                        totalPages: 1,
                        hasNext: false,
                        hasPrev: false
                    }
                },
                metadata: {
                    operation: 'areaBasedList',
                    itemCount: 1,
                    searchCriteria: 2,
                    version: '4.3.0-Enterprise',
                    timestamp: new Date().toISOString(),
                    performance: {
                        apiResponseTime: 0,
                        totalProcessingTime: 0
                    },
                    notice: 'TOURISM_API_KEY 또는 KTO_API_KEY 환경변수 설정 필요 - 샘플 데이터 제공'
                }
            }
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

    getSampleData(operation) {
        return this.SAMPLE_DATA[operation] || null;
    }
}

// ===== 개선된 설정 관리 시스템 =====
class ConfigManager {
    constructor(container) {
        this.container = container;
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
        const constants = this.container ? this.container.get('constants') : new ConstantsManager();
        const defaultConfig = { ...constants.DEFAULT_CONFIG };
        
        // ✅ 완전히 수정: TOURISM_API_KEY와 KTO_API_KEY만 확인
        const tourApiKey = process.env.TOURISM_API_KEY || 
                          process.env.KTO_API_KEY || 
                          defaultConfig.tourApiKey;
        
        return {
            ...defaultConfig,
            tourApiKey: tourApiKey,
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
            memoryThreshold: this.parseFloatWithDefault(process.env.MEMORY_THRESHOLD, defaultConfig.memoryThreshold),
            useSampleData: process.env.USE_SAMPLE_DATA === 'true' || defaultConfig.useSampleData
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
            logLevel: 'warn',
            useSampleData: false
        });

        this.environmentOverrides.set('development', {
            enableMetrics: false,
            logLevel: 'debug',
            useSampleData: true  // ✅ 개발 환경에서는 샘플 데이터 허용
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
        const i18n = this.container ? this.container.get('i18n') : null;
        
        // ✅ API 키 검증 수정 - 개발 환경에서는 경고만
        if (!this.config.tourApiKey) {
            const message = i18n ? 
                i18n.getMessage('MISSING_API_KEY') : 
                'TOURISM_API_KEY 또는 KTO_API_KEY 환경변수가 설정되지 않았습니다';
            
            if (this.config.environment === 'development') {
                console.warn('⚠️ 개발 환경:', message, '- 샘플 데이터로 동작합니다.');
            } else {
                errors.push(message);
            }
        }
        
        if (this.config.rateLimitPerMinute <= 0) {
            errors.push('rateLimitPerMinute은 0보다 커야 합니다');
        }
        
        if (errors.length > 0) {
            const message = i18n ? 
                i18n.getMessage('CONFIG_VALIDATION_FAILED') : 
                '설정 검증 실패';
            throw new Error(`${message}: ${errors.join(', ')}`);
        }
        
        return true;
    }

    isInitialized() {
        return this.initialized;
    }

    // ✅ API 키 사용 가능 여부 확인
    hasValidApiKey() {
        return !!this.config.tourApiKey;
    }

    // ✅ 샘플 데이터 사용 여부 확인
    shouldUseSampleData() {
        return !this.hasValidApiKey() && this.config.useSampleData;
    }
}

// ===== 고급 로깅 시스템 =====
class Logger {
    constructor(container) {
        this.container = container;
        this.configManager = container ? container.get('config') : null;
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
    constructor(container) {
        this.container = container;
        this.configManager = container.get('config');
        this.logger = container.get('logger');
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
        
        // 메모리 모니터링 설정
        this.memoryMonitor = {
            checkInterval: this.configManager.get('memoryCheckInterval'),
            threshold: this.configManager.get('memoryThreshold'),
            lastCheck: Date.now()
        };
        
        this.startCleanupWorker();
        this.startMemoryMonitoring();
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

    startMemoryMonitoring() {
        setInterval(() => {
            const usage = process.memoryUsage();
            const heapUsagePercent = usage.heapUsed / usage.heapTotal;
            
            if (heapUsagePercent > this.memoryMonitor.threshold) {
                this.logger.warn('High memory usage detected', {
                    heapUsagePercent: Math.round(heapUsagePercent * 100),
                    heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
                    heapTotal: Math.round(usage.heapTotal / 1024 / 1024)
                });
                
                this.emergencyCleanup();
            }
        }, this.memoryMonitor.checkInterval);
    }

    emergencyCleanup() {
        const targetSize = Math.floor(this.cache.size * 0.3); // 30%까지 줄임
        while (this.cache.size > targetSize) {
            this.evictLRU();
        }
        this.logger.info('Emergency cache cleanup completed', {
            remainingItems: this.cache.size
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
    constructor(container) {
        this.container = container;
        this.configManager = container.get('config');
        this.logger = container.get('logger');
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

// ===== 완전히 다국어화된 입력 검증 시스템 =====
class InputValidator {
    constructor(container) {
        this.container = container;
        this.i18n = container.get('i18n');
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

// ===== 동시성 제어가 포함된 HTTP 클라이언트 =====
class HttpClient {
    constructor(container) {
        this.container = container;
        this.configManager = container.get('config');
        this.logger = container.get('logger');
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
                        'Accept': 'application/json,application/xml',
                        'Accept-Encoding': this.configManager.get('enableCompression') ? 'gzip, deflate' : 'identity',
                        ...options.headers
                    }
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    const i18n = this.container.get('i18n');
                    throw new TourApiError(
                        'HTTP_ERROR',
                        'request',
                        response.status,
                        { url, status: response.status, statusText: response.statusText },
                        { status: response.status, statusText: response.statusText },
                        i18n
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
                    const i18n = this.container.get('i18n');
                    error = new ApiTimeoutError('request', this.timeout, i18n);
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
    constructor(container) {
        this.container = container;
        this.configManager = container.get('config');
        this.logger = container.get('logger');
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
        const rateLimiter = this.container.get('rateLimiter');
        const i18n = this.container.get('i18n');
        
        if (!rateLimiter.isAllowed(clientId)) {
            const remaining = rateLimiter.getRemainingQuota(clientId);
            throw new RateLimitError(this.configManager.get('rateLimitPerMinute'), remaining, i18n);
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
        const i18n = this.container.get('i18n');
        
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

    validateApiKey(req) {
        if (this.allowedApiKeys.length === 0) return;

        const apiKey = req.headers['x-api-key'];
        const i18n = this.container.get('i18n');
        
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

    static processBasicItem(item, container) {
        const mapx = item.mapx && item.mapx !== '' && item.mapx !== '0' ? 
                    parseFloat(item.mapx) : null;
        const mapy = item.mapy && item.mapy !== '' && item.mapy !== '0' ? 
                    parseFloat(item.mapy) : null;

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

// ===== 개선된 테스트 시스템 =====
class TestRunner {
    constructor(container) {
        this.container = container;
        this.tests = [];
        this.results = { passed: 0, failed: 0, errors: [] };
    }

    addTest(name, testFn) {
        this.tests.push({ name, testFn });
        return this;
    }

    async runAll() {
        console.log('🧪 Running comprehensive tests...');
        
        for (const test of this.tests) {
            try {
                await test.testFn();
                this.results.passed++;
                console.log(`✅ ${test.name}`);
            } catch (error) {
                this.results.failed++;
                this.results.errors.push({ test: test.name, error: error.message });
                console.log(`❌ ${test.name}: ${error.message}`);
            }
        }

        const total = this.results.passed + this.results.failed;
        const successRate = total > 0 ? Math.round((this.results.passed / total) * 100) : 0;
        
        console.log(`\n📊 Test Results: ${this.results.passed}/${total} passed (${successRate}%)`);
        
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

    assert(condition, message) {
        if (!condition) {
            throw new Error(message);
        }
    }
}

// ===== API 핸들러 클래스 =====
class TourApiHandlers {
    static async handleAreaBasedList(container, params) {
        const startTime = Date.now();
        const validator = container.get('validator');
        const cache = container.get('cache');
        const httpClient = container.get('httpClient');
        const configManager = container.get('config');
        const constants = container.get('constants');
        const logger = container.get('logger');
        
        validator.validate('areaBasedList', params);
        
        // ✅ API 키 확인 및 샘플 데이터 처리
        if (!configManager.hasValidApiKey()) {
            if (configManager.shouldUseSampleData()) {
                logger.warn('Using sample data due to missing API key');
                const sampleData = constants.getSampleData('areaBasedList');
                if (sampleData) {
                    return sampleData;
                }
            }
            const i18n = container.get('i18n');
            throw new TourApiError('MISSING_API_KEY', 'configuration', 500, {}, {}, i18n);
        }
        
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

        const apiKey = configManager.get('tourApiKey');
        const baseUrl = 'https://apis.data.go.kr/B551011/KorService2/areaBasedList2';
        const queryParams = {
            serviceKey: apiKey,
            MobileOS: 'ETC',
            MobileApp: `${configManager.get('appName')}-Enterprise`,
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
        let processedItems = items.map(item => ApiResponseProcessor.processBasicItem(item, container));

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

    static async handleDetailCommon(container, params) {
        const startTime = Date.now();
        const validator = container.get('validator');
        const cache = container.get('cache');
        const httpClient = container.get('httpClient');
        const configManager = container.get('config');
        const logger = container.get('logger');
        
        validator.validate('detailCommon', params);
        
        // ✅ API 키 확인
        if (!configManager.hasValidApiKey()) {
            const i18n = container.get('i18n');
            throw new TourApiError('MISSING_API_KEY', 'configuration', 500, {}, {}, i18n);
        }
        
        const { contentId } = params;
        const cacheKey = cache.generateKey('detailCommon', { contentId });
        
        const cachedData = cache.get(cacheKey);
        if (cachedData) {
            logger.metric('cache_hit', 1, { operation: 'detailCommon' });
            return ResponseFormatter.addCacheInfo(cachedData, true, cache.getStats());
        }

        const apiKey = configManager.get('tourApiKey');
        const baseUrl = 'https://apis.data.go.kr/B551011/KorService2/detailCommon2';
        const queryParams = {
            serviceKey: apiKey,
            MobileOS: 'ETC',
            MobileApp: `${configManager.get('appName')}-Enterprise`,
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
            ...ApiResponseProcessor.processBasicItem(item, container),
            telname: item.telname || null,
            homepage: ApiResponseProcessor.sanitizeHtml(item.homepage) || null,
            overview: ApiResponseProcessor.sanitizeHtml(item.overview) || null,
            meta: {
                ...ApiResponseProcessor.processBasicItem(item, container).meta,
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

    static async handleSearchKeyword(container, params) {
        const startTime = Date.now();
        const validator = container.get('validator');
        const cache = container.get('cache');
        const httpClient = container.get('httpClient');
        const configManager = container.get('config');
        const logger = container.get('logger');
        
        validator.validate('searchKeyword', params);
        
        // ✅ API 키 확인
        if (!configManager.hasValidApiKey()) {
            const i18n = container.get('i18n');
            throw new TourApiError('MISSING_API_KEY', 'configuration', 500, {}, {}, i18n);
        }
        
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

        const apiKey = configManager.get('tourApiKey');
        const baseUrl = 'https://apis.data.go.kr/B551011/KorService2/searchKeyword2';
        const queryParams = {
            serviceKey: apiKey,
            MobileOS: 'ETC',
            MobileApp: `${configManager.get('appName')}-Enterprise`,
            _type: 'json',
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
            if (value) queryParams[key] = value;
        });

        const response = await httpClient.get(baseUrl, queryParams);
        const data = await response.json();
        
        ApiResponseProcessor.validateApiResponse(data, 'searchKeyword');

        const items = ApiResponseProcessor.extractItems(data);
        let processedItems = items.map(item => ApiResponseProcessor.processBasicItem(item, container));

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

    static async handleLocationBasedList(container, params) {
        const startTime = Date.now();
        const validator = container.get('validator');
        const httpClient = container.get('httpClient');
        const configManager = container.get('config');
        const logger = container.get('logger');
        
        validator.validate('locationBasedList', params);
        
        // ✅ API 키 확인
        if (!configManager.hasValidApiKey()) {
            const i18n = container.get('i18n');
            throw new TourApiError('MISSING_API_KEY', 'configuration', 500, {}, {}, i18n);
        }
        
        const {
            mapX, mapY, radius,
            numOfRows = '10', pageNo = '1', arrange = 'E',
            contentTypeId = '', areaCode = '', sigunguCode = '',
            cat1 = '', cat2 = '', cat3 = '', modifiedtime = '',
            lDongRegnCd = '', lDongSignguCd = '',
            lclsSystm1 = '', lclsSystm2 = '', lclsSystm3 = ''
        } = params;

        const apiKey = configManager.get('tourApiKey');
        const baseUrl = 'https://apis.data.go.kr/B551011/KorService2/locationBasedList2';
        const queryParams = {
            serviceKey: apiKey,
            MobileOS: 'ETC',
            MobileApp: `${configManager.get('appName')}-Enterprise`,
            _type: 'json',
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
            if (value) queryParams[key] = value;
        });

        const response = await httpClient.get(baseUrl, queryParams);
        const data = await response.json();
        
        ApiResponseProcessor.validateApiResponse(data, 'locationBasedList');

        const items = ApiResponseProcessor.extractItems(data);
        const processedItems = items.map(item => ({
            ...ApiResponseProcessor.processBasicItem(item, container),
            dist: parseFloat(item.dist) || null // API에서 제공하는 거리
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

    static async handleBatchDetail(container, contentIds) {
        const validator = container.get('validator');
        const configManager = container.get('config');
        
        validator.validate('batchDetail', { contentIds });
        
        // ✅ API 키 확인
        if (!configManager.hasValidApiKey()) {
            const i18n = container.get('i18n');
            throw new TourApiError('MISSING_API_KEY', 'configuration', 500, {}, {}, i18n);
        }
        
        if (!Array.isArray(contentIds) || contentIds.length === 0) {
            const i18n = container.get('i18n');
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
                this.handleDetailCommon(container, { contentId })
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

// ===== 서비스 컨테이너 설정 및 초기화 =====
const container = new ServiceContainer();

// 서비스 등록 (의존성 순서대로)
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

// 서비스 초기화
container.initialize();

// 서비스 참조 생성
const configManager = container.get('config');
const logger = container.get('logger');
const i18n = container.get('i18n');
const constants = container.get('constants');
const cache = container.get('cache');

// 기본 언어 설정
i18n.setLanguage(configManager.get('defaultLanguage'));

// 설정 검증
try {
    configManager.validateConfig();
    logger.info('✅ Configuration validated successfully', {
        tourApiKey: configManager.hasValidApiKey() ? 'Set' : 'Missing',
        environment: configManager.get('environment'),
        sampleDataEnabled: configManager.shouldUseSampleData()
    });
} catch (error) {
    logger.error('❌ Configuration validation failed', error);
    // 개발 환경에서는 경고만 출력하고 계속 진행
    if (configManager.get('environment') !== 'development') {
        process.exit(1);
    }
}

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
            const security = container.get('security');
            security.handleCors(req, res);
            res.status(200).end();
            return;
        }

        const security = container.get('security');
        const securityInfo = security.validateRequest(req, res);
        
        const { operation = 'areaBasedList', ...params } = 
            req.method === 'GET' ? req.query : req.body;
        
        // ✅ API 키 체크 수정
        if (!configManager.hasValidApiKey() && !configManager.shouldUseSampleData()) {
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
            apiKeyPresent: configManager.hasValidApiKey(),
            usingSampleData: configManager.shouldUseSampleData()
        });

        let result;
        switch (operation) {
            case 'areaBasedList':
                result = await TourApiHandlers.handleAreaBasedList(container, params);
                break;
            case 'detailCommon':
                result = await TourApiHandlers.handleDetailCommon(container, params);
                break;
            case 'searchKeyword':
                result = await TourApiHandlers.handleSearchKeyword(container, params);
                break;
            case 'locationBasedList':
                result = await TourApiHandlers.handleLocationBasedList(container, params);
                break;
            case 'batchDetail':
                result = await TourApiHandlers.handleBatchDetail(container, params.contentIds);
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
            concurrentRequests: container.get('httpClient').semaphore.currentConcurrent,
            apiKeyConfigured: configManager.hasValidApiKey(),
            usingSampleData: configManager.shouldUseSampleData()
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
            apiKeyConfigured: configManager.hasValidApiKey(),
            usingSampleData: configManager.shouldUseSampleData()
        },
        timestamp: new Date().toISOString()
    };
}

// ===== 개선된 테스트 시스템 =====
function runTests() {
    const testRunner = new TestRunner(container);
    
    testRunner
        .addTest('Configuration Test', () => {
            testRunner.assert(configManager.get('environment') !== undefined, 'Environment should be defined');
            testRunner.assert(constants.isValidOperation('areaBasedList'), 'areaBasedList should be valid operation');
        })
        .addTest('API Key Test', () => {
            // ✅ 수정: API 키 또는 샘플 데이터 사용 가능해야 함
            const hasApiKey = configManager.hasValidApiKey();
            const canUseSampleData = configManager.shouldUseSampleData();
            testRunner.assert(hasApiKey || canUseSampleData, 'API key should be configured OR sample data should be available');
        })
        .addTest('Cache Test', () => {
            cache.set('test-key', { test: 'data' });
            testRunner.assert(cache.get('test-key') !== null, 'Cache should store and retrieve data');
        })
        .addTest('I18n Test', () => {
            i18n.setLanguage('en');
            testRunner.assert(i18n.getMessage('NOT_FOUND') === 'Data not found', 'English message should work');
            i18n.setLanguage('ko');
            testRunner.assert(i18n.getMessage('NOT_FOUND') === '데이터를 찾을 수 없습니다', 'Korean message should work');
        })
        .addTest('Accept-Language Parsing Test', () => {
            const parsed = LanguageNegotiator.parseAcceptLanguage('en-US,en;q=0.9,ko;q=0.8');
            testRunner.assert(parsed.length === 3, 'Should parse 3 language preferences');
            testRunner.assert(parsed[0].language === 'en-US', 'First preference should be en-US');
        })
        .addTest('Semaphore Test', () => {
            const semaphore = new Semaphore(2);
            testRunner.assert(semaphore.maxConcurrent === 2, 'Semaphore should have correct limit');
        })
        .addTest('Validation Test', () => {
            const validator = container.get('validator');
            try {
                validator.validate('detailCommon', {});
                testRunner.assert(false, 'Should throw validation error');
            } catch (error) {
                testRunner.assert(error instanceof ValidationError, 'Should throw ValidationError');
            }
        })
        .addTest('Service Container Test', () => {
            testRunner.assert(container.isInitialized(), 'Container should be initialized');
            testRunner.assert(container.get('config') === configManager, 'Should return same config instance');
        });

    return testRunner.runAll();
}

// ===== 모듈 내보내기 =====
module.exports = {
    handler: tourApiHandler,
    healthCheck,
    runTests,
    container,
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
    ServiceContainer,
    TestRunner,
    
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
    sampleDataEnabled: configManager.shouldUseSampleData(),
    features: {
        caching: true,
        rateLimiting: true,
        metrics: configManager.get('enableMetrics'),
        batching: configManager.get('enableBatching'),
        concurrencyControl: true,
        i18n: true,
        acceptLanguageParsing: true,
        dependencyInjection: true,
        memoryMonitoring: true,
        comprehensiveTesting: true,
        sampleDataSupport: true
    },
    concurrentLimit: configManager.get('maxConcurrent'),
    supportedLanguages: i18n.getSupportedLanguages(),
    servicesRegistered: Array.from(container.services.keys()),
    containerInitialized: container.isInitialized()
});
