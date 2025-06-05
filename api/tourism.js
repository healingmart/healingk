'use strict';

// ===== 런타임 환경 감지 및 안전한 폴리필 =====
const isNode = typeof window === 'undefined';
const hasProcess = typeof process !== 'undefined';

// 안전한 의존성 로딩 
let nodeFetch, AbortControllerPolyfill;
if (isNode && typeof fetch === 'undefined') {
    try {
        nodeFetch = require('node-fetch');
        AbortControllerPolyfill = require('abort-controller');
        global.fetch = nodeFetch;
        global.AbortController = AbortControllerPolyfill;
    } catch (error) {
        console.error('❌ Required dependencies missing. Install with: npm install node-fetch@2 abort-controller');
        throw new Error(`Missing dependencies: ${error.message}`);
    }
}

// ===== 서비스 시작 시간 추적 =====
const SERVICE_START_TIME = Date.now();

// ===== 안전한 유틸리티 함수들 =====
class SafeUtils {
    static safeParseInt(value, defaultValue = 0, radix = 10) {
        if (value === null || value === undefined || value === '') {
            return defaultValue;
        }
        const parsed = parseInt(String(value), radix);
        return isNaN(parsed) ? defaultValue : parsed;
    }

    static safeParseFloat(value, defaultValue = 0.0) {
        if (value === null || value === undefined || value === '') {
            return defaultValue;
        }
        const parsed = parseFloat(String(value));
        return isNaN(parsed) ? defaultValue : parsed;
    }

    static safeParseBool(value, defaultValue = false) {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
            return value.toLowerCase() === 'true';
        }
        return defaultValue;
    }

    static safeStringify(obj, maxDepth = 3, currentDepth = 0) {
        if (currentDepth >= maxDepth) return '[Max Depth Reached]';
        
        try {
            if (obj === null || obj === undefined) return String(obj);
            if (typeof obj !== 'object') return String(obj);
            
            if (Array.isArray(obj)) {
                return obj.map(item => this.safeStringify(item, maxDepth, currentDepth + 1)).join(',');
            }
            
            const keys = Object.keys(obj).sort();
            if (keys.length === 0) return '{}';
            
            return JSON.stringify(obj, keys);
        } catch (error) {
            return `[Stringify Error: ${error.message}]`;
        }
    }

    static deepClone(obj) {
        try {
            if (obj === null || typeof obj !== 'object') return obj;
            if (obj instanceof Date) return new Date(obj);
            if (Array.isArray(obj)) return obj.map(item => this.deepClone(item));
            
            const cloned = {};
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    cloned[key] = this.deepClone(obj[key]);
                }
            }
            return cloned;
        } catch (error) {
            console.warn('Deep clone failed, returning original:', error);
            return obj;
        }
    }

    static sanitizeInput(input, maxLength = 1000) {
        if (typeof input !== 'string') return input;
        return input.slice(0, maxLength).trim();
    }

    static isValidUrl(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    static maskSensitiveData(data, sensitiveKeys = ['password', 'apikey', 'token', 'secret']) {
        if (typeof data !== 'object' || data === null) return data;
        
        const masked = this.deepClone(data);
        const maskValue = (obj) => {
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    const lowerKey = key.toLowerCase();
                    if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
                        obj[key] = '***MASKED***';
                    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                        maskValue(obj[key]);
                    }
                }
            }
        };
        
        maskValue(masked);
        return masked;
    }
}

// ===== 에러 클래스들 =====
class TourismApiError extends Error {
    constructor(message, operation, statusCode = 500, details = {}, data = {}, i18n = null) {
        super(message);
        this.name = 'TourismApiError';
        this.code = message;
        this.operation = operation;
        this.statusCode = statusCode;
        this.details = details;
        this.data = data;
        this.timestamp = new Date().toISOString();
        this.i18n = i18n;
        
        if (i18n && typeof i18n.getMessage === 'function') {
            try {
                this.localizedMessage = i18n.getMessage(message, details);
            } catch {
                this.localizedMessage = message;
            }
        } else {
            this.localizedMessage = message;
        }
    }
}

class ValidationError extends TourismApiError {
    constructor(message, field, value, i18n = null) {
        super(message, 'validation', 400, { field, value }, {}, i18n);
        this.name = 'ValidationError';
        this.field = field;
        this.value = value;
    }
}

class ApiTimeoutError extends TourismApiError {
    constructor(timeout, operation, i18n = null) {
        super('API_TIMEOUT', operation, 408, { timeout }, {}, i18n);
        this.name = 'ApiTimeoutError';
        this.timeout = timeout;
    }
}

class RateLimitError extends TourismApiError {
    constructor(limit, remaining, i18n = null) {
        super('RATE_LIMIT_EXCEEDED', 'rateLimit', 429, { limit, remaining }, {}, i18n);
        this.name = 'RateLimitError';
        this.limit = limit;
        this.remaining = remaining;
    }
}

class DependencyError extends TourismApiError {
    constructor(dependency, originalError, i18n = null) {
        super('DEPENDENCY_ERROR', 'system', 503, { dependency, originalError: originalError.message }, {}, i18n);
        this.name = 'DependencyError';
        this.dependency = dependency;
        this.originalError = originalError;
    }
}

// ===== 상수 관리자 =====
class ConstantsManager {
    constructor() {
        this.SUPPORTED_OPERATIONS = [
            'areaBasedList', 'detailCommon', 'detailIntro', 'detailInfo', 
            'detailImage', 'searchKeyword', 'searchFestival', 
            'locationBasedList', 'areaCode', 'categoryCode', 'batchDetail'
        ];

        this.CONTENT_TYPES = {
            '12': '관광지',
            '14': '문화시설', 
            '15': '축제공연행사',
            '25': '여행코스',
            '28': '레포츠',
            '32': '숙박',
            '38': '쇼핑',
            '39': '음식점'
        };

        this.AREA_CODES = {
            '1': '서울',
            '2': '인천',
            '3': '대전',
            '4': '대구',
            '5': '광주',
            '6': '부산',
            '7': '울산',
            '8': '세종특별자치시',
            '31': '경기도',
            '32': '강원도',
            '33': '충청북도',
            '34': '충청남도',
            '35': '경상북도',
            '36': '경상남도',
            '37': '전라북도',
            '38': '전라남도',
            '39': '제주도'
        };
    }

    isValidOperation(operation) {
        return this.SUPPORTED_OPERATIONS.includes(operation);
    }

    getContentTypeName(code) {
        return this.CONTENT_TYPES[code] || '알 수 없음';
    }

    getAreaName(code, lang = 'ko') {
        return this.AREA_CODES[code] || '알 수 없음';
    }
}

// ===== 다국어 지원 관리자 =====
class InternationalizationManager {
    constructor() {
        this.currentLanguage = 'ko';
        this.supportedLanguages = ['ko', 'en', 'ja', 'zh'];
        this.messages = {
            ko: {
                'UNSUPPORTED_OPERATION': '지원하지 않는 작업입니다: {operation}',
                'VALIDATION_ERROR': '입력값 검증 오류',
                'FIELD_REQUIRED': '필드가 필수입니다',
                'TYPE_MISMATCH': '잘못된 타입입니다. 예상: {type}',
                'INVALID_FORMAT': '잘못된 형식입니다',
                'MIN_LENGTH_ERROR': '최소 길이: {minLength}',
                'MAX_LENGTH_ERROR': '최대 길이: {maxLength}',
                'NUMERIC_ERROR': '숫자여야 합니다',
                'INVALID_RANGE': '범위를 벗어났습니다',
                'ENUM_ERROR': '허용된 값: {values}',
                'API_TIMEOUT': 'API 요청 시간 초과',
                'RATE_LIMIT_EXCEEDED': '요청 한도 초과',
                'MISSING_API_KEY': 'API 키가 필요합니다',
                'INVALID_API_KEY': '유효하지 않은 API 키',
                'CORS_ERROR': 'CORS 정책 위반',
                'SECURITY_ERROR': '보안 오류',
                'NOT_FOUND': '데이터를 찾을 수 없습니다'
            },
            en: {
                'UNSUPPORTED_OPERATION': 'Unsupported operation: {operation}',
                'VALIDATION_ERROR': 'Input validation error',
                'FIELD_REQUIRED': 'Field is required',
                'TYPE_MISMATCH': 'Invalid type. Expected: {type}',
                'INVALID_FORMAT': 'Invalid format',
                'MIN_LENGTH_ERROR': 'Minimum length: {minLength}',
                'MAX_LENGTH_ERROR': 'Maximum length: {maxLength}',
                'NUMERIC_ERROR': 'Must be numeric',
                'INVALID_RANGE': 'Out of range',
                'ENUM_ERROR': 'Allowed values: {values}',
                'API_TIMEOUT': 'API request timeout',
                'RATE_LIMIT_EXCEEDED': 'Rate limit exceeded',
                'MISSING_API_KEY': 'API key required',
                'INVALID_API_KEY': 'Invalid API key',
                'CORS_ERROR': 'CORS policy violation',
                'SECURITY_ERROR': 'Security error',
                'NOT_FOUND': 'Data not found'
            }
        };
    }

    setLanguage(lang) {
        if (this.supportedLanguages.includes(lang)) {
            this.currentLanguage = lang;
            return true;
        }
        return false;
    }

    setLanguageFromHeader(acceptLanguage) {
        if (!acceptLanguage) return false;
        
        const languages = acceptLanguage.split(',')
            .map(lang => lang.split(';')[0].trim().toLowerCase())
            .map(lang => lang.split('-')[0]);
        
        for (const lang of languages) {
            if (this.setLanguage(lang)) {
                return true;
            }
        }
        return false;
    }

    getMessage(key, params = {}) {
        const messages = this.messages[this.currentLanguage] || this.messages.ko;
        let message = messages[key] || key;
        
        Object.entries(params).forEach(([param, value]) => {
            message = message.replace(new RegExp(`\\{${param}\\}`, 'g'), value);
        });
        
        return message;
    }

    getSupportedLanguages() {
        return [...this.supportedLanguages];
    }
}

// ===== 설정 관리자 =====
class ConfigManager {
    constructor(container) {
        this.container = container;
        this.config = {
            version: '1.2.0',
            environment: (hasProcess && process.env.NODE_ENV) || 'development',
            serviceKey: (hasProcess && process.env.SERVICE_KEY) || '',
            baseUrl: 'https://apis.data.go.kr/B551011/KorService1',
            maxConcurrent: 10,
            apiTimeout: 30000,
            rateLimitPerMinute: 100,
            maxCacheSize: 1000,
            defaultLanguage: 'ko',
            enableMetrics: true,
            enableBatching: true,
            enableCompression: true,
            securityEnabled: true,
            allowedOrigins: ['*'],
            allowedApiKeys: [],
            maxMemorySize: 512 * 1024 * 1024 // 512MB
        };
        
        this.subscribers = new Map();
        this.loadEnvironmentConfig();
    }

    loadEnvironmentConfig() {
        if (!hasProcess) return;
        
        const envMappings = {
            SERVICE_KEY: 'serviceKey',
            API_TIMEOUT: 'apiTimeout',
            MAX_CONCURRENT: 'maxConcurrent',
            RATE_LIMIT_PER_MINUTE: 'rateLimitPerMinute',
            MAX_CACHE_SIZE: 'maxCacheSize',
            DEFAULT_LANGUAGE: 'defaultLanguage',
            ALLOWED_ORIGINS: 'allowedOrigins',
            ALLOWED_API_KEYS: 'allowedApiKeys'
        };

        Object.entries(envMappings).forEach(([envKey, configKey]) => {
            const envValue = process.env[envKey];
            if (envValue) {
                if (configKey === 'allowedOrigins' || configKey === 'allowedApiKeys') {
                    this.config[configKey] = envValue.split(',').map(s => s.trim());
                } else if (typeof this.config[configKey] === 'number') {
                    this.config[configKey] = SafeUtils.safeParseInt(envValue, this.config[configKey]);
                } else {
                    this.config[configKey] = envValue;
                }
            }
        });
    }

    get(key) {
        return this.config[key];
    }

    set(key, value) {
        const oldValue = this.config[key];
        this.config[key] = value;
        this.notifySubscribers(key, value, oldValue);
        return true;
    }

    subscribe(callback) {
        const id = Math.random().toString(36).substr(2, 9);
        this.subscribers.set(id, callback);
        return () => this.subscribers.delete(id);
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

    hasValidApiKey() {
        return !!(this.config.serviceKey && this.config.serviceKey.length > 0);
    }

    validateConfig() {
        const errors = [];
        
        if (!this.hasValidApiKey()) {
            errors.push('SERVICE_KEY is required');
        }
        
        if (this.config.maxConcurrent <= 0) {
            errors.push('maxConcurrent must be positive');
        }
        
        if (this.config.apiTimeout <= 0) {
            errors.push('apiTimeout must be positive');
        }
        
        if (errors.length > 0) {
            throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
        }
        
        return true;
    }
}

// ===== 로거 클래스 =====
class Logger {
    constructor(container) {
        this.container = container;
        this.configManager = container.get('config');
        this.logLevel = this.getLogLevel();
        this.metrics = new Map();
        this.logBuffer = [];
        this.maxBufferSize = 1000;
    }

    getLogLevel() {
        const env = this.configManager.get('environment');
        switch (env) {
            case 'production': return 2; // warn, error only
            case 'staging': return 1; // info, warn, error
            case 'development': 
            default: return 0; // debug, info, warn, error
        }
    }

    log(level, message, data = {}) {
        const levels = ['debug', 'info', 'warn', 'error'];
        const levelIndex = levels.indexOf(level);
        
        if (levelIndex < this.logLevel) return;

        const logEntry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            data: SafeUtils.maskSensitiveData(data),
            service: 'AllTourism',
            version: this.configManager.get('version')
        };

        // 콘솔 출력
        const consoleMethod = console[level] || console.log;
        if (typeof data === 'object' && Object.keys(data).length > 0) {
            consoleMethod(`[${logEntry.timestamp}] ${level.toUpperCase()}: ${message}`, data);
        } else {
            consoleMethod(`[${logEntry.timestamp}] ${level.toUpperCase()}: ${message}`);
        }

        // 버퍼에 저장
        this.logBuffer.push(logEntry);
        if (this.logBuffer.length > this.maxBufferSize) {
            this.logBuffer = this.logBuffer.slice(-this.maxBufferSize);
        }
    }

    debug(message, data) { this.log('debug', message, data); }
    info(message, data) { this.log('info', message, data); }
    warn(message, data) { this.log('warn', message, data); }
    error(message, data) { this.log('error', message, data); }

    metric(name, value, tags = {}) {
        if (!this.configManager.get('enableMetrics')) return;
        
        const key = `${name}_${JSON.stringify(tags)}`;
        if (!this.metrics.has(key)) {
            this.metrics.set(key, { name, tags, values: [], count: 0, sum: 0, min: Infinity, max: -Infinity });
        }
        
        const metric = this.metrics.get(key);
        metric.values.push({ value, timestamp: Date.now() });
        metric.count++;
        metric.sum += value;
        metric.min = Math.min(metric.min, value);
        metric.max = Math.max(metric.max, value);
        
        // 최근 1000개만 유지
        if (metric.values.length > 1000) {
            metric.values = metric.values.slice(-1000);
        }
    }

    getMetrics() {
        const result = {};
        this.metrics.forEach((metric, key) => {
            result[key] = {
                ...metric,
                average: metric.count > 0 ? metric.sum / metric.count : 0,
                recent: metric.values.slice(-10)
            };
        });
        return result;
    }

    getMemoryInfo() {
        if (hasProcess && process.memoryUsage) {
            return process.memoryUsage();
        }
        return { source: 'unavailable' };
    }

    getRecentLogs(count = 100) {
        return this.logBuffer.slice(-count);
    }
}

// ===== 고급 캐시 시스템 =====
class AdvancedCache {
    constructor(container) {
        this.container = container;
        this.configManager = container.get('config');
        this.logger = container.get('logger');
        this.cache = new Map();
        this.maxSize = this.configManager.get('maxCacheSize');
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0,
            evictions: 0
        };
        this.accessOrder = new Map();
        this.startCleanupTimer();
    }

    generateKey(operation, params) {
        const sortedParams = Object.keys(params).sort().reduce((obj, key) => {
            obj[key] = params[key];
            return obj;
        }, {});
        return `${operation}:${SafeUtils.safeStringify(sortedParams)}`;
    }

    get(key) {
        if (this.cache.has(key)) {
            const item = this.cache.get(key);
            if (this.isExpired(item)) {
                this.cache.delete(key);
                this.accessOrder.delete(key);
                this.stats.misses++;
                return null;
            }
            
            // LRU 업데이트
            this.accessOrder.set(key, Date.now());
            this.stats.hits++;
            return item.data;
        }
        
        this.stats.misses++;
        return null;
    }

    set(key, data, ttl = 300000) { // 기본 5분
        // 크기 제한 확인
        if (this.cache.size >= this.maxSize) {
            this.evictLRU();
        }

        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            ttl,
            size: this.estimateSize(data)
        });
        
        this.accessOrder.set(key, Date.now());
        this.stats.sets++;
    }

    delete(key) {
        const deleted = this.cache.delete(key);
        this.accessOrder.delete(key);
        if (deleted) this.stats.deletes++;
        return deleted;
    }

    clear() {
        const size = this.cache.size;
        this.cache.clear();
        this.accessOrder.clear();
        this.stats.deletes += size;
    }

    isExpired(item) {
        return Date.now() - item.timestamp > item.ttl;
    }

    evictLRU() {
        let oldestKey = null;
        let oldestTime = Infinity;
        
        for (const [key, time] of this.accessOrder) {
            if (time < oldestTime) {
                oldestTime = time;
                oldestKey = key;
            }
        }
        
        if (oldestKey) {
            this.cache.delete(oldestKey);
            this.accessOrder.delete(oldestKey);
            this.stats.evictions++;
        }
    }

    estimateSize(data) {
        try {
            return JSON.stringify(data).length;
        } catch {
            return 1000; // 기본값
        }
    }

    startCleanupTimer() {
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 60000); // 1분마다
    }

    cleanup() {
        const now = Date.now();
        const expiredKeys = [];
        
        for (const [key, item] of this.cache) {
            if (this.isExpired(item)) {
                expiredKeys.push(key);
            }
        }
        
        expiredKeys.forEach(key => {
            this.cache.delete(key);
            this.accessOrder.delete(key);
        });
        
        if (expiredKeys.length > 0) {
            this.logger.debug('Cache cleanup completed', { expiredItems: expiredKeys.length });
        }
    }

    getStats() {
        const total = this.stats.hits + this.stats.misses;
        return {
            ...this.stats,
            hitRate: total > 0 ? this.stats.hits / total : 0,
            size: this.cache.size,
            maxSize: this.maxSize,
            memoryUsage: Array.from(this.cache.values()).reduce((sum, item) => sum + item.size, 0)
        };
    }

    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        this.clear();
        this.logger.info('Cache destroyed');
    }
}

// 계속해서 나머지 클래스들을 추가하겠습니다...

// ===== 레이트 리미터 =====
class RateLimiter {
    constructor(container) {
        this.container = container;
        this.configManager = container.get('config');
        this.logger = container.get('logger');
        this.requests = new Map();
        this.windowSize = 60000; // 1분
        this.limit = this.configManager.get('rateLimitPerMinute');
        this.startCleanupTimer();
    }

    isAllowed(clientId) {
        const now = Date.now();
        const windowStart = now - this.windowSize;
        
        if (!this.requests.has(clientId)) {
            this.requests.set(clientId, []);
        }
        
        const clientRequests = this.requests.get(clientId);
        
        // 오래된 요청 제거
        while (clientRequests.length > 0 && clientRequests[0] < windowStart) {
            clientRequests.shift();
        }
        
        if (clientRequests.length >= this.limit) {
            return false;
        }
        
        clientRequests.push(now);
        return true;
    }

    getRemainingQuota(clientId) {
        const now = Date.now();
        const windowStart = now - this.windowSize;
        
        if (!this.requests.has(clientId)) {
            return this.limit;
        }
        
        const clientRequests = this.requests.get(clientId);
        const validRequests = clientRequests.filter(time => time >= windowStart);
        
        return Math.max(0, this.limit - validRequests.length);
    }

    startCleanupTimer() {
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 60000); // 1분마다
    }

    cleanup() {
        const now = Date.now();
        const windowStart = now - this.windowSize;
        
        for (const [clientId, requests] of this.requests) {
            const validRequests = requests.filter(time => time >= windowStart);
            
            if (validRequests.length === 0) {
                this.requests.delete(clientId);
            } else {
                this.requests.set(clientId, validRequests);
            }
        }
    }

    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        this.requests.clear();
        this.logger.info('Rate limiter destroyed');
    }
}

// ===== HTTP 클라이언트 =====
class HttpClient {
    constructor(container) {
        this.container = container;
        this.configManager = container.get('config');
        this.logger = container.get('logger');
        this.semaphore = new EnhancedSemaphore(
            this.configManager.get('maxConcurrent'), 
            'httpClient'
        );
    }

    async getTourismData(operation, params) {
        return await this.semaphore.execute(async () => {
            const startTime = Date.now();
            const timeout = this.configManager.get('apiTimeout');
            
            try {
                const url = this.buildUrl(operation, params);
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeout);
                
                this.logger.debug('HTTP request starting', { operation, url });
                
                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'AllTourism-Enterprise/1.2.0'
                    },
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                const data = await response.json();
                const responseTime = Date.now() - startTime;
                
                this.logger.debug('HTTP request completed', { 
                    operation, 
                    responseTime, 
                    statusCode: response.status 
                });
                
                this.logger.metric('http_request_duration', responseTime, { operation, success: true });
                
                return data;
                
            } catch (error) {
                const responseTime = Date.now() - startTime;
                
                if (error.name === 'AbortError') {
                    this.logger.error('HTTP request timeout', { operation, timeout });
                    this.logger.metric('http_request_duration', responseTime, { operation, success: false, error: 'timeout' });
                    throw new ApiTimeoutError(timeout, operation, this.container.get('i18n'));
                }
                
                this.logger.error('HTTP request failed', { operation, error: error.message });
                this.logger.metric('http_request_duration', responseTime, { operation, success: false, error: 'network' });
                throw new TourismApiError('HTTP_ERROR', operation, 503, { originalError: error.message }, {}, this.container.get('i18n'));
            }
        });
    }

    buildUrl(operation, params) {
        const baseUrl = this.configManager.get('baseUrl');
        const serviceKey = this.configManager.get('serviceKey');
        
        const endpoint = this.getEndpoint(operation);
        const url = new URL(`${baseUrl}/${endpoint}`);
        
        // 기본 파라미터 설정
        url.searchParams.set('serviceKey', serviceKey);
        url.searchParams.set('MobileOS', 'ETC');
        url.searchParams.set('MobileApp', 'AllTourism');
        url.searchParams.set('_type', 'json');
        
        // 추가 파라미터 설정
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                url.searchParams.set(key, value);
            }
        });
        
        return url.toString();
    }

    getEndpoint(operation) {
        const endpoints = {
            'areaBasedList': 'areaBasedList1',
            'detailCommon': 'detailCommon1',
            'detailIntro': 'detailIntro1',
            'detailInfo': 'detailInfo1',
            'detailImage': 'detailImage1',
            'searchKeyword': 'searchKeyword1',
            'searchFestival': 'searchFestival1',
            'locationBasedList': 'locationBasedList1',
            'areaCode': 'areaCode1',
            'categoryCode': 'categoryCode1'
        };
        
        return endpoints[operation] || operation;
    }

    destroy() {
        this.semaphore.destroy();
        this.logger.info('HTTP client destroyed');
    }
}

// ===== 향상된 동시성 제어 유틸리티 =====
class EnhancedSemaphore {
    constructor(maxConcurrent, name = 'semaphore') {
        this.maxConcurrent = Math.max(1, SafeUtils.safeParseInt(maxConcurrent, 10));
        this.currentConcurrent = 0;
        this.queue = [];
        this.name = name;
        this.stats = {
            totalAcquired: 0,
            totalReleased: 0,
            maxQueueSize: 0,
            averageWaitTime: 0
        };
        this._destroyed = false;
    }

    async acquire() {
        if (this._destroyed) {
            throw new Error(`Semaphore ${this.name} has been destroyed`);
        }

        const acquireTime = Date.now();

        return new Promise((resolve, reject) => {
            const request = { resolve, reject, timestamp: acquireTime };

            if (this.currentConcurrent < this.maxConcurrent) {
                this.currentConcurrent++;
                this.stats.totalAcquired++;
                resolve();
            } else {
                this.queue.push(request);
                this.stats.maxQueueSize = Math.max(this.stats.maxQueueSize, this.queue.length);

                // 타임아웃 설정 (30초)
                const timeout = setTimeout(() => {
                    const index = this.queue.indexOf(request);
                    if (index > -1) {
                        this.queue.splice(index, 1);
                        reject(new Error(`Semaphore acquire timeout after 30s for ${this.name}`));
                    }
                }, 30000);

                request.timeout = timeout;
            }
        });
    }

    release() {
        if (this._destroyed) return;

        this.currentConcurrent = Math.max(0, this.currentConcurrent - 1);
        this.stats.totalReleased++;

        if (this.queue.length > 0) {
            const next = this.queue.shift();
            if (next && next.timeout) {
                clearTimeout(next.timeout);
            }

            if (next) {
                this.currentConcurrent++;
                this.stats.totalAcquired++;

                const waitTime = Date.now() - next.timestamp;
                this.stats.averageWaitTime = (this.stats.averageWaitTime + waitTime) / 2;

                next.resolve();
            }
        }
    }

    async execute(fn, timeoutMs = 30000) {
        if (this._destroyed) {
            throw new Error(`Semaphore ${this.name} has been destroyed`);
        }

        await this.acquire();

        let timeoutId;
        try {
            if (timeoutMs > 0) {
                const timeoutPromise = new Promise((_, reject) => {
                    timeoutId = setTimeout(() => {
                        reject(new Error(`Semaphore execute timeout after ${timeoutMs}ms`));
                    }, timeoutMs);
                });

                return await Promise.race([fn(), timeoutPromise]);
            } else {
                return await fn();
            }
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
            this.release();
        }
    }

    getStats() {
        return {
            ...this.stats,
            currentConcurrent: this.currentConcurrent,
            queueSize: this.queue.length,
            maxConcurrent: this.maxConcurrent,
            utilization: (this.currentConcurrent / this.maxConcurrent) * 100
        };
    }

    destroy() {
        this._destroyed = true;
        
        // 대기 중인 모든 요청 거부
        while (this.queue.length > 0) {
            const request = this.queue.shift();
            if (request.timeout) clearTimeout(request.timeout);
            request.reject(new Error(`Semaphore ${this.name} destroyed`));
        }
        
        this.currentConcurrent = 0;
    }
}

// ===== 지리 유틸리티 =====
class GeoUtils {
    static calculateDistance(lat1, lon1, lat2, lon2) {
        try {
            // 입력값 검증
            const numLat1 = SafeUtils.safeParseFloat(lat1);
            const numLon1 = SafeUtils.safeParseFloat(lon1);
            const numLat2 = SafeUtils.safeParseFloat(lat2);
            const numLon2 = SafeUtils.safeParseFloat(lon2);

            if (isNaN(numLat1) || isNaN(numLon1) || isNaN(numLat2) || isNaN(numLon2)) {
                return null;
            }

            // 위도 경도 범위 검증
            if (Math.abs(numLat1) > 90 || Math.abs(numLat2) > 90 || 
                Math.abs(numLon1) > 180 || Math.abs(numLon2) > 180) {
                return null;
            }

            // Haversine 공식
            const R = 6371; // 지구 반지름 (km)
            const dLat = this.toRadians(numLat2 - numLat1);
            const dLon = this.toRadians(numLon2 - numLon1);

            const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                      Math.cos(this.toRadians(numLat1)) * Math.cos(this.toRadians(numLat2)) *
                      Math.sin(dLon/2) * Math.sin(dLon/2);

            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            const distance = R * c;

            return distance;
        } catch (error) {
            console.warn('Distance calculation failed:', error);
            return null;
        }
    }

    static toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }

    static getBearing(lat1, lon1, lat2, lon2) {
        try {
            const dLon = this.toRadians(lon2 - lon1);
            const lat1Rad = this.toRadians(lat1);
            const lat2Rad = this.toRadians(lat2);

            const y = Math.sin(dLon) * Math.cos(lat2Rad);
            const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - 
                      Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);

            const bearing = Math.atan2(y, x) * 180 / Math.PI;
            return (bearing + 360) % 360;
        } catch {
            return null;
        }
    }

    static getDirectionText(bearing, lang = 'ko') {
        if (typeof bearing !== 'number' || isNaN(bearing)) return null;

        const directions = {
            ko: ['북', '북동', '동', '남동', '남', '남서', '서', '북서'],
            en: ['North', 'Northeast', 'East', 'Southeast', 'South', 'Southwest', 'West', 'Northwest'],
            ja: ['北', '北東', '東', '南東', '南', '南西', '西', '北西'],
            zh: ['北', '东北', '东', '东南', '南', '西南', '西', '西北']
        };

        const index = Math.round(bearing / 45) % 8;
        return directions[lang] ? directions[lang][index] : directions.ko[index];
    }

    static isInKorea(lat, lng) {
        try {
            const bounds = {
                north: 38.6, south: 33.0,
                east: 131.9, west: 124.6
            };

            const numLat = SafeUtils.safeParseFloat(lat);
            const numLng = SafeUtils.safeParseFloat(lng);

            if (isNaN(numLat) || isNaN(numLng)) return false;

            return numLat >= bounds.south && numLat <= bounds.north &&
                   numLng >= bounds.west && numLng <= bounds.east;
        } catch {
            return false;
        }
    }

    static addDistanceInfo(items, userLat, userLng, radius = null) {
        if (!items || !Array.isArray(items)) return items;
        if (!userLat || !userLng) return items;

        try {
            const userLatNum = SafeUtils.safeParseFloat(userLat);
            const userLngNum = SafeUtils.safeParseFloat(userLng);

            if (isNaN(userLatNum) || isNaN(userLngNum)) return items;

            const itemsWithDistance = items.map(item => {
                if (!item) return item;

                let distance = null;
                let bearing = null;
                let distanceText = null;
                let directionText = null;

                if (item.mapx && item.mapy) {
                    distance = this.calculateDistance(userLatNum, userLngNum, item.mapy, item.mapx);
                    if (distance !== null) {
                        distance = Math.round(distance * 100) / 100;
                        bearing = this.getBearing(userLatNum, userLngNum, item.mapy, item.mapx);
                        distanceText = this.formatDistance(distance);
                        directionText = this.getDirectionText(bearing);
                    }
                }

                return {
                    ...item,
                    distance,
                    bearing,
                    meta: {
                        ...item.meta,
                        distanceText,
                        directionText,
                        distanceCategory: this.getDistanceCategory(distance)
                    }
                };
            });

            // 반경 필터링
            let filteredItems = itemsWithDistance;
            if (radius && !isNaN(SafeUtils.safeParseFloat(radius))) {
                const radiusKm = SafeUtils.safeParseFloat(radius);
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
        } catch (error) {
            console.warn('Distance processing failed:', error);
            return items;
        }
    }

    static formatDistance(distance) {
        if (distance === null || isNaN(distance)) return null;

        try {
            if (distance < 1) {
                return `${Math.round(distance * 1000)}m`;
            } else if (distance < 10) {
                return `${Math.round(distance * 10) / 10}km`;
            } else {
                return `${Math.round(distance)}km`;
            }
        } catch (error) {
            return `${distance}km`;
        }
    }

    static getDistanceCategory(distance) {
        if (distance === null || isNaN(distance)) return 'unknown';

        if (distance <= 0.5) return 'very_close';
        if (distance <= 2) return 'close';
        if (distance <= 10) return 'nearby';
        if (distance <= 50) return 'far';
        return 'very_far';
    }
}

// ===== 서비스 컨테이너 =====
class ServiceContainer {
    constructor() {
        this.services = new Map();
        this.factories = new Map();
        this.instances = new Map();
        this.dependencies = new Map();
        this._initialized = false;
        this._destroyed = false;
    }

    register(name, factory) {
        if (this._destroyed) {
            throw new Error('Container has been destroyed');
        }

        if (typeof factory !== 'function') {
            throw new Error('Factory must be a function');
        }

        this.factories.set(name, factory);
        return this;
    }

    get(name) {
        if (this._destroyed) {
            throw new Error('Container has been destroyed');
        }

        if (this.instances.has(name)) {
            return this.instances.get(name);
        }

        if (!this.factories.has(name)) {
            throw new Error(`Service '${name}' not registered`);
        }

        const factory = this.factories.get(name);
        const instance = factory(this);
        this.instances.set(name, instance);
        return instance;
    }

    has(name) {
        return this.factories.has(name) || this.instances.has(name);
    }

    initialize() {
        if (this._initialized) return this;

        // 기본 서비스들 순서대로 초기화
        const initOrder = [
            'constants', 'i18n', 'config', 'logger', 
            'cache', 'rateLimiter', 'validator', 
            'httpClient', 'security', 'performanceMonitor'
        ];

        initOrder.forEach(serviceName => {
            if (this.factories.has(serviceName)) {
                this.get(serviceName);
            }
        });

        this._initialized = true;
        return this;
    }

    isInitialized() {
        return this._initialized;
    }

    getRegisteredServices() {
        return Array.from(this.factories.keys());
    }

    destroy() {
        if (this._destroyed) return;

        // 인스턴스들을 역순으로 파괴
        const instances = Array.from(this.instances.entries()).reverse();
        instances.forEach(([name, instance]) => {
            try {
                if (instance && typeof instance.destroy === 'function') {
                    instance.destroy();
                }
            } catch (error) {
                console.error(`Error destroying service ${name}:`, error);
            }
        });

        this.services.clear();
        this.factories.clear();
        this.instances.clear();
        this.dependencies.clear();
        this._destroyed = true;
    }
}

// ===== 응답 포맷터 =====
class ResponseFormatter {
    static formatSuccess(operation, data, metadata = {}, performance = {}) {
        return {
            success: true,
            timestamp: new Date().toISOString(),
            operation,
            data,
            metadata: {
                operation,
                ...metadata,
                cache: metadata.cache || { fromCache: false },
                performance: {
                    apiResponseTime: 0,
                    totalProcessingTime: 0,
                    ...performance
                }
            }
        };
    }

    static formatError(error, operation = 'unknown') {
        const baseError = {
            success: false,
            timestamp: new Date().toISOString(),
            operation,
            error: {
                code: error.code || 'UNKNOWN_ERROR',
                message: error.localizedMessage || error.message || 'An unknown error occurred',
                operation,
                statusCode: error.statusCode || 500
            }
        };

        // 개발 환경에서는 더 자세한 정보 포함
        if (hasProcess && process.env.NODE_ENV === 'development') {
            baseError.error.details = error.details || {};
            baseError.error.stack = error.stack;
        }

        return baseError;
    }

    static addCacheInfo(response, fromCache, cacheStats = {}) {
        if (typeof response === 'object' && response.metadata) {
            response.metadata.cache = {
                fromCache,
                ...cacheStats,
                timestamp: new Date().toISOString()
            };
        }
        return response;
    }
}

// ===== API 응답 처리기 =====
class ApiResponseProcessor {
    static extractItems(apiResponse) {
        try {
            const body = apiResponse?.response?.body;
            if (!body) return [];

            // 단일 아이템
            if (body.item && !Array.isArray(body.item)) {
                return [body.item];
            }

            // 아이템 배열
            if (body.items) {
                return Array.isArray(body.items.item) ? body.items.item : 
                       (body.items.item ? [body.items.item] : []);
            }

            // 직접 아이템 배열
            if (Array.isArray(body.item)) {
                return body.item;
            }

            return [];
        } catch (error) {
            console.warn('Error extracting items from API response:', error);
            return [];
        }
    }

    static processBasicItem(item, container) {
        try {
            if (!item) return null;

            const constants = container.get('constants');
            
            return {
                contentid: item.contentid,
                contenttypeid: item.contenttypeid,
                title: this.sanitizeHtml(item.title),
                addr1: this.sanitizeHtml(item.addr1),
                addr2: this.sanitizeHtml(item.addr2),
                zipcode: item.zipcode,
                tel: this.sanitizeHtml(item.tel),
                firstimage: this.validateImageUrl(item.firstimage),
                firstimage2: this.validateImageUrl(item.firstimage2),
                mapx: this.sanitizeCoordinate(item.mapx),
                mapy: this.sanitizeCoordinate(item.mapy),
                areacode: item.areacode,
                sigungucode: item.sigungucode,
                cat1: item.cat1,
                cat2: item.cat2,
                cat3: item.cat3,
                overview: this.sanitizeHtml(item.overview),
                homepage: this.sanitizeHtml(item.homepage),
                createdtime: this.formatDate(item.createdtime),
                modifiedtime: this.formatDate(item.modifiedtime),
                meta: {
                    contentTypeName: constants.getContentTypeName(item.contenttypeid),
                    areaName: constants.getAreaName(item.areacode),
                    hasImage: !!(item.firstimage || item.firstimage2),
                    hasCoordinates: !!(item.mapx && item.mapy),
                    hasOverview: !!item.overview,
                    hasHomepage: !!item.homepage,
                    completeness: this.calculateCompleteness(item)
                }
            };
        } catch (error) {
            console.warn('Error processing basic item:', error);
            return null;
        }
    }

    static sanitizeHtml(input) {
        if (!input || typeof input !== 'string') return input;
        
        return input
            .replace(/<[^>]*>/g, '') // HTML 태그 제거
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .trim();
    }

    static validateImageUrl(url) {
        if (!url || typeof url !== 'string') return null;
        
        // 유효한 이미지 URL 패턴 체크
        if (!url.startsWith('http')) return null;
        
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
        const hasValidExtension = imageExtensions.some(ext => 
            url.toLowerCase().includes(ext)
        );
        
        return hasValidExtension ? url : null;
    }

    static sanitizeCoordinate(coord) {
        if (!coord) return null;
        const num = SafeUtils.safeParseFloat(coord);
        return isNaN(num) ? null : num;
    }

    static formatDate(dateString) {
        if (!dateString) return null;
        
        try {
            // YYYYMMDDHHMMSS 형태를 ISO 형태로 변환
            if (/^\d{14}$/.test(dateString)) {
                const year = dateString.substring(0, 4);
                const month = dateString.substring(4, 6);
                const day = dateString.substring(6, 8);
                const hour = dateString.substring(8, 10);
                const minute = dateString.substring(10, 12);
                const second = dateString.substring(12, 14);
                
                return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
            }
            
            // YYYYMMDD 형태
            if (/^\d{8}$/.test(dateString)) {
                const year = dateString.substring(0, 4);
                const month = dateString.substring(4, 6);
                const day = dateString.substring(6, 8);
                
                return `${year}-${month}-${day}`;
            }
            
            return dateString;
        } catch (error) {
            return dateString;
        }
    }

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

    // 추가 프로세서 메서드들
    static processDetailIntroItem(item, container) {
        try {
            const basicItem = this.processBasicItem(item, container);
            if (!basicItem) return null;

            return {
                ...basicItem,
                heritage1: this.sanitizeHtml(item.heritage1),
                heritage2: this.sanitizeHtml(item.heritage2),
                heritage3: this.sanitizeHtml(item.heritage3),
                infocenter: this.sanitizeHtml(item.infocenter),
                opendate: this.sanitizeHtml(item.opendate),
                restdate: this.sanitizeHtml(item.restdate),
                usetime: this.sanitizeHtml(item.usetime),
                parking: this.sanitizeHtml(item.parking),
                chkbabycarriage: this.sanitizeHtml(item.chkbabycarriage),
                chkpet: this.sanitizeHtml(item.chkpet),
                chkcreditcard: this.sanitizeHtml(item.chkcreditcard),
                meta: {
                    ...basicItem.meta,
                    hasDetailInfo: true,
                    hasOpenInfo: !!(item.opendate || item.usetime),
                    hasFacilityInfo: !!(item.parking || item.chkbabycarriage || item.chkpet),
                    hasPaymentInfo: !!item.chkcreditcard
                }
            };
        } catch (error) {
            console.warn('Error processing detail intro item:', error);
            return null;
        }
    }

    static processDetailInfoItem(item, container) {
        try {
            return {
                serialnum: item.serialnum,
                infoname: this.sanitizeHtml(item.infoname),
                infotext: this.sanitizeHtml(item.infotext),
                fldgubun: item.fldgubun,
                meta: {
                    hasInfo: !!(item.infoname && item.infotext),
                    infoLength: item.infotext ? item.infotext.length : 0,
                    infoType: item.fldgubun || 'general'
                }
            };
        } catch (error) {
            console.warn('Error processing detail info item:', error);
            return null;
        }
    }

    static processImageItem(item, container) {
        try {
            const imageUrl = this.validateImageUrl(item.originimgurl);
            const thumbUrl = this.validateImageUrl(item.smallimageurl);

            if (!imageUrl) return null;

            return {
                serialnum: item.serialnum,
                originImageUrl: imageUrl,
                smallImageUrl: thumbUrl,
                cpyrhtDivCd: item.cpyrhtDivCd,
                imgname: this.sanitizeHtml(item.imgname),
                meta: {
                    hasThumb: !!thumbUrl,
                    hasTitle: !!item.imgname,
                    imageFormat: this.getImageFormat(imageUrl),
                    estimatedSize: this.estimateImageSize(imageUrl)
                }
            };
        } catch (error) {
            console.warn('Error processing image item:', error);
            return null;
        }
    }

    static processFestivalItem(item, container) {
        try {
            const basicItem = this.processBasicItem(item, container);
            if (!basicItem) return null;

            const startDate = this.formatDate(item.eventstartdate);
            const endDate = this.formatDate(item.eventenddate);

            return {
                ...basicItem,
                eventstartdate: startDate,
                eventenddate: endDate,
                playtime: this.sanitizeHtml(item.playtime),
                eventplace: this.sanitizeHtml(item.eventplace),
                eventhomepage: this.sanitizeHtml(item.eventhomepage),
                sponsor1: this.sanitizeHtml(item.sponsor1),
                sponsor2: this.sanitizeHtml(item.sponsor2),
                subevent: this.sanitizeHtml(item.subevent),
                usetimefestival: this.sanitizeHtml(item.usetimefestival),
                meta: {
                    ...basicItem.meta,
                    isFestival: true,
                    hasDateInfo: !!(startDate || endDate),
                    isOngoing: this.isFestivalOngoing(startDate, endDate),
                    isUpcoming: this.isFestivalUpcoming(startDate),
                    duration: this.calculateFestivalDuration(startDate, endDate),
                    hasVenue: !!item.eventplace,
                    hasWebsite: !!item.eventhomepage
                }
            };
        } catch (error) {
            console.warn('Error processing festival item:', error);
            return null;
        }
    }

    static processAreaCodeItem(item, container) {
        try {
            const i18n = container.get('i18n');
            const currentLang = i18n.currentLanguage;

            return {
                code: item.code,
                name: this.sanitizeHtml(item.name),
                rnum: SafeUtils.safeParseInt(item.rnum),
                meta: {
                    isMainArea: !item.code || item.code.length <= 2,
                    isSubArea: item.code && item.code.length > 2,
                    localizedName: this.getLocalizedAreaName(item.code, currentLang, container)
                }
            };
        } catch (error) {
            console.warn('Error processing area code item:', error);
            return null;
        }
    }

    static processCategoryCodeItem(item, container) {
        try {
            return {
                code: item.code,
                name: this.sanitizeHtml(item.name),
                rnum: SafeUtils.safeParseInt(item.rnum),
                meta: {
                    level: this.getCategoryLevel(item.code),
                    parentCode: this.getParentCategoryCode(item.code),
                    isLeafCategory: this.isLeafCategory(item.code)
                }
            };
        } catch (error) {
            console.warn('Error processing category code item:', error);
            return null;
        }
    }

    // 유틸리티 메서드들
    static getImageFormat(url) {
        if (!url) return null;
        const ext = url.split('.').pop()?.toLowerCase();
        return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) ? ext : null;
    }

    static estimateImageSize(url) {
        if (!url) return null;
        if (url.includes('thumb') || url.includes('small')) return 'small';
        if (url.includes('medium')) return 'medium';
        return 'large';
    }

    static isFestivalOngoing(startDate, endDate) {
        if (!startDate || !endDate) return false;
        const now = new Date();
        const start = new Date(startDate);
        const end = new Date(endDate);
        return now >= start && now <= end;
    }

    static isFestivalUpcoming(startDate) {
        if (!startDate) return false;
        const now = new Date();
        const start = new Date(startDate);
        return start > now;
    }

    static calculateFestivalDuration(startDate, endDate) {
        if (!startDate || !endDate) return null;
        try {
            const start = new Date(startDate);
            const end = new Date(endDate);
            const diffTime = Math.abs(end - start);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return diffDays;
        } catch {
            return null;
        }
    }

    static getCategoryLevel(code) {
        if (!code) return 0;
        if (code.length === 3) return 1;
        if (code.length === 5) return 2;
        if (code.length === 7) return 3;
        return 0;
    }

    static getParentCategoryCode(code) {
        if (!code || code.length <= 3) return null;
        if (code.length === 5) return code.substring(0, 3);
        if (code.length === 7) return code.substring(0, 5);
        return null;
    }

    static isLeafCategory(code) {
        return code && code.length === 7;
    }

    static getLocalizedAreaName(code, lang, container) {
        try {
            const constants = container.get('constants');
            return constants.getAreaName(code, lang);
        } catch {
            return null;
        }
    }
}

// ===== 입력 검증 시스템 =====
class InputValidator {
    constructor(container) {
        this.container = container;
        this.i18n = container.get('i18n');
        this.logger = container.get('logger');
        this.schemas = new Map();
        this.customValidators = new Map();
        this._destroyed = false;

        this.setupSchemas();
        this.registerCustomValidators();
    }

    setupSchemas() {
        const commonSchema = {
            numOfRows: { type: 'string', pattern: /^\d+$/, min: 1, max: 1000, sanitize: true },
            pageNo: { type: 'string', pattern: /^\d+$/, min: 1, max: 1000, sanitize: true },
            arrange: { type: 'string', enum: ['A', 'B', 'C', 'D', 'E', 'O', 'Q', 'R'], sanitize: true }
        };

        const locationSchema = {
            userLat: { type: 'string', pattern: /^-?\d+\.?\d*$/, custom: 'latitude', sanitize: true },
            userLng: { type: 'string', pattern: /^-?\d+\.?\d*$/, custom: 'longitude', sanitize: true },
            radius: { type: 'string', pattern: /^\d+\.?\d*$/, min: 0.1, max: 20000, sanitize: true }
        };

        // 스키마 정의
        this.schemas.set('areaBasedList', {
            ...commonSchema,
            ...locationSchema,
            contentTypeId: { type: 'string', enum: ['12', '14', '15', '25', '28', '32', '38', '39'], sanitize: true },
            areaCode: { type: 'string', pattern: /^\d{1,2}$/, custom: 'areaCode', sanitize: true },
            sigunguCode: { type: 'string', pattern: /^\d{1,5}$/, sanitize: true },
            cat1: { type: 'string', pattern: /^[A-Z]\d{2}$/, sanitize: true },
            cat2: { type: 'string', pattern: /^[A-Z]\d{4}$/, sanitize: true },
            cat3: { type: 'string', pattern: /^[A-Z]\d{6}$/, sanitize: true },
            modifiedtime: { type: 'string', pattern: /^\d{8}$/, custom: 'dateFormat', sanitize: true }
        });

        this.schemas.set('detailCommon', {
            contentId: { type: 'string', required: true, pattern: /^\d+$/, custom: 'contentId', sanitize: true },
            defaultYN: { type: 'string', enum: ['Y', 'N'], sanitize: true },
            firstImageYN: { type: 'string', enum: ['Y', 'N'], sanitize: true },
            areacodeYN: { type: 'string', enum: ['Y', 'N'], sanitize: true },
            catcodeYN: { type: 'string', enum: ['Y', 'N'], sanitize: true },
            addrinfoYN: { type: 'string', enum: ['Y', 'N'], sanitize: true },
            mapinfoYN: { type: 'string', enum: ['Y', 'N'], sanitize: true },
            overviewYN: { type: 'string', enum: ['Y', 'N'], sanitize: true }
        });

        this.schemas.set('searchKeyword', {
            ...commonSchema,
            ...locationSchema,
            keyword: { type: 'string', required: true, minLength: 1, maxLength: 100, custom: 'keyword', sanitize: true },
            contentTypeId: { type: 'string', enum: ['12', '14', '15', '25', '28', '32', '38', '39'], sanitize: true },
            areaCode: { type: 'string', pattern: /^\d{1,2}$/, custom: 'areaCode', sanitize: true },
            sigunguCode: { type: 'string', pattern: /^\d{1,5}$/, sanitize: true }
        });

        // 나머지 스키마들도 동일하게 추가...
    }

    registerCustomValidators() {
        this.customValidators.set('latitude', (value) => {
            const num = SafeUtils.safeParseFloat(value);
            if (isNaN(num)) return false;
            return num >= -90 && num <= 90;
        });

        this.customValidators.set('longitude', (value) => {
            const num = SafeUtils.safeParseFloat(value);
            if (isNaN(num)) return false;
            return num >= -180 && num <= 180;
        });

        this.customValidators.set('areaCode', (value) => {
            const validAreaCodes = ['1', '2', '3', '4', '5', '6', '7', '8', '31', '32', '33', '34', '35', '36', '37', '38', '39'];
            return validAreaCodes.includes(value);
        });

        this.customValidators.set('contentId', (value) => {
            const num = SafeUtils.safeParseInt(value);
            return !isNaN(num) && num > 0 && num <= 999999999;
        });

        this.customValidators.set('keyword', (value) => {
            if (typeof value !== 'string') return false;
            const trimmed = value.trim();

            if (trimmed.length === 0 || trimmed.length > 100) return false;

            // XSS 패턴 체크
            const xssPatterns = [
                /<script[^>]*>.*?<\/script>/gi,
                /javascript:/gi,
                /on\w+\s*=/gi,
                /eval\s*\(/gi,
                /expression\s*\(/gi
            ];

            for (const pattern of xssPatterns) {
                if (pattern.test(trimmed)) return false;
            }

            return true;
        });

        this.customValidators.set('dateFormat', (value) => {
            if (!/^\d{8}$/.test(value)) return false;

            const year = parseInt(value.substring(0, 4));
            const month = parseInt(value.substring(4, 6));
            const day = parseInt(value.substring(6, 8));

            if (year < 1900 || year > 2100) return false;
            if (month < 1 || month > 12) return false;
            if (day < 1 || day > 31) return false;

            try {
                const date = new Date(year, month - 1, day);
                return date.getFullYear() === year && 
                       date.getMonth() === month - 1 && 
                       date.getDate() === day;
            } catch {
                return false;
            }
        });
    }

    validate(operation, params) {
        if (this._destroyed) {
            throw new ValidationError('Validator has been destroyed', 'system', 'destroyed', this.i18n);
        }

        try {
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
            const sanitizedParams = {};

            // 각 필드 검증
            for (const [field, rules] of Object.entries(schema)) {
                const result = this.validateField(field, params[field], rules);

                if (result.errors.length > 0) {
                    errors.push(...result.errors);
                } else if (result.value !== undefined) {
                    sanitizedParams[field] = result.value;
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

            return sanitizedParams;
        } catch (error) {
            if (error instanceof ValidationError) {
                throw error;
            }

            this.logger.error('Validation system error', error);
            throw new ValidationError(
                'Validation system error',
                'system',
                operation,
                this.i18n
            );
        }
    }

    validateField(field, value, rules) {
        const result = { errors: [], value: undefined };

        try {
            // 필수 필드 체크
            if (rules.required && (value === undefined || value === null || value === '')) {
                result.errors.push(`${field}${this.i18n.getMessage('FIELD_REQUIRED')}`);
                return result;
            }

            // 값이 없으면 통과
            if (value === undefined || value === null || value === '') {
                return result;
            }

            // 입력값 정제
            let sanitizedValue = value;
            if (rules.sanitize && typeof value === 'string') {
                sanitizedValue = SafeUtils.sanitizeInput(value, rules.maxLength || 1000);
            }

            // 타입 체크
            if (rules.type && typeof sanitizedValue !== rules.type) {
                result.errors.push(`${field}${this.i18n.getMessage('TYPE_MISMATCH', { type: rules.type })}`);
                return result;
            }

            // 패턴 체크
            if (rules.pattern && typeof sanitizedValue === 'string' && !rules.pattern.test(sanitizedValue)) {
                result.errors.push(`${field}${this.i18n.getMessage('INVALID_FORMAT')}`);
                return result;
            }

            // 길이 체크
            if (typeof sanitizedValue === 'string') {
                if (rules.minLength && sanitizedValue.length < rules.minLength) {
                    result.errors.push(`${field}${this.i18n.getMessage('MIN_LENGTH_ERROR', { minLength: rules.minLength })}`);
                    return result;
                }

                if (rules.maxLength && sanitizedValue.length > rules.maxLength) {
                    result.errors.push(`${field}${this.i18n.getMessage('MAX_LENGTH_ERROR', { maxLength: rules.maxLength })}`);
                    return result;
                }
            }

            // 수치 범위 체크
            if (rules.min !== undefined || rules.max !== undefined) {
                const numValue = SafeUtils.safeParseFloat(sanitizedValue);
                if (isNaN(numValue)) {
                    result.errors.push(`${field}${this.i18n.getMessage('NUMERIC_ERROR')}`);
                    return result;
                } else {
                    if (rules.min !== undefined && numValue < rules.min) {
                        result.errors.push(`${field}${this.i18n.getMessage('INVALID_RANGE')} (min: ${rules.min})`);
                        return result;
                    }
                    if (rules.max !== undefined && numValue > rules.max) {
                        result.errors.push(`${field}${this.i18n.getMessage('INVALID_RANGE')} (max: ${rules.max})`);
                        return result;
                    }
                }
            }

            // 열거형 체크
            if (rules.enum && !rules.enum.includes(sanitizedValue)) {
                result.errors.push(`${field}${this.i18n.getMessage('ENUM_ERROR', { values: rules.enum.join(', ') })}`);
                return result;
            }

            // 커스텀 검증
            if (rules.custom && this.customValidators.has(rules.custom)) {
                const customValidator = this.customValidators.get(rules.custom);
                if (!customValidator(sanitizedValue)) {
                    result.errors.push(`${field}${this.i18n.getMessage('INVALID_FORMAT')}`);
                    return result;
                }
            }

            result.value = sanitizedValue;
            return result;
        } catch (error) {
            this.logger.error('Field validation error', { field, error });
            result.errors.push(`${field} validation failed`);
            return result;
        }
    }

    destroy() {
        if (this._destroyed) return;

        this.schemas.clear();
        this.customValidators.clear();
        this._destroyed = true;
        this.logger.info('Input validator destroyed');
    }
}


